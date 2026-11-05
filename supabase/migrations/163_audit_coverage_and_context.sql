-- Extension of INSTALLED migration 162. Submit for approval; never rerun 162.
-- No business-data update, no reassignment of the unresolved rows, no Auth schema writes.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
ALTER TABLE itrix_audit_private.registry ADD COLUMN key_columns text[] NOT NULL DEFAULT ARRAY['id'],
 ADD COLUMN scope_mode text NOT NULL DEFAULT 'client', ADD COLUMN scope_paths jsonb NOT NULL DEFAULT '[]';
ALTER TABLE itrix_audit_private.entity_scope ADD COLUMN display_label text;
ALTER TABLE public.audit_events ADD COLUMN entity_key jsonb,
 ADD COLUMN scope_kind text NOT NULL DEFAULT 'client';

CREATE FUNCTION itrix_audit_private.record_key(t text,r jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT coalesce(jsonb_object_agg(k,r->k),'{}') FROM itrix_audit_private.registry g,
 unnest(g.key_columns) k WHERE g.table_name=t
$f$;
CREATE FUNCTION itrix_audit_private.record_id(t text,r jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE k jsonb:=itrix_audit_private.record_key(t,r);
BEGIN
 IF (SELECT key_columns=ARRAY['id'] FROM itrix_audit_private.registry WHERE table_name=t)
 AND k->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN (k->>'id')::uuid; END IF;
 RETURN md5(t||':'||k::text)::uuid;
END $f$;

CREATE FUNCTION itrix_audit_private.record_label(r jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT left(coalesce(nullif(concat_ws(' — ',nullif(coalesce(r->>'code',r->>'reference',r->>'lot_number'),''),
  nullif(coalesce(r->>'name',r->>'label',nullif(concat_ws(' ',r->>'first_name',r->>'last_name'),'')),'')),''),
  nullif(r->>'source_ref',''),'Fiche enregistrée'),180)
$f$;

-- Extend the old allowlist, never add raw payloads, medical reasons, CIN, phones or credentials.
ALTER FUNCTION itrix_audit_private.safe_values(jsonb) RENAME TO safe_values_162;
CREATE FUNCTION itrix_audit_private.safe_values(r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT CASE WHEN r IS NULL THEN NULL ELSE itrix_audit_private.safe_values_162(r)||coalesce(jsonb_object_agg(key,value),'{}') END
 FROM jsonb_each(coalesce(r,'{}')) WHERE key=ANY(ARRAY[
 'label','key','list_key','first_name','last_name','worker_id','team_id','warehouse_id','stock_item_id',
 'current_qty','min_qty','inventory_value','valuation_verified','unit','quantity_kg','qty_kg',
 'lot_number','hours_worked','worker_count','person_hours','work_date','days','year','annual_taken',
 'annual_acquired','annual_carried','start_date','end_date','acquisition_date','acquisition_cost',
 'useful_life_years','residual_value','gross_salary','net_salary','revision','source_ref','movement_id',
 'family','levels','alert_days','is_default','period_year','period_month','declaration_year','declaration_month'
 ])
$f$;

CREATE FUNCTION itrix_audit_private.resolve_scope_163(t text,r jsonb,level integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE g record; path jsonb; pair jsonb; parent_key jsonb; parent_row jsonb; d uuid; found_d uuid; missing boolean:=false;
BEGIN
 IF level>20 THEN RETURN NULL; END IF;
 IF t='domains' THEN RETURN (r->>'id')::uuid; END IF;
 IF r ? 'domain_id' THEN RETURN nullif(r->>'domain_id','')::uuid; END IF;
 SELECT * INTO g FROM itrix_audit_private.registry WHERE table_name=t;
 IF NOT FOUND OR g.scope_mode='platform' THEN RETURN NULL; END IF;
 FOR path IN SELECT value FROM jsonb_array_elements(g.scope_paths) LOOP
  parent_key:='{}';
  FOR pair IN SELECT value FROM jsonb_array_elements(path->'columns') LOOP
   parent_key:=parent_key||jsonb_build_object(pair->>'target',r->(pair->>'source'));
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_each(parent_key) WHERE value='null'::jsonb) THEN CONTINUE; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE to_jsonb(p) @> $1 LIMIT 1',path->>'table') INTO parent_row USING parent_key;
  IF parent_row IS NOT NULL THEN d:=itrix_audit_private.resolve_scope_163(path->>'table',parent_row,level+1);
  ELSE
   SELECT domain_id INTO d FROM itrix_audit_private.entity_scope
    WHERE table_name=path->>'table' AND entity_id=itrix_audit_private.record_id(path->>'table',parent_key);
  END IF;
  IF d IS NULL THEN missing:=true;
  ELSIF found_d IS NOT NULL AND found_d<>d THEN RETURN NULL;
  ELSE found_d:=d; END IF;
 END LOOP;
 IF missing THEN RETURN NULL; END IF;
 RETURN found_d;
END $f$;
CREATE OR REPLACE FUNCTION itrix_audit_private.resolve_scope(t text,r jsonb) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT itrix_audit_private.resolve_scope_163(t,r)
$f$;

CREATE FUNCTION itrix_audit_private.reference_labels(d uuid,r jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE v record; label text; result jsonb:='{}';
BEGIN
 FOR v IN SELECT * FROM (VALUES ('farm_id','farms'),('greenhouse_id','greenhouses'),
 ('campaign_id','campaigns'),('campaign_planting_id','campaign_plantings'),('variety_id','varieties'),
 ('crop_id','crops'),('client_id','clients'),('market_id','markets'),('worker_id','workers'),('team_id','teams'),
 ('warehouse_id','warehouses'),('stock_item_id','stock_items'),('order_id','sales_orders'),('invoice_id','invoices')) x(col,tbl) LOOP
  IF r->>v.col ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   SELECT e.display_label INTO label FROM itrix_audit_private.entity_scope e
    JOIN itrix_audit_private.registry g ON g.table_name=e.table_name
    WHERE e.table_name=v.tbl AND e.entity_id=(r->>v.col)::uuid AND e.display_label IS NOT NULL
     AND (e.domain_id=d OR (d IS NULL AND g.scope_mode='platform'));
   IF label IS NOT NULL THEN result:=result||jsonb_build_object(r->>v.col,label); END IF;
  END IF;
 END LOOP;
 RETURN result;
END $f$;

CREATE OR REPLACE FUNCTION itrix_audit_private.capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE b jsonb; a jsonb; bd uuid; ad uuid; who uuid:=auth.uid(); label text; eid uuid; k jsonb;
 bs jsonb; av jsonb; fields text[]; verb text; mode text;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); bd:=itrix_audit_private.resolve_scope(TG_TABLE_NAME,b); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); ad:=itrix_audit_private.resolve_scope(TG_TABLE_NAME,a); END IF;
 k:=itrix_audit_private.record_key(TG_TABLE_NAME,coalesce(a,b));eid:=itrix_audit_private.record_id(TG_TABLE_NAME,coalesce(a,b));
 INSERT INTO itrix_audit_private.entity_scope(table_name,entity_id,domain_id,display_label)
  VALUES(TG_TABLE_NAME,eid,coalesce(ad,bd),itrix_audit_private.record_label(coalesce(a,b)))
  ON CONFLICT(table_name,entity_id) DO UPDATE SET domain_id=excluded.domain_id,display_label=excluded.display_label;
 IF TG_OP='UPDATE' AND a=b THEN RETURN NEW; END IF;
 SELECT coalesce(nullif(full_name,''),id::text) INTO label FROM public.profiles WHERE id=who;
 label:=coalesce(label,CASE WHEN who IS NULL THEN 'Système / administration SQL' ELSE who::text END);
 bs:=itrix_audit_private.safe_values(b);av:=itrix_audit_private.safe_values(a);
 SELECT coalesce(array_agg(key ORDER BY key),'{}') INTO fields FROM jsonb_object_keys(coalesce(bs,'{}')||coalesce(av,'{}')) key WHERE bs->key IS DISTINCT FROM av->key;
 IF bs IS NOT NULL THEN bs:=bs||jsonb_build_object('_labels',itrix_audit_private.reference_labels(bd,bs)); END IF;
 IF av IS NOT NULL THEN av:=av||jsonb_build_object('_labels',itrix_audit_private.reference_labels(ad,av)); END IF;
 verb:=CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'update' END;
 IF TG_OP='UPDATE' THEN
  IF (a->>'validated_by' IS DISTINCT FROM b->>'validated_by' AND a->>'validated_by' IS NOT NULL)
   OR (a->>'approved_by' IS DISTINCT FROM b->>'approved_by' AND a->>'approved_by' IS NOT NULL)
   OR (a->>'status' IS DISTINCT FROM b->>'status' AND a->>'status' IN('approved','validated','approuvee','approuve','validee','valide')) THEN verb:='validate';
  ELSIF a->>'status' IS DISTINCT FROM b->>'status' OR a->>'approval_status' IS DISTINCT FROM b->>'approval_status' THEN verb:='status_change'; END IF;
 END IF;
 SELECT scope_mode INTO mode FROM itrix_audit_private.registry WHERE table_name=TG_TABLE_NAME;
 IF TG_OP='UPDATE' AND bd IS DISTINCT FROM ad THEN
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values,after_values,entity_key,scope_kind)
   VALUES(bd,who,label,'scope_exit',TG_TABLE_NAME,eid,txid_current()::text,fields,bs,NULL,k,CASE WHEN bd IS NULL THEN 'unassigned' ELSE 'client' END),
   (ad,who,label,'scope_enter',TG_TABLE_NAME,eid,txid_current()::text,fields,NULL,av,k,CASE WHEN ad IS NULL THEN 'unassigned' ELSE 'client' END);
 ELSE
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values,after_values,entity_key,scope_kind)
   VALUES(coalesce(ad,bd),who,label,verb,TG_TABLE_NAME,eid,txid_current()::text,fields,bs,av,k,
    CASE WHEN coalesce(ad,bd) IS NOT NULL THEN 'client' WHEN mode='platform' THEN 'platform' ELSE 'unassigned' END);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION itrix_audit_private.capture_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r jsonb; who uuid:=auth.uid(); label text; d uuid; mode text;
BEGIN
 SELECT coalesce(nullif(full_name,''),id::text) INTO label FROM public.profiles WHERE id=who;
 label:=coalesce(label,CASE WHEN who IS NULL THEN 'Système / administration SQL' ELSE who::text END);
 SELECT scope_mode INTO mode FROM itrix_audit_private.registry WHERE table_name=TG_TABLE_NAME;
 FOR r IN EXECUTE format('SELECT to_jsonb(b) FROM public.%I b',TG_TABLE_NAME) LOOP
  d:=itrix_audit_private.resolve_scope(TG_TABLE_NAME,r);
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values,entity_key,scope_kind)
  VALUES(d,who,label,'delete',TG_TABLE_NAME,itrix_audit_private.record_id(TG_TABLE_NAME,r),txid_current()::text,ARRAY['__truncate'],
   itrix_audit_private.safe_values(r),itrix_audit_private.record_key(TG_TABLE_NAME,r),CASE WHEN d IS NOT NULL THEN 'client' WHEN mode='platform' THEN 'platform' ELSE 'unassigned' END);
 END LOOP; RETURN NULL;
