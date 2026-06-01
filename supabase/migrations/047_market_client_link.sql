-- ============================================================
-- Migration 047 — Lien Marché → Client + factures par marché
--
-- Permet :
--   1. À chaque marché, lier un client (Carrefour FR → "Carrefour France SAS")
--   2. Quand un dispatch est tarifé (manuellement OU via bordereau), créer une
--      facture rattachée au client du marché concerné (pas à la Station générique)
--   3. Tracer le dispatch → la facture sur harvest_lots.invoice_id
--
-- Workflow cible :
--   - Manuel : clic "Tarifer" sur 1 dispatch → 1 facture (client = market.client)
--   - Bordereau : valide → N factures (1 par client, somme par client)
-- ============================================================

-- ─── 1. Client par défaut sur les marchés ────────────────────
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_markets_client ON markets(client_id);

COMMENT ON COLUMN markets.client_id IS
'Client par défaut associé à ce marché. Utilisé pour facturer les ventes vers ce marché.';

-- ─── 2. Trace dispatch → facture sur harvest_lots ────────────
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_harvest_lots_invoice ON harvest_lots(invoice_id);

COMMENT ON COLUMN harvest_lots.invoice_id IS
'Facture générée pour ce dispatch tarifé (manuel ou via bordereau). NULL tant qu''aucune facture n''a été créée.';

-- ─── 3. RPC : générer facture pour 1 dispatch tarifé manuellement ─
-- Appelée automatiquement quand l'utilisateur tarifie un dispatch via le bouton classique.
-- Idempotente : retourne l'existante si déjà créée.

