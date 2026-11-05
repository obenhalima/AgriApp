-- ITRIX: tenant isolation of the exact 12 tables inventoried on 2026-10-15.
-- USER-APPROVED backfill: exact 19 IDs below, DOM-BENHALIMA only.
-- Run WHOLE file as database administrator. Do not select individual sections.
-- NOT executed or runtime-verified by Codex against the hosted database.
-- No business row deleted. Any unexpected live row aborts the transaction.
-- New root clients/markets require explicit domain_id: update callers accordingly.
-- Alerts/documents: admin-only until their contextual permission model is reviewed.
-- PostgreSQL 15+ is required for security_invoker views.
-- Service-role / SECURITY DEFINER reads are NOT secured by table RLS alone.
-- Final query lists relevant SECURITY DEFINER routines for the next review.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- Temporary allowlist is never exposed through the public API.
CREATE TEMP TABLE itrix162_targets(table_name text PRIMARY KEY,module_code text NOT NULL) ON COMMIT DROP;
INSERT INTO itrix162_targets VALUES
 ('alerts','__protected_alerts'),('clients','clients'),('cultural_operations','agronomie'),
 ('delivery_notes','commandes'),('documents','__protected_documents'),('farm_zones','fermes'),
 ('invoices','factures'),('markets','marches'),('payments_received','factures'),
 ('production_forecasts','production'),('sales_orders','commandes'),('teams','rh_employes');
CREATE TEMP TABLE itrix162_approved(table_name text,id uuid,PRIMARY KEY(table_name,id)) ON COMMIT DROP;
CREATE TEMP TABLE itrix162_before(table_name text,id uuid,before_row jsonb,PRIMARY KEY(table_name,id)) ON COMMIT DROP;
CREATE TEMP TABLE itrix162_trigger_state(table_name text,trigger_name text,enabled "char",PRIMARY KEY(table_name,trigger_name)) ON COMMIT DROP;
INSERT INTO itrix162_approved VALUES
 ('clients','14dcc5ca-e285-41f0-b842-203735754f30'),
 ('clients','5bc18f32-e34d-495d-93da-9528f585d8c0'),
 ('clients','7bf22eab-2584-4b89-ad6a-eb6a25e79134'),
 ('markets','4ac1cef3-7c5f-46df-ba99-56f8f549d5f7'),
 ('markets','97c17703-b7b1-406d-a4b7-57f25ca8e67b'),
 ('markets','d008772d-2455-450e-b187-470921bef768'),
 ('invoices','116bd35a-d472-427e-9c26-cbd67c2e17fd'),
 ('invoices','206fc9d4-3e98-448e-ae3a-ecfb0bee5600'),
 ('invoices','330e0d16-6cb0-4d5a-ae06-d248ea35f925'),
 ('invoices','4379853f-2656-416b-a521-6c0f9a6e5e28'),
 ('invoices','4d02467c-ffd1-4102-82e3-9eb7afebb9ef'),
 ('invoices','5fdcf83e-7c60-4318-96ab-8d9013dd111a'),
 ('invoices','d1aab8c0-503b-4385-8dd4-84404d00bbab'),
 ('invoices','dfb7937b-5a50-41bf-959e-0687993dba2d'),
 ('invoices','e370e6d3-2626-4080-817c-c0d4820b298a'),
 ('invoices','eae74372-09d0-4498-b595-60361243b78c'),
 ('invoices','f1090290-0fe5-4e01-a2b1-a9971ae3968b'),
 ('payments_received','5306e88b-aa61-4e69-8ef4-25317de1178a'),
 ('sales_orders','c9b0302e-8a4f-470f-b227-65bece184c93');

