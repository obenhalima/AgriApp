-- CANDIDATE ONLY: PostgreSQL rehearsal and explicit execution approval required.
-- Requires 150..153. Transactional cutover of the four crop/variety references.
-- The eight other references frozen by 150 remain frozen. No quantities/prices
-- are changed. Unknown owners, references, or source drift abort the transaction.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

DO $preflight$
DECLARE t text;
BEGIN
 IF auth.role() IN ('authenticated','anon') THEN
  RAISE EXCEPTION 'Intervention administrative approuvée requise' USING ERRCODE='42501';
 END IF;
 LOCK TABLE public.client_reference_migration_plan,public.client_reference_source_snapshot,
  public.crops,public.varieties,public.crop_variety_catalog,public.seed_suppliers,
  public.domains,public.farms,public.greenhouses,public.campaigns,
  public.campaign_plantings,public.harvest_lots,public.cost_entries,
  public.market_prices,public.markets,public.sales_order_lines,public.sales_orders,
  public.station_settlement_lines,public.station_settlements,public.clients,
  public.cultural_consumptions,public.cultural_programs,public.initialization_drafts IN EXCLUSIVE MODE;
 IF (SELECT count(*) FROM public.client_reference_migration_plan)<>126
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='crops')<>45
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='crop_variety_catalog')<>69
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='varieties')<>12
  OR EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE NOT approved)
  OR EXISTS(SELECT 1 FROM public.seed_suppliers) THEN
  RAISE EXCEPTION 'Plan confirmé incomplet ou inventaire modifié';
 END IF;
 IF has_table_privilege('authenticated','public.client_reference_migration_plan','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('anon','public.client_reference_migration_plan','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('authenticated','public.client_reference_source_snapshot','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('anon','public.client_reference_source_snapshot','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
  RAISE EXCEPTION 'Plan et instantané doivent rester privés';
 END IF;
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass
   AND tgname=t||'_shared_write_guard' AND tgenabled='O')
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass
   AND tgname=t||'_shared_truncate_guard' AND tgenabled='O') THEN
   RAISE EXCEPTION 'Confinement complet requis sur %',t;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p JOIN public.domains d ON d.id=p.domain_id
  WHERE NOT d.is_active OR d.id NOT IN ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81','8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217')) THEN
  RAISE EXCEPTION 'Client du plan absent ou inactif';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table='varieties'
  AND (p.target_active IS DISTINCT FROM true OR p.target_crop_source_id IS DISTINCT FROM '67c4a6a8-d572-42e4-884f-f32f12c0a1aa'::uuid
   OR p.source_id NOT IN ('806f845e-9e81-489a-9341-7ace21dcccda','8d67b5d6-a0c9-4939-94a1-ed090d3899ba',
     '37caf3ef-fbab-4a25-94a3-9fe35402432b','ec26adb4-a819-4750-afe9-6b3594eb0796'))) THEN
  RAISE EXCEPTION 'Répartition des variétés différente du plan approuvé';
 END IF;
 -- Enumerate all incoming foreign keys, not only varieties' direct callers.
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid IN
  ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass))<>8
  OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f' AND k.confrelid IN
   ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass)
   AND NOT ((k.confrelid='public.varieties'::regclass AND k.conrelid IN
    ('public.campaign_plantings'::regclass,'public.cost_entries'::regclass,'public.harvest_lots'::regclass,
     'public.market_prices'::regclass,'public.sales_order_lines'::regclass,'public.station_settlement_lines'::regclass)
    AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='variety_id')]::smallint[])
    OR (k.conrelid='public.varieties'::regclass AND
     ((k.confrelid='public.crops'::regclass AND k.conname='varieties_crop_id_fkey')
      OR (k.confrelid='public.seed_suppliers'::regclass AND k.conname='varieties_supplier_id_fkey'))))) THEN
  RAISE EXCEPTION 'Dépendance nouvelle ou différente : réexaminer les clés étrangères';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cost_entries'::regclass AND tgname='trg_guard_generated_consumption_cost' AND tgenabled='O')
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.station_settlement_lines'::regclass AND tgname='trg_sl_recompute_totals' AND tgenabled='O') THEN
  RAISE EXCEPTION 'État des triggers métier différent de l’inventaire';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_depend dep JOIN pg_rewrite rw ON rw.oid=dep.objid JOIN pg_class v ON v.oid=rw.ev_class
  WHERE dep.classid='pg_rewrite'::regclass AND dep.refclassid='pg_class'::regclass
   AND dep.refobjid IN ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass)
   AND v.relkind IN ('v','m') AND v.oid NOT IN ('public.v_planting_forecasts'::regclass,'public.v_production_summary'::regclass)) THEN
  RAISE EXCEPTION 'Vue dépendante non examinée : arrêt de la migration';
 END IF;
