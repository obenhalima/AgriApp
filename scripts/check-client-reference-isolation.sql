-- READ ONLY. Run after the cutover (or inside its rehearsal transaction).
-- This checks database structure and remapping, NOT every authenticated workflow.
WITH counts AS (
 SELECT d.code AS client,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id) AS crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND is_active) AS active_crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND NOT is_active) AS inactive_crops,
  (SELECT count(*) FROM public.crop_variety_catalog WHERE domain_id=d.id) AS suggestions,
  (SELECT count(*) FROM public.varieties WHERE domain_id=d.id) AS varieties
 FROM public.domains d WHERE d.id IN ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81',
  '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217')
), edges AS (
 SELECT 'campaign_plantings'::text AS source,p.variety_id,p.domain_id FROM public.campaign_plantings p UNION ALL
 SELECT 'cost_entries',p.variety_id,p.domain_id FROM public.cost_entries p UNION ALL
 SELECT 'harvest_lots',p.variety_id,p.domain_id FROM public.harvest_lots p UNION ALL
 SELECT 'market_prices',p.variety_id,p.domain_id FROM public.market_prices p UNION ALL
 SELECT 'sales_order_lines',p.variety_id,p.domain_id FROM public.sales_order_lines p UNION ALL
 SELECT 'station_settlement_lines',p.variety_id,p.domain_id FROM public.station_settlement_lines p
), json_edges AS (
 SELECT 'cultural_consumptions'::text AS source,k.domain_id,x.value->>'variety_id' AS variety_id
 FROM public.cultural_consumptions k CROSS JOIN LATERAL jsonb_array_elements(k.allocations) x UNION ALL
 SELECT 'cultural_programs',d.domain_id,x.value->>'variety_id'
 FROM public.cultural_programs d CROSS JOIN LATERAL jsonb_array_elements(d.targets) x UNION ALL
 SELECT 'initialization_drafts',d.domain_id,x.value->>'existing_id'
 FROM public.initialization_drafts d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.payload->'rows'->'varieties','[]'::jsonb)) x
)
SELECT jsonb_build_object(
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY client) FROM counts c),'[]'::jsonb),
 'unowned_references',(SELECT count(*) FROM (
  SELECT domain_id FROM public.crops UNION ALL SELECT domain_id FROM public.varieties UNION ALL
  SELECT domain_id FROM public.crop_variety_catalog UNION ALL SELECT domain_id FROM public.seed_suppliers) r WHERE domain_id IS NULL),
 'foreign_relational_edges',(SELECT count(*) FROM edges e LEFT JOIN public.varieties v ON v.id=e.variety_id
  WHERE e.variety_id IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_json_edges',(SELECT count(*) FROM json_edges e LEFT JOIN public.varieties v ON v.id::text=e.variety_id
  WHERE nullif(e.variety_id,'') IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_crop_edges',(SELECT count(*) FROM public.varieties v JOIN public.crops c ON c.id=v.crop_id WHERE c.domain_id IS DISTINCT FROM v.domain_id),
 'foreign_supplier_edges',(SELECT count(*) FROM public.varieties v JOIN public.seed_suppliers s ON s.id=v.supplier_id WHERE s.domain_id IS DISTINCT FROM v.domain_id),
 'business_rows_changed_outside_reference_ids',(SELECT count(*) FROM public.client_reference_cutover_snapshot
  WHERE reference_table IN ('campaign_plantings','cost_entries','harvest_lots','market_prices','sales_order_lines','station_settlement_lines')
   AND (before_row-'variety_id'-'domain_id') IS DISTINCT FROM (after_row-'variety_id'-'domain_id')),
 'settlements_changed',(SELECT count(*) FROM public.client_reference_cutover_snapshot WHERE reference_table='station_settlements' AND (before_row-'domain_id') IS DISTINCT FROM (after_row-'domain_id')),
 'legacy_empty_settlements_quarantined',(SELECT count(*) FROM public.station_settlements WHERE domain_id IS NULL),
 'rls_tables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.crops'::regclass,'public.varieties'::regclass,'public.seed_suppliers'::regclass,
   'public.crop_variety_catalog'::regclass,'public.market_prices'::regclass,'public.sales_order_lines'::regclass,'public.station_settlement_lines'::regclass)),'[]'::jsonb),
 'validated_variety_client_keys',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated
  AND conname IN ('campaign_plantings_variety_client_fk','cost_entries_variety_client_fk','harvest_lots_variety_client_fk',
   'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')),
 'views',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'options',reloptions) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.v_planting_forecasts'::regclass,'public.v_production_summary'::regclass)),'[]'::jsonb)
) AS isolation_check;
