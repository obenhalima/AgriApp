-- Migration 093 — Normalisation des unités de dose historiques et saisies
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_phyto_dose_unit(p_unit TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE lower(replace(regexp_replace(trim(COALESCE(p_unit,'')),'\s+','','g'),'/','_'))
    WHEN 'ml_hl' THEN 'ml_100l'
    WHEN 'ml_100l' THEN 'ml_100l'
    WHEN 'cc_hl' THEN 'ml_100l'
    WHEN 'cc_100l' THEN 'ml_100l'
    WHEN 'g_hl' THEN 'g_100l'
    WHEN 'g_100l' THEN 'g_100l'
    WHEN 'l_ha' THEN 'l_ha'
    WHEN 'kg_ha' THEN 'kg_ha'
    WHEN 'ml_ha' THEN 'ml_ha'
    WHEN 'g_ha' THEN 'g_ha'
    WHEN 'unité_ha' THEN 'unite_ha'
    WHEN 'unite_ha' THEN 'unite_ha'
    WHEN 'l_1000m2' THEN 'l_1000m2'
    WHEN 'l_1000m²' THEN 'l_1000m2'
    WHEN 'kg_1000m2' THEN 'kg_1000m2'
    WHEN 'kg_1000m²' THEN 'kg_1000m2'
    ELSE lower(replace(regexp_replace(trim(COALESCE(p_unit,'')),'\s+','','g'),'/','_'))
  END
$$;

UPDATE public.product_authorized_uses
SET dose_unit=public.normalize_phyto_dose_unit(dose_unit)
WHERE dose_unit IS DISTINCT FROM public.normalize_phyto_dose_unit(dose_unit);

CREATE OR REPLACE FUNCTION public.guard_treatment_product_dose_and_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_area NUMERIC; v_water NUMERIC; v_product UUID; v_stock_unit TEXT;
  v_use product_authorized_uses%ROWTYPE; v_qty NUMERIC; v_source_unit TEXT;
  v_unit TEXT; v_authorized_unit TEXT;
BEGIN
  SELECT treated_area_m2,water_volume_liters INTO v_area,v_water
  FROM treatment_requests WHERE id=NEW.treatment_request_id;
  SELECT plant_protection_product_id,lower(trim(unit)) INTO v_product,v_stock_unit
  FROM stock_items WHERE id=NEW.stock_item_id AND domain_id=NEW.domain_id AND is_active;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Article non lié à un produit phytosanitaire actif'; END IF;

  SELECT * INTO v_use FROM product_authorized_uses
  WHERE product_id=v_product AND domain_id=NEW.domain_id AND is_active
  ORDER BY created_at NULLS LAST,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun usage autorisé actif pour ce produit'; END IF;

  v_unit:=public.normalize_phyto_dose_unit(NEW.dose_unit);
  v_authorized_unit:=public.normalize_phyto_dose_unit(v_use.dose_unit);
  IF v_unit<>v_authorized_unit THEN
    RAISE EXCEPTION 'Unité de dose incompatible : prescription=% ; usage autorisé=%',NEW.dose_unit,v_use.dose_unit;
  END IF;
  NEW.dose_unit:=v_unit;
  IF NEW.dose>v_use.dose_max OR (v_use.dose_min IS NOT NULL AND NEW.dose<v_use.dose_min) THEN
    RAISE EXCEPTION 'Dose hors intervalle autorisé (% à % %)',COALESCE(v_use.dose_min,v_use.dose_max),v_use.dose_max,v_authorized_unit;
  END IF;
  IF v_area IS NULL OR v_area<=0 THEN RAISE EXCEPTION 'Surface traitée invalide'; END IF;
  IF v_unit IN ('ml_100l','g_100l') AND (v_water IS NULL OR v_water<=0) THEN RAISE EXCEPTION 'Volume de bouillie obligatoire pour une dose par 100 L'; END IF;

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

REVOKE ALL ON FUNCTION public.normalize_phyto_dose_unit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_phyto_dose_unit(TEXT) TO authenticated;

COMMIT;
