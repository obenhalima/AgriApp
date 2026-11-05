-- NEW FEATURE ONLY. Run after the already-applied client isolation package.
-- Do not rerun 150..154. This installs APIs; it imports no client data itself.
BEGIN;
CREATE TABLE public.initialization_operations (
 id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
 module text NOT NULL CHECK(module='exploitation'),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 request_payload jsonb NOT NULL, before_payload jsonb NOT NULL, after_payload jsonb NOT NULL,
 after_revision integer NOT NULL, status text NOT NULL DEFAULT 'applied' CHECK(status IN('applied','rolled_back')),
 created_at timestamptz NOT NULL DEFAULT now(), rolled_back_at timestamptz, rolled_back_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX initialization_one_active_module1 ON public.initialization_operations(domain_id,module) WHERE status='applied';
CREATE TABLE public.initialization_operation_items (
 operation_id uuid NOT NULL REFERENCES public.initialization_operations(id),
 entity_table text NOT NULL CHECK(entity_table IN('farms','greenhouses','varieties')),
 entity_id uuid NOT NULL, created boolean NOT NULL, after_row jsonb NOT NULL,
 PRIMARY KEY(operation_id,entity_table,entity_id)
);
ALTER TABLE public.initialization_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initialization_operation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.initialization_operations,public.initialization_operation_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.initialization_operations TO authenticated;
CREATE POLICY initialization_operation_read ON public.initialization_operations FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND public.is_domain_admin(domain_id,auth.uid()));

CREATE FUNCTION public.initialization_input_number(value text,minimum numeric,optional boolean DEFAULT true)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result numeric; normalized text;
BEGIN
 IF value IS NULL OR btrim(value)='' THEN
  IF optional THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Surface ou nombre obligatoire non renseigné';
 END IF;
 normalized:=replace(regexp_replace(value,'[[:space:]  ]','','g'),',','.');
 IF normalized !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN RAISE EXCEPTION 'Nombre invalide : %',value; END IF;
 result:=normalized::numeric;
 IF result<minimum THEN RAISE EXCEPTION 'Nombre inférieur à % : %',minimum,value; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.initialization_input_number(text,numeric,boolean) FROM PUBLIC,anon,authenticated;