DO $preflight$
DECLARE t record; tr record; n bigint; expected bigint; d uuid:='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79';
BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN
   RAISE EXCEPTION 'PostgreSQL 15 minimum requis : migration annulée'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND code='DOM-BENHALIMA' AND is_active) THEN
   RAISE EXCEPTION 'Client confirmé absent, renommé ou désactivé : migration annulée'; END IF;
 IF to_regprocedure('public.has_domain_permission(uuid,uuid,text,text)') IS NULL
 OR to_regprocedure('public.is_domain_member(uuid,uuid)') IS NULL
 OR to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
   RAISE EXCEPTION 'Helpers de permission manquants : migration annulée'; END IF;
 -- Acquire ALL locks before checking any row or changing any schema.
 FOR t IN SELECT * FROM itrix162_targets ORDER BY table_name LOOP
   EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t.table_name);
 END LOOP;
 FOR t IN SELECT * FROM itrix162_targets ORDER BY table_name LOOP
   IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t.table_name) THEN
     RAISE EXCEPTION 'Politiques déjà présentes sur % : revue nécessaire, migration annulée',t.table_name; END IF;
   IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||t.table_name) AND attname='domain_id' AND NOT attisdropped) THEN
     RAISE EXCEPTION 'domain_id déjà présent sur % : ne pas rejouer ni écraser une migration existante',t.table_name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I b WHERE NOT EXISTS(SELECT 1 FROM pg_temp.itrix162_approved a WHERE a.table_name=$1 AND a.id=b.id)',t.table_name) INTO n USING t.table_name;
   IF n<>0 THEN RAISE EXCEPTION '% contient % lignes non approuvées : refaire inventaire, aucune attribution automatique',t.table_name,n; END IF;
   SELECT count(*) INTO expected FROM itrix162_approved WHERE table_name=t.table_name;
   EXECUTE format('SELECT count(*) FROM public.%I',t.table_name) INTO n;
   IF n<>expected THEN RAISE EXCEPTION 'Nombre de lignes différent pour % : attendu %, trouvé %',t.table_name,expected,n; END IF;
   EXECUTE format('INSERT INTO pg_temp.itrix162_before SELECT $1,b.id,to_jsonb(b) FROM public.%I b',t.table_name) USING t.table_name;
 END LOOP;
 FOR t IN SELECT * FROM itrix162_targets ORDER BY table_name LOOP
   -- Backfill ownership only: do not run timestamp, audit, ecart or business triggers.
   -- Preserve the exact enabled/disabled/replica/always state of every user trigger.
   INSERT INTO itrix162_trigger_state SELECT t.table_name,tgname,tgenabled FROM pg_trigger
    WHERE tgrelid=to_regclass('public.'||t.table_name) AND NOT tgisinternal AND tgenabled<>'D';
   FOR tr IN SELECT * FROM itrix162_trigger_state WHERE table_name=t.table_name LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',t.table_name,tr.trigger_name);
   END LOOP;
   EXECUTE format('ALTER TABLE public.%I ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT',t.table_name);
   EXECUTE format('UPDATE public.%I SET domain_id=$1',t.table_name) USING d;
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN domain_id SET NOT NULL',t.table_name);
   EXECUTE format('CREATE INDEX %I ON public.%I(domain_id)','itrix162_'||t.table_name||'_domain',t.table_name);
   FOR tr IN SELECT * FROM itrix162_trigger_state WHERE table_name=t.table_name LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE %s TRIGGER %I',t.table_name,
     CASE tr.enabled WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,tr.trigger_name);
   END LOOP;
 END LOOP;
END;
$preflight$;

-- Active identity + active tenant + existing business permissions.
-- Special unknown module names deliberately grant only existing tenant/platform admins.
CREATE FUNCTION public.itrix162_access(p_domain uuid,p_module text,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
 AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(p_domain,auth.uid()))
 AND coalesce(public.has_domain_permission(p_domain,auth.uid(),p_module,p_action),false)
