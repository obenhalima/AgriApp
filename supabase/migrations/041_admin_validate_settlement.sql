-- ============================================================
-- Migration 041 — RPC admin_validate_station_settlement
--
-- Valide un bordereau station en mode FIFO :
--   • Pour chaque ligne (farm × market × variety), on récupère
--     les harvest_lots tri_status='tried', category='station_dispatch'
--     avec qty_priced_kg < qty_acceptee_kg, ordonnés par date_lot ASC.
--   • On consomme qty_kg de la ligne sur ces lots dans l'ordre,
--     en créant des station_settlement_allocations.
--   • On met à jour qty_priced_kg sur chaque lot ; quand
--     qty_priced_kg >= qty_acceptee_kg, on bascule tri_status='priced'.
--   • Si qty_kg de la ligne dépasse le stock disponible, on lève
--     une exception (la validation reste atomique).
--
-- Sécurité : SECURITY DEFINER + check is_admin(auth.uid()).
-- ============================================================

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
  -- Auth : doit être admin
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;
  IF NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Privilèges admin requis' USING ERRCODE = '42501';
  END IF;

  -- Charge le bordereau
  SELECT * INTO v_settlement
    FROM station_settlements
   WHERE id = p_settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable : %', p_settlement_id USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.status = 'valide' THEN
    RAISE EXCEPTION 'Bordereau % déjà validé', v_settlement.code USING ERRCODE = '22023';
  END IF;

  -- Itère sur les lignes du bordereau
  FOR v_line IN
    SELECT *
      FROM station_settlement_lines
     WHERE settlement_id = p_settlement_id
     ORDER BY created_at
  LOOP
    v_remaining := v_line.qty_kg;

    -- Récupère les lots disponibles : tried, station_dispatch, pas fully priced
    -- Filtre optionnel sur farm_id si renseigné dans la ligne (via greenhouses.farm_id)
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

      -- Crée l'allocation
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

      -- Update du lot
      UPDATE harvest_lots
         SET qty_priced_kg = COALESCE(qty_priced_kg, 0) + v_to_allocate,
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

    -- Si on n'a pas pu allouer toute la qty de la ligne, on échoue
    IF v_remaining > 0.01 THEN
      RAISE EXCEPTION
        'Stock insuffisant pour la ligne (market=%, variety=%, farm=%): manque % kg sur % kg demandés. Vérifier les dispatches triés non encore tarifés.',
        v_line.market_id, v_line.variety_id, COALESCE(v_line.farm_id::text, 'ALL'),
        v_remaining, v_line.qty_kg
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Marque le bordereau comme validé
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
'Valide un bordereau station en allouant FIFO chaque ligne sur les dispatches triés non encore tarifés. Met à jour qty_priced_kg + tri_status=priced quand un lot est totalement payé.';

-- ─── RPC complémentaire : annuler un bordereau validé ────────────────
-- Au cas où l'utilisateur se serait trompé : on supprime les allocations,
-- on décrémente qty_priced_kg, on remet tri_status='tried' si nécessaire,
-- on remet le bordereau en status='brouillon'.

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
    RAISE EXCEPTION 'Privilèges admin requis' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement
    FROM station_settlements
   WHERE id = p_settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.status != 'valide' THEN
    RAISE EXCEPTION 'Le bordereau % n''est pas validé', v_settlement.code USING ERRCODE = '22023';
  END IF;

  -- Décrémente qty_priced_kg sur chaque lot et retire le statut priced si besoin
  FOR v_alloc IN
    SELECT a.id, a.harvest_lot_id, a.qty_allocated_kg
      FROM station_settlement_allocations a
      JOIN station_settlement_lines l ON l.id = a.settlement_line_id
     WHERE l.settlement_id = p_settlement_id
  LOOP
    UPDATE harvest_lots
       SET qty_priced_kg = GREATEST(0, COALESCE(qty_priced_kg, 0) - v_alloc.qty_allocated_kg),
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

  -- Supprime toutes les allocations
  DELETE FROM station_settlement_allocations
   WHERE settlement_line_id IN (
     SELECT id FROM station_settlement_lines WHERE settlement_id = p_settlement_id
   );

  -- Remet le bordereau en brouillon
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
'Annule la validation d''un bordereau : supprime allocations, décrémente qty_priced_kg, repasse status=brouillon.';
