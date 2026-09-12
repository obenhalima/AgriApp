-- Migration 089 — Ferme, surfaces, volume de bouillie et doses sécurisées
BEGIN;

ALTER TABLE public.product_authorized_uses
  ADD COLUMN IF NOT EXISTS spray_volume_min_l_ha NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS spray_volume_max_l_ha NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS spray_volume_reference_l_ha NUMERIC(12,2);

ALTER TABLE public.product_authorized_uses
  DROP CONSTRAINT IF EXISTS product_use_spray_volume_range;
ALTER TABLE public.product_authorized_uses
  ADD CONSTRAINT product_use_spray_volume_range CHECK (
    (spray_volume_min_l_ha IS NULL OR spray_volume_min_l_ha>0) AND
    (spray_volume_max_l_ha IS NULL OR spray_volume_max_l_ha>0) AND
    (spray_volume_reference_l_ha IS NULL OR spray_volume_reference_l_ha>0) AND
    (spray_volume_min_l_ha IS NULL OR spray_volume_max_l_ha IS NULL OR spray_volume_min_l_ha<=spray_volume_max_l_ha) AND
    (spray_volume_reference_l_ha IS NULL OR spray_volume_min_l_ha IS NULL OR spray_volume_reference_l_ha>=spray_volume_min_l_ha) AND
    (spray_volume_reference_l_ha IS NULL OR spray_volume_max_l_ha IS NULL OR spray_volume_reference_l_ha<=spray_volume_max_l_ha)
  );

ALTER TABLE public.treatment_prescription_schedules
  DROP CONSTRAINT IF EXISTS treatment_prescription_schedules_frequency_check;
ALTER TABLE public.treatment_prescription_schedules
  ADD CONSTRAINT treatment_prescription_schedules_frequency_check
  CHECK(frequency IS NULL OR frequency IN ('daily','weekly','monthly','quarterly','yearly'));

CREATE OR REPLACE FUNCTION public.guard_treatment_product_dose_and_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_area NUMERIC; v_water NUMERIC; v_product UUID; v_stock_unit TEXT;
  v_use product_authorized_uses%ROWTYPE; v_qty NUMERIC; v_source_unit TEXT;
BEGIN
  SELECT treated_area_m2,water_volume_liters INTO v_area,v_water
  FROM treatment_requests WHERE id=NEW.treatment_request_id;
  SELECT plant_protection_product_id,lower(unit) INTO v_product,v_stock_unit
  FROM stock_items WHERE id=NEW.stock_item_id AND domain_id=NEW.domain_id AND is_active;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Article non lié à un produit phytosanitaire actif'; END IF;

  SELECT * INTO v_use FROM product_authorized_uses
  WHERE product_id=v_product AND domain_id=NEW.domain_id AND is_active
  ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun usage autorisé actif pour ce produit'; END IF;
  IF NEW.dose_unit<>v_use.dose_unit THEN RAISE EXCEPTION 'Unité de dose différente de l’usage autorisé'; END IF;
  IF NEW.dose>v_use.dose_max OR (v_use.dose_min IS NOT NULL AND NEW.dose<v_use.dose_min) THEN
    RAISE EXCEPTION 'Dose hors intervalle autorisé (% à % %)',COALESCE(v_use.dose_min,v_use.dose_max),v_use.dose_max,v_use.dose_unit;
  END IF;
  IF v_area IS NULL OR v_area<=0 THEN RAISE EXCEPTION 'Surface traitée invalide'; END IF;
  IF NEW.dose_unit IN ('ml_100l','g_100l') AND (v_water IS NULL OR v_water<=0) THEN
    RAISE EXCEPTION 'Volume de bouillie obligatoire pour une dose par 100 L';
  END IF;

  v_source_unit:=CASE
    WHEN NEW.dose_unit='ml_100l' THEN 'ml' WHEN NEW.dose_unit='g_100l' THEN 'g'
    WHEN NEW.dose_unit IN ('l_ha','l_1000m2') THEN 'l'
    WHEN NEW.dose_unit IN ('kg_ha','kg_1000m2') THEN 'kg'
    WHEN NEW.dose_unit='ml_ha' THEN 'ml' WHEN NEW.dose_unit='g_ha' THEN 'g'
    WHEN NEW.dose_unit='unite_ha' THEN 'unite' ELSE NULL END;
  v_qty:=CASE
    WHEN NEW.dose_unit IN ('ml_100l','g_100l') THEN NEW.dose*v_water/100
    WHEN NEW.dose_unit IN ('l_ha','kg_ha','ml_ha','g_ha','unite_ha') THEN NEW.dose*v_area/10000
    WHEN NEW.dose_unit IN ('l_1000m2','kg_1000m2') THEN NEW.dose*v_area/1000 END;

  IF v_source_unit='ml' AND v_stock_unit IN ('l','litre','litres') THEN v_qty:=v_qty/1000;
  ELSIF v_source_unit='g' AND v_stock_unit IN ('kg','kilogramme','kilogrammes') THEN v_qty:=v_qty/1000;
  ELSIF NOT (
    (v_source_unit='ml' AND v_stock_unit IN ('ml','millilitre','millilitres')) OR
    (v_source_unit='g' AND v_stock_unit IN ('g','gramme','grammes')) OR
    (v_source_unit='l' AND v_stock_unit IN ('l','litre','litres')) OR
    (v_source_unit='kg' AND v_stock_unit IN ('kg','kilogramme','kilogrammes')) OR
    (v_source_unit='unite' AND v_stock_unit IN ('unite','unité','unités','piece','pièce','pièces'))
  ) THEN RAISE EXCEPTION 'Unité de stock (%) incompatible avec l’unité de dose (%)',v_stock_unit,NEW.dose_unit;
  END IF;

  NEW.planned_quantity:=round(v_qty,4);
  NEW.phi_days:=v_use.phi_days;
  NEW.rei_hours:=v_use.rei_hours;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_treatment_product_dose ON public.treatment_request_products;