$fn$;
REVOKE ALL ON FUNCTION public.itrix162_access(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.itrix162_access(uuid,text,text) TO authenticated;

-- Private helper for explicit polymorphic links; unknown types fail closed.
CREATE FUNCTION public.itrix162_entity_domain(p_type text,p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE target text; d uuid;
BEGIN
 target:=CASE p_type
  WHEN 'farm' THEN 'farms' WHEN 'farms' THEN 'farms' WHEN 'ferme' THEN 'farms'
  WHEN 'campaign' THEN 'campaigns' WHEN 'campaigns' THEN 'campaigns' WHEN 'campagne' THEN 'campaigns'
  WHEN 'campaign_planting' THEN 'campaign_plantings' WHEN 'campaign_plantings' THEN 'campaign_plantings' WHEN 'plantation' THEN 'campaign_plantings'
  WHEN 'harvest' THEN 'harvests' WHEN 'harvests' THEN 'harvests' WHEN 'recolte' THEN 'harvests'
  WHEN 'harvest_lot' THEN 'harvest_lots' WHEN 'harvest_lots' THEN 'harvest_lots'
  WHEN 'sales_order' THEN 'sales_orders' WHEN 'sales_orders' THEN 'sales_orders' WHEN 'commande' THEN 'sales_orders'
  WHEN 'invoice' THEN 'invoices' WHEN 'invoices' THEN 'invoices' WHEN 'facture' THEN 'invoices'
  WHEN 'client' THEN 'clients' WHEN 'clients' THEN 'clients'
  WHEN 'market' THEN 'markets' WHEN 'markets' THEN 'markets'
  WHEN 'station_settlement' THEN 'station_settlements' WHEN 'station_settlements' THEN 'station_settlements'
  WHEN 'delivery_note' THEN 'delivery_notes' WHEN 'delivery_notes' THEN 'delivery_notes'
  ELSE NULL END;
 IF p_type IN ('greenhouse','greenhouses','serre') THEN
   SELECT f.domain_id INTO d FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=p_id;
 ELSIF target IS NOT NULL THEN
   EXECUTE format('SELECT domain_id FROM public.%I WHERE id=$1',target) INTO d USING p_id;
 ELSE RAISE EXCEPTION 'Type de référence non pris en charge : rattachement explicite à revoir' USING ERRCODE='23514'; END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'Référence absente ou sans client identifié' USING ERRCODE='23514'; END IF;
 RETURN d;
END;
$fn$;
REVOKE ALL ON FUNCTION public.itrix162_entity_domain(text,uuid) FROM PUBLIC,anon,authenticated;

-- No browser-controlled owner changes. Parent inference only from actual owned rows.
-- Trigger checks also apply to writes made by SECURITY DEFINER routines with auth.uid().
CREATE FUNCTION public.itrix162_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j jsonb; d uuid; parent_domain uuid; parent_table text; parent_key text; module_code text; action text;
BEGIN
 module_code:=TG_ARGV[0]; action:=CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'edit' ELSE 'delete' END;
 IF TG_OP='DELETE' THEN d:=OLD.domain_id;
 ELSE
   j:=to_jsonb(NEW);d:=NEW.domain_id;
   IF TG_OP='UPDATE' AND (NEW.domain_id IS DISTINCT FROM OLD.domain_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
     RAISE EXCEPTION 'Identifiant et client propriétaire non modifiables' USING ERRCODE='23514'; END IF;
   CASE TG_TABLE_NAME
    WHEN 'farm_zones','teams' THEN parent_table:='farms';parent_key:='farm_id';
    WHEN 'cultural_operations','production_forecasts' THEN parent_table:='campaign_plantings';parent_key:='campaign_planting_id';
    WHEN 'sales_orders','invoices' THEN parent_table:='clients';parent_key:='client_id';
    WHEN 'delivery_notes' THEN parent_table:='sales_orders';parent_key:='order_id';
    WHEN 'payments_received' THEN parent_table:='invoices';parent_key:='invoice_id';
    WHEN 'markets' THEN parent_table:='clients';parent_key:='client_id';
    WHEN 'clients' THEN parent_table:='markets';parent_key:='market_id';
    ELSE NULL;
   END CASE;
   IF parent_key IS NOT NULL AND nullif(j->>parent_key,'') IS NOT NULL THEN
     EXECUTE format('SELECT domain_id FROM public.%I WHERE id=$1',parent_table) INTO parent_domain USING (j->>parent_key)::uuid;
     IF parent_domain IS NULL THEN RAISE EXCEPTION 'Parent absent ou sans client identifié' USING ERRCODE='23514'; END IF;
     IF d IS NOT NULL AND d<>parent_domain THEN RAISE EXCEPTION 'Les éléments liés appartiennent à des clients différents' USING ERRCODE='23514'; END IF;
     d:=parent_domain;
   END IF;
   IF TG_TABLE_NAME IN ('alerts','documents') THEN
     IF nullif(j->>'entity_id','') IS NOT NULL THEN
       parent_domain:=public.itrix162_entity_domain(j->>'entity_type',(j->>'entity_id')::uuid);
       IF d IS NOT NULL AND d<>parent_domain THEN RAISE EXCEPTION 'Référence liée à un autre client' USING ERRCODE='23514'; END IF;
       d:=parent_domain;
     ELSIF TG_TABLE_NAME='documents' OR nullif(j->>'entity_type','') IS NOT NULL THEN
       RAISE EXCEPTION 'Référence métier incomplète' USING ERRCODE='23514';
     END IF;
   END IF;
   IF d IS NULL THEN RAISE EXCEPTION 'Client cible obligatoire : sélectionner le client et transmettre domain_id' USING ERRCODE='23514'; END IF;
   NEW.domain_id:=d;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active) THEN
   RAISE EXCEPTION 'Client absent ou désactivé' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL THEN
   IF NOT public.itrix162_access(d,module_code,action) THEN
     RAISE EXCEPTION 'Opération non autorisée pour ce client et ce module' USING ERRCODE='42501'; END IF;
 ELSIF NOT (coalesce(auth.role(),'')='service_role' OR session_user IN ('postgres','supabase_admin')) THEN
   RAISE EXCEPTION 'Authentification obligatoire' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.itrix162_guard() FROM PUBLIC,anon,authenticated;

DO $policies$
DECLARE t record; p text;
BEGIN
 FOR t IN SELECT * FROM itrix162_targets ORDER BY table_name LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.table_name);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t.table_name);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon',t.table_name);
   EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public.%I FROM authenticated',t.table_name);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated',t.table_name);
   EXECUTE format('CREATE POLICY itrix162_fence ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.itrix162_access(domain_id,%L,''view'')) WITH CHECK (public.itrix162_access(domain_id,%L,''view''))',t.table_name,t.module_code,t.module_code);
   EXECUTE format('CREATE POLICY itrix162_read ON public.%I FOR SELECT TO authenticated USING (public.itrix162_access(domain_id,%L,''view''))',t.table_name,t.module_code);
   EXECUTE format('CREATE POLICY itrix162_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.itrix162_access(domain_id,%L,''create''))',t.table_name,t.module_code);
   EXECUTE format('CREATE POLICY itrix162_update ON public.%I FOR UPDATE TO authenticated USING (public.itrix162_access(domain_id,%L,''edit'')) WITH CHECK (public.itrix162_access(domain_id,%L,''edit''))',t.table_name,t.module_code,t.module_code);
   EXECUTE format('CREATE POLICY itrix162_delete ON public.%I FOR DELETE TO authenticated USING (public.itrix162_access(domain_id,%L,''delete''))',t.table_name,t.module_code);
   EXECUTE format('CREATE TRIGGER aaa_itrix162_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.itrix162_guard(%L)',t.table_name,t.module_code);
 END LOOP;
