-- Apply manually to hosted Supabase after local verification.
BEGIN;
CREATE SCHEMA itrix_client_delete;
REVOKE ALL ON SCHEMA itrix_client_delete FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.client_deletion_jobs (
 id uuid PRIMARY KEY, client_id uuid NOT NULL, client_code text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 status text NOT NULL CHECK(status IN('files_pending','complete')),
 counts jsonb NOT NULL, files jsonb NOT NULL DEFAULT '[]', local_cleanup boolean NOT NULL DEFAULT true,
 fingerprint text NOT NULL
);
ALTER TABLE public.client_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_deletion_jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION itrix_client_delete.assert_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(public.is_platform_admin(auth.uid()),false) THEN
  RAISE EXCEPTION 'Suppression réservée au super-administrateur plateforme' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION itrix_client_delete.row_key(rel oid, payload jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_object_agg(a.attname,payload->a.attname)
 FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) n
 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=n
 WHERE c.conrelid=rel AND c.contype='p'
$$;

CREATE FUNCTION itrix_client_delete.collect(client uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE t record; fk record; predicate text; owner_expression text; count_added bigint; progress bigint; bad boolean; report jsonb; manifest jsonb;
BEGIN
 PERFORM itrix_client_delete.assert_admin();
 IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=client) THEN RAISE EXCEPTION 'Client introuvable'; END IF;
 DROP TABLE IF EXISTS pg_temp.itrix_delete_rows;
 CREATE TEMP TABLE itrix_delete_rows(rel oid NOT NULL,k jsonb NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(rel,k)) ON COMMIT DROP;
 -- Every directly owned table is included, including histories without a foreign key.
 FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN('public','itrix_audit_private') AND EXISTS(
   SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='domain_id' AND NOT a.attisdropped)
 LOOP
  EXECUTE format('INSERT INTO pg_temp.itrix_delete_rows SELECT %s,itrix_client_delete.row_key(%s,to_jsonb(r)),to_jsonb(r) FROM %I.%I r WHERE domain_id=$1 ON CONFLICT DO NOTHING',t.oid,t.oid,t.nspname,t.relname) USING client;
 END LOOP;
 INSERT INTO pg_temp.itrix_delete_rows SELECT 'public.domains'::regclass,itrix_client_delete.row_key('public.domains'::regclass,to_jsonb(d)),to_jsonb(d) FROM public.domains d WHERE id=client;
 LOOP
  progress:=0;
  FOR fk IN SELECT c.*,n.nspname,cl.relname FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE c.contype='f' AND n.nspname='public'
    AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows WHERE rel=c.confrelid)
  LOOP
   -- Identity, roles and platform configuration are never descendants to erase.
   IF fk.relname=ANY(ARRAY['profiles','users','roles','permissions','role_permissions','modules','app_modules','app_settings','cnss_declarations','reference_lists','reference_values','account_categories','exchange_rates','default_crop_templates','workflow_definitions','workflow_states','workflow_transitions','client_deletion_jobs']) THEN CONTINUE; END IF;
   SELECT string_agg(format('to_jsonb(r)->%L IS NOT NULL AND to_jsonb(r)->%L<>''null''::jsonb AND to_jsonb(r)->%L=p.payload->%L',a.attname,a.attname,a.attname,b.attname),' AND ' ORDER BY u.ord) INTO predicate
   FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY u(src,dst,ord)
   JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.src JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=u.dst;
   EXECUTE format('INSERT INTO pg_temp.itrix_delete_rows SELECT %s,itrix_client_delete.row_key(%s,to_jsonb(r)),to_jsonb(r) FROM public.%I r WHERE EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows p WHERE p.rel=%s AND %s) ON CONFLICT DO NOTHING',fk.conrelid,fk.conrelid,fk.relname,fk.confrelid,predicate);
   GET DIAGNOSTICS count_added=ROW_COUNT; progress:=progress+count_added;
  END LOOP;
  -- Legacy payroll periods can contain employees from multiple clients.
  -- Delete a period only when every payslip in it belongs to this deletion.
  INSERT INTO pg_temp.itrix_delete_rows
   SELECT 'public.payroll_periods'::regclass,itrix_client_delete.row_key('public.payroll_periods'::regclass,to_jsonb(p)),to_jsonb(p)
   FROM public.payroll_periods p WHERE (
    EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows s WHERE s.rel='public.payslips'::regclass AND s.payload->>'period_id'=p.id::text)
    OR EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows s WHERE s.rel='public.payroll_preparations'::regclass AND s.payload->>'payroll_period_id'=p.id::text))
   AND NOT EXISTS(SELECT 1 FROM public.payslips s WHERE s.period_id=p.id AND NOT EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows r WHERE r.rel='public.payslips'::regclass AND r.k=itrix_client_delete.row_key('public.payslips'::regclass,to_jsonb(s))))
   ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS count_added=ROW_COUNT; progress:=progress+count_added;
  EXIT WHEN progress=0;
 END LOOP;
 -- Polymorphic histories and old reference snapshots have no FK.
 INSERT INTO pg_temp.itrix_delete_rows SELECT 'public.workflow_history'::regclass,itrix_client_delete.row_key('public.workflow_history'::regclass,to_jsonb(h)),to_jsonb(h)
 FROM public.workflow_history h WHERE EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows r JOIN pg_class c ON c.oid=r.rel
  WHERE r.payload->>'id'=h.entity_id::text AND h.entity_type IN(c.relname,regexp_replace(c.relname,'s$',''))) ON CONFLICT DO NOTHING;
 INSERT INTO pg_temp.itrix_delete_rows SELECT 'public.client_reference_cutover_snapshot'::regclass,itrix_client_delete.row_key('public.client_reference_cutover_snapshot'::regclass,to_jsonb(s)),to_jsonb(s)
 FROM public.client_reference_cutover_snapshot s WHERE s.before_row->>'domain_id'=client::text OR s.after_row->>'domain_id'=client::text ON CONFLICT DO NOTHING;
 INSERT INTO pg_temp.itrix_delete_rows SELECT 'public.client_reference_source_snapshot'::regclass,itrix_client_delete.row_key('public.client_reference_source_snapshot'::regclass,to_jsonb(s)),to_jsonb(s)
 FROM public.client_reference_source_snapshot s WHERE s.before_row->>'domain_id'=client::text ON CONFLICT DO NOTHING;

 -- Reject cross-client relationships instead of extending a cascade into another tenant.
 IF EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows WHERE payload->>'domain_id' IS NOT NULL AND payload->>'domain_id'<>client::text) THEN
  RAISE EXCEPTION 'Une relation relie ce client aux données d’un autre client. Corrigez ce rattachement avant suppression.'; END IF;
 IF to_regprocedure('itrix_audit_private.resolve_scope(text,jsonb)') IS NOT NULL THEN
  FOR t IN SELECT r.*,c.relname FROM pg_temp.itrix_delete_rows r JOIN pg_class c ON c.oid=r.rel JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' LOOP
   IF t.relname NOT IN('workflow_history','payroll_periods','client_reference_source_snapshot','client_reference_cutover_snapshot') THEN
    EXECUTE 'SELECT itrix_audit_private.resolve_scope($1,$2) IS NOT NULL AND itrix_audit_private.resolve_scope($1,$2)<>$3' INTO bad USING t.relname,t.payload,client;
    IF bad THEN RAISE EXCEPTION 'Dépendance attribuée à un autre client (%)',t.relname; END IF;
   END IF;
  END LOOP;
 END IF;
 FOR fk IN SELECT c.*,n.nspname,cl.relname FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
  WHERE c.contype='f' AND n.nspname='public' AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows WHERE rel=c.conrelid)
   AND EXISTS(SELECT 1 FROM pg_class p JOIN pg_namespace ns ON ns.oid=p.relnamespace WHERE p.oid=c.confrelid AND ns.nspname='public')
 LOOP
  SELECT string_agg(format('to_jsonb(r)->%L=to_jsonb(p)->%L',a.attname,b.attname),' AND ') INTO predicate
   FROM unnest(fk.conkey,fk.confkey) u(src,dst) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.src JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=u.dst;
  owner_expression:='to_jsonb(p)->>''domain_id''';
  IF to_regprocedure('itrix_audit_private.resolve_scope(text,jsonb)') IS NOT NULL THEN
   owner_expression:=format('coalesce(to_jsonb(p)->>''domain_id'',itrix_audit_private.resolve_scope(%L,to_jsonb(p))::text)',(SELECT relname FROM pg_class WHERE oid=fk.confrelid));
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s r JOIN %s p ON %s WHERE (%s) IS NOT NULL AND (%s)<>$1::text AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows s WHERE s.rel=%s AND s.k=itrix_client_delete.row_key(%s,to_jsonb(r))))',fk.conrelid::regclass,fk.confrelid::regclass,predicate,owner_expression,owner_expression,fk.conrelid,fk.conrelid) INTO bad USING client;
  IF bad THEN RAISE EXCEPTION 'Dépendance entre clients dans %',fk.relname; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'id',id,'updated_at',updated_at) ORDER BY bucket_id,name),'[]') INTO manifest
 FROM storage.objects WHERE split_part(name,'/',1)=client::text;
 SELECT jsonb_build_object('client_id',client,'code',(SELECT code FROM public.domains WHERE id=client),
  'name',(SELECT name FROM public.domains WHERE id=client),'tables',
  (SELECT jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'count',v.cnt) ORDER BY n.nspname,c.relname)
   FROM (SELECT rel,count(*) cnt FROM pg_temp.itrix_delete_rows GROUP BY rel) v JOIN pg_class c ON c.oid=v.rel JOIN pg_namespace n ON n.oid=c.relnamespace),
  'total',(SELECT count(*) FROM pg_temp.itrix_delete_rows),'files',jsonb_array_length(manifest),
  'accounts_to_deactivate',(SELECT count(*) FROM public.profiles p WHERE p.is_active AND NOT p.is_platform_admin AND EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.user_id=p.id AND m.domain_id=client) AND NOT EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.user_id=p.id AND m.domain_id<>client AND m.is_active)),
  'fingerprint',md5((SELECT string_agg(rel::text||k::text||md5(payload::text),'|' ORDER BY rel,k) FROM pg_temp.itrix_delete_rows)||manifest::text)) INTO report;
 RETURN report||jsonb_build_object('_files',manifest);
