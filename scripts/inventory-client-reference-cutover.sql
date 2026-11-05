-- READ ONLY preflight. Works before 150/151/152; no dependency on a missing plan table.
-- Run in Supabase SQL Editor and return the inventory result before approving cutover.
-- No contact details, credentials, financial amounts or auth tokens are selected.
WITH targets(table_name) AS (VALUES
 ('varieties'),('crops'),('seed_suppliers'),('crop_variety_catalog')
), reference_rows AS (
 SELECT 'varieties'::text AS reference_table, v.id,
  jsonb_build_object('code',v.code,'name',v.commercial_name,
   'domain_id',to_jsonb(v)->>'domain_id','active',v.is_active,
   'crop_id',v.crop_id,'supplier_id',v.supplier_id) AS metadata
 FROM public.varieties v
 UNION ALL
 SELECT 'crops',c.id,jsonb_build_object('code',c.code,'name',c.name,
  'domain_id',to_jsonb(c)->>'domain_id','active',c.is_active) FROM public.crops c
 UNION ALL
 SELECT 'seed_suppliers',s.id,jsonb_build_object('code',s.code,'name',s.name,
  'domain_id',to_jsonb(s)->>'domain_id') FROM public.seed_suppliers s
 UNION ALL
 SELECT 'crop_variety_catalog',c.id,jsonb_build_object('crop_code',c.crop_code,'name',c.name,
  'domain_id',to_jsonb(c)->>'domain_id') FROM public.crop_variety_catalog c
), relevant_relations AS (
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM targets)
), incoming AS (
 SELECT k.oid,k.conrelid,k.confrelid,k.conname FROM pg_constraint k
 WHERE k.contype='f' AND k.confrelid IN (SELECT oid FROM relevant_relations)
), inspected_relations AS (
 SELECT oid FROM relevant_relations UNION SELECT conrelid FROM incoming
 UNION SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('clients','cultural_consumptions',
  'initialization_drafts','farms','greenhouses','campaigns','markets','sales_orders','station_settlements')
)
SELECT jsonb_build_object(
 'scope','Four crop/variety reference tables and every declared incoming foreign key. Known JSON/array paths listed separately; not proof of exhaustive arbitrary JSON coverage.',
 'prerequisites',jsonb_build_object(
  'private_plan_present',to_regclass('public.client_reference_migration_plan') IS NOT NULL,
  'containment_function_present',to_regprocedure('public.guard_shared_business_reference_write()') IS NOT NULL,
  'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,
   'rls_enabled',c.relrowsecurity,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.relname)
   FROM pg_class c WHERE c.oid IN (SELECT oid FROM relevant_relations)),'[]'::jsonb)),
 'reference_rows',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.reference_table,'id',r.id,'metadata',r.metadata) ORDER BY r.reference_table,r.id) FROM reference_rows r),'[]'::jsonb),
 'dependent_tables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,
   'rls_enabled',c.relrowsecurity,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.relname)
   FROM pg_class c WHERE c.oid IN (SELECT oid FROM inspected_relations) AND c.oid NOT IN (SELECT oid FROM relevant_relations)),'[]'::jsonb),
 'incoming_foreign_keys',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'source_table',i.conrelid::regclass::text,'target_table',i.confrelid::regclass::text,
   'name',i.conname,'definition',pg_get_constraintdef(i.oid)) ORDER BY i.conrelid::regclass::text,i.conname)
   FROM incoming i),'[]'::jsonb),
 'unique_constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('table',k.conrelid::regclass::text,
   'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conrelid::regclass::text,k.conname)
   FROM pg_constraint k WHERE k.conrelid IN (SELECT oid FROM relevant_relations) AND k.contype IN ('p','u')),'[]'::jsonb),
 'indexes',coalesce((SELECT jsonb_agg(jsonb_build_object('table',i.indrelid::regclass::text,
   'name',i.indexrelid::regclass::text,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid::regclass::text)
   FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM relevant_relations)),'[]'::jsonb),
 'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('table',p.tablename,'name',p.policyname,
   'command',p.cmd,'roles',p.roles,'permissive',p.permissive,'using',p.qual,'check',p.with_check) ORDER BY p.tablename,p.policyname)
   FROM pg_policies p WHERE p.schemaname='public' AND to_regclass(format('public.%I',p.tablename)) IN (SELECT oid FROM inspected_relations)),'[]'::jsonb),
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,
   'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text,t.tgname)
   FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT oid FROM inspected_relations)),'[]'::jsonb),
 'known_non_fk_paths',jsonb_build_array('clients.preferred_variety_ids',
   'cultural_consumptions.allocations[*].variety_id',
   'initialization_drafts.payload.rows.varieties[*].existing_id'),
 'dependent_views',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('schema',n.nspname,'name',v.relname,'kind',v.relkind))
   FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid
   JOIN pg_class v ON v.oid=rw.ev_class JOIN pg_namespace n ON n.oid=v.relnamespace
   WHERE d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
    AND d.refobjid IN (SELECT oid FROM relevant_relations) AND v.relkind IN ('v','m')),'[]'::jsonb)
) AS inventory;
