-- Supabase SQL Editor: one SELECT, no writes, no function bodies or setting values.
WITH targets(table_name) AS (VALUES
 ('varieties'),('crops'),('seed_suppliers'),('crop_variety_catalog'),
 ('reference_lists'),('reference_values'),('app_settings'),('exchange_rates'),
 ('account_categories'),('workflow_definitions'),('workflow_states'),('workflow_transitions'),
 ('domains'),('farms'),('greenhouses'),('campaigns'),('campaign_plantings'),('harvest_lots'),('cost_entries'),
 ('markets'),('market_prices'),('clients'),('sales_orders'),('sales_order_lines'),
 ('station_settlements'),('station_settlement_lines'),('cultural_consumptions')
), tables AS (
 SELECT t.table_name, c.oid IS NOT NULL AS present, c.relrowsecurity AS rls_enabled,
  EXISTS(SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=t.table_name AND x.column_name='domain_id') AS has_domain_id,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name',x.column_name,'type',x.data_type) ORDER BY x.ordinal_position)
    FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=t.table_name),'[]'::jsonb) AS columns
 FROM targets t LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.table_name AND c.relkind IN ('r','p')
)
SELECT jsonb_build_object(
 'tables',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_name) FROM tables t),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',p.tablename,'policy',p.policyname,'command',p.cmd,'permissive',p.permissive,'roles',p.roles,'using',p.qual,'check',p.with_check) ORDER BY p.tablename,p.policyname)
  FROM pg_policies p JOIN targets t ON t.table_name=p.tablename WHERE p.schemaname='public'),'[]'::jsonb),
 'reference_constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'constraint',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname)
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND (c.relname IN ('varieties','crops','seed_suppliers','crop_variety_catalog') OR k.confrelid=to_regclass('public.varieties'))),'[]'::jsonb)
) AS inventory;
