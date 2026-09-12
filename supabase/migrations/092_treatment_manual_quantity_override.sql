-- Migration 092 — Calcul robuste et dérogation manuelle de quantité avec justification
BEGIN;

ALTER TABLE public.treatment_request_products
  ADD COLUMN IF NOT EXISTS calculated_quantity NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS quantity_is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quantity_override_justification TEXT;

ALTER TABLE public.treatment_request_products
  DROP CONSTRAINT IF EXISTS treatment_product_manual_quantity_justified;
ALTER TABLE public.treatment_request_products
  ADD CONSTRAINT treatment_product_manual_quantity_justified CHECK(
    NOT quantity_is_manual OR length(trim(COALESCE(quantity_override_justification,'')))>=5
  );

CREATE OR REPLACE FUNCTION public.guard_treatment_product_dose_and_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_area NUMERIC; v_water NUMERIC; v_product UUID; v_stock_unit TEXT;
  v_use product_authorized_uses%ROWTYPE; v_qty NUMERIC; v_source_unit TEXT; v_unit TEXT;
BEGIN
  SELECT treated_area_m2,water_volume_liters INTO v_area,v_water
  FROM treatment_requests WHERE id=NEW.treatment_request_id;
  SELECT plant_protection_product_id,lower(trim(unit)) INTO v_product,v_stock_unit
  FROM stock_items WHERE id=NEW.stock_item_id AND domain_id=NEW.domain_id AND is_active;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Article non lié à un produit phytosanitaire actif'; END IF;

  SELECT * INTO v_use FROM product_authorized_uses
  WHERE product_id=v_product AND domain_id=NEW.domain_id AND is_active
  ORDER BY created_at NULLS LAST, id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun usage autorisé actif pour ce produit'; END IF;

  v_unit:=lower(regexp_replace(trim(NEW.dose_unit),'\s+','','g'));
  v_unit:=replace(v_unit,'/','_');
  v_unit:=CASE v_unit
    WHEN 'ml_hl' THEN 'ml_100l' WHEN 'cc_hl' THEN 'ml_100l' WHEN 'cc_100l' THEN 'ml_100l'
    WHEN 'g_hl' THEN 'g_100l' ELSE v_unit END;
  IF v_unit<>v_use.dose_unit THEN RAISE EXCEPTION 'Unité de dose différente de l’usage autorisé'; END IF;
  NEW.dose_unit:=v_unit;
  IF NEW.dose>v_use.dose_max OR (v_use.dose_min IS NOT NULL AND NEW.dose<v_use.dose_min) THEN
    RAISE EXCEPTION 'Dose hors intervalle autorisé (% à % %)',COALESCE(v_use.dose_min,v_use.dose_max),v_use.dose_max,v_use.dose_unit;
  END IF;
  IF v_area IS NULL OR v_area<=0 THEN RAISE EXCEPTION 'Surface traitée invalide'; END IF;
  IF v_unit IN ('ml_100l','g_100l') AND (v_water IS NULL OR v_water<=0) THEN
    RAISE EXCEPTION 'Volume de bouillie obligatoire pour une dose par 100 L';
  END IF;

  v_source_unit:=CASE
    WHEN v_unit='ml_100l' THEN 'ml' WHEN v_unit='g_100l' THEN 'g'
    WHEN v_unit IN ('l_ha','l_1000m2') THEN 'l'
    WHEN v_unit IN ('kg_ha','kg_1000m2') THEN 'kg'
    WHEN v_unit='ml_ha' THEN 'ml' WHEN v_unit='g_ha' THEN 'g'
    WHEN v_unit='unite_ha' THEN 'unite' ELSE NULL END;
  v_qty:=CASE
    WHEN v_unit IN ('ml_100l','g_100l') THEN NEW.dose*v_water/100
    WHEN v_unit IN ('l_ha','kg_ha','ml_ha','g_ha','unite_ha') THEN NEW.dose*v_area/10000
    WHEN v_unit IN ('l_1000m2','kg_1000m2') THEN NEW.dose*v_area/1000 END;

  IF v_source_unit='ml' AND v_stock_unit IN ('l','litre','litres') THEN v_qty:=v_qty/1000;
  ELSIF v_source_unit='g' AND v_stock_unit IN ('kg','kilogramme','kilogrammes') THEN v_qty:=v_qty/1000;
  ELSIF NOT (
    (v_source_unit='ml' AND v_stock_unit IN ('ml','millilitre','millilitres')) OR
    (v_source_unit='g' AND v_stock_unit IN ('g','gramme','grammes')) OR
    (v_source_unit='l' AND v_stock_unit IN ('l','litre','litres')) OR
    (v_source_unit='kg' AND v_stock_unit IN ('kg','kilogramme','kilogrammes')) OR
    (v_source_unit='unite' AND v_stock_unit IN ('unite','unité','unités','piece','pièce','pièces'))
  ) THEN RAISE EXCEPTION 'Unité de stock (%) incompatible avec l’unité de dose (%)',v_stock_unit,v_unit;
  END IF;

  NEW.calculated_quantity:=round(v_qty,4);
  IF NEW.quantity_is_manual THEN
    IF NEW.planned_quantity IS NULL OR NEW.planned_quantity<=0 THEN RAISE EXCEPTION 'La quantité manuelle doit être positive'; END IF;
    IF length(trim(COALESCE(NEW.quantity_override_justification,'')))<5 THEN RAISE EXCEPTION 'Justification obligatoire pour une quantité manuelle'; END IF;
  ELSE
    NEW.planned_quantity:=NEW.calculated_quantity;
    NEW.quantity_override_justification:=NULL;
  END IF;
  NEW.phi_days:=v_use.phi_days;
  NEW.rei_hours:=v_use.rei_hours;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_treatment_request(p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID; v_domain UUID; v_line JSONB; v_target JSONB; v_item_domain UUID; v_target_domain UUID; v_first UUID;
BEGIN
  v_domain:=(p_request->>'domain_id')::UUID;
  IF NOT has_domain_permission(v_domain,auth.uid(),'agronomie','create')
     AND NOT has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL) THEN RAISE EXCEPTION 'Habilitation de prescription refusée'; END IF;
  IF jsonb_array_length(COALESCE(p_request->'target_planting_ids','[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins une serre est obligatoire'; END IF;
  IF jsonb_array_length(COALESCE(p_products,'[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins un produit est obligatoire'; END IF;
  v_first:=(p_request->'target_planting_ids'->>0)::UUID;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    SELECT domain_id INTO v_target_domain FROM campaign_plantings WHERE id=(v_target#>>'{}')::UUID;
    IF v_target_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Plantation hors de la société active'; END IF;
  END LOOP;
  INSERT INTO treatment_requests(domain_id,campaign_planting_id,planned_at,target_name,diagnosis,justification,treated_area_m2,water_volume_liters,temperature_c,humidity_pct,requested_by,notes)
  VALUES(v_domain,v_first,(p_request->>'planned_at')::TIMESTAMPTZ,p_request->>'target_name',p_request->>'diagnosis',p_request->>'justification',(p_request->>'treated_area_m2')::NUMERIC,NULLIF(p_request->>'water_volume_liters','')::NUMERIC,NULLIF(p_request->>'temperature_c','')::NUMERIC,NULLIF(p_request->>'humidity_pct','')::NUMERIC,auth.uid(),NULLIF(p_request->>'notes','')) RETURNING id INTO v_id;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    INSERT INTO treatment_request_targets(treatment_request_id,domain_id,campaign_planting_id) VALUES(v_id,v_domain,(v_target#>>'{}')::UUID);
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    SELECT domain_id INTO v_item_domain FROM stock_items WHERE id=(v_line->>'stock_item_id')::UUID AND is_active;
    IF v_item_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Produit de stock hors société ou inactif'; END IF;
    INSERT INTO treatment_request_products(treatment_request_id,domain_id,stock_item_id,dose,dose_unit,planned_quantity,calculated_quantity,quantity_is_manual,quantity_override_justification,phi_days,rei_hours,label_confirmed)
    VALUES(v_id,v_domain,(v_line->>'stock_item_id')::UUID,(v_line->>'dose')::NUMERIC,v_line->>'dose_unit',(v_line->>'planned_quantity')::NUMERIC,NULLIF(v_line->>'calculated_quantity','')::NUMERIC,COALESCE((v_line->>'quantity_is_manual')::BOOLEAN,FALSE),NULLIF(v_line->>'quantity_override_justification',''),COALESCE((v_line->>'phi_days')::INTEGER,0),COALESCE((v_line->>'rei_hours')::INTEGER,0),COALESCE((v_line->>'label_confirmed')::BOOLEAN,FALSE));
  END LOOP;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_treatment_request(JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_treatment_request(JSONB,JSONB) TO authenticated;

COMMIT;
