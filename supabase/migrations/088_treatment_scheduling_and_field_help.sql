-- Migration 088 — Unités de dose et planification des prescriptions
BEGIN;

INSERT INTO public.reference_lists(key,label,description,is_system) VALUES
 ('phyto_dose_unit','Unités de dose phytosanitaire','Unités autorisées pour les usages et prescriptions phytosanitaires.',TRUE)
ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description;

INSERT INTO public.reference_values(list_key,code,label,order_idx,is_default) VALUES
 ('phyto_dose_unit','ml_100l','mL / 100 L',1,TRUE),
 ('phyto_dose_unit','g_100l','g / 100 L',2,FALSE),
 ('phyto_dose_unit','l_ha','L / ha',3,FALSE),
 ('phyto_dose_unit','kg_ha','kg / ha',4,FALSE),
 ('phyto_dose_unit','ml_ha','mL / ha',5,FALSE),
 ('phyto_dose_unit','g_ha','g / ha',6,FALSE),
 ('phyto_dose_unit','l_1000m2','L / 1 000 m²',7,FALSE),
 ('phyto_dose_unit','kg_1000m2','kg / 1 000 m²',8,FALSE),
 ('phyto_dose_unit','unite_ha','Unité / ha',9,FALSE)
ON CONFLICT(list_key,code) DO UPDATE SET label=EXCLUDED.label,order_idx=EXCLUDED.order_idx;

ALTER TABLE public.product_authorized_uses ADD COLUMN IF NOT EXISTS recommended_dose NUMERIC(12,4);
ALTER TABLE public.product_authorized_uses ADD CONSTRAINT product_use_recommended_dose_range
  CHECK(recommended_dose IS NULL OR (recommended_dose>0 AND recommended_dose<=dose_max AND (dose_min IS NULL OR recommended_dose>=dose_min)));

-- Normalisation des anciennes unités les plus courantes vers les codes du référentiel.
UPDATE product_authorized_uses SET dose_unit=CASE lower(regexp_replace(dose_unit,'\s+','','g'))
 WHEN 'ml/100l' THEN 'ml_100l' WHEN 'g/100l' THEN 'g_100l' WHEN 'l/ha' THEN 'l_ha'
 WHEN 'kg/ha' THEN 'kg_ha' WHEN 'ml/ha' THEN 'ml_ha' WHEN 'g/ha' THEN 'g_ha'
 WHEN 'l/1000m²' THEN 'l_1000m2' WHEN 'l/1000m2' THEN 'l_1000m2'
 WHEN 'kg/1000m²' THEN 'kg_1000m2' WHEN 'kg/1000m2' THEN 'kg_1000m2'
 ELSE dose_unit END;