END $preflight$;

CREATE TABLE public.client_reference_live_before AS
 SELECT 'crops'::text AS reference_table,id AS source_id,to_jsonb(c) AS row FROM public.crops c UNION ALL
 SELECT 'varieties',id,to_jsonb(v) FROM public.varieties v UNION ALL
 SELECT 'crop_variety_catalog',id,to_jsonb(c) FROM public.crop_variety_catalog c;
ALTER TABLE public.client_reference_live_before ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_live_before FROM PUBLIC,anon,authenticated,service_role;
DO $source_check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.client_reference_live_before l FULL JOIN public.client_reference_source_snapshot s
  USING(reference_table,source_id) WHERE l.row IS DISTINCT FROM s.before_row)
  OR EXISTS(SELECT 1 FROM public.client_reference_migration_plan p LEFT JOIN public.client_reference_live_before s USING(reference_table,source_id)
   WHERE s.source_id IS NULL)
  OR EXISTS(SELECT 1 FROM public.client_reference_live_before s WHERE NOT EXISTS(
   SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table=s.reference_table AND p.source_id=s.source_id AND p.destination_id=s.source_id)) THEN
  RAISE EXCEPTION 'Sources modifiées ou couverture du plan insuffisante';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p JOIN public.client_reference_live_before l
  ON l.reference_table=p.reference_table AND l.source_id=p.destination_id WHERE p.destination_id<>p.source_id) THEN
  RAISE EXCEPTION 'Collision d’identifiant de destination';
 END IF;
END $source_check$;

-- Resolve ownership using authoritative parent chains, never using the shared
-- variety itself. Commercial preferences with no owner are rejected, not guessed.
CREATE TABLE public.client_reference_usage_work AS
WITH raw(reference_table,record_key,variety_id,candidates) AS (
 SELECT 'campaign_plantings',p.id::text,p.variety_id::text,ARRAY[p.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.campaign_plantings p LEFT JOIN public.campaigns c ON c.id=p.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=p.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'harvest_lots',h.id::text,h.variety_id::text,ARRAY[h.domain_id::text,p.domain_id::text,f.domain_id::text]
  FROM public.harvest_lots h LEFT JOIN public.campaign_plantings p ON p.id=h.campaign_planting_id
  LEFT JOIN public.greenhouses g ON g.id=h.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'cost_entries',e.id::text,e.variety_id::text,ARRAY[e.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cost_entries e LEFT JOIN public.campaigns c ON c.id=e.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=e.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'sales_order_lines',l.id::text,l.variety_id::text,ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(o)->>'domain_id',c.domain_id::text,f.domain_id::text,to_jsonb(b)->>'domain_id']
  FROM public.sales_order_lines l LEFT JOIN public.sales_orders o ON o.id=l.order_id LEFT JOIN public.campaigns c ON c.id=o.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=l.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id LEFT JOIN public.clients b ON b.id=o.client_id
 UNION ALL
 SELECT 'market_prices',p.id::text,p.variety_id::text,ARRAY[to_jsonb(p)->>'domain_id',to_jsonb(m)->>'domain_id']
  FROM public.market_prices p LEFT JOIN public.markets m ON m.id=p.market_id
 UNION ALL
 SELECT 'station_settlement_lines',l.id::text,l.variety_id::text,ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(s)->>'domain_id',f.domain_id::text,to_jsonb(m)->>'domain_id']
  FROM public.station_settlement_lines l LEFT JOIN public.station_settlements s ON s.id=l.settlement_id
  LEFT JOIN public.farms f ON f.id=l.farm_id LEFT JOIN public.markets m ON m.id=l.market_id
 UNION ALL
 SELECT 'clients',b.id::text,x.value,ARRAY[to_jsonb(b)->>'domain_id',to_jsonb(m)->>'domain_id']
  FROM public.clients b LEFT JOIN public.markets m ON m.id=b.market_id CROSS JOIN LATERAL
  jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(b)->'preferred_variety_ids')='array' THEN to_jsonb(b)->'preferred_variety_ids' ELSE '[]'::jsonb END) x
 UNION ALL
 SELECT 'cultural_consumptions',k.movement_id::text,x.value->>'variety_id',ARRAY[k.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cultural_consumptions k CROSS JOIN LATERAL jsonb_array_elements(k.allocations) x
  LEFT JOIN public.campaigns c ON c.id::text=x.value->>'campaign_id'
  LEFT JOIN public.greenhouses g ON g.id::text=x.value->>'greenhouse_id' LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'cultural_programs',p.id::text,x.value->>'variety_id',ARRAY[p.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cultural_programs p CROSS JOIN LATERAL jsonb_array_elements(p.targets) x
  LEFT JOIN public.campaigns c ON c.id::text=x.value->>'campaign_id'
  LEFT JOIN public.greenhouses g ON g.id::text=x.value->>'greenhouse_id' LEFT JOIN public.farms f ON f.id=g.farm_id
)
SELECT reference_table,record_key,variety_id,
 ARRAY(SELECT DISTINCT owner FROM unnest(candidates) owner WHERE owner IS NOT NULL AND owner<>'' ORDER BY owner) owners
FROM raw WHERE variety_id IS NOT NULL AND variety_id<>'';
ALTER TABLE public.client_reference_usage_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_usage_work FROM PUBLIC,anon,authenticated,service_role;
DO $usage_check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.client_reference_usage_work WHERE cardinality(owners)<>1)
  OR EXISTS(SELECT 1 FROM public.client_reference_usage_work u WHERE NOT EXISTS(
   SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table='varieties'
    AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1])) THEN
  RAISE EXCEPTION 'Lien historique sans propriétaire unique ou non prévu : arrêt sans changement';
 END IF;
