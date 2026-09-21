-- Lot 133 : irrigation SANS produits. À appliquer après validation sur la base partagée.
-- Ne dépend pas des lots 130-132. Ne modifie aucun traitement ni stock existant.
BEGIN;

INSERT INTO public.business_capabilities(code,name,process_code,is_sensitive,is_system) VALUES
 ('irrigation.plan','Planifier une irrigation','irrigation',false,true),
 ('irrigation.validate','Valider un programme d’irrigation','irrigation',true,true),
 ('irrigation.execute','Confirmer une irrigation réelle','irrigation',true,true)
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.function_capabilities(function_id,capability_id)
SELECT f.id,c.id FROM (VALUES
 ('charge_irrigation','irrigation.plan'),('charge_irrigation','irrigation.execute'),
 ('responsable_fertigation','irrigation.plan'),('responsable_fertigation','irrigation.validate'),
 ('responsable_fertigation','irrigation.execute'),('responsable_exploitation','irrigation.validate')
) v(f,c) JOIN public.operational_functions f ON f.code=v.f JOIN public.business_capabilities c ON c.code=v.c
ON CONFLICT DO NOTHING;

CREATE TABLE public.irrigation_settings (
 domain_id uuid PRIMARY KEY REFERENCES public.domains(id),
 validation_enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.irrigation_programs (
 id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
 farm_id uuid NOT NULL REFERENCES public.farms(id), campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 greenhouse_ids uuid[] NOT NULL CHECK(cardinality(greenhouse_ids)>0),
 sector text NOT NULL DEFAULT '', water_source text NOT NULL,
 planned_liters numeric NOT NULL CHECK(planned_liters>0 AND planned_liters<=1e12),
 input jsonb NOT NULL, status text NOT NULL DEFAULT 'brouillon'
 CHECK(status IN ('brouillon','soumise','approuvee','rejetee','annulee','terminee')),
 validation_required boolean, requested_by uuid NOT NULL REFERENCES public.profiles(id),
 reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, review_comment text,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
 CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by)
);
CREATE TABLE public.irrigation_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.irrigation_programs(id),
 planned_at timestamptz NOT NULL, actual_liters numeric CHECK(actual_liters>0 AND actual_liters<=1e12),
 actual_data jsonb, performed_at timestamptz, confirmed_by uuid REFERENCES public.profiles(id), confirmed_at timestamptz,
 UNIQUE(program_id,planned_at)
);
CREATE TABLE public.irrigation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid NOT NULL REFERENCES public.domains(id),
 program_id uuid REFERENCES public.irrigation_programs(id), actor uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irrigation_programs(domain_id,farm_id,status);
CREATE INDEX ON public.irrigation_occurrences(program_id,planned_at);
ALTER TABLE public.irrigation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_audit ENABLE ROW LEVEL SECURITY;
-- All mutations go through checked RPCs, including settings and audit.
REVOKE ALL ON public.irrigation_settings,public.irrigation_programs,public.irrigation_occurrences,public.irrigation_audit FROM anon,authenticated;
GRANT SELECT ON public.irrigation_settings,public.irrigation_programs,public.irrigation_occurrences,public.irrigation_audit TO authenticated;
CREATE POLICY irrigation_settings_read ON public.irrigation_settings FOR SELECT TO authenticated USING(is_domain_member(domain_id,auth.uid()) AND has_domain_permission(domain_id,auth.uid(),'agronomie','view'));
CREATE POLICY irrigation_programs_read ON public.irrigation_programs FOR SELECT TO authenticated USING(is_domain_member(domain_id,auth.uid()) AND has_domain_permission(domain_id,auth.uid(),'agronomie','view'));
CREATE POLICY irrigation_occurrences_read ON public.irrigation_occurrences FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.irrigation_programs p WHERE p.id=program_id));
CREATE POLICY irrigation_audit_read ON public.irrigation_audit FOR SELECT TO authenticated USING(is_domain_member(domain_id,auth.uid()) AND has_domain_permission(domain_id,auth.uid(),'agronomie','view'));

CREATE FUNCTION public.irrigation_access(p_domain uuid,p_farm uuid,p_capability text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 AND is_domain_member(p_domain,auth.uid()) AND has_domain_permission(p_domain,auth.uid(),'agronomie','view')
 AND (p_farm IS NULL OR EXISTS(SELECT 1 FROM farms WHERE id=p_farm AND domain_id=p_domain AND is_active))
 AND (p_capability IS NULL OR has_business_capability(p_domain,auth.uid(),p_capability,p_farm)),false)
