BEGIN;
-- Conserve tous les contrôles réglementaires/stock du flux existant.
ALTER FUNCTION public.confirm_treatment_application(UUID,JSONB,JSONB) RENAME TO confirm_treatment_application_before_costing;
REVOKE ALL ON FUNCTION public.confirm_treatment_application_before_costing(UUID,JSONB,JSONB) FROM PUBLIC,authenticated;
CREATE FUNCTION public.snapshot_cost_areas() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.actual_cost_areas:=nullif(current_setting('app.actual_cost_areas',true),'')::jsonb; RETURN NEW; END $$;
CREATE TRIGGER trg_snapshot_cost_areas BEFORE INSERT ON public.treatment_applications FOR EACH ROW EXECUTE FUNCTION public.snapshot_cost_areas();
CREATE FUNCTION public.confirm_treatment_application(p_request UUID,p_application JSONB,p_actual_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a JSONB:='{}'; t RECORD; area NUMERIC; total NUMERIC:=0; actual NUMERIC; prescribed NUMERIC; n INTEGER;
BEGIN
 IF p_application->>'application_status'='non_realisee' THEN
  PERFORM set_config('app.actual_cost_areas','',true);
  RETURN confirm_treatment_application_before_costing(p_request,p_application,p_actual_products);
 END IF;
 SELECT count(*),sum(coalesce(rt.treated_area_m2,cp.planted_area)) INTO n,prescribed FROM treatment_request_targets rt JOIN campaign_plantings cp ON cp.id=rt.campaign_planting_id WHERE rt.treatment_request_id=p_request;
 actual:=(p_application->>'actual_treated_area_m2')::numeric;
 IF n=0 OR actual IS NULL OR actual<=0 THEN RAISE EXCEPTION 'Surfaces de traitement requises'; END IF;
 IF n>1 AND coalesce((p_application->>'homogeneous_cost_allocation')::boolean,false)=false AND p_application->'actual_cost_areas' IS NULL THEN RAISE EXCEPTION 'Confirmez une application homogène ou renseignez les surfaces réelles par serre'; END IF;
 FOR t IN SELECT cp.id,cp.planted_area,coalesce(rt.treated_area_m2,cp.planted_area) AS prescribed FROM treatment_request_targets rt JOIN campaign_plantings cp ON cp.id=rt.campaign_planting_id WHERE rt.treatment_request_id=p_request LOOP
  area:=CASE WHEN p_application->'actual_cost_areas' IS NOT NULL THEN (p_application->'actual_cost_areas'->>t.id::text)::numeric ELSE actual*t.prescribed/prescribed END;
  IF area IS NULL OR area<0 OR area>t.planted_area OR area='NaN'::numeric THEN RAISE EXCEPTION 'Surface réelle par serre invalide'; END IF;
  a:=a||jsonb_build_object(t.id::text,area); total:=total+area;
 END LOOP;
 IF abs(total-actual)>0.01 THEN RAISE EXCEPTION 'La somme des surfaces doit égaler la surface réellement traitée'; END IF;
 PERFORM set_config('app.actual_cost_areas',a::text,true);
 RETURN confirm_treatment_application_before_costing(p_request,p_application,p_actual_products);
END $$;
REVOKE ALL ON FUNCTION public.confirm_treatment_application(UUID,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_treatment_application(UUID,JSONB,JSONB) TO authenticated;
COMMIT;
