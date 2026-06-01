-- ============================================================
-- Migration 044 — Date prévue d'encaissement + lien facture
--
-- Permet de :
--   1. Paramétrer le délai de paiement par marché (ex: Carrefour 45j,
--      Salad Time 30j, Local 7j)
--   2. Calculer une date prévue d'encaissement sur chaque bordereau
--   3. Générer une facture formatée à partir d'un bordereau (lien 1:1)
-- ============================================================

-- ─── 1. Délai de paiement par marché ─────────────────────────
-- Le champ `payment_terms` existant est du texte libre (ex "30 jours fin de mois").
-- On ajoute payment_terms_days en numérique pour calcul.
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 30;

COMMENT ON COLUMN markets.payment_terms_days IS
'Délai en jours entre la réception du bordereau et l''encaissement attendu. Utilisé pour calculer expected_payment_date sur les bordereaux station.';

-- ─── 2. Champs sur les bordereaux ────────────────────────────
ALTER TABLE station_settlements
  ADD COLUMN IF NOT EXISTS expected_payment_date DATE,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN station_settlements.expected_payment_date IS
'Date prévisionnelle d''encaissement (received_date + payment_terms_days du marché le plus lent du bordereau, ou 30j par défaut).';

COMMENT ON COLUMN station_settlements.invoice_id IS
'Facture générée à partir de ce bordereau (lien 1:1). NULL tant qu''aucune facture n''a été créée.';

CREATE INDEX IF NOT EXISTS idx_settlement_expected_payment
  ON station_settlements(expected_payment_date)
  WHERE status = 'valide';

CREATE INDEX IF NOT EXISTS idx_settlement_invoice
  ON station_settlements(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- ─── 3. RPC pour générer la facture du bordereau ──────────────
-- Crée une invoice rattachée au client "Station" (auto-créé si manquant),
-- avec total = bordereau total_amount, due_date = expected_payment_date.
-- Idempotente : si invoice_id déjà présent, retourne l'existante.

CREATE OR REPLACE FUNCTION admin_generate_settlement_invoice(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_invoice_id UUID;
  v_invoice_number VARCHAR(30);
  v_station_client_id UUID;
  v_user_id UUID;
  v_due_date DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Privilèges admin requis' USING ERRCODE = '42501';
  END IF;

  -- Charge le bordereau
  SELECT * INTO v_settlement
    FROM station_settlements
   WHERE id = p_settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bordereau introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.status != 'valide' THEN
    RAISE EXCEPTION 'Le bordereau % doit être validé avant de générer la facture', v_settlement.code USING ERRCODE = '22023';
  END IF;

  -- Idempotence : si facture déjà existante, la retourne
  IF v_settlement.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'invoice_id', v_settlement.invoice_id,
      'settlement_code', v_settlement.code,
      'message', 'Facture déjà existante'
    );
  END IF;

  -- Trouve (ou crée) le client "Station"
  -- Pattern : on cherche un client avec code 'STATION' ou name LIKE '%station%'
  -- Sinon on en crée un par défaut.
  SELECT id INTO v_station_client_id
    FROM clients
   WHERE (code ILIKE 'STATION%' OR name ILIKE '%station%')
     AND is_active = TRUE
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_station_client_id IS NULL THEN
    INSERT INTO clients (code, name, type, currency, payment_terms_days, is_active, country)
    VALUES ('STATION', 'Station de conditionnement', 'station',
            'MAD', 30, TRUE, 'Maroc')
    RETURNING id INTO v_station_client_id;
  END IF;

  -- Calcule la due_date (prend la valeur saisie, sinon received + 30j)
  v_due_date := COALESCE(
    v_settlement.expected_payment_date,
    v_settlement.received_date + INTERVAL '30 days'
  )::DATE;

  -- Numéro de facture
  v_invoice_number := 'FB-' || to_char(NOW(), 'YYYY') || '-' || replace(v_settlement.code, 'SET-', '');

  -- Crée la facture
  INSERT INTO invoices (
    invoice_number,
    invoice_type,
    client_id,
    invoice_date,
    due_date,
    currency,
    subtotal,
    tax_amount,
    total_amount,
    paid_amount,
    status,
    notes,
    created_by
  ) VALUES (
    v_invoice_number,
    'vente',
    v_station_client_id,
    COALESCE(v_settlement.received_date, CURRENT_DATE),
    v_due_date,
    'MAD',
    COALESCE(v_settlement.total_amount, 0),
    0,
    COALESCE(v_settlement.total_amount, 0),
    0,
    'en_attente',
    'Bordereau station ' || v_settlement.code ||
    ' (période ' || to_char(v_settlement.period_start, 'DD/MM/YYYY') ||
    ' → ' || to_char(v_settlement.period_end, 'DD/MM/YYYY') || ')',
    v_user_id
  )
  RETURNING id INTO v_invoice_id;

  -- Lien retour
  UPDATE station_settlements
     SET invoice_id = v_invoice_id,
         updated_at = NOW()
   WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'settlement_code', v_settlement.code,
    'due_date', v_due_date,
    'amount', v_settlement.total_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_generate_settlement_invoice(UUID) TO authenticated;

COMMENT ON FUNCTION admin_generate_settlement_invoice(UUID) IS
'Génère une invoice (table invoices) à partir d''un bordereau validé. Idempotente. Le client est auto-détecté (Station) ou créé.';