$$;

CREATE FUNCTION public.irrigation_water(p_data jsonb,p_actual boolean DEFAULT false) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v numeric; a numeric; b numeric;
BEGIN
 IF p_data->>'mode'='volume' THEN v:=(p_data->>'volume')::numeric;
 ELSIF p_data->>'mode'='duration' THEN
  a:=(p_data->>'minutes')::numeric; b:=(p_data->>'flow')::numeric;
  IF a IS NULL OR b IS NULL OR a<=0 OR b<=0 OR a>1e12 OR b>1e12 THEN RAISE EXCEPTION 'Durée et débit positifs requis'; END IF;
  v:=a*b/60;
 ELSIF p_data->>'mode'='meter' AND p_actual THEN
  a:=(p_data->>'before')::numeric; b:=(p_data->>'after')::numeric;
  IF a IS NULL OR b IS NULL OR a<0 OR b<=a OR a>1e12 OR b>1e12 THEN RAISE EXCEPTION 'Index compteur invalides'; END IF;
  v:=(b-a)*1000;
 ELSE RAISE EXCEPTION 'Mode de calcul non autorisé'; END IF;
 IF v IS NULL OR v<=0 OR v>1e12 OR v::text IN ('NaN','Infinity','-Infinity') OR round(v,2)<=0 THEN RAISE EXCEPTION 'Volume positif et fini requis'; END IF;
 RETURN round(v,2);
END $$;

CREATE FUNCTION public.save_irrigation_program(p_id uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid:=(p_input->>'domain_id')::uuid; f uuid:=(p_input->>'farm_id')::uuid;
 c uuid:=(p_input->>'campaign_id')::uuid; g uuid[]; dates timestamptz[]; old irrigation_programs%ROWTYPE; liters numeric;
BEGIN
 IF NOT irrigation_access(d,f,'irrigation.plan') THEN RAISE EXCEPTION 'Habilitation de planification requise sur cette ferme'; END IF;
 -- Serialize retries even before the row exists.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,133));
 SELECT * INTO old FROM irrigation_programs WHERE id=p_id;
 IF FOUND THEN
  IF old.requested_by=auth.uid() AND old.domain_id=d AND old.input=p_input THEN RETURN p_id; END IF;
  RAISE EXCEPTION 'Identifiant déjà utilisé : actualisez';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=c AND domain_id=d AND farm_id=f) THEN RAISE EXCEPTION 'Campagne étrangère à la ferme'; END IF;
 SELECT array_agg(DISTINCT value::uuid) INTO g FROM jsonb_array_elements_text(p_input->'greenhouse_ids');
 IF coalesce(cardinality(g),0)=0 OR EXISTS(SELECT 1 FROM unnest(g) x WHERE NOT EXISTS(SELECT 1 FROM greenhouses WHERE id=x AND farm_id=f AND status='active')) THEN RAISE EXCEPTION 'Sélectionnez des serres actives de cette ferme'; END IF;
 SELECT array_agg(value::timestamptz ORDER BY value::timestamptz) INTO dates FROM jsonb_array_elements_text(p_input->'dates');
 IF coalesce(cardinality(dates),0) NOT BETWEEN 1 AND 100 OR cardinality(dates)<>(SELECT count(DISTINCT x) FROM unnest(dates) x)
 OR EXISTS(SELECT 1 FROM unnest(dates) x WHERE x IS NULL OR NOT isfinite(x) OR x<now() OR x>now()+interval '3 years') THEN RAISE EXCEPTION 'Prévoir 1 à 100 dates futures distinctes, dans les trois prochaines années'; END IF;
 IF length(btrim(coalesce(p_input->>'water_source','')))=0 THEN RAISE EXCEPTION 'Source d’eau requise'; END IF;
 IF p_input ? 'products' THEN RAISE EXCEPTION 'Irrigation simple : aucun produit autorisé, utiliser le parcours spécialisé'; END IF;
 liters:=irrigation_water(p_input->'water');
 INSERT INTO irrigation_programs(id,domain_id,farm_id,campaign_id,title,greenhouse_ids,sector,water_source,planned_liters,input,requested_by)
 VALUES(p_id,d,f,c,btrim(p_input->>'title'),g,coalesce(p_input->>'sector',''),p_input->>'water_source',liters,p_input,auth.uid());
 INSERT INTO irrigation_occurrences(program_id,planned_at) SELECT p_id,x FROM unnest(dates) x;
 INSERT INTO irrigation_audit(domain_id,program_id,actor,action) VALUES(d,p_id,auth.uid(),'creation');
 RETURN p_id;