END $usage_check$;

-- Store affected business rows privately for verification/manual recovery.
CREATE TABLE public.client_reference_cutover_snapshot (
 reference_table text NOT NULL, record_key text NOT NULL, before_row jsonb NOT NULL,
 after_row jsonb, captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reference_table,record_key)
);
ALTER TABLE public.client_reference_cutover_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_cutover_snapshot FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_reference_cutover_snapshot TO service_role;
DO $capture$
DECLARE t text; key_column text;
BEGIN
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines',
  'station_settlement_lines','station_settlements','clients','cultural_consumptions','cultural_programs','initialization_drafts'] LOOP
  key_column:=CASE t WHEN 'cultural_consumptions' THEN 'movement_id' WHEN 'initialization_drafts' THEN 'domain_id' ELSE 'id' END;
  EXECUTE format('INSERT INTO public.client_reference_cutover_snapshot(reference_table,record_key,before_row) SELECT %L,%I::text,to_jsonb(r) FROM public.%I r',t,key_column,t);
 END LOOP;
END $capture$;

ALTER TABLE public.varieties DROP CONSTRAINT varieties_code_key;
ALTER TABLE public.crops DROP CONSTRAINT crops_code_key;
ALTER TABLE public.seed_suppliers DROP CONSTRAINT seed_suppliers_code_key;
ALTER TABLE public.crop_variety_catalog DROP CONSTRAINT crop_variety_catalog_crop_code_name_key;

DO $copy$
DECLARE p record; patch jsonb; crop_destination uuid;
BEGIN
 FOR p IN SELECT m.*,s.before_row FROM public.client_reference_migration_plan m
  JOIN public.client_reference_source_snapshot s USING(reference_table,source_id)
  ORDER BY CASE m.reference_table WHEN 'crops' THEN 1 WHEN 'crop_variety_catalog' THEN 2 ELSE 3 END,m.source_id,m.domain_id LOOP
  patch:=jsonb_build_object('id',p.destination_id,'domain_id',p.domain_id);
  IF p.reference_table IN ('crops','varieties') THEN patch:=patch||jsonb_build_object('is_active',p.target_active); END IF;
  IF p.reference_table='varieties' THEN
   SELECT destination_id INTO STRICT crop_destination FROM public.client_reference_migration_plan
    WHERE reference_table='crops' AND source_id=p.target_crop_source_id AND domain_id=p.domain_id;
   patch:=patch||jsonb_build_object('crop_id',crop_destination);
  END IF;
  IF p.source_id=p.destination_id THEN
   IF p.reference_table='varieties' THEN
    UPDATE public.varieties SET domain_id=p.domain_id,is_active=p.target_active,crop_id=crop_destination WHERE id=p.source_id;
   ELSIF p.reference_table='crops' THEN
    UPDATE public.crops SET domain_id=p.domain_id,is_active=p.target_active WHERE id=p.source_id;
   ELSE
    UPDATE public.crop_variety_catalog SET domain_id=p.domain_id WHERE id=p.source_id;
   END IF;
  ELSE
   EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I,$1)).*',p.reference_table,p.reference_table)
    USING p.before_row||patch;
  END IF;
 END LOOP;