END;
$policies$;

-- Add tenant composite FKs for live single-column ID relations touching a target.
-- This also protects incoming relations from already-owned harvest/station rows.
-- Existing original FKs and their delete actions remain unchanged.
DO $relations$
DECLARE r record; index_name text; constraint_name text;
BEGIN
 FOR r IN
   SELECT DISTINCT src.relname AS source_table,dst.relname AS target_table,a.attname AS source_column
   FROM pg_constraint k JOIN pg_class src ON src.oid=k.conrelid JOIN pg_namespace sn ON sn.oid=src.relnamespace
   JOIN pg_class dst ON dst.oid=k.confrelid JOIN pg_namespace dn ON dn.oid=dst.relnamespace
   JOIN pg_attribute a ON a.attrelid=src.oid AND a.attnum=k.conkey[1]
   JOIN pg_attribute b ON b.attrelid=dst.oid AND b.attnum=k.confkey[1]
   WHERE k.contype='f' AND array_length(k.conkey,1)=1 AND b.attname='id'
   AND sn.nspname='public' AND dn.nspname='public' AND a.attname<>'domain_id'
   AND (EXISTS(SELECT 1 FROM itrix162_targets WHERE table_name=src.relname) OR EXISTS(SELECT 1 FROM itrix162_targets WHERE table_name=dst.relname))
   AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=src.oid AND attname='domain_id' AND NOT attisdropped)
   AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=dst.oid AND attname='domain_id' AND NOT attisdropped)
 LOOP
   index_name:='itrix162_uq_'||substr(md5(r.target_table),1,16);
   EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(id,domain_id)',index_name,r.target_table);
   constraint_name:='itrix162_fk_'||substr(md5(r.source_table||'/'||r.source_column||'/'||r.target_table),1,24);
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I,domain_id) REFERENCES public.%I(id,domain_id) DEFERRABLE INITIALLY IMMEDIATE NOT VALID',r.source_table,constraint_name,r.source_column,r.target_table);
   EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',r.source_table,constraint_name);
 END LOOP;
END;
$relations$;

-- Preferred variety arrays are not SQL FKs. Enforce same-tenant references too.
CREATE FUNCTION public.itrix162_client_varieties() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(NEW.preferred_variety_ids) AS v(id)
   LEFT JOIN public.varieties x ON x.id=v.id AND x.domain_id=NEW.domain_id WHERE x.id IS NULL) THEN
   RAISE EXCEPTION 'Variété préférée absente ou liée à un autre client' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.itrix162_client_varieties() FROM PUBLIC,anon,authenticated;