CREATE TABLE public.treatment_prescription_schedules (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
 schedule_mode VARCHAR(20) NOT NULL CHECK(schedule_mode IN ('single','exact_dates','recurring')),
 name VARCHAR(180),
 frequency VARCHAR(20) CHECK(frequency IS NULL OR frequency IN ('daily','weekly')),
 interval_value INTEGER CHECK(interval_value IS NULL OR interval_value BETWEEN 1 AND 52),
 starts_at TIMESTAMPTZ,
 ends_at TIMESTAMPTZ,
 occurrence_count INTEGER CHECK(occurrence_count IS NULL OR occurrence_count BETWEEN 1 AND 100),
 request_template JSONB NOT NULL,
 products_template JSONB NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
 created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.treatment_schedule_occurrences (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 schedule_id UUID NOT NULL REFERENCES public.treatment_prescription_schedules(id) ON DELETE CASCADE,
 domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
 occurrence_number INTEGER NOT NULL,
 planned_at TIMESTAMPTZ NOT NULL,
 treatment_request_id UUID UNIQUE REFERENCES public.treatment_requests(id) ON DELETE SET NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(schedule_id,occurrence_number),
 UNIQUE(schedule_id,planned_at)
);

ALTER TABLE public.treatment_requests ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.treatment_prescription_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.treatment_requests ADD COLUMN IF NOT EXISTS occurrence_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_treatment_schedule_domain ON treatment_prescription_schedules(domain_id,status,starts_at);
CREATE INDEX IF NOT EXISTS idx_treatment_occurrence_date ON treatment_schedule_occurrences(domain_id,planned_at);

CREATE OR REPLACE FUNCTION public.submit_treatment_schedule(p_schedule JSONB,p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_schedule UUID; v_mode TEXT; v_frequency TEXT; v_interval INTEGER; v_current TIMESTAMPTZ; v_end TIMESTAMPTZ; v_limit INTEGER; v_n INTEGER:=0; v_date JSONB; v_request UUID;
BEGIN
 v_domain:=(p_request->>'domain_id')::UUID;
 IF NOT has_domain_permission(v_domain,auth.uid(),'agronomie','create')
    AND NOT has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL) THEN RAISE EXCEPTION 'Habilitation de prescription refusée'; END IF;
 v_mode:=p_schedule->>'schedule_mode';
 IF v_mode NOT IN ('single','exact_dates','recurring') THEN RAISE EXCEPTION 'Mode de planification invalide'; END IF;
 INSERT INTO treatment_prescription_schedules(domain_id,schedule_mode,name,frequency,interval_value,starts_at,ends_at,occurrence_count,request_template,products_template,created_by)
 VALUES(v_domain,v_mode,NULLIF(p_schedule->>'name',''),NULLIF(p_schedule->>'frequency',''),NULLIF(p_schedule->>'interval_value','')::INTEGER,NULLIF(p_schedule->>'starts_at','')::TIMESTAMPTZ,NULLIF(p_schedule->>'ends_at','')::TIMESTAMPTZ,NULLIF(p_schedule->>'occurrence_count','')::INTEGER,p_request,p_products,auth.uid()) RETURNING id INTO v_schedule;

 IF v_mode IN ('single','exact_dates') THEN
   IF jsonb_array_length(COALESCE(p_schedule->'exact_dates','[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins une date est obligatoire'; END IF;
   FOR v_date IN SELECT value FROM jsonb_array_elements(p_schedule->'exact_dates') LOOP
     v_n:=v_n+1; IF v_n>100 THEN RAISE EXCEPTION 'Maximum 100 occurrences'; END IF;
     v_current:=(v_date#>>'{}')::TIMESTAMPTZ;
     v_request:=submit_treatment_request(jsonb_set(p_request,'{planned_at}',to_jsonb(v_current::TEXT)),p_products);
     UPDATE treatment_requests SET schedule_id=v_schedule,occurrence_number=v_n WHERE id=v_request;
     INSERT INTO treatment_schedule_occurrences(schedule_id,domain_id,occurrence_number,planned_at,treatment_request_id) VALUES(v_schedule,v_domain,v_n,v_current,v_request);
   END LOOP;
 ELSE
   v_frequency:=p_schedule->>'frequency'; v_interval:=COALESCE(NULLIF(p_schedule->>'interval_value','')::INTEGER,1);
   v_current:=(p_schedule->>'starts_at')::TIMESTAMPTZ; v_end:=NULLIF(p_schedule->>'ends_at','')::TIMESTAMPTZ; v_limit:=COALESCE(NULLIF(p_schedule->>'occurrence_count','')::INTEGER,100);
   IF v_frequency NOT IN ('daily','weekly') OR v_current IS NULL THEN RAISE EXCEPTION 'Fréquence et date de début obligatoires'; END IF;
   IF v_end IS NULL AND NULLIF(p_schedule->>'occurrence_count','') IS NULL THEN RAISE EXCEPTION 'Date de fin ou nombre d’occurrences obligatoire'; END IF;
   WHILE v_n<v_limit AND (v_end IS NULL OR v_current<=v_end) LOOP
     v_n:=v_n+1;
     v_request:=submit_treatment_request(jsonb_set(p_request,'{planned_at}',to_jsonb(v_current::TEXT)),p_products);
     UPDATE treatment_requests SET schedule_id=v_schedule,occurrence_number=v_n WHERE id=v_request;
     INSERT INTO treatment_schedule_occurrences(schedule_id,domain_id,occurrence_number,planned_at,treatment_request_id) VALUES(v_schedule,v_domain,v_n,v_current,v_request);
     v_current:=v_current+CASE WHEN v_frequency='daily' THEN make_interval(days=>v_interval) ELSE make_interval(weeks=>v_interval) END;
   END LOOP;
 END IF;
 IF v_n=0 THEN RAISE EXCEPTION 'La planification ne génère aucune occurrence'; END IF;
 RETURN v_schedule;
END $$;

ALTER TABLE treatment_prescription_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_schedule_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY treatment_schedules_read ON treatment_prescription_schedules FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY treatment_occurrences_read ON treatment_schedule_occurrences FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
REVOKE ALL ON FUNCTION public.submit_treatment_schedule(JSONB,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_treatment_schedule(JSONB,JSONB,JSONB) TO authenticated;

COMMIT;