END $copy$;

ALTER TABLE public.market_prices ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_order_lines ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.station_settlement_lines ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.station_settlements ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
DO $settlement_owners$
BEGIN
 IF EXISTS(SELECT 1 FROM public.station_settlement_lines l JOIN public.client_reference_usage_work u
  ON u.reference_table='station_settlement_lines' AND u.record_key=l.id::text
  GROUP BY l.settlement_id HAVING count(DISTINCT u.owners[1])<>1) THEN
  RAISE EXCEPTION 'Bordereau partagé entre clients : séparation manuelle requise, aucune migration conservée';
 END IF;
 UPDATE public.station_settlements s SET domain_id=x.owner::uuid FROM (
  SELECT l.settlement_id,min(u.owners[1]) owner FROM public.station_settlement_lines l
  JOIN public.client_reference_usage_work u ON u.reference_table='station_settlement_lines' AND u.record_key=l.id::text
  GROUP BY l.settlement_id) x WHERE s.id=x.settlement_id;
 -- Empty legacy headers remain unowned, quarantined from tenant writes.
END $settlement_owners$;
-- Only these two named triggers are suspended under exclusive locks; rollback
-- also rolls back their DDL state. Never disable ALL/USER or replication checks.
ALTER TABLE public.cost_entries DISABLE TRIGGER trg_guard_generated_consumption_cost;
ALTER TABLE public.station_settlement_lines DISABLE TRIGGER trg_sl_recompute_totals;
DO $remap$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('UPDATE public.%I r SET variety_id=p.destination_id,domain_id=p.domain_id FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p ON p.reference_table=''varieties'' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1] WHERE u.reference_table=%L AND r.id::text=u.record_key AND (r.variety_id IS DISTINCT FROM p.destination_id OR r.domain_id IS DISTINCT FROM p.domain_id)',t,t);
 END LOOP;
END $remap$;
ALTER TABLE public.cost_entries ENABLE TRIGGER trg_guard_generated_consumption_cost;
ALTER TABLE public.station_settlement_lines ENABLE TRIGGER trg_sl_recompute_totals;

UPDATE public.cultural_consumptions k SET allocations=(
 SELECT jsonb_agg(CASE WHEN nullif(a.value->>'variety_id','') IS NULL THEN a.value ELSE
  jsonb_set(a.value,'{variety_id}',to_jsonb(p.destination_id::text)) END ORDER BY a.ordinality)
 FROM jsonb_array_elements(k.allocations) WITH ORDINALITY a(value,ordinality)
 LEFT JOIN public.client_reference_migration_plan p ON p.reference_table='varieties'
  AND p.source_id::text=a.value->>'variety_id' AND p.domain_id=k.domain_id)
 WHERE EXISTS(SELECT 1 FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p
  ON p.reference_table='varieties' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1]
  WHERE u.reference_table='cultural_consumptions' AND u.record_key=k.movement_id::text AND p.source_id<>p.destination_id);

UPDATE public.cultural_programs k SET targets=(
 SELECT jsonb_agg(CASE WHEN nullif(a.value->>'variety_id','') IS NULL THEN a.value ELSE
  jsonb_set(a.value,'{variety_id}',to_jsonb(p.destination_id::text)) END ORDER BY a.ordinality)
 FROM jsonb_array_elements(k.targets) WITH ORDINALITY a(value,ordinality)
 LEFT JOIN public.client_reference_migration_plan p ON p.reference_table='varieties'
  AND p.source_id::text=a.value->>'variety_id' AND p.domain_id=k.domain_id)
 WHERE EXISTS(SELECT 1 FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p
  ON p.reference_table='varieties' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1]
  WHERE u.reference_table='cultural_programs' AND u.record_key=k.id::text AND p.source_id<>p.destination_id);

