-- ITRIX audit v1. NOT applied by Codex to hosted Supabase.
-- Run as owner, as ONE transaction, after review. No business-data backfill/change.
-- PostgreSQL transaction triggers + READ ONLY adapter for native Auth logs.
-- No browser-supplied actor/time; no raw rows, passwords, tokens or arbitrary JSON.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE SCHEMA itrix_audit_private;
REVOKE ALL ON SCHEMA itrix_audit_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE itrix_audit_private.registry(
 table_name text PRIMARY KEY, depth integer NOT NULL,
 parent_table text, parent_column text,
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Retained ownership lookup allows attribution of cascading deletes after parent removal.
CREATE TABLE itrix_audit_private.entity_scope(
 table_name text NOT NULL, entity_id uuid NOT NULL, domain_id uuid,
 PRIMARY KEY(table_name,entity_id)
);
CREATE TABLE public.audit_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid, -- no cascading FK: history survives deleted records/actors
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid, actor_label text NOT NULL,
 action text NOT NULL CHECK(action IN('create','update','delete','validate','status_change','scope_exit','scope_enter')),
 table_name text NOT NULL, entity_id uuid NOT NULL,
 transaction_id text NOT NULL,
 changed_fields text[] NOT NULL,
 before_values jsonb, after_values jsonb
);
CREATE INDEX audit_events_domain_time ON public.audit_events(domain_id,occurred_at DESC,id DESC);
CREATE INDEX audit_events_entity ON public.audit_events(domain_id,table_name,entity_id,occurred_at);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE itrix_audit_private.registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE itrix_audit_private.entity_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA itrix_audit_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION itrix_audit_private.assert_reader(d uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF auth.uid() IS NULL OR d IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active)
 OR NOT public.is_domain_admin(d,auth.uid()) THEN
  RAISE EXCEPTION 'Rapport réservé aux administrateurs du client actif.' USING ERRCODE='42501';
 END IF;
END $fn$;

-- Allowlist, not a blacklist. Secrets/new application columns are NOT captured by default.
CREATE FUNCTION itrix_audit_private.safe_values(r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN r IS NULL THEN NULL ELSE coalesce(jsonb_object_agg(key,value),'{}'::jsonb) END
 FROM jsonb_each(coalesce(r,'{}'::jsonb)) WHERE key=ANY(ARRAY[
 'code','name','reference','status','is_active','state','approval_status','application_status',
 'validated_by','validated_at','approved_by','approved_at','confirmed_by','confirmed_at',
 'created_by','created_at','updated_at','user_id','role_id','farm_id','greenhouse_id','campaign_id',
 'campaign_planting_id','variety_id','crop_id','client_id','market_id','order_id','invoice_id',
 'quantity','total_qty','gross_weight','net_weight','amount','total_amount','unit_price',
 'total_cost','unit_cost','currency','currency_code','total_area','planted_area','exploitable_area',
 'harvest_date','planting_date','movement_date','payment_date','invoice_date','movement_type'
 ]);
$fn$;

CREATE FUNCTION itrix_audit_private.resolve_scope(t text,r jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p record; d uuid; parent_row jsonb;
BEGIN
 IF t='domains' THEN RETURN (r->>'id')::uuid; END IF;
 IF r ? 'domain_id' THEN RETURN nullif(r->>'domain_id','')::uuid; END IF;
 SELECT * INTO p FROM itrix_audit_private.registry WHERE table_name=t;
 IF p.parent_table IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(b) FROM public.%I b WHERE id=$1',p.parent_table)
   INTO parent_row USING nullif(r->>p.parent_column,'')::uuid;
  IF parent_row IS NOT NULL THEN RETURN itrix_audit_private.resolve_scope(p.parent_table,parent_row); END IF;
  SELECT domain_id INTO d FROM itrix_audit_private.entity_scope
   WHERE table_name=p.parent_table AND entity_id=nullif(r->>p.parent_column,'')::uuid;
 END IF;
 RETURN d;
END $fn$;

CREATE FUNCTION itrix_audit_private.capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE b jsonb; a jsonb; old_d uuid; new_d uuid; who uuid:=auth.uid(); label text;
 fields text[]; verb text; eid uuid; bs jsonb; av jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); old_d:=itrix_audit_private.resolve_scope(TG_TABLE_NAME,b); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); new_d:=itrix_audit_private.resolve_scope(TG_TABLE_NAME,a); END IF;
 eid:=coalesce(a->>'id',b->>'id')::uuid;
 -- Refresh even before a cascading delete, including ancestors transferred since install.
  INSERT INTO itrix_audit_private.entity_scope VALUES(TG_TABLE_NAME,eid,coalesce(new_d,old_d))
   ON CONFLICT(table_name,entity_id) DO UPDATE SET domain_id=excluded.domain_id;
 IF TG_OP='UPDATE' AND a=b THEN RETURN NEW; END IF;
 SELECT coalesce(nullif(full_name,''),id::text) INTO label FROM public.profiles WHERE id=who;
 label:=coalesce(label,CASE WHEN who IS NULL THEN 'Système / administration SQL' ELSE who::text END);
 bs:=itrix_audit_private.safe_values(b); av:=itrix_audit_private.safe_values(a);
 SELECT coalesce(array_agg(k ORDER BY k),'{}') INTO fields FROM
  (SELECT key k FROM jsonb_object_keys(coalesce(bs,'{}')||coalesce(av,'{}')) key) keys
  WHERE bs->k IS DISTINCT FROM av->k;
 verb:=CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'update' END;
 IF TG_OP='UPDATE' THEN
  IF (a->>'validated_by' IS DISTINCT FROM b->>'validated_by' AND a->>'validated_by' IS NOT NULL)
   OR (a->>'approved_by' IS DISTINCT FROM b->>'approved_by' AND a->>'approved_by' IS NOT NULL)
   OR (a->>'status' IS DISTINCT FROM b->>'status' AND a->>'status' IN('approved','validated','approuvee','approuve','validee','valide')) THEN verb:='validate';
  ELSIF a->>'status' IS DISTINCT FROM b->>'status' OR a->>'approval_status' IS DISTINCT FROM b->>'approval_status' THEN verb:='status_change'; END IF;
 END IF;
 -- A tenant transfer must not reveal the receiving client's new values to the old client.
 IF TG_OP='UPDATE' AND old_d IS DISTINCT FROM new_d THEN
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values,after_values)
   VALUES(old_d,who,label,'scope_exit',TG_TABLE_NAME,eid,txid_current()::text,fields,bs,NULL),
         (new_d,who,label,'scope_enter',TG_TABLE_NAME,eid,txid_current()::text,fields,NULL,av);
 ELSE
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values,after_values)
   VALUES(coalesce(new_d,old_d),who,label,verb,TG_TABLE_NAME,eid,txid_current()::text,fields,bs,av);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;

