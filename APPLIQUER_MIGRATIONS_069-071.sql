-- ============================================================
-- A APPLIQUER dans Supabase SQL Editor (projet dlisonvsphybjiyxoymk)
-- 069 : le bordereau ecrit le CA realise (fix onglet CA vide) + rattrapage
-- 070 : destinations d'ecart parametrables (referentiel destination_rejet)
-- 071 : bordereau par marche + semaine S1 par marche (markets.week1_start_date)
-- ============================================================

-- ============================================================
-- Migration 069 â€” Le bordereau station Ã©crit le CA rÃ©alisÃ© sur les lots
--
-- BUG : aprÃ¨s validation d'un bordereau station, l'onglet Â« CA RÃ©alisÃ© Â»
-- restait vide. La RPC admin_validate_station_settlement (041) allouait bien
-- (qty_priced_kg, tri_status='priced', station_settlement_allocations) mais
-- n'Ã©crivait JAMAIS harvest_lots.ca_amount ni harvest_lots.price_per_kg â€”
-- or l'onglet CA RÃ©alisÃ© lit harvest_lots.ca_amount.
--
-- FIX : on recrÃ©e les deux RPC :
--   â€¢ validate   â†’ accumule ca_amount += qty_allouÃ©e Ã— prix_ligne
--                  et pose price_per_kg = prix_ligne sur le lot.
--   â€¢ unvalidate â†’ dÃ©crÃ©mente ca_amount du montant allouÃ© (via le prix
--                  stockÃ© dans l'allocation) et remet price_per_kg Ã  NULL
--                  quand le lot n'est plus tarifÃ© du tout.
--
-- Colonnes : harvest_lots.ca_amount + price_per_kg (024),
--            station_settlement_allocations.price_per_kg (040).
-- SÃ©curitÃ© : SECURITY DEFINER + is_admin(auth.uid()), inchangÃ©e.
-- ============================================================

SET search_path = public;

-- â”€â”€â”€ VALIDATE (recrÃ©Ã©e avec Ã©criture du CA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION admin_validate_station_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_line RECORD;
  v_lot RECORD;
  v_remaining DECIMAL(10, 2);
  v_to_allocate DECIMAL(10, 2);
  v_lot_remaining DECIMAL(10, 2);
  v_total_allocations INT := 0;
  v_total_lots_priced INT := 0;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;
  IF NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'PrivilÃ¨ges admin requis' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement
    FROM station_settlements
   WHERE id = p_settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable : %', p_settlement_id USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.status = 'valide' THEN
    RAISE EXCEPTION 'Bordereau % dÃ©jÃ  validÃ©', v_settlement.code USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT *
      FROM station_settlement_lines
     WHERE settlement_id = p_settlement_id
     ORDER BY created_at
  LOOP
    v_remaining := v_line.qty_kg;

    FOR v_lot IN
      SELECT hl.id,
             hl.qty_acceptee_kg,
             hl.qty_priced_kg,
             (hl.qty_acceptee_kg - hl.qty_priced_kg) AS qty_available_kg,
             g.farm_id AS farm_id,
             hl.market_id,
             hl.variety_id,
             hl.harvest_date
        FROM harvest_lots hl
        JOIN greenhouses g ON g.id = hl.greenhouse_id
       WHERE hl.tri_status = 'tried'
         AND hl.category = 'station_dispatch'
         AND hl.market_id = v_line.market_id
         AND hl.variety_id = v_line.variety_id
         AND (v_line.farm_id IS NULL OR g.farm_id = v_line.farm_id)
         AND COALESCE(hl.qty_acceptee_kg, 0) > COALESCE(hl.qty_priced_kg, 0)
       ORDER BY hl.harvest_date ASC, hl.created_at ASC
       FOR UPDATE OF hl
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_lot_remaining := v_lot.qty_available_kg;
      IF v_lot_remaining <= 0 THEN
        CONTINUE;
      END IF;

      v_to_allocate := LEAST(v_remaining, v_lot_remaining);

      INSERT INTO station_settlement_allocations (
        settlement_line_id,
        harvest_lot_id,
        qty_allocated_kg,
        price_per_kg
      ) VALUES (
        v_line.id,
        v_lot.id,
        v_to_allocate,
        v_line.price_per_kg
      );

      v_total_allocations := v_total_allocations + 1;

      -- Update du lot : qty + CA rÃ©alisÃ© + prix + statut
      UPDATE harvest_lots
         SET qty_priced_kg = COALESCE(qty_priced_kg, 0) + v_to_allocate,
             ca_amount     = COALESCE(ca_amount, 0) + v_to_allocate * COALESCE(v_line.price_per_kg, 0),
             price_per_kg  = v_line.price_per_kg,
             settlement_id = p_settlement_id,
             tri_status = CASE
               WHEN COALESCE(qty_priced_kg, 0) + v_to_allocate >= COALESCE(qty_acceptee_kg, 0)
                    THEN 'priced'
               ELSE tri_status
             END
       WHERE id = v_lot.id;

      IF (v_lot.qty_priced_kg + v_to_allocate) >= v_lot.qty_acceptee_kg THEN
        v_total_lots_priced := v_total_lots_priced + 1;
      END IF;

      v_remaining := v_remaining - v_to_allocate;
    END LOOP;

    IF v_remaining > 0.01 THEN
      RAISE EXCEPTION
        'Stock insuffisant pour la ligne (market=%, variety=%, farm=%): manque % kg sur % kg demandÃ©s. VÃ©rifier les dispatches triÃ©s non encore tarifÃ©s.',
        v_line.market_id, v_line.variety_id, COALESCE(v_line.farm_id::text, 'ALL'),
        v_remaining, v_line.qty_kg
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  UPDATE station_settlements
     SET status = 'valide',
         validated_at = NOW(),
         validated_by = v_user_id,
         updated_at = NOW()
   WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'settlement_code', v_settlement.code,
    'allocations_created', v_total_allocations,
    'lots_fully_priced', v_total_lots_priced
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_validate_station_settlement(UUID) TO authenticated;

COMMENT ON FUNCTION admin_validate_station_settlement(UUID) IS
'Valide un bordereau station : alloue FIFO chaque ligne sur les dispatches triÃ©s, accumule ca_amount + price_per_kg sur les lots, bascule tri_status=priced quand un lot est totalement payÃ©.';

-- â”€â”€â”€ UNVALIDATE (recrÃ©Ã©e : dÃ©crÃ©mente aussi le CA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION admin_unvalidate_station_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_alloc RECORD;
  v_total_unwound INT := 0;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'PrivilÃ¨ges admin requis' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement
    FROM station_settlements
   WHERE id = p_settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.status != 'valide' THEN
    RAISE EXCEPTION 'Le bordereau % n''est pas validÃ©', v_settlement.code USING ERRCODE = '22023';
  END IF;

  -- DÃ©crÃ©mente qty_priced_kg + ca_amount sur chaque lot, retire priced si besoin
  FOR v_alloc IN
    SELECT a.id, a.harvest_lot_id, a.qty_allocated_kg, a.price_per_kg
      FROM station_settlement_allocations a
      JOIN station_settlement_lines l ON l.id = a.settlement_line_id
     WHERE l.settlement_id = p_settlement_id
  LOOP
    UPDATE harvest_lots
       SET qty_priced_kg = GREATEST(0, COALESCE(qty_priced_kg, 0) - v_alloc.qty_allocated_kg),
           ca_amount     = GREATEST(0, COALESCE(ca_amount, 0) - v_alloc.qty_allocated_kg * COALESCE(v_alloc.price_per_kg, 0)),
           price_per_kg  = CASE
             WHEN (COALESCE(qty_priced_kg, 0) - v_alloc.qty_allocated_kg) <= 0 THEN NULL
             ELSE price_per_kg
           END,
           tri_status = CASE
             WHEN tri_status = 'priced'
                  AND (COALESCE(qty_priced_kg, 0) - v_alloc.qty_allocated_kg) < COALESCE(qty_acceptee_kg, 0)
                  THEN 'tried'
             ELSE tri_status
           END,
           settlement_id = NULL
     WHERE id = v_alloc.harvest_lot_id;

    v_total_unwound := v_total_unwound + 1;
  END LOOP;

  DELETE FROM station_settlement_allocations
   WHERE settlement_line_id IN (
     SELECT id FROM station_settlement_lines WHERE settlement_id = p_settlement_id
   );

  UPDATE station_settlements
     SET status = 'brouillon',
         validated_at = NULL,
         validated_by = NULL,
         updated_at = NOW()
   WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'settlement_code', v_settlement.code,
    'allocations_removed', v_total_unwound
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_unvalidate_station_settlement(UUID) TO authenticated;

COMMENT ON FUNCTION admin_unvalidate_station_settlement(UUID) IS
'Annule la validation d''un bordereau : supprime allocations, dÃ©crÃ©mente qty_priced_kg + ca_amount, remet price_per_kg Ã  NULL si le lot n''est plus tarifÃ©, repasse status=brouillon.';

-- â”€â”€â”€ Rattrapage : recalcule ca_amount pour les bordereaux DÃ‰JÃ€ validÃ©s â”€â”€
-- (les lots tarifÃ©s avant ce correctif ont ca_amount NULL alors que des
--  allocations existent â†’ on reconstruit ca_amount depuis les allocations.)
UPDATE harvest_lots hl
   SET ca_amount = agg.ca,
       price_per_kg = COALESCE(hl.price_per_kg, agg.last_price)
  FROM (
    SELECT a.harvest_lot_id,
           SUM(a.qty_allocated_kg * a.price_per_kg) AS ca,
           MAX(a.price_per_kg)                      AS last_price
      FROM station_settlement_allocations a
     GROUP BY a.harvest_lot_id
  ) agg
 WHERE hl.id = agg.harvest_lot_id
   AND COALESCE(hl.ca_amount, 0) = 0;


-- ============================================================
-- Migration 070 â€” Destinations d'Ã©cart paramÃ©trables (no-code)
--
-- Retour test : Â« Rendre les destinations Ã©cart paramÃ©trables (ajout rÃ©fÃ©rentiel) Â».
--
-- Aujourd'hui les destinations du rejet de tri sont figÃ©es dans un CHECK
-- (destruction, retour_stock, vente_industrie, dons, vente_ecart) et en dur
-- dans le modal de tri. On les bascule en rÃ©fÃ©rentiel no-code
-- (reference_lists / reference_values) pour que l'admin puisse en ajouter.
--
-- âš ï¸ Deux destinations portent une LOGIQUE mÃ©tier :
--     â€¢ vente_ecart  â†’ crÃ©e un dispatch enfant vers le marchÃ© Ã©cart (RPC)
--     â€¢ retour_stock â†’ crÃ©e un lot stock rÃ©-envoyable
--   On encode ce comportement dans metadata.behavior. Toute NOUVELLE
--   destination ajoutÃ©e par l'admin aura behavior='none' â†’ elle est
--   simplement enregistrÃ©e (perte sÃ¨che / informative), comme
--   destruction / vente_industrie / dons aujourd'hui.
--
-- Ã‰tapes :
--   1. Ã‰largir harvest_lots.destination_rejet (VARCHAR 20 â†’ 40) pour les codes custom.
--   2. Supprimer le CHECK figÃ© (chk_destination_rejet) â†’ valeurs libres.
--   3. Seed du rÃ©fÃ©rentiel + valeurs (couleur, icÃ´ne, behavior, description).
-- ============================================================

SET search_path = public;

-- 1. Colonne plus large (codes personnalisÃ©s)
ALTER TABLE harvest_lots
  ALTER COLUMN destination_rejet TYPE VARCHAR(40);

-- 2. Le CHECK figÃ© n'a plus lieu d'Ãªtre (les valeurs viennent du rÃ©fÃ©rentiel)
ALTER TABLE harvest_lots
  DROP CONSTRAINT IF EXISTS chk_destination_rejet;

COMMENT ON COLUMN harvest_lots.destination_rejet IS
'Destination des Ã©carts du tri (rÃ©fÃ©rentiel no-code Â« destination_rejet Â»).
 metadata.behavior pilote la logique : vente_ecart (dispatch Ã©cart auto),
 retour_stock (lot rÃ©-envoyable), none (enregistrÃ©, sans effet de bord).';

-- 3. RÃ©fÃ©rentiel + valeurs
INSERT INTO reference_lists (key, label, description) VALUES
  ('destination_rejet', 'Destinations d''Ã©cart (tri)',
   'Que faire des Ã©carts refusÃ©s au tri station. Â« Vente client Ã©cart Â» et Â« Retour au stock Â» dÃ©clenchent une logique dÃ©diÃ©e (metadata.behavior) ; les autres sont enregistrÃ©es sans effet de bord.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO reference_values (list_key, code, label, color, icon, metadata, order_idx, is_default) VALUES
  ('destination_rejet', 'vente_ecart',     'Vente client Ã©cart', '#3b82f6', 'ðŸ¤',
     '{"behavior": "vente_ecart", "desc": "Le client Ã©cart configurÃ© passe rÃ©cupÃ©rer (recommandÃ©)"}', 1, true),
  ('destination_rejet', 'retour_stock',    'Retour au stock',    '#10b981', 'ðŸ”„',
     '{"behavior": "retour_stock", "desc": "RÃ©-envoi possible vers un autre marchÃ©"}', 2, false),
  ('destination_rejet', 'vente_industrie', 'Vente industrie',    '#f59e0b', 'ðŸ­',
     '{"behavior": "none", "desc": "Vendu direct prix rÃ©duit (transformation, jus)"}', 3, false),
  ('destination_rejet', 'dons',            'Dons',               '#a855f7', 'ðŸŽ',
     '{"behavior": "none", "desc": "DonnÃ© (association, personnelâ€¦)"}', 4, false),
  ('destination_rejet', 'destruction',     'Destruction',        '#ef4444', 'ðŸ—‘ï¸',
     '{"behavior": "none", "desc": "Perte sÃ¨che â€” produit non rÃ©cupÃ©rable"}', 5, false)
ON CONFLICT (list_key, code) DO NOTHING;


-- ============================================================
-- Migration 071 â€” Bordereau par marchÃ© (B1) + semaine S1 par marchÃ© (B4)
--
-- Retours test :
--   B1 Â« Dans saisie bordereau station, il faut saisir des bordereaux par marchÃ© Â»
--   B4 Â« Pour le numÃ©ro de semaine, il faut paramÃ©trer la S1â€¦ dÃ©finie par marchÃ© Â»
--
-- B1 : un bordereau est dÃ©sormais rattachÃ© Ã  UN marchÃ© (station_settlements.market_id).
--      L'unicitÃ© passe de (semaine) Ã  (semaine Ã— marchÃ©).
-- B4 : chaque marchÃ© dÃ©finit le lundi de sa S1 (markets.week1_start_date).
--      Le nÂ° de semaine AFFICHÃ‰ = 1 + floor((lundi_pÃ©riode âˆ’ week1_start_date)/7).
--      Le calcul se fait cÃ´tÃ© app ; la colonne stocke juste la rÃ©fÃ©rence.
--
-- Le code auto (SET-YYYY-Www) est complÃ©tÃ© par le code marchÃ© quand il est
-- renseignÃ© (ex. SET-2026-W36-CASA) pour lever l'ambiguÃ¯tÃ© entre marchÃ©s.
-- Les bordereaux existants (market_id NULL) restent Â« tous marchÃ©s Â» (legacy).
-- ============================================================

SET search_path = public;

-- â”€â”€â”€ B4 : date de dÃ©but S1 par marchÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS week1_start_date DATE;

COMMENT ON COLUMN markets.week1_start_date IS
  'Lundi de la semaine S1 station pour ce marchÃ© (B4). NÂ° de semaine affichÃ© d''un bordereau = 1 + floor((lundi_pÃ©riode âˆ’ week1_start_date)/7 j). NULL â†’ numÃ©rotation ISO.';

-- â”€â”€â”€ B1 : bordereau rattachÃ© Ã  un marchÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE station_settlements
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN station_settlements.market_id IS
  'MarchÃ© du bordereau (B1 : un bordereau par marchÃ©). NULL = bordereau legacy Â« tous marchÃ©s Â».';

CREATE INDEX IF NOT EXISTS idx_settlement_market ON station_settlements(market_id);

-- UnicitÃ© : (semaine Ã— marchÃ©) au lieu de (semaine) seule.
-- (market_id NULL â†’ lignes distinctes : les legacy Â« tous marchÃ©s Â» restent tolÃ©rÃ©s.)
DROP INDEX IF EXISTS uq_settlement_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_period_market
  ON station_settlements(period_start, period_end, market_id);

-- â”€â”€â”€ Code auto enrichi du code marchÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION trg_gen_settlement_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INT := 2;
  v_mcode TEXT;
BEGIN
  IF NEW.code IS NOT NULL AND length(trim(NEW.code)) > 0 THEN
    RETURN NEW;  -- code fourni manuellement, on respecte
  END IF;

  -- ISO week : IYYY = annÃ©e ISO, IW = numÃ©ro semaine ISO (01-53)
  v_base := 'SET-' || to_char(NEW.period_start, 'IYYY') || '-W' || to_char(NEW.period_start, 'IW');

  -- Suffixe marchÃ© si renseignÃ© (lisibilitÃ© entre bordereaux du mÃªme crÃ©neau)
  IF NEW.market_id IS NOT NULL THEN
    SELECT code INTO v_mcode FROM markets WHERE id = NEW.market_id;
    IF v_mcode IS NOT NULL AND length(trim(v_mcode)) > 0 THEN
      v_base := v_base || '-' || upper(trim(v_mcode));
    END IF;
  END IF;

  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM station_settlements WHERE code = v_candidate) LOOP
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  NEW.code := v_candidate;
  RETURN NEW;
END;
$$;