-- No commercial preferences have an authoritative tenant in the reviewed
-- schema. If present the preflight above aborts; never infer a tenant from an ID.
DO $drafts$
DECLARE r record; entry record; p uuid; new_rows jsonb; content jsonb;
BEGIN
 FOR r IN SELECT * FROM public.initialization_drafts LOOP
  content:=r.payload; new_rows:='[]'::jsonb;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(r.payload->'rows'->'varieties','[]'::jsonb)) LOOP
   IF nullif(entry.value->>'existing_id','') IS NOT NULL THEN
    SELECT destination_id INTO p FROM public.client_reference_migration_plan WHERE reference_table='varieties'
     AND source_id::text=entry.value->>'existing_id' AND domain_id=r.domain_id;
    IF p IS NULL THEN RAISE EXCEPTION 'Variété liée du brouillon hors client : résolution manuelle requise'; END IF;
    entry.value:=jsonb_set(entry.value,'{existing_id}',to_jsonb(p::text));
   END IF;
   new_rows:=new_rows||jsonb_build_array(entry.value);
  END LOOP;
  IF content->'rows' ? 'varieties' THEN content:=jsonb_set(content,'{rows,varieties}',new_rows); END IF;
  IF content IS DISTINCT FROM r.payload THEN
   content:=jsonb_set(content,'{reviewed}','[]'::jsonb);
   UPDATE public.initialization_drafts SET payload=content,revision=revision+1,updated_at=now() WHERE domain_id=r.domain_id;
  END IF;
 END LOOP;
END $drafts$;

CREATE UNIQUE INDEX varieties_client_code ON public.varieties(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX crops_client_code ON public.crops(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX seed_suppliers_client_code ON public.seed_suppliers(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX catalogue_client_name ON public.crop_variety_catalog(domain_id,crop_code,lower(trim(name)));
ALTER TABLE public.varieties ADD CONSTRAINT varieties_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.crops ADD CONSTRAINT crops_id_client_key UNIQUE(id,domain_id),ADD CONSTRAINT crops_code_client_key UNIQUE(code,domain_id);
ALTER TABLE public.seed_suppliers ADD CONSTRAINT suppliers_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.station_settlements ADD CONSTRAINT settlement_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.station_settlement_lines ADD CONSTRAINT settlement_line_parent_client_fk FOREIGN KEY(settlement_id,domain_id) REFERENCES public.station_settlements(id,domain_id);
DROP INDEX IF EXISTS public.uq_settlement_period;
DROP INDEX IF EXISTS public.uq_settlement_period_type;
DROP INDEX IF EXISTS public.uq_settlement_period_market;
CREATE UNIQUE INDEX settlement_client_period_market ON public.station_settlements(domain_id,period_start,period_end,coalesce(market_id,'00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.varieties ADD CONSTRAINT varieties_crop_client_fk FOREIGN KEY(crop_id,domain_id) REFERENCES public.crops(id,domain_id),
 ADD CONSTRAINT varieties_supplier_client_fk FOREIGN KEY(supplier_id,domain_id) REFERENCES public.seed_suppliers(id,domain_id);
ALTER TABLE public.crop_variety_catalog ADD CONSTRAINT catalogue_crop_client_fk FOREIGN KEY(crop_code,domain_id) REFERENCES public.crops(code,domain_id);
DO $tenant_keys$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN domain_id SET NOT NULL',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(variety_id,domain_id) REFERENCES public.varieties(id,domain_id)',t,t||'_variety_client_fk');
 END LOOP;
END $tenant_keys$;

-- RLS also protects direct API reads and writes, without trusting UI selection.
-- Remove all old policies; permissive policies otherwise combine with OR.
DO $tenant_policies$
DECLARE t text; p record;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',t);
  EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid())))',t||'_client_read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND public.is_domain_admin(domain_id,auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND public.is_domain_admin(domain_id,auth.uid()))',t||'_client_write',t);
 END LOOP;
END $tenant_policies$;

CREATE FUNCTION public.guard_client_reference_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parent_domain uuid;
BEGIN
 IF TG_LEVEL='STATEMENT' THEN
  IF auth.role() IN ('authenticated','anon') THEN RAISE EXCEPTION 'Réinitialisation globale interdite' USING ERRCODE='42501'; END IF;
  RETURN NULL;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.domain_id IS DISTINCT FROM NEW.domain_id OR OLD.id IS DISTINCT FROM NEW.id) THEN
  RAISE EXCEPTION 'Identifiant et propriétaire immuables' USING ERRCODE='42501';
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='sales_order_lines' THEN
  SELECT c.domain_id INTO parent_domain FROM public.sales_orders o JOIN public.campaigns c ON c.id=o.campaign_id WHERE o.id=NEW.order_id;
  IF parent_domain IS NULL OR parent_domain IS DISTINCT FROM NEW.domain_id THEN
   RAISE EXCEPTION 'Commande sans campagne du client : rapprochement requis' USING ERRCODE='42501';
  END IF;
  IF NEW.greenhouse_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id AND f.domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Serre de vente hors client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='station_settlement_lines' THEN
  IF NOT EXISTS(SELECT 1 FROM public.station_settlements WHERE id=NEW.settlement_id AND domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Bordereau parent hors client' USING ERRCODE='42501';
  END IF;
  IF NEW.farm_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.farms WHERE id=NEW.farm_id AND domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Ferme de bordereau hors client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF auth.role() IN ('authenticated','anon') AND (auth.uid() IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END AND is_active)
  OR NOT coalesce(CASE WHEN TG_TABLE_NAME='station_settlement_lines' THEN
   public.has_domain_permission(CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END,auth.uid(),'recoltes','edit')
   ELSE public.is_domain_admin(CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END,auth.uid()) END,false)) THEN
  RAISE EXCEPTION 'Modification non autorisée pour ce client' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_reference_owner() FROM PUBLIC,anon,authenticated;
