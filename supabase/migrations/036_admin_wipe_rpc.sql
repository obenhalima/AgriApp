-- ============================================================
-- Migration 036 — Admin wipe RPC functions
--
-- Crée des fonctions Postgres SECURITY DEFINER qui permettent
-- aux admins de wipe les données depuis le client web sans être
-- bloqués par les RLS policies.
--
-- Fonctions :
--   1. admin_delete_campaign(uuid)      → supprime 1 campagne + cascade
--   2. admin_operational_reset()        → wipe transactions, garde master
--   3. admin_nuclear_wipe()             → wipe TOUT (sauf auth/roles)
--
-- Sécurité : chaque fonction vérifie que l'appelant a un rôle admin
-- (profiles.role_id → roles.is_admin = true).
-- ============================================================

-- ─── Helper : vérifie que l'appelant est admin ───────────────
CREATE OR REPLACE FUNCTION is_admin_caller()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(r.is_admin, FALSE)
  INTO is_admin
  FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();

  RETURN is_admin;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. SUPPRESSION D'UNE CAMPAGNE (cascade complète)
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
  -- Auth check
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  -- Tables qui pointent vers campaign_id (sans CASCADE)
  DELETE FROM amortissements WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{amortissements}', to_jsonb(v_count));

  DELETE FROM recoltes_marche_daily WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{recoltes_marche_daily}', to_jsonb(v_count));

  DELETE FROM cost_entries WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{cost_entries}', to_jsonb(v_count));

  DELETE FROM supplier_invoices WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{supplier_invoices}', to_jsonb(v_count));

  DELETE FROM purchase_orders WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{purchase_orders}', to_jsonb(v_count));

  DELETE FROM sales_orders WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{sales_orders}', to_jsonb(v_count));

  DELETE FROM cultural_operations WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{cultural_operations}', to_jsonb(v_count));

  DELETE FROM labor_entries WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{labor_entries}', to_jsonb(v_count));

  -- Wipe les harvests via campaign_plantings de cette campagne
  -- (harvest_lot_sources et harvest_lots ne référencent pas directement la campagne mais les harvests)
  DELETE FROM harvest_lot_sources
   WHERE harvest_id IN (
     SELECT h.id FROM harvests h
     JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id
     WHERE cp.campaign_id = p_campaign_id
   );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{harvest_lot_sources}', to_jsonb(v_count));

  DELETE FROM harvest_lots
   WHERE harvest_id IN (
     SELECT h.id FROM harvests h
     JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id
     WHERE cp.campaign_id = p_campaign_id
   );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{harvest_lots}', to_jsonb(v_count));

  DELETE FROM harvests
   WHERE campaign_planting_id IN (
     SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id
   );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{harvests}', to_jsonb(v_count));

  DELETE FROM production_forecasts
   WHERE campaign_planting_id IN (
     SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id
   );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{production_forecasts}', to_jsonb(v_count));

  -- Finally : la campagne (cascade auto sur campaign_plantings + budget_lines)
  DELETE FROM campaigns WHERE id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{campaigns}', to_jsonb(v_count));

  RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. RESET OPÉRATIONNEL (transactions, garde master data)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_operational_reset()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted JSONB := '{}'::jsonb;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  -- TRUNCATE CASCADE : vide les transactions d'un coup et propage aux FK
  TRUNCATE TABLE
    chatbot_messages,
    harvest_lot_sources,
    harvest_lots,
    harvests,
    production_forecasts,
    station_prices,
    recoltes_marche_daily,
    payments_received,
    invoices,
    delivery_notes,
    sales_order_lines,
    sales_orders,
    payments_made,
    supplier_invoices,
    purchase_order_lines,
    purchase_orders,
    cost_entries,
    stock_movements,
    cultural_operations,
    labor_entries,
    alerts,
    budget_lines,
    amortissements,
    campaign_plantings,
    campaigns,
    market_prices
  RESTART IDENTITY CASCADE;

  v_deleted := jsonb_build_object('status', 'success', 'message', 'Toutes les transactions ont été vidées');

  RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. NUCLEAR WIPE (tout sauf auth/roles/profiles/permissions)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_nuclear_wipe()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted JSONB := '{}'::jsonb;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  -- 1. D'abord les transactions (mêmes tables que operational_reset)
  TRUNCATE TABLE
    chatbot_messages,
    harvest_lot_sources,
    harvest_lots,
    harvests,
    production_forecasts,
    station_prices,
    recoltes_marche_daily,
    payments_received,
    invoices,
    delivery_notes,
    sales_order_lines,
    sales_orders,
    payments_made,
    supplier_invoices,
    purchase_order_lines,
    purchase_orders,
    cost_entries,
    stock_movements,
    cultural_operations,
    labor_entries,
    alerts,
    budget_lines,
    amortissements,
    campaign_plantings,
    campaigns,
    market_prices
  RESTART IDENTITY CASCADE;

  -- 2. Master data (sauf auth/roles/permissions)
  --    Order matters : enfants avant parents
  TRUNCATE TABLE
    chatbot_users,
    workers,
    teams,
    stock_items,
    assets,
    clients,
    suppliers,
    markets,
    varieties,
    seed_suppliers,
    greenhouses,
    farm_zones,
    farms
  RESTART IDENTITY CASCADE;

  v_deleted := jsonb_build_object('status', 'success', 'message', 'Nuclear wipe terminé. Base réinitialisée (auth conservée).');

  RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- PERMISSIONS : ces fonctions sont SECURITY DEFINER mais on
-- restreint quand même l'EXECUTE aux utilisateurs authentifiés.
-- La vérification admin est faite dans le corps de la fonction.
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_delete_campaign(UUID)    FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_operational_reset()      FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_nuclear_wipe()           FROM PUBLIC;
REVOKE ALL ON FUNCTION is_admin_caller()              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_delete_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_operational_reset()   TO authenticated;
GRANT EXECUTE ON FUNCTION admin_nuclear_wipe()        TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_caller()           TO authenticated;

COMMENT ON FUNCTION admin_delete_campaign(UUID)  IS 'Supprime une campagne et toutes ses données liées. Admin only.';
COMMENT ON FUNCTION admin_operational_reset()    IS 'Vide les tables de transactions, garde le master data. Admin only.';
COMMENT ON FUNCTION admin_nuclear_wipe()         IS '⚠️ Vide toute la base sauf auth/roles. Admin only.';