-- Matches the initialization catalog's display/reference representation.
CREATE FUNCTION public.initialization_module1_projection(t text,entity uuid,client uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE raw jsonb; keys text[]; projected jsonb;
BEGIN
 IF t='farms' THEN
  SELECT to_jsonb(f)||jsonb_build_object('existing_id',f.id::text,'address',coalesce(nullif(f.address,''),f.city)) INTO raw FROM public.farms f WHERE id=entity AND domain_id=client;
  keys:=ARRAY['existing_id','code','name','address','city','region','country','total_area','notes'];
 ELSIF t='greenhouses' THEN
  SELECT to_jsonb(g)||jsonb_build_object('existing_id',g.id::text,'code',f.code||'/'||g.code,'name',coalesce(nullif(g.name,''),g.code)||' — '||f.name,'farm',f.code,'area',g.total_area,'usable_area',g.exploitable_area)
   INTO raw FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=entity AND f.domain_id=client;
  keys:=ARRAY['existing_id','code','name','farm','type','area','usable_area','status','notes'];
 ELSIF t='varieties' THEN
  SELECT to_jsonb(v)||jsonb_build_object('existing_id',v.id::text,'name',v.commercial_name,'crop',c.code) INTO raw
   FROM public.varieties v LEFT JOIN public.crops c ON c.id=v.crop_id AND c.domain_id=client WHERE v.id=entity AND v.domain_id=client;
  keys:=ARRAY['existing_id','code','name','crop','type','destination','theoretical_yield_per_m2','theoretical_cost_per_m2','avg_price_local','avg_price_export','estimated_cycle_days','technical_notes','is_active'];
 ELSE RAISE EXCEPTION 'Section non autorisée'; END IF;
 IF raw IS NULL THEN RAISE EXCEPTION 'Fiche introuvable pour ce client'; END IF;
 SELECT jsonb_object_agg(k,to_jsonb(coalesce(CASE WHEN raw->k='true'::jsonb THEN 'oui' WHEN raw->k='false'::jsonb THEN 'non' ELSE raw->>k END,''))) INTO projected FROM unnest(keys) k;
 RETURN projected;
END;
$$;
REVOKE ALL ON FUNCTION public.initialization_module1_projection(text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.initialization_operation_report(op uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('operation_id',o.id,'status',o.status,'revision',o.after_revision,
  'created',(SELECT count(*) FROM public.initialization_operation_items WHERE operation_id=o.id AND created),
  'reused',(SELECT count(*) FROM public.initialization_operation_items WHERE operation_id=o.id AND NOT created),
  'payload',o.after_payload)
 FROM public.initialization_operations o WHERE o.id=op;
$$;
REVOKE ALL ON FUNCTION public.initialization_operation_report(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.initialization_module1_state(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Administration du client requise' USING ERRCODE='42501';
 END IF;
 SELECT id INTO op FROM public.initialization_operations WHERE domain_id=p_domain AND status='applied';
 RETURN jsonb_build_object('enabled',coalesce(public.client_reference_isolation_ready(p_domain),false),'operation',public.initialization_operation_report(op));
END;
$$;

CREATE FUNCTION public.apply_initialization_module1(p_domain uuid,p_revision integer,p_payload jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_op public.initialization_operations%ROWTYPE; v_revision integer; section text; t text; r jsonb;
 entity uuid; parent uuid; crop uuid; stored jsonb; native jsonb; output jsonb; rows jsonb;
 mappings jsonb:='{}'; v_code text; field text; record_entry record; linked boolean; area numeric; usable numeric; cycle numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT coalesce(public.client_reference_isolation_ready(p_domain),false) THEN
  RAISE EXCEPTION 'Client non autorisé ou isolation non validée' USING ERRCODE='42501';
 END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Identifiant d’opération requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,141));
 SELECT * INTO old_op FROM public.initialization_operations WHERE id=p_request;
 IF FOUND THEN
  IF old_op.domain_id<>p_domain OR old_op.request_payload IS DISTINCT FROM p_payload OR old_op.status<>'applied' THEN RAISE EXCEPTION 'Identifiant d’opération déjà utilisé'; END IF;
  RETURN public.initialization_operation_report(old_op.id);
 END IF;
 IF EXISTS(SELECT 1 FROM public.initialization_operations WHERE domain_id=p_domain AND status='applied') THEN RAISE EXCEPTION 'Module déjà intégré : consultez le bilan'; END IF;
 -- Same validated payload and optimistic locking contract as draft saves.
 v_revision:=public.save_initialization_draft(p_domain,p_revision,p_payload);
 output:=p_payload;
 FOREACH section IN ARRAY ARRAY['farms','greenhouses','varieties'] LOOP
  IF NOT p_payload->'reviewed' ? section OR jsonb_array_length(coalesce(p_payload->'rows'->section,'[]'))=0 THEN RAISE EXCEPTION 'Étape % non relue ou vide',section; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows'->section) q GROUP BY upper(btrim(q->>'code')) HAVING count(*)>1) THEN RAISE EXCEPTION 'Codes dupliqués dans %',section; END IF;
 END LOOP;
 -- Journal and all creations share the same transaction; an error retains none.
 INSERT INTO public.initialization_operations(id,domain_id,module,actor_id,request_payload,before_payload,after_payload,after_revision)
  VALUES(p_request,p_domain,'exploitation',auth.uid(),p_payload,p_payload,p_payload,v_revision);
 FOREACH section IN ARRAY ARRAY['farms','greenhouses','varieties'] LOOP
  t:=section; rows:='[]';
  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'rows'->section) LOOP
   v_code:=btrim(r->>'code'); linked:=nullif(r->>'existing_id','') IS NOT NULL;
   IF v_code IS NULL OR v_code='' OR btrim(coalesce(r->>'name',''))='' THEN RAISE EXCEPTION 'Code et nom requis dans %',section; END IF;
   IF linked THEN
    entity:=(r->>'existing_id')::uuid;
    EXECUTE format('SELECT to_jsonb(q) FROM public.%I q WHERE id=$1 FOR UPDATE',t) INTO native USING entity;
    stored:=public.initialization_module1_projection(t,entity,p_domain);
    IF upper(stored->>'code')<>upper(v_code) OR stored->>'name' IS DISTINCT FROM r->>'name' THEN RAISE EXCEPTION 'Fiche liée modifiée : sélectionner de nouveau la référence'; END IF;
   ELSE
    entity:=gen_random_uuid();
    IF section='farms' THEN
     INSERT INTO public.farms(id,domain_id,code,name,address,city,region,country,total_area,notes)
      VALUES(entity,p_domain,v_code,btrim(r->>'name'),nullif(r->>'address',''),nullif(r->>'city',''),nullif(r->>'region',''),coalesce(nullif(r->>'country',''),'Maroc'),public.initialization_input_number(r->>'total_area',0),nullif(r->>'notes',''));
    ELSIF section='greenhouses' THEN
     SELECT f.id INTO parent FROM public.farms f WHERE f.domain_id=p_domain AND upper(f.code)=upper(btrim(r->>'farm')) FOR UPDATE;
     IF parent IS NULL THEN RAISE EXCEPTION 'Ferme de serre introuvable pour ce client'; END IF;
     area:=public.initialization_input_number(r->>'area',0.01,false);
     usable:=coalesce(public.initialization_input_number(r->>'usable_area',0.01),area);
     IF usable>area THEN RAISE EXCEPTION 'Surface exploitable supérieure à la surface officielle'; END IF;
     INSERT INTO public.greenhouses(id,farm_id,code,name,type,status,total_area,exploitable_area,notes)
      SELECT entity,parent,v_code,btrim(r->>'name'),x.type,x.status,area,usable,nullif(r->>'notes','')
      FROM jsonb_populate_record(NULL::public.greenhouses,jsonb_build_object('type',coalesce(nullif(r->>'type',''),'tunnel'),'status',coalesce(nullif(r->>'status',''),'active'))) x;
    ELSE
     SELECT c.id INTO crop FROM public.crops c WHERE c.domain_id=p_domain AND c.is_active AND upper(c.code)=upper(btrim(r->>'crop')) FOR SHARE;
     IF crop IS NULL THEN RAISE EXCEPTION 'Culture de variété introuvable pour ce client'; END IF;
     cycle:=public.initialization_input_number(r->>'estimated_cycle_days',0);
     IF cycle IS NOT NULL AND cycle<>trunc(cycle) THEN RAISE EXCEPTION 'Le cycle doit être un nombre entier de jours'; END IF;
     INSERT INTO public.varieties(id,domain_id,crop_id,code,commercial_name,type,destination,theoretical_yield_per_m2,theoretical_cost_per_m2,avg_price_local,avg_price_export,estimated_cycle_days,technical_notes,is_active)
      SELECT entity,p_domain,crop,v_code,btrim(r->>'name'),x.type,x.destination,
       public.initialization_input_number(r->>'theoretical_yield_per_m2',0),public.initialization_input_number(r->>'theoretical_cost_per_m2',0),
       public.initialization_input_number(r->>'avg_price_local',0),public.initialization_input_number(r->>'avg_price_export',0),
       cycle::integer,nullif(r->>'technical_notes',''),true
      FROM jsonb_populate_record(NULL::public.varieties,jsonb_build_object('type',coalesce(nullif(r->>'type',''),'autre'),'destination',coalesce(nullif(r->>'destination',''),'mixte'))) x;
    END IF;
    stored:=public.initialization_module1_projection(t,entity,p_domain);
   END IF;
   EXECUTE format('SELECT to_jsonb(q) FROM public.%I q WHERE id=$1 FOR UPDATE',t) INTO native USING entity;
   INSERT INTO public.initialization_operation_items VALUES(p_request,t,entity,NOT linked,native);
   rows:=rows||jsonb_build_array(stored);
   mappings:=mappings||jsonb_build_object(section||':'||upper(v_code),stored->>'code');
  END LOOP;
  output:=jsonb_set(output,ARRAY['rows',section],rows);
 END LOOP;
 -- Propagate qualified greenhouse codes into other prepared modules, not DB rows.
 FOR record_entry IN SELECT key,value FROM jsonb_each(output->'rows') LOOP
  rows:='[]';
  FOR r IN SELECT value FROM jsonb_array_elements(record_entry.value) LOOP
   FOREACH field IN ARRAY ARRAY['farm','greenhouse','variety'] LOOP
    v_code:=mappings->>(CASE field WHEN 'farm' THEN 'farms' WHEN 'greenhouse' THEN 'greenhouses' ELSE 'varieties' END||':'||upper(btrim(r->>field)));
    IF v_code IS NOT NULL THEN r:=jsonb_set(r,ARRAY[field],to_jsonb(v_code)); END IF;
   END LOOP;
   rows:=rows||jsonb_build_array(r);
  END LOOP;
  output:=jsonb_set(output,ARRAY['rows',record_entry.key],rows);
 END LOOP;
 UPDATE public.initialization_drafts d SET payload=output WHERE d.domain_id=p_domain AND d.revision=v_revision;
 UPDATE public.initialization_operations SET after_payload=output WHERE id=p_request;
 RETURN public.initialization_operation_report(p_request);
END;
$$;

CREATE FUNCTION public.rollback_initialization_module1(p_domain uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.initialization_operations%ROWTYPE; item record; relation record; current_row jsonb;
 source_column text; has_refs boolean; restored jsonb; v_revision integer; ordinal integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT coalesce(public.client_reference_isolation_ready(p_domain),false) THEN RAISE EXCEPTION 'Annulation non autorisée' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,141));
 SELECT * INTO op FROM public.initialization_operations WHERE id=p_operation AND domain_id=p_domain FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération introuvable pour ce client'; END IF;
 IF op.status='rolled_back' THEN RETURN public.initialization_operation_report(op.id); END IF;
 SELECT d.revision INTO v_revision FROM public.initialization_drafts d WHERE d.domain_id=p_domain AND d.payload=op.after_payload AND d.revision=op.after_revision FOR UPDATE;
 IF v_revision IS NULL THEN RAISE EXCEPTION 'Dossier modifié depuis l’intégration : annulation automatique bloquée'; END IF;
 -- Serialize non-FK reference writers during dependency checks and deletion.
 LOCK TABLE public.clients,public.cultural_programs,public.cultural_consumptions,public.initialization_drafts IN SHARE ROW EXCLUSIVE MODE;
 FOR item IN SELECT * FROM public.initialization_operation_items WHERE operation_id=op.id AND created ORDER BY entity_table,entity_id LOOP
  EXECUTE format('SELECT to_jsonb(q) FROM public.%I q WHERE id=$1 FOR UPDATE',item.entity_table) INTO current_row USING item.entity_id;
  IF current_row IS DISTINCT FROM item.after_row THEN RAISE EXCEPTION 'Fiche créée modifiée depuis : annulation bloquée'; END IF;
  FOR relation IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid=format('public.%I',item.entity_table)::regclass LOOP
   SELECT n INTO ordinal FROM generate_subscripts(relation.confkey,1) n JOIN pg_attribute a ON a.attrelid=relation.confrelid AND a.attnum=relation.confkey[n] WHERE a.attname='id';
   IF ordinal IS NULL THEN RAISE EXCEPTION 'Dépendance non reconnue : annulation bloquée'; END IF;
   SELECT attname INTO source_column FROM pg_attribute WHERE attrelid=relation.conrelid AND attnum=relation.conkey[ordinal];
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s q WHERE %I=$1 AND NOT EXISTS(SELECT 1 FROM public.initialization_operation_items i WHERE i.operation_id=$2 AND i.created AND i.entity_table=%L AND i.entity_id::text=to_jsonb(q)->>''id''))',relation.conrelid::regclass,source_column,(SELECT CASE WHEN relnamespace='public'::regnamespace THEN relname ELSE '@other_schema' END FROM pg_class WHERE oid=relation.conrelid)) INTO has_refs USING item.entity_id,op.id;
   IF has_refs THEN RAISE EXCEPTION 'Fiche utilisée dans % : annuler les données dépendantes en premier',relation.conrelid::regclass; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.clients c WHERE coalesce(to_jsonb(c)->'preferred_variety_ids','[]') @> jsonb_build_array(item.entity_id::text))
   OR EXISTS(SELECT 1 FROM public.cultural_programs p CROSS JOIN LATERAL jsonb_array_elements(p.targets) x WHERE x->>'variety_id'=item.entity_id::text OR x->>'greenhouse_id'=item.entity_id::text)
   OR EXISTS(SELECT 1 FROM public.cultural_consumptions p CROSS JOIN LATERAL jsonb_array_elements(p.allocations) x WHERE x->>'variety_id'=item.entity_id::text OR x->>'greenhouse_id'=item.entity_id::text)
   OR EXISTS(SELECT 1 FROM public.initialization_drafts d CROSS JOIN LATERAL jsonb_each(d.payload->'rows') s CROSS JOIN LATERAL jsonb_array_elements(s.value) x WHERE d.domain_id<>p_domain AND x->>'existing_id'=item.entity_id::text) THEN
   RAISE EXCEPTION 'Fiche utilisée par un autre dossier ou une intervention : annulation bloquée';
  END IF;
 END LOOP;
 FOR item IN SELECT * FROM public.initialization_operation_items WHERE operation_id=op.id AND created ORDER BY CASE entity_table WHEN 'greenhouses' THEN 1 WHEN 'varieties' THEN 2 ELSE 3 END LOOP
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',item.entity_table) USING item.entity_id;
 END LOOP;
 restored:=jsonb_set(op.before_payload,'{reviewed}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(op.before_payload->'reviewed') WHERE value#>>'{}' NOT IN('farms','greenhouses','varieties')),'[]'));
 UPDATE public.initialization_drafts d SET payload=restored,revision=d.revision+1,updated_at=now(),updated_by=auth.uid() WHERE d.domain_id=p_domain RETURNING d.revision INTO v_revision;
 UPDATE public.initialization_operations SET status='rolled_back',rolled_back_at=now(),rolled_back_by=auth.uid(),after_payload=restored,after_revision=v_revision WHERE id=op.id;
 RETURN public.initialization_operation_report(op.id);
END;
$$;
REVOKE ALL ON FUNCTION public.initialization_module1_state(uuid),public.apply_initialization_module1(uuid,integer,jsonb,uuid),public.rollback_initialization_module1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialization_module1_state(uuid),public.apply_initialization_module1(uuid,integer,jsonb,uuid),public.rollback_initialization_module1(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
