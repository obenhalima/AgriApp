-- Module 2 only. Run once after 155..157; imports no data during installation.
BEGIN;
ALTER TABLE public.initialization_operations DROP CONSTRAINT initialization_operations_module_check;
ALTER TABLE public.initialization_operations ADD CONSTRAINT initialization_operations_module_check CHECK(module IN('exploitation','plantations'));
ALTER TABLE public.initialization_operation_items DROP CONSTRAINT initialization_operation_items_entity_table_check;
ALTER TABLE public.initialization_operation_items ADD CONSTRAINT initialization_operation_items_entity_table_check
 CHECK(entity_table IN('farms','greenhouses','varieties','campaigns','campaign_plantings'));

CREATE FUNCTION public.initialization_module2_projection(p_table text,p_id uuid,p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_raw jsonb; v_keys text[]; v_out jsonb;
BEGIN
 IF p_table='campaigns' THEN
  SELECT to_jsonb(c)||jsonb_build_object('existing_id',c.id::text,'farm',f.code,
   'start',coalesce(c.preparation_start,c.planting_start),'end',c.campaign_end)
  INTO v_raw FROM public.campaigns c JOIN public.farms f ON f.id=c.farm_id
  WHERE c.id=p_id AND c.domain_id=p_domain AND f.domain_id=p_domain;
  v_keys:=ARRAY['existing_id','code','name','farm','start','end','status','planting_start','harvest_start','harvest_end','budget_total','production_target_kg','notes'];
 ELSE
  SELECT to_jsonb(p)||jsonb_build_object('existing_id',p.id::text,'code','PLA:'||p.id::text,
   'name',coalesce(g.name,g.code)||' — '||v.commercial_name||' — '||coalesce(p.planting_date::text,''),
   'farm',f.code,'greenhouse',f.code||'/'||g.code,'campaign',c.code,'variety',v.code,
   'date',p.planting_date,'harvest_start',coalesce(p.harvest_start_date,p.first_harvest_date),
   'harvest_end',coalesce(p.harvest_end_date,p.last_harvest_date),'area',p.planted_area,'target_kg',p.target_total_production)
  INTO v_raw FROM public.campaign_plantings p JOIN public.campaigns c ON c.id=p.campaign_id
   JOIN public.greenhouses g ON g.id=p.greenhouse_id JOIN public.farms f ON f.id=g.farm_id
   JOIN public.varieties v ON v.id=p.variety_id
  WHERE p.id=p_id AND p.domain_id=p_domain AND c.domain_id=p_domain AND f.domain_id=p_domain AND v.domain_id=p_domain;
  v_keys:=ARRAY['existing_id','code','name','campaign','farm','greenhouse','variety','date','harvest_start','harvest_end','area','target_kg',
   'plant_count','linear_meters','target_yield_per_m2','estimated_cost','export_share_pct','price_per_kg_export','price_per_kg_local'];
 END IF;
 IF v_raw IS NULL THEN RAISE EXCEPTION 'Fiche du module 2 introuvable pour ce client'; END IF;
 SELECT jsonb_object_agg(k,to_jsonb(coalesce(v_raw->>k,''))) INTO v_out FROM unnest(v_keys) k;
 RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.initialization_module2_projection(text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.initialization_module2_state(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_op uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false) THEN
  RAISE EXCEPTION 'Administration du client requise' USING ERRCODE='42501';
 END IF;
 SELECT id INTO v_op FROM public.initialization_operations WHERE domain_id=p_domain AND module='plantations' AND status='applied';
 RETURN jsonb_build_object('enabled',coalesce(public.client_reference_isolation_ready(p_domain),false),
  'operation',public.initialization_operation_report(v_op));
END;
$$;
-- Separate module 1 and module 2 journals.
CREATE OR REPLACE FUNCTION public.initialization_module1_state(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_op uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Administration du client requise' USING ERRCODE='42501';
 END IF;
 SELECT id INTO v_op FROM public.initialization_operations WHERE domain_id=p_domain AND module='exploitation' AND status='applied';
 RETURN jsonb_build_object('enabled',coalesce(public.client_reference_isolation_ready(p_domain),false),
  'operation',public.initialization_operation_report(v_op));
END;
$$;

CREATE FUNCTION public.apply_initialization_module2(p_domain uuid,p_revision integer,p_payload jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old public.initialization_operations%ROWTYPE; v_revision integer; v_section text; v_table text;
 v_row jsonb; v_rows jsonb; v_output jsonb; v_stored jsonb; v_native jsonb; v_entity uuid;
 v_farm uuid; v_campaign public.campaigns%ROWTYPE; v_house public.greenhouses%ROWTYPE; v_variety uuid;
 v_code text; v_linked boolean; v_start date; v_end date; v_date date; v_first date; v_last date;
 v_area numeric; v_capacity numeric; v_count numeric; v_export numeric; v_aliases jsonb:='{}'; v_entry record;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT coalesce(public.client_reference_isolation_ready(p_domain),false) THEN
  RAISE EXCEPTION 'Client non autorisé ou isolation non validée' USING ERRCODE='42501';
 END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Identifiant d’opération requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,141));
 SELECT * INTO v_old FROM public.initialization_operations WHERE id=p_request;
 IF FOUND THEN
  IF v_old.domain_id<>p_domain OR v_old.module<>'plantations' OR v_old.status<>'applied'
   OR v_old.request_payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Identifiant d’opération déjà utilisé'; END IF;
  RETURN public.initialization_operation_report(p_request);
 END IF;
 IF EXISTS(SELECT 1 FROM public.initialization_operations WHERE domain_id=p_domain AND module='plantations' AND status='applied')
 THEN RAISE EXCEPTION 'Module 2 déjà intégré : consultez le bilan'; END IF;
 v_revision:=public.save_initialization_draft(p_domain,p_revision,p_payload);
 FOREACH v_section IN ARRAY ARRAY['campaigns','plantings'] LOOP
  IF NOT p_payload->'reviewed' ? v_section OR jsonb_array_length(coalesce(p_payload->'rows'->v_section,'[]'))=0
   THEN RAISE EXCEPTION 'Étape % non relue ou vide',v_section; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows'->v_section) q
   GROUP BY upper(trim(q->>'code')) HAVING count(*)>1) THEN RAISE EXCEPTION 'Code dupliqué dans %',v_section; END IF;
 END LOOP;
 INSERT INTO public.initialization_operations(id,domain_id,module,actor_id,request_payload,before_payload,after_payload,after_revision)
 VALUES(p_request,p_domain,'plantations',auth.uid(),p_payload,p_payload,p_payload,v_revision);
 v_output:=p_payload;
 -- Lock greenhouse capacity rows in stable order; FK locks serialize competing integrations.
 PERFORM g.id FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id
 WHERE f.domain_id=p_domain AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows'->'plantings') q
  WHERE upper(trim(q->>'greenhouse'))=upper(f.code||'/'||g.code))
 ORDER BY g.id FOR UPDATE OF g;
 FOREACH v_section IN ARRAY ARRAY['campaigns','plantings'] LOOP
  v_table:=CASE v_section WHEN 'campaigns' THEN 'campaigns' ELSE 'campaign_plantings' END; v_rows:='[]';
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'rows'->v_section) LOOP
   v_code:=trim(v_row->>'code'); v_linked:=nullif(v_row->>'existing_id','') IS NOT NULL;
   IF coalesce(v_code,'')='' THEN RAISE EXCEPTION 'Code requis dans %',v_section; END IF;
   IF v_linked THEN
    v_entity:=(v_row->>'existing_id')::uuid;
    EXECUTE format('SELECT to_jsonb(q) FROM public.%I q WHERE id=$1 FOR UPDATE',v_table) INTO v_native USING v_entity;
    v_stored:=public.initialization_module2_projection(v_table,v_entity,p_domain);
    IF upper(v_stored->>'code')<>upper(v_code) THEN RAISE EXCEPTION 'Lien existant incohérent : sélectionner de nouveau la fiche'; END IF;
   ELSE
    v_entity:=gen_random_uuid();
    SELECT f.id INTO v_farm FROM public.farms f WHERE f.domain_id=p_domain AND upper(f.code)=upper(trim(v_row->>'farm')) FOR SHARE;
    IF v_farm IS NULL THEN RAISE EXCEPTION 'Ferme absente : intégrer le module 1 ou sélectionner une ferme existante'; END IF;
    IF v_section='campaigns' THEN
     IF trim(coalesce(v_row->>'name',''))='' THEN RAISE EXCEPTION 'Nom de campagne requis'; END IF;
     v_start:=nullif(v_row->>'start','')::date; v_end:=nullif(v_row->>'end','')::date;
     IF v_start IS NULL OR v_end IS NULL OR v_end<v_start THEN RAISE EXCEPTION 'Période de campagne invalide'; END IF;
     v_date:=nullif(v_row->>'planting_start','')::date; v_first:=nullif(v_row->>'harvest_start','')::date; v_last:=nullif(v_row->>'harvest_end','')::date;
     IF (v_date IS NOT NULL AND (v_date<v_start OR v_date>v_end))
      OR (v_first IS NOT NULL AND (v_first<coalesce(v_date,v_start) OR v_first>v_end))
      OR (v_last IS NOT NULL AND (v_last<coalesce(v_first,v_date,v_start) OR v_last>v_end))
      THEN RAISE EXCEPTION 'Dates de plantation ou récolte hors période de campagne'; END IF;
     INSERT INTO public.campaigns(id,domain_id,farm_id,code,name,status,preparation_start,campaign_end,planting_start,
      harvest_start,harvest_end,budget_total,production_target_kg,notes)
     SELECT v_entity,p_domain,v_farm,v_code,trim(v_row->>'name'),x.status,v_start,v_end,v_date,v_first,v_last,
      public.initialization_input_number(v_row->>'budget_total',0),public.initialization_input_number(v_row->>'production_target_kg',0),nullif(v_row->>'notes','')
     FROM jsonb_populate_record(NULL::public.campaigns,jsonb_build_object('status',coalesce(nullif(v_row->>'status',''),'planification'))) x;
    ELSE
     SELECT c.* INTO v_campaign FROM public.campaigns c WHERE c.domain_id=p_domain AND upper(c.code)=upper(trim(v_row->>'campaign')) FOR SHARE;
     SELECT g.* INTO v_house FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id
      WHERE f.domain_id=p_domain AND upper(f.code||'/'||g.code)=upper(trim(v_row->>'greenhouse')) FOR UPDATE OF g;
     SELECT v.id INTO v_variety FROM public.varieties v WHERE v.domain_id=p_domain AND v.is_active
      AND upper(v.code)=upper(trim(v_row->>'variety')) FOR SHARE;
     IF v_campaign.id IS NULL OR v_house.id IS NULL OR v_variety IS NULL THEN RAISE EXCEPTION 'Campagne, serre ou variété absente du client : intégrer les références avant les plantations'; END IF;
     IF v_campaign.farm_id<>v_farm OR v_house.farm_id<>v_farm THEN RAISE EXCEPTION 'La campagne et la serre doivent appartenir à la ferme sélectionnée'; END IF;
     v_date:=nullif(v_row->>'date','')::date; v_first:=nullif(v_row->>'harvest_start','')::date; v_last:=nullif(v_row->>'harvest_end','')::date;
     IF v_date IS NULL OR v_first IS NULL OR v_last IS NULL OR v_first<v_date OR v_last<v_first
      OR v_date<coalesce(v_campaign.preparation_start,v_campaign.planting_start,'-infinity'::date)
      OR v_last>coalesce(v_campaign.campaign_end,'infinity'::date) THEN RAISE EXCEPTION 'Dates de plantation ou récolte incohérentes ou hors campagne'; END IF;
     v_area:=public.initialization_input_number(v_row->>'area',0.01,false);
     v_capacity:=coalesce(nullif(v_house.exploitable_area,0),nullif(v_house.total_area,0));
     IF v_capacity IS NULL OR v_capacity<=0 THEN RAISE EXCEPTION 'Surface disponible de la serre à renseigner avant intégration'; END IF;
     IF v_area>v_capacity THEN RAISE EXCEPTION 'Surface plantée supérieure à la surface disponible'; END IF;
     v_count:=public.initialization_input_number(v_row->>'plant_count',0);
     IF v_count IS NOT NULL AND v_count<>trunc(v_count) THEN RAISE EXCEPTION 'Nombre de plants entier requis'; END IF;
     v_export:=coalesce(public.initialization_input_number(v_row->>'export_share_pct',0),100);
     IF v_export>100 THEN RAISE EXCEPTION 'Part export supérieure à 100 pour cent'; END IF;
     INSERT INTO public.campaign_plantings(id,domain_id,campaign_id,greenhouse_id,variety_id,planting_date,first_harvest_date,last_harvest_date,
      harvest_start_date,harvest_end_date,planted_area,target_total_production,plant_count,linear_meters,target_yield_per_m2,
      estimated_cost,export_share_pct,price_per_kg_export,price_per_kg_local)
     VALUES(v_entity,p_domain,v_campaign.id,v_house.id,v_variety,v_date,v_first,v_last,v_first,v_last,v_area,
      public.initialization_input_number(v_row->>'target_kg',0,false),v_count::integer,
      public.initialization_input_number(v_row->>'linear_meters',0),public.initialization_input_number(v_row->>'target_yield_per_m2',0),
      public.initialization_input_number(v_row->>'estimated_cost',0),v_export,
      public.initialization_input_number(v_row->>'price_per_kg_export',0),public.initialization_input_number(v_row->>'price_per_kg_local',0));
     -- Peak occupied area during this new plantation, including existing overlapping plantations.
     IF EXISTS(SELECT 1 FROM (
       SELECT v_date AS day UNION SELECT p.planting_date FROM public.campaign_plantings p
       WHERE p.greenhouse_id=v_house.id AND p.planting_date BETWEEN v_date AND v_last
      ) points WHERE (SELECT coalesce(sum(p.planted_area),0) FROM public.campaign_plantings p
       WHERE p.greenhouse_id=v_house.id AND coalesce(p.planting_date,'-infinity'::date)<=points.day
        AND coalesce(p.harvest_end_date,p.last_harvest_date,'infinity'::date)>=points.day)>v_capacity)
      THEN RAISE EXCEPTION 'Cumul des surfaces des plantations simultanées supérieur à la capacité de la serre'; END IF;
    END IF;
    v_stored:=public.initialization_module2_projection(v_table,v_entity,p_domain);
   END IF;
   EXECUTE format('SELECT to_jsonb(q) FROM public.%I q WHERE id=$1 FOR UPDATE',v_table) INTO v_native USING v_entity;
   INSERT INTO public.initialization_operation_items VALUES(p_request,v_table,v_entity,NOT v_linked,v_native);
   v_rows:=v_rows||jsonb_build_array(v_stored);
   IF v_section='plantings' THEN v_aliases:=v_aliases||jsonb_build_object(upper(v_code),v_stored->>'code'); END IF;
  END LOOP;
  v_output:=jsonb_set(v_output,ARRAY['rows',v_section],v_rows);
 END LOOP;
 FOR v_entry IN SELECT key,value FROM jsonb_each(v_output->'rows') LOOP
  v_rows:='[]';
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_entry.value) LOOP
   v_code:=v_aliases->>upper(trim(v_row->>'planting'));
   IF v_code IS NOT NULL THEN v_row:=jsonb_set(v_row,'{planting}',to_jsonb(v_code)); END IF;
   v_rows:=v_rows||jsonb_build_array(v_row);
  END LOOP;
  v_output:=jsonb_set(v_output,ARRAY['rows',v_entry.key],v_rows);
 END LOOP;
 UPDATE public.initialization_drafts SET payload=v_output WHERE domain_id=p_domain AND revision=v_revision;
 UPDATE public.initialization_operations SET after_payload=v_output WHERE id=p_request;
 RETURN public.initialization_operation_report(p_request);
