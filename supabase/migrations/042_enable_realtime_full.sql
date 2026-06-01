-- ============================================================
-- Migration 042 — Active Supabase Realtime sur TOUTES les tables
-- critiques de l'app pour que les pages se synchronisent en live.
--
-- Sans ça, les pages doivent être refresh manuellement pour voir
-- les changements faits par d'autres utilisateurs ou par le bot.
--
-- Idempotent : duplicate_object ignoré pour chaque ALTER.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- Récoltes (déjà en migration 025 mais ré-ajouté pour idempotence)
    'harvests',
    'harvest_lots',
    'harvest_lot_sources',
    'alerts',
    -- Facturation
    'invoices',
    'supplier_invoices',
    'payments_received',
    'payments_made',
    -- Bordereaux station (nouveau)
    'station_settlements',
    'station_settlement_lines',
    'station_settlement_allocations',
    -- Achats
    'purchase_orders',
    'purchase_order_lines',
    'purchase_receipts',
    -- Coûts & Budget
    'cost_entries',
    'budgets',
    'budget_lines',
    -- Stocks
    'stock_items',
    'stock_movements',
    -- Référentiels (créations à la volée)
    'farms',
    'greenhouses',
    'varieties',
    'campaigns',
    'campaign_plantings',
    'markets',
    'clients',
    'suppliers',
    -- Sales orders & dispatches
    'sales_orders',
    'sales_order_lines',
    'sales_dispatches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      RAISE NOTICE 'Realtime activé sur %', t;
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'Realtime déjà actif sur % (skip)', t;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % n''existe pas (skip)', t;
    END;
  END LOOP;
END $$;

-- ============================================================
-- Vérifier ce qui est dans la publication :
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--    ORDER BY tablename;
-- ============================================================
