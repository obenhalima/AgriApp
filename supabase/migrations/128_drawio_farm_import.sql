-- Import transactionnel : dessin, rattachement et initialisation des serres.
BEGIN;
ALTER TABLE public.farm_schematic_plans ADD COLUMN IF NOT EXISTS elements jsonb NOT NULL DEFAULT '[]';

CREATE OR REPLACE FUNCTION public.validate_farm_plan_elements(p_elements jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e jsonb; pt jsonb; k text; ids text[]:='{}';
BEGIN
 IF p_elements IS NULL OR jsonb_typeof(p_elements)<>'array' THEN RAISE EXCEPTION 'Décor invalide'; END IF;
 IF jsonb_array_length(p_elements)>1000 OR octet_length(p_elements::text)>5242880 THEN RAISE EXCEPTION 'Décor trop volumineux'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_elements) LOOP
  IF jsonb_typeof(e)<>'object' OR NOT(e ?& ARRAY['id','label','kind','shape','x','y','width','height','rotation','fill','stroke','fontColor','fontSize'])
  THEN RAISE EXCEPTION 'Élément de décor incomplet'; END IF;
  IF coalesce(e->>'id','')='' OR length(e->>'id')>200 OR e->>'id'=ANY(ids)
    OR length(e->>'label')>500 OR length(e->>'kind')>40
    OR (e->>'shape') NOT IN ('rect','ellipse','arrow','line','image')
  THEN RAISE EXCEPTION 'Élément de décor invalide'; END IF;
  ids:=array_append(ids,e->>'id');
  FOR k IN SELECT unnest(ARRAY['id','label','kind','shape','fill','stroke','fontColor']) LOOP
   IF jsonb_typeof(e->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Attribut graphique textuel requis'; END IF;
  END LOOP;
  FOR k IN SELECT unnest(ARRAY['x','y','width','height','rotation','fontSize']) LOOP
   IF jsonb_typeof(e->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Coordonnées numériques requises'; END IF;
  END LOOP;
  IF (e->>'x')::numeric NOT BETWEEN 0 AND 1200 OR (e->>'y')::numeric NOT BETWEEN 0 AND 800
    OR (e->>'width')::numeric NOT BETWEEN 0.001 AND 1500 OR (e->>'height')::numeric NOT BETWEEN 0.001 AND 1500
    OR (e->>'rotation')::numeric NOT BETWEEN 0 AND 359.999999 OR (e->>'fontSize')::numeric NOT BETWEEN 3 AND 100
  THEN RAISE EXCEPTION 'Décor hors limites'; END IF;
  FOR k IN SELECT unnest(ARRAY['fill','stroke','fontColor']) LOOP
   IF (e->>k) IS NULL OR (e->>k) !~ '^(none|#[0-9a-fA-F]{6})$' THEN RAISE EXCEPTION 'Couleur non autorisée'; END IF;
  END LOOP;
  IF e ? 'vertical' AND jsonb_typeof(e->'vertical') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Orientation invalide'; END IF;
  IF e->>'shape'='image' THEN
   IF coalesce(e->>'image','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$' OR length(e->>'image')>180000
   THEN RAISE EXCEPTION 'Seuls les petits pictogrammes PNG intégrés sont autorisés'; END IF;
  ELSIF e ? 'image' THEN RAISE EXCEPTION 'Image inattendue'; END IF;
  IF e->>'shape'='line' THEN
   IF jsonb_typeof(e->'points') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
   IF jsonb_array_length(e->'points')<>2 THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
   FOR pt IN SELECT value FROM jsonb_array_elements(e->'points') LOOP
    IF jsonb_typeof(pt->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(pt->'y') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Point invalide'; END IF;
    IF (pt->>'x')::numeric NOT BETWEEN 0 AND 1200 OR (pt->>'y')::numeric NOT BETWEEN 0 AND 800 THEN RAISE EXCEPTION 'Point hors limites'; END IF;
   END LOOP;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(e) AS f(key) WHERE key<>ALL(ARRAY['id','label','kind','shape','x','y','width','height','rotation','fill','stroke','fontColor','fontSize','vertical','image','points']))
  THEN RAISE EXCEPTION 'Attribut graphique non autorisé'; END IF;
 END LOOP;
 RETURN p_elements;
END $$;
REVOKE ALL ON FUNCTION public.validate_farm_plan_elements(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_farm_schematic_plan_with_elements(p_farm uuid,p_revision integer,p_shapes jsonb,p_elements jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r integer;
BEGIN
 r:=public.save_farm_schematic_plan(p_farm,p_revision,p_shapes);
 UPDATE public.farm_schematic_plans SET elements=public.validate_farm_plan_elements(p_elements) WHERE farm_id=p_farm;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.save_farm_schematic_plan_with_elements(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_farm_schematic_plan_with_elements(uuid,integer,jsonb,jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.farm_plan_imports (
 id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.profiles(id), payload_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.farm_plan_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_plan_imports FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.import_farm_drawio_plan(p_farm uuid,p_revision integer,p_rows jsonb,p_elements jsonb,p_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; actor uuid:=auth.uid(); previous public.farm_plan_imports; fingerprint text;
 row_data jsonb; ng jsonb; gh uuid; shapes jsonb:='[]'; created_count integer:=0; r integer; result_data jsonb;
 source_ids text[]:='{}'; code_text text; area numeric; usable numeric;
BEGIN
 SELECT domain_id INTO d FROM public.farms WHERE id=p_farm AND is_active FOR UPDATE;
 IF actor IS NULL OR d IS NULL OR NOT public.has_domain_permission(d,actor,'fermes','edit')
 THEN RAISE EXCEPTION 'Import non autorisé pour cette ferme'; END IF;
 IF p_import_id IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'Identifiant ou révision manquant'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Liste de serres invalide'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Maximum 500 serres'; END IF;
 fingerprint:=md5(jsonb_build_array(p_farm,p_revision,p_rows,p_elements)::text);
 SELECT * INTO previous FROM public.farm_plan_imports WHERE id=p_import_id;
 IF FOUND THEN
  IF previous.actor_id<>actor OR previous.farm_id<>p_farm OR previous.payload_hash<>fingerprint THEN RAISE EXCEPTION 'Identifiant d’import déjà utilisé'; END IF;
  RETURN previous.result;
 END IF;
 IF p_revision IS DISTINCT FROM coalesce((SELECT revision FROM public.farm_schematic_plans WHERE farm_id=p_farm),0)
 THEN RAISE EXCEPTION 'Le plan a été modifié ailleurs. Rechargez avant de recommencer.'; END IF;
 PERFORM public.validate_farm_plan_elements(p_elements);
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(row_data)<>'object' OR coalesce(row_data->>'source_id','')='' OR length(row_data->>'source_id')>200 OR row_data->>'source_id'=ANY(source_ids)
  THEN RAISE EXCEPTION 'Forme dupliquée ou invalide'; END IF;
  source_ids:=array_append(source_ids,row_data->>'source_id');
  IF (nullif(row_data->>'greenhouse_id','') IS NOT NULL) = coalesce(jsonb_typeof(row_data->'new_greenhouse')='object',false)
  THEN RAISE EXCEPTION 'Choisissez une serre existante OU une nouvelle serre'; END IF;
  IF jsonb_typeof(row_data->'new_greenhouse')='object' THEN
   IF NOT public.has_domain_permission(d,actor,'serres','create') THEN RAISE EXCEPTION 'Création de serre non autorisée'; END IF;
   ng:=row_data->'new_greenhouse'; code_text:=btrim(ng->>'code');
   IF coalesce(code_text,'')='' OR length(code_text)>20 OR coalesce(btrim(ng->>'name'),'')='' OR length(ng->>'name')>100
   THEN RAISE EXCEPTION 'Code (20 caractères) et nom (100 caractères) requis'; END IF;
   IF EXISTS(SELECT 1 FROM public.greenhouses WHERE farm_id=p_farm AND
    regexp_replace(regexp_replace(upper(btrim(code)),'^SERRE\s*','S'),'^S[-\s]*0*([0-9]+)$','S\1')=
    regexp_replace(regexp_replace(upper(code_text),'^SERRE\s*','S'),'^S[-\s]*0*([0-9]+)$','S\1'))
   THEN RAISE EXCEPTION 'La serre % existe déjà dans cette ferme : sélectionnez-la',code_text; END IF;
   IF jsonb_typeof(ng->'total_area') IS DISTINCT FROM 'number' OR jsonb_typeof(ng->'exploitable_area') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'Surfaces officielles requises pour %',code_text; END IF;
   area:=(ng->>'total_area')::numeric; usable:=(ng->>'exploitable_area')::numeric;
   IF area<=0 OR area>=100000000 OR usable<=0 OR usable>area OR area<>round(area,2) OR usable<>round(usable,2)
   THEN RAISE EXCEPTION 'Surfaces invalides pour %',code_text; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.reference_values WHERE list_key='greenhouse_type' AND code=ng->>'type' AND is_active)
    OR NOT EXISTS(SELECT 1 FROM public.reference_values WHERE list_key='greenhouse_status' AND code=ng->>'status' AND is_active)
   THEN RAISE EXCEPTION 'Type ou statut de serre invalide'; END IF;
   IF length(coalesce(ng->>'notes',''))>4000 THEN RAISE EXCEPTION 'Notes trop longues'; END IF;
   INSERT INTO public.greenhouses(farm_id,code,name,type,status,total_area,exploitable_area,notes)
   VALUES(p_farm,code_text,btrim(ng->>'name'),ng->>'type',ng->>'status',area,usable,ng->>'notes') RETURNING id INTO gh;
   created_count:=created_count+1;
  ELSE
   gh:=(row_data->>'greenhouse_id')::uuid;
   IF gh IS NULL OR NOT EXISTS(SELECT 1 FROM public.greenhouses WHERE id=gh AND farm_id=p_farm)
   THEN RAISE EXCEPTION 'Serre manquante ou étrangère à la ferme'; END IF;
  END IF;
  shapes:=shapes||jsonb_build_array(jsonb_build_object('greenhouse_id',gh,'x',row_data->'x','y',row_data->'y','width',row_data->'width','height',row_data->'height','rotation',row_data->'rotation'));
 END LOOP;
 r:=public.save_farm_schematic_plan_with_elements(p_farm,p_revision,shapes,p_elements);
 result_data:=jsonb_build_object('revision',r,'created_count',created_count,'linked_count',jsonb_array_length(p_rows)-created_count);
 INSERT INTO public.farm_plan_imports(id,farm_id,actor_id,payload_hash,result) VALUES(p_import_id,p_farm,actor,fingerprint,result_data);
 RETURN result_data;
END $$;
REVOKE ALL ON FUNCTION public.import_farm_drawio_plan(uuid,integer,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_farm_drawio_plan(uuid,integer,jsonb,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