END $f$;

CREATE FUNCTION public.preview_client_deletion(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN itrix_client_delete.collect(p_domain)-'_files'; END $$;

CREATE FUNCTION public.delete_client_completely(p_domain uuid,p_code text,p_fingerprint text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='8s' SET statement_timeout='120s' AS $f$
DECLARE plan jsonb; job public.client_deletion_jobs; t record; tr record; fk record; progress bigint; affected bigint; predicate text; nullable_col text; changed boolean; result_counts jsonb; affected_users uuid[]; affected_campaigns uuid[];
BEGIN
 PERFORM itrix_client_delete.assert_admin();
 PERFORM pg_advisory_xact_lock(hashtextextended('client-delete:'||p_domain::text,0));
 SELECT * INTO job FROM public.client_deletion_jobs WHERE id=p_request FOR UPDATE;
 IF FOUND THEN
  IF job.client_id<>p_domain OR job.client_code<>p_code OR job.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Confirmation différente de la demande initiale'; END IF;
  RETURN jsonb_build_object('job_id',job.id,'status',job.status,'counts',job.counts);
 END IF;
 IF p_request IS NULL OR p_code IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'Confirmation incomplète'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND code=p_code) THEN RAISE EXCEPTION 'Le code client ne correspond pas'; END IF;
 -- Stable dependency snapshot: readers continue during planning; writers wait.
 FOR t IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN('public','itrix_audit_private') AND c.relname<>'client_deletion_jobs' ORDER BY c.oid
 LOOP EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',t.oid::regclass); END LOOP;
 LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;
 plan:=itrix_client_delete.collect(p_domain);
 IF plan->>'fingerprint'<>p_fingerprint THEN RAISE EXCEPTION 'Les données ont changé. Rechargez l’aperçu avant de confirmer.'; END IF;
 result_counts:=plan->'tables';
 SELECT array_agg(DISTINCT (payload->>'user_id')::uuid) INTO affected_users FROM pg_temp.itrix_delete_rows WHERE rel='public.domain_memberships'::regclass;
 SELECT array_agg((payload->>'id')::uuid) INTO affected_campaigns FROM pg_temp.itrix_delete_rows WHERE rel='public.campaigns'::regclass;
 -- User triggers enforce ordinary workflows; this whole-client transaction bypasses
 -- them under table locks, while FK/check constraints remain enforced throughout.
 CREATE TEMP TABLE itrix_delete_triggers(rel oid,name text,state "char") ON COMMIT DROP;
 FOR t IN SELECT DISTINCT rel FROM pg_temp.itrix_delete_rows ORDER BY rel LOOP
  EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE',t.rel::regclass);
  FOR tr IN SELECT * FROM pg_trigger WHERE tgrelid=t.rel AND NOT tgisinternal AND tgenabled<>'D' LOOP
   INSERT INTO pg_temp.itrix_delete_triggers VALUES(t.rel,tr.tgname,tr.tgenabled);
   EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',t.rel::regclass,tr.tgname);
  END LOOP;
 END LOOP;
 LOOP
  progress:=0;
  FOR t IN SELECT DISTINCT rel FROM pg_temp.itrix_delete_rows ORDER BY rel LOOP
   BEGIN
    EXECUTE format('DELETE FROM %s r USING pg_temp.itrix_delete_rows s WHERE s.rel=%s AND s.k=itrix_client_delete.row_key(%s,to_jsonb(r))',t.rel::regclass,t.rel,t.rel);
    GET DIAGNOSTICS affected=ROW_COUNT;
    DELETE FROM pg_temp.itrix_delete_rows WHERE rel=t.rel;
    progress:=progress+affected;
   EXCEPTION WHEN foreign_key_violation THEN NULL;
   END;
  END LOOP;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows);
  IF progress=0 THEN
   changed:=false;
   -- Break only nullable internal FK cycles, never primary keys or tenant ownership.
   FOR fk IN SELECT c.* FROM pg_constraint c WHERE c.contype='f'
    AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows WHERE rel=c.conrelid)
    AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows WHERE rel=c.confrelid) ORDER BY c.oid
   LOOP
    SELECT a.attname INTO nullable_col FROM unnest(fk.conkey) u(num) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.num
     WHERE NOT a.attnotnull AND a.attname<>'domain_id' AND NOT EXISTS(SELECT 1 FROM pg_constraint p WHERE p.conrelid=fk.conrelid AND p.contype='p' AND a.attnum=ANY(p.conkey)) LIMIT 1;
    IF nullable_col IS NULL THEN CONTINUE; END IF;
    SELECT string_agg(format('to_jsonb(r)->%L=p.payload->%L',a.attname,b.attname),' AND ') INTO predicate
     FROM unnest(fk.conkey,fk.confkey) u(src,dst) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.src JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=u.dst;
    BEGIN
     EXECUTE format('UPDATE %s r SET %I=NULL WHERE r.%I IS NOT NULL AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows s WHERE s.rel=%s AND s.k=itrix_client_delete.row_key(%s,to_jsonb(r))) AND EXISTS(SELECT 1 FROM pg_temp.itrix_delete_rows p WHERE p.rel=%s AND %s)',fk.conrelid::regclass,nullable_col,nullable_col,fk.conrelid,fk.conrelid,fk.confrelid,predicate);
     GET DIAGNOSTICS affected=ROW_COUNT;
     IF affected>0 THEN changed:=true; EXIT; END IF;
    EXCEPTION WHEN check_violation OR not_null_violation OR foreign_key_violation THEN NULL;
    END;
   END LOOP;
   IF NOT changed THEN RAISE EXCEPTION 'Une dépendance empêche la suppression complète. Transaction annulée.'; END IF;
  END IF;
 END LOOP;
 -- Restore the original trigger modes before releasing any table lock.
 FOR tr IN SELECT * FROM pg_temp.itrix_delete_triggers LOOP
  EXECUTE format('ALTER TABLE %s ENABLE %s TRIGGER %I',tr.rel::regclass,CASE tr.state WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,tr.name);
 END LOOP;
 -- Shared login identities remain. Unassigned ordinary profiles are deactivated.
 UPDATE public.profiles p SET is_active=false WHERE p.id=ANY(affected_users) AND NOT p.is_platform_admin AND p.is_active
  AND NOT EXISTS(SELECT 1 FROM public.domain_memberships m WHERE m.user_id=p.id AND m.is_active);
 UPDATE public.domain_memberships m SET is_default=true WHERE m.id IN(
  SELECT DISTINCT ON(user_id) id FROM public.domain_memberships r WHERE r.is_active AND r.user_id=ANY(affected_users)
  AND NOT EXISTS(SELECT 1 FROM public.domain_memberships d WHERE d.user_id=r.user_id AND d.is_active AND d.is_default) ORDER BY user_id,created_at,id);
 UPDATE public.app_settings SET value=jsonb_build_object('id',NULL) WHERE key='current_campaign_id'
  AND value->>'id'=ANY(affected_campaigns::text[]);
 INSERT INTO public.client_deletion_jobs(id,client_id,client_code,actor_id,status,counts,files,fingerprint)
  VALUES(p_request,p_domain,p_code,auth.uid(),'files_pending',result_counts,plan->'_files',p_fingerprint);
 RETURN jsonb_build_object('job_id',p_request,'status','files_pending','counts',result_counts);