CREATE TRIGGER trg_guard_treatment_product_dose
BEFORE INSERT OR UPDATE OF stock_item_id,dose,dose_unit,planned_quantity ON public.treatment_request_products
FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_product_dose_and_quantity();

CREATE OR REPLACE FUNCTION public.submit_treatment_schedule(p_schedule JSONB,p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_schedule UUID; v_mode TEXT; v_frequency TEXT; v_interval INTEGER; v_current TIMESTAMPTZ; v_end TIMESTAMPTZ; v_limit INTEGER; v_n INTEGER:=0; v_date JSONB; v_request UUID;
BEGIN
 v_domain:=(p_request->>'domain_id')::UUID;
 IF NOT has_domain_permission(v_domain,auth.uid(),'agronomie','create') AND NOT has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL) THEN RAISE EXCEPTION 'Habilitation de prescription refusée'; END IF;
 v_mode:=p_schedule->>'schedule_mode';
 IF v_mode NOT IN ('single','exact_dates','recurring') THEN RAISE EXCEPTION 'Mode de planification invalide'; END IF;
 INSERT INTO treatment_prescription_schedules(domain_id,schedule_mode,name,frequency,interval_value,starts_at,ends_at,occurrence_count,request_template,products_template,created_by)
 VALUES(v_domain,v_mode,NULLIF(p_schedule->>'name',''),NULLIF(p_schedule->>'frequency',''),NULLIF(p_schedule->>'interval_value','')::INTEGER,NULLIF(p_schedule->>'starts_at','')::TIMESTAMPTZ,NULLIF(p_schedule->>'ends_at','')::TIMESTAMPTZ,NULLIF(p_schedule->>'occurrence_count','')::INTEGER,p_request,p_products,auth.uid()) RETURNING id INTO v_schedule;
 IF v_mode IN ('single','exact_dates') THEN
   IF jsonb_array_length(COALESCE(p_schedule->'exact_dates','[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins une date est obligatoire'; END IF;
   FOR v_date IN SELECT value FROM jsonb_array_elements(p_schedule->'exact_dates') LOOP
     v_n:=v_n+1; IF v_n>100 THEN RAISE EXCEPTION 'Maximum 100 occurrences'; END IF; v_current:=(v_date#>>'{}')::TIMESTAMPTZ;
     v_request:=submit_treatment_request(jsonb_set(p_request,'{planned_at}',to_jsonb(v_current::TEXT)),p_products);
     UPDATE treatment_requests SET schedule_id=v_schedule,occurrence_number=v_n WHERE id=v_request;
     INSERT INTO treatment_schedule_occurrences(schedule_id,domain_id,occurrence_number,planned_at,treatment_request_id) VALUES(v_schedule,v_domain,v_n,v_current,v_request);
   END LOOP;
 ELSE
   v_frequency:=p_schedule->>'frequency'; v_interval:=COALESCE(NULLIF(p_schedule->>'interval_value','')::INTEGER,1);
   v_current:=(p_schedule->>'starts_at')::TIMESTAMPTZ; v_end:=NULLIF(p_schedule->>'ends_at','')::TIMESTAMPTZ; v_limit:=COALESCE(NULLIF(p_schedule->>'occurrence_count','')::INTEGER,100);
   IF v_frequency NOT IN ('daily','weekly','monthly','quarterly','yearly') OR v_current IS NULL THEN RAISE EXCEPTION 'Fréquence et date de début obligatoires'; END IF;
   IF v_end IS NULL AND NULLIF(p_schedule->>'occurrence_count','') IS NULL THEN RAISE EXCEPTION 'Date de fin ou nombre d’occurrences obligatoire'; END IF;
   WHILE v_n<v_limit AND (v_end IS NULL OR v_current<=v_end) LOOP
     v_n:=v_n+1; v_request:=submit_treatment_request(jsonb_set(p_request,'{planned_at}',to_jsonb(v_current::TEXT)),p_products);
     UPDATE treatment_requests SET schedule_id=v_schedule,occurrence_number=v_n WHERE id=v_request;
     INSERT INTO treatment_schedule_occurrences(schedule_id,domain_id,occurrence_number,planned_at,treatment_request_id) VALUES(v_schedule,v_domain,v_n,v_current,v_request);
     v_current:=v_current+CASE v_frequency WHEN 'daily' THEN make_interval(days=>v_interval) WHEN 'weekly' THEN make_interval(weeks=>v_interval) WHEN 'monthly' THEN make_interval(months=>v_interval) WHEN 'quarterly' THEN make_interval(months=>3*v_interval) ELSE make_interval(years=>v_interval) END;
   END LOOP;
 END IF;
 IF v_n=0 THEN RAISE EXCEPTION 'La planification ne génère aucune occurrence'; END IF;
 RETURN v_schedule;
END $$;

REVOKE ALL ON FUNCTION public.submit_treatment_schedule(JSONB,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_treatment_schedule(JSONB,JSONB,JSONB) TO authenticated;
COMMIT;
