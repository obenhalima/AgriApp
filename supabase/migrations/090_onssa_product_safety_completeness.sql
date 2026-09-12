-- Migration 090 — Complétude ONSSA et sécurité avant prescription
BEGIN;

ALTER TABLE public.plant_protection_products
  ADD COLUMN IF NOT EXISTS toxicology_class VARCHAR(30),
  ADD COLUMN IF NOT EXISTS hazard_pictograms TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hazard_statements TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS precautionary_statements TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS safety_data_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS safety_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.product_authorized_uses
  ADD COLUMN IF NOT EXISTS dose_type VARCHAR(20) NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS application_period TEXT,
  ADD COLUMN IF NOT EXISTS treatment_mode VARCHAR(160);
ALTER TABLE public.product_authorized_uses
  DROP CONSTRAINT IF EXISTS product_authorized_uses_dose_type_check;
ALTER TABLE public.product_authorized_uses
  ADD CONSTRAINT product_authorized_uses_dose_type_check CHECK(dose_type IN ('single','range'));

-- Les anciens zéros provenaient du défaut applicatif et ne prouvent pas un délai réglementaire nul.
ALTER TABLE public.product_authorized_uses ALTER COLUMN rei_hours DROP DEFAULT;
ALTER TABLE public.product_authorized_uses ALTER COLUMN rei_hours DROP NOT NULL;
UPDATE public.product_authorized_uses SET rei_hours=NULL WHERE rei_hours=0;
ALTER TABLE public.treatment_request_products ALTER COLUMN rei_hours DROP DEFAULT;
ALTER TABLE public.treatment_request_products ALTER COLUMN rei_hours DROP NOT NULL;
UPDATE public.treatment_request_products SET rei_hours=NULL WHERE rei_hours=0;

CREATE OR REPLACE FUNCTION public.set_phyto_safety_verification_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.safety_data_verified AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.safety_data_verified,FALSE)) THEN
    NEW.safety_verified_at:=NOW(); NEW.safety_verified_by:=auth.uid();
  ELSIF NOT NEW.safety_data_verified THEN
    NEW.safety_verified_at:=NULL; NEW.safety_verified_by:=NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_phyto_safety_verification_audit ON public.plant_protection_products;
CREATE TRIGGER trg_phyto_safety_verification_audit
BEFORE INSERT OR UPDATE OF safety_data_verified ON public.plant_protection_products
FOR EACH ROW EXECUTE FUNCTION public.set_phyto_safety_verification_audit();

CREATE OR REPLACE FUNCTION public.require_phyto_safety_before_prescription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_product UUID; v_verified BOOLEAN; v_rei INTEGER;
BEGIN
  SELECT si.plant_protection_product_id,p.safety_data_verified
    INTO v_product,v_verified
  FROM stock_items si JOIN plant_protection_products p ON p.id=si.plant_protection_product_id
  WHERE si.id=NEW.stock_item_id AND si.domain_id=NEW.domain_id;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Produit phytosanitaire introuvable'; END IF;
  IF NOT COALESCE(v_verified,FALSE) THEN RAISE EXCEPTION 'Données de sécurité du produit non vérifiées'; END IF;
  SELECT rei_hours INTO v_rei FROM product_authorized_uses
  WHERE product_id=v_product AND domain_id=NEW.domain_id AND is_active ORDER BY created_at LIMIT 1;
  IF v_rei IS NULL THEN RAISE EXCEPTION 'Délai de rentrée non renseigné : compléter l’étiquette avant prescription'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_require_phyto_safety ON public.treatment_request_products;
CREATE TRIGGER trg_require_phyto_safety
BEFORE INSERT OR UPDATE OF stock_item_id ON public.treatment_request_products
FOR EACH ROW EXECUTE FUNCTION public.require_phyto_safety_before_prescription();

COMMIT;