END $f$;

CREATE FUNCTION public.client_deletion_cleanup(p_request uuid,p_done boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.client_deletion_jobs;
BEGIN
 PERFORM itrix_client_delete.assert_admin();
 SELECT * INTO job FROM public.client_deletion_jobs WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Suppression introuvable'; END IF;
 IF p_done THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'id',id,'updated_at',updated_at)),'[]') INTO job.files
   FROM storage.objects WHERE split_part(name,'/',1)=job.client_id::text;
  IF jsonb_array_length(job.files)>0 THEN
   UPDATE public.client_deletion_jobs SET files=job.files WHERE id=p_request;
   RETURN jsonb_build_object('job_id',job.id,'status','files_pending','files',job.files,'counts',job.counts);
  END IF;
  UPDATE public.client_deletion_jobs SET status='complete',completed_at=coalesce(completed_at,now()),files='[]',local_cleanup=false WHERE id=p_request;
  job.status:='complete'; job.files:='[]';
 END IF;
 RETURN jsonb_build_object('job_id',job.id,'client_id',job.client_id,'status',job.status,'counts',job.counts,'files',job.files);
END $$;

CREATE FUNCTION public.pending_client_deletions() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM itrix_client_delete.assert_admin();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('job_id',id,'client_id',client_id,'client_code',client_code,'fingerprint',fingerprint,'counts',counts) ORDER BY created_at)
 FROM public.client_deletion_jobs WHERE status='files_pending'),'[]');
END $$;

-- Storage is deleted through its API after commit, never by SQL metadata deletion.
CREATE FUNCTION public.can_cleanup_client_file(bucket text,object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(public.is_platform_admin(auth.uid()),false) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND EXISTS(SELECT 1 FROM public.client_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.files) f
  WHERE j.status='files_pending' AND f->>'bucket'=bucket AND f->>'path'=object_name)
$$;
CREATE POLICY client_delete_file_read ON storage.objects FOR SELECT TO authenticated USING(public.can_cleanup_client_file(bucket_id,name));
CREATE POLICY client_delete_file_remove ON storage.objects FOR DELETE TO authenticated USING(public.can_cleanup_client_file(bucket_id,name));
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA itrix_client_delete FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_client_deletion(uuid),public.delete_client_completely(uuid,text,text,uuid),public.client_deletion_cleanup(uuid,boolean),public.can_cleanup_client_file(text,text),public.pending_client_deletions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_client_deletion(uuid),public.delete_client_completely(uuid,text,text,uuid),public.client_deletion_cleanup(uuid,boolean),public.can_cleanup_client_file(text,text),public.pending_client_deletions() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