DO $reference_triggers$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog'] LOOP
  EXECUTE format('DROP TRIGGER %I ON public.%I',t||'_shared_write_guard',t);
  EXECUTE format('DROP TRIGGER %I ON public.%I',t||'_shared_truncate_guard',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_owner()',t||'_client_owner_guard',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_client_reference_owner()',t||'_client_truncate_guard',t);
 END LOOP;
END $reference_triggers$;

CREATE FUNCTION public.guard_client_settlement_header() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d uuid;
BEGIN
 d:=CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END;
 IF auth.role() IN ('authenticated','anon') THEN
  IF TG_OP='UPDATE' AND (OLD.domain_id IS DISTINCT FROM NEW.domain_id OR OLD.id IS DISTINCT FROM NEW.id) THEN
   RAISE EXCEPTION 'Propriétaire du bordereau immuable' USING ERRCODE='42501';
  END IF;
  IF d IS NULL OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
   OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active)
   OR NOT coalesce(public.has_domain_permission(d,auth.uid(),'recoltes','edit'),false) THEN
   RAISE EXCEPTION 'Bordereau non attribué ou non autorisé pour ce client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='INSERT' AND d IS NOT NULL THEN
  NEW.code:=left(NEW.code,31)||'-'||left(replace(d::text,'-',''),8);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_settlement_header() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_client_settlement_header BEFORE INSERT OR UPDATE OR DELETE ON public.station_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_client_settlement_header();
DO $header_policies$
DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='station_settlements' LOOP
  EXECUTE format('DROP POLICY %I ON public.station_settlements',p.policyname);
 END LOOP;