CREATE OR REPLACE FUNCTION admin_generate_dispatch_invoice(p_lot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot RECORD;
  v_invoice_id UUID;
  v_invoice_number VARCHAR(30);
  v_client_id UUID;
  v_user_id UUID;
  v_due_date DATE;
  v_total DECIMAL(12,2);
  v_payment_days INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;
  IF NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Privilèges admin requis' USING ERRCODE = '42501';
  END IF;

  -- Charge le dispatch + market + client
  SELECT hl.*,
         m.name AS market_name,
         m.client_id AS market_client_id,
         m.payment_terms_days AS market_payment_days
    INTO v_lot
    FROM harvest_lots hl
    JOIN markets m ON m.id = hl.market_id
   WHERE hl.id = p_lot_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_lot.tri_status != 'priced' THEN
    RAISE EXCEPTION 'Le dispatch % doit être tarifé (tri_status=priced)', v_lot.lot_number USING ERRCODE = '22023';
  END IF;

  IF v_lot.price_per_kg IS NULL OR v_lot.price_per_kg <= 0 THEN
    RAISE EXCEPTION 'Le dispatch % n''a pas de prix valide', v_lot.lot_number USING ERRCODE = '22023';
  END IF;

  -- Idempotence
  IF v_lot.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'created', false,
      'invoice_id', v_lot.invoice_id,
      'message', 'Facture déjà existante pour ce dispatch'
    );
  END IF;

  v_client_id := v_lot.market_client_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Le marché % n''a pas de client par défaut. Configurez markets.client_id dans /marches.', v_lot.market_name USING ERRCODE = 'P0001';
  END IF;

  v_payment_days := COALESCE(v_lot.market_payment_days, 30);
  v_due_date := (CURRENT_DATE + (v_payment_days || ' days')::interval)::DATE;
  v_total := COALESCE(v_lot.qty_acceptee_kg, 0) * COALESCE(v_lot.price_per_kg, 0);
  v_invoice_number := 'FD-' || to_char(NOW(), 'YYYY') || '-' || substr(p_lot_id::text, 1, 8);

  INSERT INTO invoices (
    invoice_number, invoice_type, client_id,
    invoice_date, due_date, currency,
    subtotal, tax_amount, total_amount, paid_amount,
    status, notes, created_by
  ) VALUES (
    v_invoice_number, 'vente', v_client_id,
    CURRENT_DATE, v_due_date, 'MAD',
    v_total, 0, v_total, 0,
    'en_attente',
    'Dispatch ' || v_lot.lot_number || ' — ' || v_lot.market_name ||
    ' — ' || COALESCE(v_lot.qty_acceptee_kg, 0)::text || ' kg @ ' || v_lot.price_per_kg::text || ' MAD/kg',
    v_user_id
  ) RETURNING id INTO v_invoice_id;

  UPDATE harvest_lots SET invoice_id = v_invoice_id WHERE id = p_lot_id;

  RETURN jsonb_build_object(
    'success', true, 'created', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'client_id', v_client_id,
    'due_date', v_due_date,
    'amount', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_generate_dispatch_invoice(UUID) TO authenticated;

COMMENT ON FUNCTION admin_generate_dispatch_invoice(UUID) IS
'Génère une facture pour un dispatch tarifé manuellement. Client = market.client_id. Échéance = today + market.payment_terms_days.';

-- ─── 4. Refactor RPC bordereau : N factures (1 par market) ───
-- Remplace la version single-invoice de la migration 044/046.
-- Pour chaque marché unique dans les lignes du bordereau, somme les amounts
-- et crée une invoice avec client = market.client_id.

CREATE OR REPLACE FUNCTION admin_generate_settlement_invoice(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_user_id UUID;
  v_invoice_id UUID;
  v_invoice_count INT := 0;
  v_total_amount DECIMAL(12,2) := 0;
  v_market RECORD;
  v_invoice_number VARCHAR(30);
  v_due_date DATE;
  v_market_idx INT := 0;
  v_invoices_json JSONB := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Privilèges admin requis' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement FROM station_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_settlement.status != 'valide' THEN
    RAISE EXCEPTION 'Le bordereau % doit être validé', v_settlement.code USING ERRCODE = '22023';
  END IF;

  -- Itère sur chaque marché unique du bordereau, somme les montants, crée 1 invoice
  FOR v_market IN
    SELECT
      m.id AS market_id,
      m.name AS market_name,
      m.client_id AS market_client_id,
      m.payment_terms_days AS market_payment_days,
      SUM(sl.amount) AS market_total,
      SUM(sl.qty_kg) AS market_qty
    FROM station_settlement_lines sl
    JOIN markets m ON m.id = sl.market_id
   WHERE sl.settlement_id = p_settlement_id
   GROUP BY m.id, m.name, m.client_id, m.payment_terms_days
   ORDER BY market_total DESC
  LOOP
    v_market_idx := v_market_idx + 1;

    IF v_market.market_client_id IS NULL THEN
      RAISE EXCEPTION
        'Le marché "%" n''a pas de client par défaut. Configurez markets.client_id dans /marches avant de générer les factures.',
        v_market.market_name
      USING ERRCODE = 'P0001';
    END IF;

    v_due_date := COALESCE(
      v_settlement.expected_payment_date,
      (v_settlement.received_date + (COALESCE(v_market.market_payment_days, 30) || ' days')::interval)::DATE
    );

    v_invoice_number := 'FB-' || to_char(NOW(), 'YYYY') || '-' ||
                        replace(v_settlement.code, 'SET-', '') ||
                        '-' || v_market_idx;

    INSERT INTO invoices (
      invoice_number, invoice_type, client_id,
      invoice_date, due_date, currency,
      subtotal, tax_amount, total_amount, paid_amount,
      status, notes, created_by
    ) VALUES (
      v_invoice_number, 'vente', v_market.market_client_id,
      COALESCE(v_settlement.received_date, CURRENT_DATE), v_due_date, 'MAD',
      v_market.market_total, 0, v_market.market_total, 0,
      'en_attente',
      'Bordereau ' || v_settlement.code || ' — Marché ' || v_market.market_name ||
      ' (' || v_market.market_qty::text || ' kg)',
      v_user_id
    ) RETURNING id INTO v_invoice_id;

    v_invoice_count := v_invoice_count + 1;
    v_total_amount := v_total_amount + v_market.market_total;
    v_invoices_json := v_invoices_json || jsonb_build_object(
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'market_id', v_market.market_id,
      'market_name', v_market.market_name,
      'amount', v_market.market_total
    );

    -- Garde une trace globale dans settlements.invoice_id (1ère facture créée)
    IF v_settlement.invoice_id IS NULL THEN
      UPDATE station_settlements SET invoice_id = v_invoice_id WHERE id = p_settlement_id;
    END IF;
  END LOOP;

  IF v_invoice_count = 0 THEN
    RAISE EXCEPTION 'Aucune ligne dans le bordereau %', v_settlement.code USING ERRCODE = '22023';
  END IF;

  UPDATE station_settlements SET updated_at = NOW() WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoices_created', v_invoice_count,
    'total_amount', v_total_amount,
    'invoices', v_invoices_json,
    'settlement_code', v_settlement.code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_generate_settlement_invoice(UUID) TO authenticated;

COMMENT ON FUNCTION admin_generate_settlement_invoice(UUID) IS
'Génère N factures à partir d''un bordereau validé : 1 par marché unique, client = market.client_id. Permet le suivi paiement par client réel.';