END $f$;

DO $install$
DECLARE t record; paths jsonb;
BEGIN
 -- Business tables missed by 162 (composite/text PKs, multiple possible owners).
 -- Shared reference/security configuration is explicitly platform-scoped, never assigned to a client.
 FOR t IN SELECT c.oid,c.relname,CASE WHEN c.relname=ANY(ARRAY[
  'reference_lists','reference_values','account_categories','exchange_rates','default_crop_templates',
  'roles','permissions','role_permissions','modules','app_modules','app_settings','profiles','users',
  'business_capabilities','operational_functions','function_capabilities','workflow_definitions','workflow_states','workflow_transitions',
  'payroll_periods','cnss_declarations','cultural_families','phyto_targets'
 ]) THEN 'platform' ELSE 'client' END mode,
 array_agg(a.attname::text ORDER BY u.ord) keys
 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 JOIN pg_constraint pk ON pk.conrelid=c.oid AND pk.contype='p'
 CROSS JOIN LATERAL unnest(pk.conkey) WITH ORDINALITY u(attnum,ord)
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum
 WHERE ns.nspname='public' AND c.relkind='r' AND c.relname=ANY(ARRAY[
 'workers','labor_entries','leave_requests','leave_balances','assets','warehouse_stocks','farm_schematic_plans',
 'inventory_consumption_reviews','cultural_consumptions','harvest_import_receipts','initialization_operation_items',
 'initialization_drafts','harvest_module_drafts','harvest_dispatch_locks','profile_navigation','user_module_access',
 'reference_lists','reference_values','account_categories','exchange_rates','default_crop_templates',
 'roles','permissions','role_permissions','modules','app_modules','app_settings','profiles','users',
 'business_capabilities','operational_functions','function_capabilities','workflow_definitions','workflow_states','workflow_transitions',
 'payroll_periods','cnss_declarations','cultural_families','cultural_settings','irrigation_settings',
 'cost_reporting_settings','phyto_targets','phyto_compliance_settings','operational_alert_settings',
 'mobile_notification_preferences','mobile_notification_rules','mobile_push_subscriptions','mobile_telegram_links','chatbot_messages'
 ]) GROUP BY c.oid,c.relname ORDER BY c.relname LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t.relname);
  INSERT INTO itrix_audit_private.registry(table_name,depth,key_columns,scope_mode) VALUES(t.relname,1,t.keys,t.mode)
   ON CONFLICT(table_name) DO UPDATE SET key_columns=excluded.key_columns;
 END LOOP;
 -- 162 could have registered these via one optional FK before other owners existed.
 -- Re-evaluate ALL declared business owner paths; do not retain that accidental shortcut.
 UPDATE itrix_audit_private.registry SET parent_table=NULL,parent_column=NULL
 WHERE table_name IN('workers','labor_entries','assets','payslips','leave_requests','leave_balances',
 'inventory_consumption_reviews','cultural_consumptions','harvest_import_receipts');
 -- Only actual FK routes to CLIENT-owned registered tables, not creator/profile FKs.
 FOR t IN SELECT g.*,c.oid FROM itrix_audit_private.registry g JOIN pg_class c ON c.oid=to_regclass('public.'||g.table_name) LOOP
  SELECT coalesce(jsonb_agg(x.path),'[]') INTO paths FROM (
   SELECT jsonb_build_object('table',p.relname,'columns',jsonb_agg(jsonb_build_object('source',a.attname,'target',b.attname) ORDER BY u.ord)) path
   FROM pg_constraint f JOIN pg_class p ON p.oid=f.confrelid AND p.relnamespace='public'::regnamespace
   JOIN itrix_audit_private.registry parent ON parent.table_name=p.relname AND parent.scope_mode='client'
   CROSS JOIN LATERAL unnest(f.conkey,f.confkey) WITH ORDINALITY u(src,dst,ord)
   JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=u.src JOIN pg_attribute b ON b.attrelid=f.confrelid AND b.attnum=u.dst
   WHERE f.conrelid=t.oid AND f.contype='f' AND p.relname NOT IN('profiles','users','domains')
   -- Existing 162 explicit owner routes are preserved, rather than adding secondary market/variety links.
   AND (t.parent_table IS NULL OR (p.relname=t.parent_table AND a.attname=t.parent_column))
   GROUP BY f.oid,p.relname
  ) x;
  UPDATE itrix_audit_private.registry SET scope_paths=paths WHERE table_name=t.table_name;
  EXECUTE format('DROP TRIGGER IF EXISTS itrix_audit_write ON public.%I',t.table_name);
  EXECUTE format('DROP TRIGGER IF EXISTS itrix_audit_delete ON public.%I',t.table_name);
  EXECUTE format('DROP TRIGGER IF EXISTS itrix_audit_truncate ON public.%I',t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_write AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION itrix_audit_private.capture()',t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION itrix_audit_private.capture()',t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION itrix_audit_private.capture_truncate()',t.table_name);
 END LOOP;
 -- Refresh private lookup only. Resolve via live FK rows, so no ordering guess is needed.
 FOR t IN SELECT * FROM itrix_audit_private.registry LOOP
  EXECUTE format('INSERT INTO itrix_audit_private.entity_scope(table_name,entity_id,domain_id,display_label)
   SELECT %L,itrix_audit_private.record_id(%L,to_jsonb(b)),itrix_audit_private.resolve_scope(%L,to_jsonb(b)),itrix_audit_private.record_label(to_jsonb(b)) FROM public.%I b
   ON CONFLICT(table_name,entity_id) DO UPDATE SET domain_id=excluded.domain_id,display_label=excluded.display_label',t.table_name,t.table_name,t.table_name,t.table_name);
 END LOOP;
END $install$;

CREATE OR REPLACE FUNCTION itrix_audit_private.assert_reader(d uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR (d IS NULL AND NOT public.is_platform_admin(auth.uid()))
 OR (d IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active) OR NOT public.is_domain_admin(d,auth.uid()))) THEN
  RAISE EXCEPTION 'Rapport réservé aux administrateurs du périmètre sélectionné.' USING ERRCODE='42501';
 END IF;
END $f$;

CREATE FUNCTION itrix_audit_private.connections_163(d uuid,lo timestamptz,hi timestamptz)
RETURNS TABLE(event_id text,occurred_at timestamptz,actor_id uuid,actor_label text,action text,connection_scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF to_regclass('auth.audit_log_entries') IS NULL THEN RETURN; END IF;
 RETURN QUERY EXECUTE $q$
 WITH source AS (SELECT e.id,e.created_at,
 coalesce(e.payload->>'actor_id',e.payload->>'user_id',e.payload#>>'{auth_event,actor_id}') actor,
 coalesce(e.payload->>'action',e.payload#>>'{auth_event,action}') action FROM auth.audit_log_entries e
 WHERE e.created_at >= $2 AND e.created_at < $3)
 SELECT 'auth:'||e.id::text,e.created_at,p.id,coalesce(nullif(p.full_name,''),p.id::text),e.action,
 CASE WHEN $1 IS NOT NULL AND EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.domain_id=$1 AND m.user_id=p.id AND m.is_active AND e.created_at>=m.created_at)
 THEN 'client_account' ELSE 'platform_account' END
 FROM source e JOIN public.profiles p ON p.id::text=e.actor
 WHERE e.action IN('login','logout','token_refreshed','mfa_code_login') AND
 (($1 IS NOT NULL AND EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.domain_id=$1 AND m.user_id=p.id AND m.is_active AND e.created_at>=m.created_at))
 OR (public.is_platform_admin(auth.uid()) AND p.is_platform_admin))
 $q$ USING d,lo,hi;
END $f$;

CREATE FUNCTION itrix_audit_private.connection_diagnostics(d uuid,lo timestamptz,hi timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE n bigint:=0; last_event timestamptz; refreshes bigint:=0; logins bigint:=0;
BEGIN
 IF to_regclass('auth.audit_log_entries') IS NOT NULL THEN
  EXECUTE $q$ SELECT count(*),max(created_at),count(*) FILTER(WHERE payload->>'action'='token_refreshed'),count(*) FILTER(WHERE payload->>'action' IN('login','mfa_code_login'))
  FROM auth.audit_log_entries WHERE created_at >= $1 AND created_at < $2 AND coalesce(payload->>'actor_id',payload->>'user_id',payload#>>'{auth_event,actor_id}')=auth.uid()::text $q$
  INTO n,last_event,refreshes,logins USING lo,hi;
 END IF;
 RETURN jsonb_build_object('source_present',to_regclass('auth.audit_log_entries') IS NOT NULL,'own_events',n,'own_logins',logins,'own_refreshes',refreshes,'own_last_event',last_event,
 'own_client_membership',EXISTS(SELECT 1 FROM public.domain_memberships WHERE domain_id=d AND user_id=auth.uid() AND is_active));
END $f$;

CREATE OR REPLACE FUNCTION public.audit_report(p_domain uuid,p_from timestamptz,p_to timestamptz,
 p_category text DEFAULT NULL,p_action text DEFAULT NULL,p_actor uuid DEFAULT NULL,p_table text DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM itrix_audit_private.assert_reader(p_domain);
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '93 days'
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_category IS NOT NULL AND p_category NOT IN('transaction','connection')
 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Période invalide (93 jours maximum) ou pagination invalide.' USING ERRCODE='22023'; END IF;
 WITH all_events AS MATERIALIZED (
 SELECT 'tx:'||e.id::text event_id,e.occurred_at,e.actor_id,e.actor_label,e.action,'transaction'::text category,
 e.table_name,e.entity_id::text entity_id,e.transaction_id,e.changed_fields,e.before_values,e.after_values,e.entity_key,
 CASE WHEN e.domain_id IS NULL AND e.scope_kind='client' THEN 'unassigned' ELSE e.scope_kind END scope_kind,NULL::text connection_scope
 FROM public.audit_events e WHERE e.domain_id IS NOT DISTINCT FROM p_domain AND e.occurred_at>=p_from AND e.occurred_at<p_to AND (p_category IS NULL OR p_category='transaction')
 UNION ALL
 SELECT c.event_id,c.occurred_at,c.actor_id,c.actor_label,c.action,'connection','auth',NULL,NULL,'{}'::text[],NULL,NULL,NULL,
 CASE WHEN c.connection_scope='platform_account' THEN 'platform' ELSE 'client' END,c.connection_scope
 FROM itrix_audit_private.connections_163(p_domain,p_from,p_to) c WHERE p_category IS NULL OR p_category='connection'
 ), filtered AS MATERIALIZED (
 SELECT * FROM all_events e WHERE (p_action IS NULL OR e.action=p_action) AND (p_actor IS NULL OR e.actor_id=p_actor) AND (p_table IS NULL OR e.table_name=p_table)
 ), page AS (SELECT * FROM filtered e WHERE p_before IS NULL OR (e.occurred_at,e.event_id)<(p_before,p_before_id) ORDER BY occurred_at DESC,event_id DESC LIMIT p_limit+1),
 shown AS (SELECT e.*,itrix_audit_private.reference_labels(p_domain,e.before_values)||itrix_audit_private.reference_labels(p_domain,e.after_values) reference_labels
 FROM page e ORDER BY occurred_at DESC,event_id DESC LIMIT p_limit)
 SELECT jsonb_build_object('events',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.occurred_at DESC,s.event_id DESC) FROM shown s),'[]'),
 'has_more',(SELECT count(*)>p_limit FROM page),'summary',(SELECT jsonb_build_object('total',count(*),'logins',count(*) FILTER(WHERE action IN('login','mfa_code_login')),
 'transactions',count(DISTINCT transaction_id) FILTER(WHERE category='transaction'),'validations',count(*) FILTER(WHERE action='validate'),'actors',count(DISTINCT actor_id)) FROM filtered),
 'coverage',coalesce((SELECT jsonb_agg(table_name ORDER BY table_name) FROM itrix_audit_private.registry),'[]'),
 'auth_source_present',to_regclass('auth.audit_log_entries') IS NOT NULL,'connection_diagnostics',itrix_audit_private.connection_diagnostics(p_domain,p_from,p_to),
 'unassigned_events',CASE WHEN public.is_platform_admin(auth.uid()) THEN (SELECT count(*) FROM public.audit_events WHERE domain_id IS NULL AND scope_kind<>'platform') ELSE NULL END,
 'actor_options',coalesce((SELECT jsonb_agg(x) FROM (SELECT actor_id,max(actor_label) actor_label FROM all_events WHERE actor_id IS NOT NULL GROUP BY actor_id ORDER BY max(actor_label)) x),'[]'),
 'started_at',(SELECT min(installed_at) FROM itrix_audit_private.registry)) INTO result; RETURN result;
END $f$;

CREATE FUNCTION public.audit_entity_history(p_domain uuid,p_table text,p_entity uuid DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM itrix_audit_private.assert_reader(p_domain);
 IF NOT EXISTS(SELECT 1 FROM itrix_audit_private.registry WHERE table_name=p_table)
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Historique indisponible pour ce périmètre.' USING ERRCODE='22023'; END IF;
 WITH matching AS MATERIALIZED (SELECT e.* FROM public.audit_events e WHERE e.domain_id IS NOT DISTINCT FROM p_domain AND e.table_name=p_table AND (p_entity IS NULL OR e.entity_id=p_entity)),
 page AS (SELECT * FROM matching e WHERE p_before IS NULL OR (e.occurred_at,e.id)<(p_before,p_before_id) ORDER BY occurred_at DESC,id DESC LIMIT p_limit+1),
 shown AS (SELECT 'tx:'||e.id::text event_id,e.id cursor_id,e.occurred_at,e.actor_id,e.actor_label,e.action,'transaction'::text category,e.table_name,e.entity_id::text,e.transaction_id,e.changed_fields,e.before_values,e.after_values,e.entity_key,e.scope_kind,
 itrix_audit_private.reference_labels(p_domain,e.before_values)||itrix_audit_private.reference_labels(p_domain,e.after_values) reference_labels FROM page e ORDER BY e.occurred_at DESC,e.id DESC LIMIT p_limit)
 SELECT jsonb_build_object('events',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY occurred_at DESC,cursor_id DESC) FROM shown s),'[]'),'has_more',(SELECT count(*)>p_limit FROM page),'total',(SELECT count(*) FROM matching)) INTO result;
 RETURN result;
END $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA itrix_audit_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.audit_entity_history(uuid,text,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.audit_entity_history(uuid,text,uuid,timestamptz,uuid,integer) TO authenticated;
COMMIT;
SELECT jsonb_build_object('covered_tables',(SELECT jsonb_agg(table_name ORDER BY table_name) FROM itrix_audit_private.registry),
 'unassigned_existing_rows',(SELECT count(*) FROM itrix_audit_private.entity_scope e JOIN itrix_audit_private.registry r USING(table_name) WHERE e.domain_id IS NULL AND r.scope_mode<>'platform')) audit_extension;