END $header_policies$;
ALTER TABLE public.station_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.station_settlements FROM PUBLIC,anon;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.station_settlements FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.station_settlements TO authenticated;
CREATE POLICY settlement_client_read ON public.station_settlements FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid())));
CREATE POLICY settlement_client_write ON public.station_settlements FOR ALL TO authenticated
 USING (domain_id IS NOT NULL AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','edit'))
 WITH CHECK (domain_id IS NOT NULL AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','edit'));

-- Check JSON references even for SECURITY DEFINER callers. Commercial preference
-- arrays remain read-only until the commercial client itself has tenant ownership.
CREATE FUNCTION public.guard_client_reference_json() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE entry jsonb; items jsonb; owner uuid;
BEGIN
 IF TG_TABLE_NAME='clients' THEN
  items:=coalesce(to_jsonb(NEW)->'preferred_variety_ids','[]'::jsonb);
  IF jsonb_typeof(items)='null' THEN items:='[]'::jsonb; END IF;
  IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>0 THEN
   RAISE EXCEPTION 'Préférences variétés indisponibles avant isolation des clients commerciaux';
  END IF;
  RETURN NEW;
 END IF;
 owner:=NEW.domain_id;
 IF TG_TABLE_NAME='cultural_consumptions' THEN
  items:=NEW.allocations;
 ELSIF TG_TABLE_NAME='cultural_programs' THEN
  items:=NEW.targets;
 ELSE
  items:=coalesce(NEW.payload->'rows'->'varieties','[]'::jsonb);
 END IF;
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste de références invalide'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN
   IF (nullif(entry->>'campaign_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaigns WHERE id::text=entry->>'campaign_id' AND domain_id=owner))
    OR (nullif(entry->>'planting_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaign_plantings WHERE id::text=entry->>'planting_id' AND domain_id=owner))
    OR (nullif(entry->>'greenhouse_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id::text=entry->>'greenhouse_id' AND f.domain_id=owner)) THEN
    RAISE EXCEPTION 'Allocation liée à une campagne ou serre hors client' USING ERRCODE='42501';
   END IF;
  END IF;
  IF nullif(entry->>CASE WHEN TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN 'variety_id' ELSE 'existing_id' END,'') IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.varieties v WHERE v.id::text=entry->>CASE WHEN TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN 'variety_id' ELSE 'existing_id' END AND v.domain_id=owner) THEN
   RAISE EXCEPTION 'Référence JSON hors client' USING ERRCODE='42501';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_reference_json() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER client_variety_preferences_guard BEFORE INSERT OR UPDATE OF preferred_variety_ids ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER cultural_variety_json_guard BEFORE INSERT OR UPDATE ON public.cultural_consumptions FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER cultural_program_variety_guard BEFORE INSERT OR UPDATE ON public.cultural_programs FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER draft_variety_json_guard BEFORE INSERT OR UPDATE ON public.initialization_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();

ALTER VIEW public.v_planting_forecasts SET (security_invoker=true);
ALTER VIEW public.v_production_summary SET (security_invoker=true);

DO $postconditions$
DECLARE t text; key_column text;
BEGIN
 IF (SELECT count(*) FROM public.crops)<>45 OR (SELECT count(*) FROM public.crop_variety_catalog)<>69
  OR (SELECT count(*) FROM public.varieties)<>12 OR EXISTS(SELECT 1 FROM public.seed_suppliers)
  OR (SELECT count(*) FROM public.crops WHERE is_active)<>24
  OR (SELECT count(*) FROM public.crops WHERE NOT is_active)<>21
  OR EXISTS(SELECT 1 FROM public.varieties WHERE NOT is_active) THEN
  RAISE EXCEPTION 'Résultats différents de la confirmation';
 END IF;
 IF EXISTS(SELECT 1 FROM public.station_settlements s JOIN public.client_reference_cutover_snapshot b
  ON b.reference_table='station_settlements' AND b.record_key=s.id::text WHERE (to_jsonb(s)-'domain_id') IS DISTINCT FROM (b.before_row-'domain_id')) THEN
  RAISE EXCEPTION 'Un bordereau a changé : annulation complète';
 END IF;
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('UPDATE public.client_reference_cutover_snapshot b SET after_row=to_jsonb(r) FROM public.%I r WHERE b.reference_table=%L AND b.record_key=r.id::text',t,t);
  IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table=t
   AND (after_row IS NULL OR (before_row-'variety_id'-'domain_id') IS DISTINCT FROM (after_row-'variety_id'-'domain_id'))) THEN
   RAISE EXCEPTION 'Modification métier inattendue sur % : annulation',t;
  END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['station_settlements','clients','cultural_consumptions','cultural_programs','initialization_drafts'] LOOP
  key_column:=CASE t WHEN 'cultural_consumptions' THEN 'movement_id' WHEN 'initialization_drafts' THEN 'domain_id' ELSE 'id' END;
  EXECUTE format('UPDATE public.client_reference_cutover_snapshot b SET after_row=to_jsonb(r) FROM public.%I r WHERE b.reference_table=%L AND b.record_key=r.%I::text',t,t,key_column);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table='cultural_consumptions'
  AND (before_row-'allocations') IS DISTINCT FROM (after_row-'allocations')) THEN
  RAISE EXCEPTION 'Consommation modifiée hors références : annulation';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table='cultural_programs'
  AND (before_row-'targets') IS DISTINCT FROM (after_row-'targets')) THEN
  RAISE EXCEPTION 'Programme modifié hors références : annulation';
 END IF;
END $postconditions$;

-- UI readiness is a separate server acknowledgement, not an authorization
-- switch. RLS, ownership triggers and composite FKs remain authoritative.
CREATE FUNCTION public.client_reference_isolation_ready(p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  AND EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
  AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(p_domain,auth.uid()))
  AND EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE domain_id=p_domain AND approved)
  AND NOT EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE after_row IS NULL)
  AND (SELECT count(*) FROM pg_constraint WHERE conname IN
   ('campaign_plantings_variety_client_fk','harvest_lots_variety_client_fk','cost_entries_variety_client_fk',
    'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')
   AND convalidated AND connamespace='public'::regnamespace)=6;
$$;
REVOKE ALL ON FUNCTION public.client_reference_isolation_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client_reference_isolation_ready(uuid) TO authenticated;

-- Replace settlement lines atomically; legacy delete-then-insert API calls must
-- fail BEFORE deletion, including an old deployed client without domain_id.
CREATE FUNCTION public.replace_client_settlement_lines(p_domain uuid,p_settlement uuid,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE line jsonb; status text; qty numeric; price numeric; variety uuid; farm uuid; market uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
  OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'recoltes','edit'),false) THEN
  RAISE EXCEPTION 'Modification de bordereau non autorisée pour ce client' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)>1000 OR octet_length(p_lines::text)>2000000 THEN
  RAISE EXCEPTION 'Liste de lignes invalide';
 END IF;
 SELECT s.status INTO status FROM public.station_settlements s WHERE id=p_settlement AND domain_id=p_domain FOR UPDATE;
 IF NOT FOUND OR status<>'brouillon' THEN RAISE EXCEPTION 'Bordereau absent ou déjà validé'; END IF;
 IF EXISTS(SELECT 1 FROM public.station_settlement_lines WHERE settlement_id=p_settlement AND domain_id<>p_domain) THEN
  RAISE EXCEPTION 'Bordereau partagé entre clients : séparation requise avant modification';
 END IF;
 -- Validate every submitted row before the first delete. SQL exceptions still
 -- roll back the entire replacement if any later insert or trigger fails.
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(line)<>'object' THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
  variety:=(line->>'variety_id')::uuid; farm:=nullif(line->>'farm_id','')::uuid; market:=(line->>'market_id')::uuid;
  qty:=(line->>'qty_kg')::numeric; price:=(line->>'price_per_kg')::numeric;
  IF qty IS NULL OR price IS NULL OR qty<0 OR price<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Quantité et prix valides requis';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.varieties WHERE id=variety AND domain_id=p_domain)
   OR (farm IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.farms WHERE id=farm AND domain_id=p_domain))
   OR NOT EXISTS(SELECT 1 FROM public.markets WHERE id=market) THEN
   RAISE EXCEPTION 'Référence de bordereau invalide ou hors client' USING ERRCODE='42501';
  END IF;
 END LOOP;
 DELETE FROM public.station_settlement_lines WHERE settlement_id=p_settlement AND domain_id=p_domain;
 INSERT INTO public.station_settlement_lines(domain_id,settlement_id,farm_id,market_id,variety_id,qty_kg,price_per_kg,notes)
  SELECT p_domain,p_settlement,nullif(l->>'farm_id','')::uuid,(l->>'market_id')::uuid,(l->>'variety_id')::uuid,
   (l->>'qty_kg')::numeric,(l->>'price_per_kg')::numeric,l->>'notes'
  FROM jsonb_array_elements(p_lines) l WHERE (l->>'qty_kg')::numeric>0;
END $$;
REVOKE ALL ON FUNCTION public.replace_client_settlement_lines(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_client_settlement_lines(uuid,uuid,jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.station_settlement_lines FROM authenticated;
DROP TABLE public.client_reference_usage_work;
DROP TABLE public.client_reference_live_before;
NOTIFY pgrst,'reload schema';
COMMIT;
