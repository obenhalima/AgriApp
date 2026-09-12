-- Migration 094 — Contrôle de l’unité lors de la liaison produit phyto / stock
BEGIN;

CREATE OR REPLACE FUNCTION public.phyto_stock_unit_compatible(p_stock_unit TEXT,p_dose_unit TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN public.normalize_phyto_dose_unit(p_dose_unit) IN ('ml_100l','ml_ha','l_ha','l_1000m2')
      THEN lower(trim(p_stock_unit)) IN ('ml','millilitre','millilitres','l','litre','litres')
    WHEN public.normalize_phyto_dose_unit(p_dose_unit) IN ('g_100l','g_ha','kg_ha','kg_1000m2')
      THEN lower(trim(p_stock_unit)) IN ('g','gramme','grammes','kg','kilogramme','kilogrammes')
    WHEN public.normalize_phyto_dose_unit(p_dose_unit)='unite_ha'
      THEN lower(trim(p_stock_unit)) IN ('unite','unité','unités','piece','pièce','pièces')
    ELSE FALSE END
$$;

CREATE OR REPLACE FUNCTION public.guard_stock_phyto_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_active BOOLEAN; v_name TEXT; v_units TEXT;
BEGIN
  IF NEW.plant_protection_product_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.category<>'phytosanitaires' THEN RAISE EXCEPTION 'Un produit phytosanitaire ne peut être lié qu’à la catégorie phytosanitaires'; END IF;
  SELECT domain_id,is_active,commercial_name INTO v_domain,v_active,v_name
  FROM plant_protection_products WHERE id=NEW.plant_protection_product_id;
  IF v_domain IS DISTINCT FROM NEW.domain_id OR NOT COALESCE(v_active,FALSE) THEN RAISE EXCEPTION 'Produit phytosanitaire hors société ou inactif'; END IF;
  IF NOT EXISTS(SELECT 1 FROM product_authorized_uses u WHERE u.product_id=NEW.plant_protection_product_id AND u.domain_id=NEW.domain_id AND u.is_active) THEN
    RAISE EXCEPTION 'Aucun usage autorisé actif pour ce produit';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM product_authorized_uses u WHERE u.product_id=NEW.plant_protection_product_id AND u.domain_id=NEW.domain_id AND u.is_active AND public.phyto_stock_unit_compatible(NEW.unit,u.dose_unit)) THEN
    SELECT string_agg(DISTINCT public.normalize_phyto_dose_unit(u.dose_unit),', ') INTO v_units FROM product_authorized_uses u WHERE u.product_id=NEW.plant_protection_product_id AND u.domain_id=NEW.domain_id AND u.is_active;
    RAISE EXCEPTION '% : unité de stock % incompatible avec les doses %',v_name,NEW.unit,v_units;
  END IF;
  IF EXISTS(SELECT 1 FROM stock_items s WHERE s.domain_id=NEW.domain_id AND s.plant_protection_product_id=NEW.plant_protection_product_id AND s.id IS DISTINCT FROM NEW.id AND s.is_active) THEN
    RAISE EXCEPTION 'Ce produit est déjà lié à un article de stock actif dans cette société';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