END $$;

CREATE FUNCTION public.irrigation_program_action(p_id uuid,p_action text,p_comment text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p irrigation_programs%ROWTYPE; required boolean;
BEGIN
 SELECT * INTO p FROM irrigation_programs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT irrigation_access(p.domain_id,p.farm_id) THEN RAISE EXCEPTION 'Programme inaccessible'; END IF;
 IF p_action='submit' THEN
  IF p.requested_by<>auth.uid() OR NOT irrigation_access(p.domain_id,p.farm_id,'irrigation.plan') THEN RAISE EXCEPTION 'Seul le demandeur habilité peut soumettre'; END IF;
  IF p.status IN ('soumise','approuvee') THEN RETURN; END IF;
  IF p.status<>'brouillon' THEN RAISE EXCEPTION 'Programme non modifiable'; END IF;
  IF EXISTS(SELECT 1 FROM irrigation_occurrences WHERE program_id=p_id AND planned_at<now()) THEN RAISE EXCEPTION 'Dates dépassées : annulez ce brouillon et préparez un nouveau programme'; END IF;
  SELECT validation_enabled INTO required FROM irrigation_settings WHERE domain_id=p.domain_id;
  required:=coalesce(required,true);
  UPDATE irrigation_programs SET validation_required=required,status=CASE WHEN required THEN 'soumise' ELSE 'approuvee' END,submitted_at=now() WHERE id=p_id;
 ELSIF p_action IN ('approve','reject') THEN
  IF p.requested_by=auth.uid() OR NOT irrigation_access(p.domain_id,p.farm_id,'irrigation.validate') THEN RAISE EXCEPTION 'Validation par une autre personne habilitée requise'; END IF;
  IF p.reviewed_by=auth.uid() AND ((p_action='approve' AND p.status='approuvee') OR (p_action='reject' AND p.status='rejetee')) THEN RETURN; END IF;
  IF p.status<>'soumise' THEN RAISE EXCEPTION 'Programme déjà traité'; END IF;
  IF p_action='reject' AND length(btrim(coalesce(p_comment,'')))<5 THEN RAISE EXCEPTION 'Motif du refus : au moins 5 caractères'; END IF;
  UPDATE irrigation_programs SET status=CASE WHEN p_action='approve' THEN 'approuvee' ELSE 'rejetee' END,reviewed_by=auth.uid(),reviewed_at=now(),review_comment=p_comment WHERE id=p_id;
 ELSIF p_action='cancel' THEN
  IF NOT ((p.requested_by=auth.uid() AND irrigation_access(p.domain_id,p.farm_id,'irrigation.plan')) OR irrigation_access(p.domain_id,p.farm_id,'irrigation.validate')) THEN RAISE EXCEPTION 'Annulation non autorisée'; END IF;
  IF p.status='annulee' THEN RETURN; END IF;
  IF p.status NOT IN ('brouillon','soumise','approuvee') OR length(btrim(coalesce(p_comment,'')))<5 THEN RAISE EXCEPTION 'Annulation impossible ou motif trop court'; END IF;
  UPDATE irrigation_programs SET status='annulee' WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Action inconnue'; END IF;
 INSERT INTO irrigation_audit(domain_id,program_id,actor,action,details) VALUES(p.domain_id,p.id,auth.uid(),p_action,jsonb_build_object('comment',p_comment,'previous_status',p.status,'validation_required',required));
END $$;

CREATE FUNCTION public.confirm_irrigation_occurrence(p_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o irrigation_occurrences%ROWTYPE; p irrigation_programs%ROWTYPE; actual numeric; performed timestamptz;
BEGIN
 SELECT * INTO o FROM irrigation_occurrences WHERE id=p_id;
 SELECT * INTO p FROM irrigation_programs WHERE id=o.program_id FOR UPDATE;
 IF NOT FOUND OR NOT irrigation_access(p.domain_id,p.farm_id,'irrigation.execute') THEN RAISE EXCEPTION 'Habilitation de confirmation requise'; END IF;
 SELECT * INTO o FROM irrigation_occurrences WHERE id=p_id FOR UPDATE;
 IF o.confirmed_at IS NOT NULL THEN
  IF o.confirmed_by=auth.uid() AND o.actual_data=p_data THEN RETURN; END IF;
  RAISE EXCEPTION 'Occurrence déjà confirmée : réel non écrasable';
 END IF;
 IF p.status<>'approuvee' THEN RAISE EXCEPTION 'Programme non approuvé'; END IF;
 performed:=(p_data->>'performed_at')::timestamptz;
 IF performed IS NULL OR NOT isfinite(performed) OR performed>now() OR performed<p.submitted_at THEN RAISE EXCEPTION 'Date réelle requise, après soumission et non future'; END IF;
 IF p.reviewed_at IS NOT NULL AND performed<p.reviewed_at THEN RAISE EXCEPTION 'La réalisation doit suivre la validation'; END IF;
 IF length(btrim(coalesce(p_data->>'notes','')))<5 THEN RAISE EXCEPTION 'Observation du réalisé : au moins 5 caractères'; END IF;
 IF p_data ? 'products' THEN RAISE EXCEPTION 'Aucun produit dans une irrigation simple'; END IF;
 actual:=irrigation_water(p_data->'water',true);
 UPDATE irrigation_occurrences SET actual_liters=actual,actual_data=p_data,performed_at=performed,confirmed_by=auth.uid(),confirmed_at=now() WHERE id=p_id;
 IF NOT EXISTS(SELECT 1 FROM irrigation_occurrences WHERE program_id=p.id AND confirmed_at IS NULL) THEN UPDATE irrigation_programs SET status='terminee' WHERE id=p.id; END IF;
 INSERT INTO irrigation_audit(domain_id,program_id,actor,action,details) VALUES(p.domain_id,p.id,auth.uid(),'confirmation',jsonb_build_object('occurrence_id',p_id,'actual_liters',actual,'planned_liters',p.planned_liters));
END $$;

CREATE FUNCTION public.set_irrigation_validation(p_domain uuid,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT irrigation_access(p_domain,NULL) OR NOT coalesce(is_domain_admin(p_domain,auth.uid()),false) OR p_enabled IS NULL THEN RAISE EXCEPTION 'Administration de la société requise'; END IF;
 INSERT INTO irrigation_settings(domain_id,validation_enabled) VALUES(p_domain,p_enabled) ON CONFLICT(domain_id) DO UPDATE SET validation_enabled=excluded.validation_enabled;
 INSERT INTO irrigation_audit(domain_id,actor,action,details) VALUES(p_domain,auth.uid(),'validation_setting',jsonb_build_object('enabled',p_enabled));
END $$;

CREATE FUNCTION public.irrigation_workspace(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT irrigation_access(p_domain,NULL) THEN RAISE EXCEPTION 'Accès agronomie refusé'; END IF;
 RETURN jsonb_build_object(
 'validation_enabled',coalesce((SELECT validation_enabled FROM irrigation_settings WHERE domain_id=p_domain),true),
 'can_configure',coalesce(is_domain_admin(p_domain,auth.uid()),false),
 'farms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'can_plan',irrigation_access(p_domain,id,'irrigation.plan'),'can_validate',irrigation_access(p_domain,id,'irrigation.validate'),'can_execute',irrigation_access(p_domain,id,'irrigation.execute')) ORDER BY name) FROM farms WHERE domain_id=p_domain AND is_active),'[]'),
 'campaigns',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'farm_id',farm_id)) FROM campaigns WHERE domain_id=p_domain),'[]'),
 'greenhouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'farm_id',g.farm_id,'area',g.exploitable_area) ORDER BY g.code) FROM greenhouses g JOIN farms f ON f.id=g.farm_id WHERE f.domain_id=p_domain AND g.status='active'),'[]'),
 'programs',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('requester',(SELECT full_name FROM profiles WHERE id=p.requested_by),'reviewer',(SELECT full_name FROM profiles WHERE id=p.reviewed_by),
 'occurrences',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY planned_at) FROM irrigation_occurrences o WHERE o.program_id=p.id),'[]'),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at) FROM irrigation_audit a WHERE a.program_id=p.id),'[]')) ORDER BY p.created_at DESC) FROM irrigation_programs p WHERE domain_id=p_domain),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.irrigation_access(uuid,uuid,text),public.irrigation_water(jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_irrigation_program(uuid,jsonb),public.irrigation_program_action(uuid,text,text),public.confirm_irrigation_occurrence(uuid,jsonb),public.set_irrigation_validation(uuid,boolean),public.irrigation_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_irrigation_program(uuid,jsonb),public.irrigation_program_action(uuid,text,text),public.confirm_irrigation_occurrence(uuid,jsonb),public.set_irrigation_validation(uuid,boolean),public.irrigation_workspace(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