CREATE FUNCTION itrix_audit_private.deny_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'Le journal d’audit ne peut pas être modifié ou effacé.' USING ERRCODE='42501'; END $fn$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events
 FOR EACH STATEMENT EXECUTE FUNCTION itrix_audit_private.deny_rewrite();

CREATE FUNCTION itrix_audit_private.capture_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r jsonb; who uuid:=auth.uid(); label text;
BEGIN
 SELECT coalesce(nullif(full_name,''),id::text) INTO label FROM public.profiles WHERE id=who;
 label:=coalesce(label,CASE WHEN who IS NULL THEN 'Système / administration SQL' ELSE who::text END);
 FOR r IN EXECUTE format('SELECT to_jsonb(b) FROM public.%I b',TG_TABLE_NAME) LOOP
  INSERT INTO public.audit_events(domain_id,actor_id,actor_label,action,table_name,entity_id,transaction_id,changed_fields,before_values)
   VALUES(itrix_audit_private.resolve_scope(TG_TABLE_NAME,r),who,label,'delete',TG_TABLE_NAME,(r->>'id')::uuid,
    txid_current()::text,ARRAY['__truncate'],itrix_audit_private.safe_values(r));
 END LOOP;
 RETURN NULL;
END $fn$;

-- Discover owned tables and unambiguous FK child paths. Nothing is guessed from UI state.
DO $install$
DECLARE n integer; added integer; t record;
BEGIN
 IF to_regprocedure('public.is_domain_admin(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Helpers client absents.'; END IF;
 INSERT INTO itrix_audit_private.registry(table_name,depth)
 SELECT c.relname,0 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relkind='r' AND c.relname<>'audit_events'
 AND c.relname !~ '(audit|history|snapshot|migration|draft)' AND c.relname NOT LIKE 'client_reference_%'
 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped)
 AND (c.relname='domains' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='domain_id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped));
 LOOP
  -- Known business ownership routes: optional alternative FKs (zone, variety, market)
  -- must not exclude core transaction lines. Require the actual declared FK to match.
  INSERT INTO itrix_audit_private.registry(table_name,depth,parent_table,parent_column)
  SELECT v.child,r.depth+1,v.parent,v.col FROM (VALUES
   ('greenhouses','farms','farm_id'),('purchase_order_lines','purchase_orders','po_id'),
   ('invoice_lines','invoices','invoice_id'),('sales_order_lines','sales_orders','order_id'),
   ('delivery_notes','sales_orders','order_id'),('station_settlement_lines','station_settlements','settlement_id'),
   ('station_settlement_allocations','station_settlement_lines','settlement_line_id'),
   ('harvest_lot_sources','harvest_lots','harvest_lot_id')
  ) v(child,parent,col) JOIN itrix_audit_private.registry r ON r.table_name=v.parent
  WHERE NOT EXISTS(SELECT 1 FROM itrix_audit_private.registry WHERE table_name=v.child)
  AND EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]
   JOIN pg_attribute p ON p.attrelid=f.confrelid AND p.attnum=f.confkey[1]
   WHERE f.conrelid=to_regclass('public.'||v.child) AND f.confrelid=to_regclass('public.'||v.parent)
    AND f.contype='f' AND cardinality(f.conkey)=1 AND a.attname=v.col AND p.attname='id')
  AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||v.child) AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped);
  GET DIAGNOSTICS added=ROW_COUNT;
  INSERT INTO itrix_audit_private.registry(table_name,depth,parent_table,parent_column)
  SELECT DISTINCT ON(c.relname) c.relname,r.depth+1,p.relname,a.attname
  FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
  JOIN pg_class p ON p.oid=fk.confrelid AND p.relnamespace='public'::regnamespace JOIN itrix_audit_private.registry r ON r.table_name=p.relname
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=fk.conkey[1]
  JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=fk.confkey[1] AND pa.attname='id'
  WHERE fk.contype='f' AND cardinality(fk.conkey)=1 AND ns.nspname='public' AND c.relkind='r'
  AND c.relname !~ '(audit|history|snapshot|migration|draft)' AND c.relname NOT LIKE 'client_reference_%'
  AND c.relname NOT IN(SELECT table_name FROM itrix_audit_private.registry)
  AND EXISTS(SELECT 1 FROM pg_attribute i WHERE i.attrelid=c.oid AND i.attname='id' AND i.atttypid='uuid'::regtype AND NOT i.attisdropped)
  -- Only a single potential owner route at installation is accepted (ambiguous rows excluded).
  AND (SELECT count(*) FROM pg_constraint f JOIN pg_class pc ON pc.oid=f.confrelid
       JOIN itrix_audit_private.registry pr ON pr.table_name=pc.relname
       WHERE f.conrelid=c.oid AND pc.relnamespace='public'::regnamespace AND f.contype='f' AND cardinality(f.conkey)=1)=1
  ORDER BY c.relname,r.depth,p.relname;
  GET DIAGNOSTICS n=ROW_COUNT; EXIT WHEN n+added=0;
 END LOOP;
 -- Prevent ownership cache gaps while installing. No update to business records.
 FOR t IN SELECT * FROM itrix_audit_private.registry ORDER BY table_name LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t.table_name);
 END LOOP;
 FOR t IN SELECT * FROM itrix_audit_private.registry ORDER BY depth,table_name LOOP
  EXECUTE format('INSERT INTO itrix_audit_private.entity_scope SELECT %L,id,itrix_audit_private.resolve_scope(%L,to_jsonb(b)) FROM public.%I b',t.table_name,t.table_name,t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_write AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION itrix_audit_private.capture()',t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION itrix_audit_private.capture()',t.table_name);
  EXECUTE format('CREATE TRIGGER itrix_audit_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION itrix_audit_private.capture_truncate()',t.table_name);
 END LOOP;