-- Replace the legacy blanket ban only for this newly owned table.
DROP TRIGGER IF EXISTS client_variety_preferences_guard ON public.clients;
CREATE TRIGGER zzz_itrix162_client_varieties BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.itrix162_client_varieties();
DO $arrays$
BEGIN
 IF EXISTS(SELECT 1 FROM public.clients c CROSS JOIN LATERAL unnest(c.preferred_variety_ids) AS v(id)
   LEFT JOIN public.varieties x ON x.id=v.id AND x.domain_id=c.domain_id WHERE x.id IS NULL) THEN
   RAISE EXCEPTION 'Variétés préférées hors client : migration annulée, résolution ciblée nécessaire'; END IF;
END;
$arrays$;

-- Existing ecart uniqueness triggers must no longer update other tenants.
CREATE OR REPLACE FUNCTION public.trg_enforce_single_ecart_buyer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NEW.is_ecart_buyer=TRUE AND NEW.is_active=TRUE THEN
  UPDATE public.clients SET is_ecart_buyer=FALSE
   WHERE id<>NEW.id AND domain_id=NEW.domain_id AND is_ecart_buyer=TRUE;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.trg_enforce_single_ecart_market() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NEW.is_ecart_market=TRUE AND NEW.is_active=TRUE THEN
  UPDATE public.markets SET is_ecart_market=FALSE
   WHERE id<>NEW.id AND domain_id=NEW.domain_id AND is_ecart_market=TRUE;
 END IF;
 RETURN NEW;
END;
$fn$;

-- Ordinary owner-context views would otherwise bypass the new table policies.
DO $views$
DECLARE v record;
BEGIN
 FOR v IN
  WITH RECURSIVE dependent(oid) AS (
   SELECT to_regclass('public.'||table_name)::oid FROM itrix162_targets
   UNION
   SELECT rw.ev_class FROM dependent d
    JOIN pg_depend dep ON dep.refclassid='pg_class'::regclass AND dep.refobjid=d.oid AND dep.classid='pg_rewrite'::regclass
    JOIN pg_rewrite rw ON rw.oid=dep.objid
    JOIN pg_class c ON c.oid=rw.ev_class
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='v' AND n.nspname='public'
  )
  SELECT c.relname FROM dependent d JOIN pg_class c ON c.oid=d.oid WHERE c.relkind='v'
 LOOP
  EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',v.relname);
 END LOOP;
END;
$views$;

-- Authenticate BEFORE privileged routines return cached invoice IDs or read names.
CREATE FUNCTION public.itrix162_rpc_gate(p_table text,p_id uuid,p_module text,p_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d uuid;
BEGIN
 IF p_table NOT IN ('harvest_lots','station_settlements') THEN RAISE EXCEPTION 'Source non autorisée'; END IF;
 EXECUTE format('SELECT domain_id FROM public.%I WHERE id=$1',p_table) INTO d USING p_id;
 IF NOT coalesce(public.itrix162_access(d,p_module,p_action),false) THEN
  RAISE EXCEPTION 'Opération inaccessible pour ce client' USING ERRCODE='42501'; END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.itrix162_rpc_gate(text,uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Patch exact known deployed contracts. Unknown versions abort, never guess.
DO $rpcs$
DECLARE r record; f oid; definition text; marker text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('public.admin_generate_dispatch_invoice(uuid)','p_lot_id','harvest_lots','factures','create'),
   ('public.admin_generate_settlement_invoice(uuid)','p_settlement_id','station_settlements','factures','create'),
   ('public.create_ecart_dispatch(uuid,numeric)','p_parent_lot_id','harvest_lots','recoltes','edit')
 ) AS x(signature,arg_name,source_table,module_code,action) LOOP
  f:=to_regprocedure(r.signature);
  IF f IS NULL THEN RAISE EXCEPTION 'Fonction attendue absente : %, migration annulée',r.signature; END IF;
  definition:=pg_get_functiondef(f);
  IF definition !~* '\mBEGIN\M' OR position(r.arg_name IN definition)=0 THEN
   RAISE EXCEPTION 'Contrat de fonction non reconnu : %',r.signature; END IF;
  IF position('itrix162_rpc_gate' IN definition)>0 THEN RAISE EXCEPTION 'Ne pas rejouer une migration déjà appliquée'; END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M',format(E'BEGIN\n PERFORM public.itrix162_rpc_gate(%L,%I,%L,%L);',r.source_table,r.arg_name,r.module_code,r.action),'i');
  IF r.source_table='harvest_lots' AND r.module_code='recoltes' THEN
   marker:='WHERE is_ecart_market = TRUE AND is_active = TRUE';
   IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Sélection de marché écart non reconnue : revue nécessaire'; END IF;
   definition:=replace(definition,marker,marker||' AND domain_id = v_parent.domain_id');
  END IF;
  EXECUTE definition;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f::regprocedure);
 END LOOP;
 f:=to_regprocedure('public.apply_authorized_workflow_transition(text,uuid,uuid,text)');
 IF f IS NULL THEN RAISE EXCEPTION 'Workflow sécurisé absent : migration annulée'; END IF;
 definition:=pg_get_functiondef(f);
 marker:='SELECT c.domain_id,o.status::text INTO d,current_status';
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Contrat du workflow non reconnu : revue nécessaire'; END IF;
 EXECUTE replace(definition,marker,'SELECT o.domain_id,o.status::text INTO d,current_status');
 REVOKE ALL ON FUNCTION public.apply_authorized_workflow_transition(text,uuid,uuid,text) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.apply_authorized_workflow_transition(text,uuid,uuid,text) TO authenticated;
