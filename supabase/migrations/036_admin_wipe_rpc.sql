-- ============================================================
-- Migration 036 — Admin wipe RPC functions (V2 défensive)
--
-- Version améliorée : chaque table est wipée individuellement avec
-- un EXCEPTION handler. Si une table n'existe pas, on skip et on
-- continue. Aucun TRUNCATE en bloc qui fail-all.
--
-- Retourne un rapport JSONB détaillé par table (ok/skipped/error).
-- ============================================================

-- Helper : admin check
CREATE OR REPLACE FUNCTION is_admin_caller()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(r.is_admin, FALSE) INTO v
  FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  RETURN v;
END;
$$;

-- Helper : truncate safe avec exception
CREATE OR REPLACE FUNCTION _admin_truncate_table(p_table TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT := 0;
  v_status TEXT := 'ok';
  v_err TEXT := NULL;
BEGIN
  -- D'abord compte (si la table existe)
  BEGIN
    EXECUTE format('SELECT COUNT(*) FROM %I', p_table) INTO v_count;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('table', p_table, 'status', 'missing', 'rows', 0);
  END;

  -- Puis TRUNCATE CASCADE
  BEGIN
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', p_table);
  EXCEPTION WHEN OTHERS THEN
    v_status := 'error';
    v_err := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'table', p_table,
    'status', v_status,
    'rows', v_count,
    'error', v_err
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. ADMIN_NUCLEAR_WIPE — vide TOUT (sauf auth/roles)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_nuclear_wipe()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl TEXT;
  results JSONB := '[]'::jsonb;
  rec JSONB;
  total_rows BIGINT := 0;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  -- Statement timeout : 60 secondes max
  SET LOCAL statement_timeout = '60s';

  -- Ordre : enfants → parents (pour éviter les FK errors même si CASCADE)
  FOR tbl IN SELECT unnest(ARRAY[
    -- Transactions
    'chatbot_messages',
    'harvest_lot_sources',
    'harvest_lots',
    'harvests',
    'production_forecasts',
    'station_prices',
    'recoltes_marche_daily',
    'payments_received',
    'invoices',
    'delivery_notes',
    'sales_order_lines',
    'sales_orders',
    'payments_made',
    'supplier_invoices',
    'purchase_order_lines',
    'purchase_orders',
    'cost_entries',
    'stock_movements',
    'cultural_operations',
    'labor_entries',
    'alerts',
    'budget_lines',
    'amortissements',
    'campaign_plantings',
    'campaigns',
    'market_prices',
    -- Master data
    'chatbot_users',
    'workers',
    'teams',
    'stock_items',
    'assets',
    'clients',
    'suppliers',
    'markets',
    'varieties',
    'seed_suppliers',
    'greenhouses',
    'farm_zones',
    'farms'
  ]) LOOP
    rec := _admin_truncate_table(tbl);
    total_rows := total_rows + COALESCE((rec->>'rows')::BIGINT, 0);
    results := results || rec;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', format('Nuclear wipe terminé. %s lignes effacées au total.', total_rows),
    'total_rows', total_rows,
    'tables', results
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. ADMIN_OPERATIONAL_RESET — vide transactions, garde master
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_operational_reset()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl TEXT;
  results JSONB := '[]'::jsonb;
  rec JSONB;
  total_rows BIGINT := 0;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  SET LOCAL statement_timeout = '60s';

  FOR tbl IN SELECT unnest(ARRAY[
    'chatbot_messages',
    'harvest_lot_sources',
    'harvest_lots',
    'harvests',
    'production_forecasts',
    'station_prices',
    'recoltes_marche_daily',
    'payments_received',
    'invoices',
    'delivery_notes',
    'sales_order_lines',
    'sales_orders',
    'payments_made',
    'supplier_invoices',
    'purchase_order_lines',
    'purchase_orders',
    'cost_entries',
    'stock_movements',
    'cultural_operations',
    'labor_entries',
    'alerts',
    'budget_lines',
    'amortissements',
    'campaign_plantings',
    'campaigns',
    'market_prices'
  ]) LOOP
    rec := _admin_truncate_table(tbl);
    total_rows := total_rows + COALESCE((rec->>'rows')::BIGINT, 0);
    results := results || rec;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', format('Reset opérationnel terminé. %s lignes effacées.', total_rows),
    'total_rows', total_rows,
    'tables', results
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. ADMIN_DELETE_CAMPAIGN — supprime 1 campagne + cascade
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_delete_campaign(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  SET LOCAL statement_timeout = '30s';

  -- Helper inline : delete + count avec EXCEPTION
  BEGIN DELETE FROM amortissements WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{amortissements}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN v_deleted := jsonb_set(v_deleted, '{amortissements_err}', to_jsonb(SQLERRM)); END;

  BEGIN DELETE FROM recoltes_marche_daily WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{recoltes_marche_daily}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN v_deleted := jsonb_set(v_deleted, '{recoltes_err}', to_jsonb(SQLERRM)); END;

  BEGIN DELETE FROM cost_entries WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{cost_entries}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM supplier_invoices WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{supplier_invoices}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM purchase_orders WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{purchase_orders}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM sales_orders WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{sales_orders}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM cultural_operations WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{cultural_operations}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM labor_entries WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := jsonb_set(v_deleted, '{labor_entries}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM harvest_lot_sources WHERE harvest_id IN (
    SELECT h.id FROM harvests h JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id
    WHERE cp.campaign_id = p_campaign_id);
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM harvest_lots WHERE harvest_id IN (
    SELECT h.id FROM harvests h JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id
    WHERE cp.campaign_id = p_campaign_id);
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM harvests WHERE campaign_planting_id IN (
    SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id);
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN DELETE FROM production_forecasts WHERE campaign_planting_id IN (
    SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id);
  EXCEPTION WHEN OTHERS THEN END;

  -- Final : la campagne (cascade auto sur campaign_plantings + budget_lines)
  DELETE FROM campaigns WHERE id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{campaigns}', to_jsonb(v_count));

  RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Permissions
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION is_admin_caller()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION _admin_truncate_table(TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_nuclear_wipe()               FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_operational_reset()          FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_campaign(UUID)        FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_admin_caller()               TO authenticated;
GRANT EXECUTE ON FUNCTION admin_nuclear_wipe()            TO authenticated;
GRANT EXECUTE ON FUNCTION admin_operational_reset()       TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_campaign(UUID)     TO authenticated;
-- _admin_truncate_table reste interne (pas de GRANT)

COMMENT ON FUNCTION admin_nuclear_wipe()       IS 'Wipe complet défensif. Per-table EXCEPTION handler. Admin only. Retourne rapport JSONB.';
COMMENT ON FUNCTION admin_operational_reset()  IS 'Wipe transactions seulement (garde master). Admin only.';
COMMENT ON FUNCTION admin_delete_campaign(UUID) IS 'Supprime 1 campagne + données liées. Admin only.';
