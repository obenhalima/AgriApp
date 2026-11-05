-- Fix only the ambiguous code variable in the already-installed module 1 API.
-- No data migration, creation, deletion or table recreation.
BEGIN;
CREATE OR REPLACE FUNCTION public.apply_initialization_module1(p_domain uuid,p_revision integer,p_payload jsonb,p_request uuid)
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
NOTIFY pgrst,'reload schema';
COMMIT;