END;
$$;

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
  IF old_op.domain_id<>p_domain OR old_op.module<>'exploitation' OR old_op.request_payload IS DISTINCT FROM p_payload OR old_op.status<>'applied' THEN RAISE EXCEPTION 'Identifiant d’opération déjà utilisé'; END IF;
  RETURN public.initialization_operation_report(old_op.id);
 END IF;
 IF EXISTS(SELECT 1 FROM public.initialization_operations WHERE domain_id=p_domain AND module='exploitation' AND status='applied') THEN RAISE EXCEPTION 'Module déjà intégré : consultez le bilan'; END IF;
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
CREATE OR REPLACE FUNCTION public.rollback_initialization_module1(p_domain uuid,p_operation uuid) RETURNS jsonb
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
 FOR item IN SELECT * FROM public.initialization_operation_items WHERE operation_id=op.id AND created ORDER BY CASE entity_table WHEN 'campaign_plantings' THEN 1 WHEN 'campaigns' THEN 2 WHEN 'greenhouses' THEN 3 WHEN 'varieties' THEN 4 ELSE 5 END LOOP
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',item.entity_table) USING item.entity_id;
 END LOOP;
 restored:=jsonb_set(op.before_payload,'{reviewed}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(op.before_payload->'reviewed') WHERE NOT ((value#>>'{}')=ANY(CASE op.module WHEN 'plantations' THEN ARRAY['campaigns','plantings'] ELSE ARRAY['farms','greenhouses','varieties'] END))),'[]'));
 UPDATE public.initialization_drafts d SET payload=restored,revision=d.revision+1,updated_at=now(),updated_by=auth.uid() WHERE d.domain_id=p_domain RETURNING d.revision INTO v_revision;
 UPDATE public.initialization_operations SET status='rolled_back',rolled_back_at=now(),rolled_back_by=auth.uid(),after_payload=restored,after_revision=v_revision WHERE id=op.id;
 RETURN public.initialization_operation_report(op.id);
END;
$$;

CREATE FUNCTION public.rollback_initialization_module2(p_domain uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.initialization_operations WHERE id=p_operation AND domain_id=p_domain AND module='plantations')
  THEN RAISE EXCEPTION 'Opération du module 2 introuvable'; END IF;
 RETURN public.rollback_initialization_module1(p_domain,p_operation);
END;
$$;
REVOKE ALL ON FUNCTION public.initialization_module2_state(uuid),public.apply_initialization_module2(uuid,integer,jsonb,uuid),public.rollback_initialization_module2(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialization_module2_state(uuid),public.apply_initialization_module2(uuid,integer,jsonb,uuid),public.rollback_initialization_module2(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
