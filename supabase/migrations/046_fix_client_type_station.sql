-- ============================================================
-- Migration 046 — Ajoute 'station' au type ENUM client_type
--
-- Bug : la RPC admin_generate_settlement_invoice (migration 044) tente
-- d'insérer un client avec type='station', mais ce n'est pas une valeur
-- valide du ENUM client_type → "invalid input value for enum".
--
-- Fix : ALTER TYPE pour ajouter 'station'.
-- Idempotent : 'IF NOT EXISTS' supporté à partir de PG 12+.
-- ============================================================

ALTER TYPE client_type ADD VALUE IF NOT EXISTS 'station';

-- Note : PG 12+ supporte ALTER TYPE ... ADD VALUE IF NOT EXISTS,
-- l'opération doit être faite hors transaction explicite.
-- Si l'erreur persiste, exécuter manuellement dans Supabase SQL Editor.

-- ─── Refactor de la RPC pour utiliser un fallback robuste ───
-- Si 'station' n'est pas encore dans l'enum (avant que cette migration prenne effet),
-- on retombe sur 'autre' qui est toujours valide. Sinon 'station' est utilisé.

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
  v_client_type client_type;
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
    RAISE EXCEPTION 'Le bordereau % doit être validé avant de générer la facture', v_settlement.code USING ERRCODE = '22023';
  END IF;

  IF v_settlement.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'invoice_id', v_settlement.invoice_id,
      'settlement_code', v_settlement.code,
      'message', 'Facture déjà existante'
    );
  END IF;

  -- Trouve un client "Station" existant
  SELECT id INTO v_station_client_id
    FROM clients
   WHERE (code ILIKE 'STATION%' OR name ILIKE '%station%')
     AND is_active = TRUE
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_station_client_id IS NULL THEN
    -- Choisit dynamiquement le type : 'station' si dispo, sinon 'autre' (fallback)
    BEGIN
      v_client_type := 'station'::client_type;
    EXCEPTION WHEN invalid_text_representation OR undefined_object THEN
      v_client_type := 'autre'::client_type;
    END;

    INSERT INTO clients (code, name, type, currency, payment_terms_days, is_active, country)
    VALUES ('STATION', 'Station de conditionnement', v_client_type,
            'MAD', 30, TRUE, 'Maroc')
    RETURNING id INTO v_station_client_id;
  END IF;

  v_due_date := COALESCE(
    v_settlement.expected_payment_date,
    v_settlement.received_date + INTERVAL '30 days'
  )::DATE;

  v_invoice_number := 'FB-' || to_char(NOW(), 'YYYY') || '-' || replace(v_settlement.code, 'SET-', '');

  INSERT INTO invoices (
    invoice_number, invoice_type, client_id,
    invoice_date, due_date, currency,
    subtotal, tax_amount, total_amount, paid_amount,
    status, notes, created_by
  ) VALUES (
    v_invoice_number, 'vente', v_station_client_id,
    COALESCE(v_settlement.received_date, CURRENT_DATE), v_due_date, 'MAD',
    COALESCE(v_settlement.total_amount, 0), 0,
    COALESCE(v_settlement.total_amount, 0), 0,
    'en_attente',
    'Bordereau station ' || v_settlement.code ||
    ' (période ' || to_char(v_settlement.period_start, 'DD/MM/YYYY') ||
    ' → ' || to_char(v_settlement.period_end, 'DD/MM/YYYY') || ')',
    v_user_id
  )
  RETURNING id INTO v_invoice_id;

  UPDATE station_settlements
     SET invoice_id = v_invoice_id, updated_at = NOW()
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
