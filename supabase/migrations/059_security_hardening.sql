-- ============================================================
-- Migration 059 — Durcissement sécurité (Lot 1)
--
-- Corrige les findings de l'audit :
--   C1  admin_weigh_station_dispatch : aucun contrôle d'autorisation
--   C2  create_ecart_dispatch        : aucun contrôle d'autorisation
--   H1  paie/CNSS/congés lisibles par tout utilisateur connecté
--   H2  policies d'écriture ouvertes (USING(true) WITH CHECK(true))
--
-- Principe : lecture large conservée, ÉCRITURE / actions sensibles gated
-- sur is_admin(auth.uid()). (Un rôle « opérateur station » pourra assouplir
-- la pesée plus tard via le système de permissions.)
-- ============================================================

-- ─── C1. Pesée station : exiger l'admin ─────────────────────
CREATE OR REPLACE FUNCTION admin_weigh_station_dispatch(
  p_dispatch_id UUID,
  p_real_kg     DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_est DECIMAL;
  v_count     INT;
  r           RECORD;
  v_new       DECIMAL;
BEGIN
  -- Garde d'autorisation (correctif C1)
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé : privilèges administrateur requis pour la pesée.'
      USING ERRCODE = '42501';
  END IF;

  IF p_real_kg IS NULL OR p_real_kg <= 0 THEN
    RAISE EXCEPTION 'Le tonnage réel doit être > 0';
  END IF;

  SELECT COALESCE(SUM(qty_contributed_kg), 0), COUNT(*)
    INTO v_total_est, v_count
  FROM harvest_lot_sources
  WHERE harvest_lot_id = p_dispatch_id;

  IF v_count = 0 OR v_total_est <= 0 THEN
    RAISE EXCEPTION 'Envoi sans récoltes sources pesables (estimation nulle).';
  END IF;

  FOR r IN
    SELECT id, harvest_id, qty_contributed_kg
    FROM harvest_lot_sources
    WHERE harvest_lot_id = p_dispatch_id
  LOOP
    v_new := ROUND(p_real_kg * (r.qty_contributed_kg / v_total_est), 2);
    UPDATE harvest_lot_sources SET qty_contributed_kg = v_new WHERE id = r.id;
  END LOOP;

  UPDATE harvest_lots
  SET weighed_kg   = p_real_kg,
      quantity_kg  = p_real_kg,
      weighed_at   = NOW(),
      estimated_kg = COALESCE(estimated_kg, v_total_est)
  WHERE id = p_dispatch_id;

  UPDATE harvests h
  SET actual_kg = sub.total
  FROM (
    SELECT hls.harvest_id, SUM(hls.qty_contributed_kg) AS total
    FROM harvest_lot_sources hls
    JOIN harvest_lots hl ON hl.id = hls.harvest_lot_id
    WHERE hl.weighed_kg IS NOT NULL
      AND hls.harvest_id IN (
        SELECT harvest_id FROM harvest_lot_sources WHERE harvest_lot_id = p_dispatch_id
      )
    GROUP BY hls.harvest_id
  ) sub
  WHERE h.id = sub.harvest_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'estimated_kg', v_total_est,
    'real_kg', p_real_kg,
    'ecart_kg', ROUND(p_real_kg - v_total_est, 2),
    'sources', v_count
  );
END;
$$;

-- ─── C2. Création dispatch écart : exiger l'admin ───────────
CREATE OR REPLACE FUNCTION create_ecart_dispatch(
  p_parent_lot_id UUID,
  p_ecart_qty_kg DECIMAL DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_ecart_market_id UUID;
  v_ecart_client_id UUID;
  v_qty DECIMAL(10, 2);
  v_new_lot_id UUID;
  v_new_lot_number VARCHAR(50);
BEGIN
  -- Garde d'autorisation (correctif C2)
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé : privilèges administrateur requis.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_parent FROM harvest_lots WHERE id = p_parent_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch parent introuvable' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, client_id INTO v_ecart_market_id, v_ecart_client_id
    FROM markets
   WHERE is_ecart_market = TRUE AND is_active = TRUE
   LIMIT 1;

  IF v_ecart_market_id IS NULL THEN
    RAISE EXCEPTION 'Aucun marché écart configuré. Active is_ecart_market=true sur un marché dans /marches.'
      USING ERRCODE = 'P0001';
  END IF;

  v_qty := COALESCE(p_ecart_qty_kg, COALESCE(v_parent.quantity_kg, 0) - COALESCE(v_parent.qty_acceptee_kg, 0));
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantité écart nulle ou négative pour le lot %', v_parent.lot_number;
  END IF;

  v_new_lot_number := COALESCE(v_parent.lot_number, 'LOT') || '-ECART';

  INSERT INTO harvest_lots (
    lot_number, harvest_id, campaign_planting_id, harvest_date, receipt_date,
    quantity_kg, category, variety_id, greenhouse_id, market_id, client_id,
    tri_status, parent_dispatch_id, notes
  ) VALUES (
    v_new_lot_number, v_parent.harvest_id, v_parent.campaign_planting_id, CURRENT_DATE, CURRENT_DATE,
    v_qty, 'station_dispatch', v_parent.variety_id, v_parent.greenhouse_id, v_ecart_market_id, v_ecart_client_id,
    'pending', v_parent.id,
    'Écart du dispatch ' || v_parent.lot_number || ' vendu au client écart'
  )
  RETURNING id INTO v_new_lot_id;

  RETURN v_new_lot_id;
END;
$$;

-- ─── H1. Confidentialité paie : lecture admin uniquement ────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_periods','payslips','leave_requests','leave_balances','cnss_declarations']
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "auth read %I" ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "admin read %I" ON %I', t, t);
      EXECUTE format('CREATE POLICY "admin read %I" ON %I FOR SELECT TO authenticated USING (is_admin(auth.uid()))', t, t);
    EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'table % absente (skip)', t;
    END;
  END LOOP;
END $$;

-- ─── H2. Policies d'écriture ouvertes → écriture admin ──────
-- Prix station / prix marché / statut quotidien : lecture ouverte, écriture admin.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['harvest_market_prices','harvest_daily_status','harvest_station_prices']
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'read_'||t, t);
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'read_'||t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'write_'||t, t);
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()))', 'write_'||t, t);
    EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'table % absente (skip)', t;
    END;
  END LOOP;
END $$;

-- harvest_tray_lines : le caporal CRÉE ses lignes (INSERT ouvert, requis par
-- la saisie de récolte), mais modification/suppression réservées à l'admin.
DROP POLICY IF EXISTS "auth_write_tray_lines" ON harvest_tray_lines;
DROP POLICY IF EXISTS "tray_insert" ON harvest_tray_lines;
CREATE POLICY "tray_insert" ON harvest_tray_lines FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tray_update" ON harvest_tray_lines;
CREATE POLICY "tray_update" ON harvest_tray_lines FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "tray_delete" ON harvest_tray_lines;
CREATE POLICY "tray_delete" ON harvest_tray_lines FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

COMMENT ON FUNCTION admin_weigh_station_dispatch(UUID, DECIMAL) IS
  'Pesée station + répartition prorata. Réservé aux admins (correctif sécurité 059).';