END $install$;

-- Native source adapter; never writes to managed auth schema. Unknown/failed identities are
-- not assigned to a tenant by email. A refresh is NOT a login. No raw payload/IP export.
CREATE FUNCTION itrix_audit_private.connections(d uuid,lo timestamptz,hi timestamptz)
RETURNS TABLE(event_id text,occurred_at timestamptz,actor_id uuid,actor_label text,action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF to_regclass('auth.audit_log_entries') IS NULL THEN RETURN; END IF;
 RETURN QUERY EXECUTE $q$
 SELECT 'auth:'||e.id::text,e.created_at,p.id,coalesce(nullif(p.full_name,''),p.id::text),e.payload->>'action'
 FROM auth.audit_log_entries e JOIN public.profiles p ON p.id::text=e.payload->>'actor_id'
 WHERE e.created_at >= $2 AND e.created_at < $3 AND e.payload->>'action' IN('login','logout','token_refreshed','mfa_code_login')
 AND EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.domain_id=$1 AND m.user_id=p.id
  AND m.is_active AND e.created_at>=m.created_at)
 $q$ USING d,lo,hi;
END $fn$;

CREATE FUNCTION public.audit_report(p_domain uuid,p_from timestamptz,p_to timestamptz,
 p_category text DEFAULT NULL,p_action text DEFAULT NULL,p_actor uuid DEFAULT NULL,p_table text DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM itrix_audit_private.assert_reader(p_domain);
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '93 days'
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
 OR p_category IS NOT NULL AND p_category NOT IN('transaction','connection')
 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION 'Période invalide (93 jours maximum) ou pagination invalide.' USING ERRCODE='22023';
 END IF;
 WITH all_events AS MATERIALIZED (
 SELECT 'tx:'||e.id::text event_id,e.occurred_at,e.actor_id,e.actor_label,e.action,'transaction'::text category,
 e.table_name,e.entity_id::text entity_id,e.transaction_id,e.changed_fields,e.before_values,e.after_values
 FROM public.audit_events e WHERE e.domain_id=p_domain AND e.occurred_at>=p_from AND e.occurred_at<p_to
 AND (p_category IS NULL OR p_category='transaction')
 UNION ALL
 SELECT c.event_id,c.occurred_at,c.actor_id,c.actor_label,c.action,'connection','auth',NULL,NULL,'{}'::text[],NULL,NULL
 FROM itrix_audit_private.connections(p_domain,p_from,p_to) c WHERE p_category IS NULL OR p_category='connection'
 ), filtered AS MATERIALIZED (
 SELECT * FROM all_events e WHERE (p_action IS NULL OR e.action=p_action) AND (p_actor IS NULL OR e.actor_id=p_actor)
 AND (p_table IS NULL OR e.table_name=p_table)
 ), page AS (
 SELECT * FROM filtered e WHERE p_before IS NULL OR (e.occurred_at,e.event_id)<(p_before,p_before_id)
 ORDER BY occurred_at DESC,event_id DESC LIMIT p_limit+1
 ), shown AS (SELECT * FROM page ORDER BY occurred_at DESC,event_id DESC LIMIT p_limit)
 SELECT jsonb_build_object(
 'events',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.occurred_at DESC,s.event_id DESC) FROM shown s),'[]'),
 'has_more',(SELECT count(*)>p_limit FROM page),
 'summary',(SELECT jsonb_build_object('total',count(*),'logins',count(*) FILTER(WHERE action IN('login','mfa_code_login')),
  'transactions',count(DISTINCT transaction_id) FILTER(WHERE category='transaction'),'validations',count(*) FILTER(WHERE action='validate'),
  'actors',count(DISTINCT actor_id)) FROM filtered),
 'coverage',coalesce((SELECT jsonb_agg(table_name ORDER BY table_name) FROM itrix_audit_private.registry),'[]'),
 'auth_source_present',to_regclass('auth.audit_log_entries') IS NOT NULL,
 'unassigned_events',CASE WHEN public.is_platform_admin(auth.uid()) THEN (SELECT count(*) FROM public.audit_events WHERE domain_id IS NULL) ELSE NULL END,
 'actor_options',coalesce((SELECT jsonb_agg(x) FROM (SELECT actor_id,max(actor_label) actor_label FROM all_events WHERE actor_id IS NOT NULL GROUP BY actor_id ORDER BY max(actor_label)) x),'[]'),
 'started_at',(SELECT min(installed_at) FROM itrix_audit_private.registry)
 ) INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA itrix_audit_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.audit_report(uuid,timestamptz,timestamptz,text,text,uuid,text,timestamptz,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.audit_report(uuid,timestamptz,timestamptz,text,text,uuid,text,timestamptz,text,integer) TO authenticated;
COMMIT;
-- Installation receipt: no business row content is returned.
SELECT jsonb_build_object('covered_tables',(SELECT jsonb_agg(table_name ORDER BY table_name) FROM itrix_audit_private.registry),
 'unassigned_existing_rows',(SELECT count(*) FROM itrix_audit_private.entity_scope WHERE domain_id IS NULL),
 'other_public_tables',(SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='r' AND c.relname<>'audit_events' AND c.relname NOT IN(SELECT table_name FROM itrix_audit_private.registry))) audit_installation;
