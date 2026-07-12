-- ============================================================
-- Migration 060 — Pont Achats → Coûts (cost_entries)
--
-- Problème : les achats (/achats) n'alimentaient PAS cost_entries. Les
-- intrants (semences, engrais, phytos…) — la plus grosse charge variable —
-- étaient donc invisibles du coût de revient / CPC.
--
-- Solution : à la RÉCEPTION d'un bon d'achat, générer un cost_entry RÉEL
-- (comme la paie 029 et les amortissements 030), tracé par source_po_id
-- (idempotent : DELETE + INSERT à chaque changement).
--
--   • Montant   = Σ (received_qty × unit_price)  → réception partielle OU totale
--   • Attribution = campaign_id + greenhouse_id du bon d'achat
--                  (fallback : campagne active de la ferme de la serre)
--   • Catégorie  = mapping cost_category (achat) → account_categories
-- ============================================================

-- ─── 1. Traçabilité : colonne source_po_id (idempotence + lien) ─────
ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS source_po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cost_entries_source_po ON cost_entries(source_po_id);

COMMENT ON COLUMN cost_entries.source_po_id IS
  'Bon d''achat source (pont achats→coûts). Non NULL = coût généré automatiquement, non éditable manuellement.';

-- ─── 2. Mapping cost_category (achat) → code account_categories ──────
CREATE OR REPLACE FUNCTION map_purchase_cat_to_account_code(p_cat TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p_cat, ''))
    WHEN 'semences'        THEN 'SEMENCES'
    WHEN 'plants'          THEN 'PLANTS'
    WHEN 'engrais'         THEN 'ENGRAIS'
    WHEN 'phytosanitaires' THEN 'PHYTOS'
    WHEN 'phyto'           THEN 'PHYTOS'
    WHEN 'irrigation'      THEN 'AUTRES_FOURNI'
    WHEN 'emballage'       THEN 'AUTRES_FOURNI'
    WHEN 'transport'       THEN 'TRANSPORT_VENTES'
    WHEN 'energie'         THEN 'ELECTRICITE'
    WHEN 'services'        THEN 'PRESTATIONS'
    WHEN 'equipement'      THEN 'AUTRES_FG'
    WHEN 'divers'          THEN 'AUTRES_FOURNI'
    ELSE 'AUTRES_FOURNI'   -- catégorie inconnue → autres fournitures agricoles
  END
$$;

-- ─── 3. Fonction de sync : PO → cost_entries ────────────────────────
CREATE OR REPLACE FUNCTION sync_po_to_cost_entries(p_po_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po        purchase_orders%ROWTYPE;
  v_amount    NUMERIC;
  v_campaign  UUID;
  v_cat_id    UUID;
  v_inserted  INTEGER := 0;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Idempotence : on efface l'existant pour ce bon d'achat
  DELETE FROM cost_entries WHERE source_po_id = p_po_id;

  -- Un coût n'est encouru qu'après (au moins partielle) réception
  IF v_po.status NOT IN ('partiellement_recu', 'recu', 'facture') THEN
    RETURN 0;
  END IF;

  -- Montant reçu = Σ (received_qty × unit_price) sur les lignes
  SELECT COALESCE(SUM(COALESCE(received_qty, 0) * COALESCE(unit_price, 0)), 0)
    INTO v_amount
  FROM purchase_order_lines WHERE po_id = p_po_id;

  IF v_amount <= 0 THEN RETURN 0; END IF;

  -- Campagne : celle du bon d'achat ; sinon campagne active de la ferme
  -- de la serre à la date de commande (maximise l'attribution).
  v_campaign := v_po.campaign_id;
  IF v_campaign IS NULL AND v_po.greenhouse_id IS NOT NULL THEN
    SELECT c.id INTO v_campaign
    FROM greenhouses g
    JOIN campaigns c ON c.farm_id = g.farm_id
    WHERE g.id = v_po.greenhouse_id
      AND COALESCE(v_po.order_date, CURRENT_DATE)
          BETWEEN COALESCE(c.planting_start, DATE '1900-01-01')
              AND COALESCE(c.campaign_end,   DATE '2100-12-31')
    ORDER BY c.planting_start DESC LIMIT 1;
  END IF;

  -- Non rattachable à une campagne → pas de coût de revient (on n'invente pas)
  IF v_campaign IS NULL THEN RETURN 0; END IF;

  -- Catégorie comptable (feuille du plan comptable)
  SELECT id INTO v_cat_id FROM account_categories
  WHERE code = map_purchase_cat_to_account_code(v_po.cost_category) LIMIT 1;

  INSERT INTO cost_entries (
    campaign_id, greenhouse_id, account_category_id, cost_category,
    amount, entry_date, description, is_planned, source_po_id
  ) VALUES (
    v_campaign,
    v_po.greenhouse_id,
    v_cat_id,
    LOWER(COALESCE(v_po.cost_category, 'divers')),
    v_amount,
    COALESCE(v_po.order_date, CURRENT_DATE),
    'Achat ' || COALESCE(v_po.po_number, p_po_id::text)
      || ' [' || COALESCE(v_po.cost_category, 'divers') || ']',
    FALSE,
    p_po_id
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ─── 4. Triggers : ré-synchroniser dès qu'un bon (ou ses lignes) bouge ─
CREATE OR REPLACE FUNCTION trg_po_sync_cost() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM sync_po_to_cost_entries(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_po_cost_sync ON purchase_orders;
CREATE TRIGGER trg_po_cost_sync
  AFTER INSERT OR UPDATE OF status, campaign_id, greenhouse_id, cost_category
  ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION trg_po_sync_cost();

CREATE OR REPLACE FUNCTION trg_pol_sync_cost() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM sync_po_to_cost_entries(COALESCE(NEW.po_id, OLD.po_id));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_pol_cost_sync ON purchase_order_lines;
CREATE TRIGGER trg_pol_cost_sync
  AFTER INSERT OR UPDATE OF received_qty, unit_price, quantity OR DELETE
  ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION trg_pol_sync_cost();

-- ─── 5. Backfill : tous les bons d'achat déjà (partiellement) reçus ──
DO $$
DECLARE r RECORD; n INT; total INT := 0; skipped INT := 0;
BEGIN
  FOR r IN SELECT id FROM purchase_orders
           WHERE status IN ('partiellement_recu', 'recu', 'facture')
  LOOP
    n := sync_po_to_cost_entries(r.id);
    total := total + n;
    IF n = 0 THEN skipped := skipped + 1; END IF;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '  Pont achats→coûts : % cost_entries créés', total;
  RAISE NOTICE '  (% bons ignorés : non attribuables à une campagne)', skipped;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;

COMMENT ON FUNCTION sync_po_to_cost_entries(UUID) IS
  'Génère/rafraîchit le cost_entry réel d''un bon d''achat reçu. Idempotent (source_po_id).';
