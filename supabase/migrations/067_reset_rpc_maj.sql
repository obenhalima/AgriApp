-- ============================================================
-- Migration 067 — Mise à jour des RPC de reset (tables récentes)
--
-- Les RPC admin_nuclear_wipe / admin_operational_reset (036) ne connaissaient
-- pas les tables transactionnelles ajoutées depuis :
--   • bordereaux station (040) : station_settlements + lignes + allocations
--   • lignes de plateaux (054) : harvest_tray_lines
--   • bordereaux marché (049)  : market_bordereaux
-- On les ajoute pour ne rien laisser traîner. Le helper _admin_truncate_table
-- ignore proprement les tables absentes (status 'missing'), donc c'est sûr.
--
-- KEEP (jamais effacé) : reference_lists/values, account_categories,
-- app_settings, business_params, exchange_rates, workflow_*, crops,
-- crop_variety_catalog, users/profiles, roles, permissions.
-- ============================================================

SET search_path = public;

-- Liste des tables TRANSACTIONNELLES (ordre enfant → parent), partagée.
-- (répétée en dur dans chaque fonction ci-dessous)

CREATE OR REPLACE FUNCTION admin_nuclear_wipe()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tbl TEXT; results JSONB := '[]'::jsonb; rec JSONB; total_rows BIGINT := 0;
BEGIN
  IF NOT is_admin_caller() THEN RAISE EXCEPTION 'Permission refusée : admin requis'; END IF;
  SET LOCAL statement_timeout = '90s';
  FOR tbl IN SELECT unnest(ARRAY[
    -- Transactions
    'chatbot_messages',
    'harvest_tray_lines',
    'harvest_lot_sources',
    'station_settlement_allocations',
    'station_settlement_lines',
    'station_settlements',
    'harvest_lots',
    'harvests',
    'production_forecasts',
    'station_prices',
    'recoltes_marche_daily',
    'market_bordereaux',
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
  RETURN jsonb_build_object('status','success','total_rows',total_rows,
    'message',format('Nuclear wipe terminé. %s lignes effacées.',total_rows),'tables',results);
END; $$;

CREATE OR REPLACE FUNCTION admin_operational_reset()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tbl TEXT; results JSONB := '[]'::jsonb; rec JSONB; total_rows BIGINT := 0;
BEGIN
  IF NOT is_admin_caller() THEN RAISE EXCEPTION 'Permission refusée : admin requis'; END IF;
  SET LOCAL statement_timeout = '90s';
  FOR tbl IN SELECT unnest(ARRAY[
    'chatbot_messages',
    'harvest_tray_lines',
    'harvest_lot_sources',
    'station_settlement_allocations',
    'station_settlement_lines',
    'station_settlements',
    'harvest_lots',
    'harvests',
    'production_forecasts',
    'station_prices',
    'recoltes_marche_daily',
    'market_bordereaux',
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
  RETURN jsonb_build_object('status','success','total_rows',total_rows,
    'message',format('Reset opérationnel terminé. %s lignes effacées.',total_rows),'tables',results);
END; $$;