END;
$rpcs$;

-- Integrity checks run BEFORE commit. No silent new rows or ownership changes.
DO $checks$
DECLARE t record;n bigint;expected bigint;
BEGIN
 FOR t IN SELECT * FROM itrix162_targets ORDER BY table_name LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE domain_id IS DISTINCT FROM $1',t.table_name) INTO n USING '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'::uuid;
   IF n<>0 THEN RAISE EXCEPTION 'Rattachement inattendu dans %',t.table_name; END IF;
   SELECT count(*) INTO expected FROM itrix162_approved WHERE table_name=t.table_name;
   EXECUTE format('SELECT count(*) FROM public.%I',t.table_name) INTO n;
   IF n<>expected THEN RAISE EXCEPTION 'Nombre de lignes modifié pour %',t.table_name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I b JOIN pg_temp.itrix162_before s ON s.table_name=$1 AND s.id=b.id WHERE (to_jsonb(b)-''domain_id'') IS DISTINCT FROM s.before_row',t.table_name) INTO n USING t.table_name;
   IF n<>0 THEN RAISE EXCEPTION 'Données métier modifiées hors domain_id dans % : migration annulée',t.table_name; END IF;
   IF has_table_privilege('anon',to_regclass('public.'||t.table_name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('anon',to_regclass('public.'||t.table_name),'SELECT,INSERT,UPDATE,REFERENCES') THEN
     RAISE EXCEPTION 'Droits anonymes hérités présents pour % : migration annulée',t.table_name; END IF;
 END LOOP;
END;
$checks$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- One final result, so the SQL Editor does not hide earlier result sets.
-- EXPECTED: 12 rls_tables entries with true/true/5/false; counts 3/3/11/1/1.
-- Routines list is for review, NOT proof that every routine is unsafe or covered.
-- Text matching misses dynamic SQL / indirect calls. Service paths need review.
SELECT jsonb_build_object(
 'rls_tables',(SELECT jsonb_agg(jsonb_build_object(
  'table',c.relname,'rls_active',c.relrowsecurity,'rls_force',c.relforcerowsecurity,
  'policies',(SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
  'anon_access',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (
  'alerts','clients','cultural_operations','delivery_notes','documents','farm_zones',
  'invoices','markets','payments_received','production_forecasts','sales_orders','teams')),
 'DOM_BENHALIMA',jsonb_build_object(
  'clients',(SELECT count(*) FROM public.clients WHERE domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'),
  'markets',(SELECT count(*) FROM public.markets WHERE domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'),
  'invoices',(SELECT count(*) FROM public.invoices WHERE domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'),
  'payments_received',(SELECT count(*) FROM public.payments_received WHERE domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'),
  'sales_orders',(SELECT count(*) FROM public.sales_orders WHERE domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79')),
 'routines_a_revoir',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'routine',p.oid::regprocedure::text,
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) ORDER BY p.oid::regprocedure::text),'[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f'
 AND p.proname NOT LIKE 'itrix162_%'
 AND p.prosrc ~* '\m(alerts|clients|cultural_operations|delivery_notes|documents|farm_zones|invoices|markets|payments_received|production_forecasts|sales_orders|teams)\M')
) AS isolation_check;
