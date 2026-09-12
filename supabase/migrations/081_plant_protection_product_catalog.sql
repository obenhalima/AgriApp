-- Migration 081 — Référentiel des produits phytosanitaires et liaison au stock

BEGIN;

CREATE TABLE public.plant_protection_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  commercial_name VARCHAR(180) NOT NULL,
  authorization_number VARCHAR(100) NOT NULL,
  authorization_status VARCHAR(30) NOT NULL DEFAULT 'autorise'
    CHECK (authorization_status IN ('autorise','suspendu','retire','expire')),
  authorization_expires_on DATE,
  holder_name VARCHAR(180),
  supplier_name VARCHAR(180),
  active_substances TEXT NOT NULL,
  concentration VARCHAR(120),
  formulation VARCHAR(80),
  product_family VARCHAR(40) NOT NULL
    CHECK (product_family IN ('insecticide','fongicide','acaricide','nematicide','herbicide','biocontrole','adjuvant','autre')),
  resistance_group VARCHAR(50),
  max_applications_per_campaign INTEGER CHECK (max_applications_per_campaign IS NULL OR max_applications_per_campaign > 0),
  min_interval_days INTEGER CHECK (min_interval_days IS NULL OR min_interval_days >= 0),
  default_phi_days INTEGER CHECK (default_phi_days IS NULL OR default_phi_days >= 0),
  default_rei_hours INTEGER CHECK (default_rei_hours IS NULL OR default_rei_hours >= 0),
  ppe_requirements TEXT,
  label_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phyto_product_name_not_blank CHECK (btrim(commercial_name)<>''),
  CONSTRAINT phyto_authorization_not_blank CHECK (btrim(authorization_number)<>'')
);

CREATE UNIQUE INDEX uq_phyto_product_domain_authorization
  ON public.plant_protection_products(domain_id,upper(authorization_number));
CREATE INDEX idx_phyto_product_domain_active
  ON public.plant_protection_products(domain_id,is_active);

CREATE TABLE public.product_authorized_uses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.plant_protection_products(id) ON DELETE CASCADE,
  crop_name VARCHAR(120) NOT NULL DEFAULT 'Tomate',
  target_name VARCHAR(180) NOT NULL,
  dose_min NUMERIC(12,4) CHECK (dose_min IS NULL OR dose_min > 0),
  dose_max NUMERIC(12,4) NOT NULL CHECK (dose_max > 0),
  dose_unit VARCHAR(40) NOT NULL,
  phi_days INTEGER NOT NULL DEFAULT 0 CHECK (phi_days >= 0),
  rei_hours INTEGER NOT NULL DEFAULT 0 CHECK (rei_hours >= 0),
  max_applications INTEGER CHECK (max_applications IS NULL OR max_applications > 0),
  min_interval_days INTEGER CHECK (min_interval_days IS NULL OR min_interval_days >= 0),
  official_source_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (dose_min IS NULL OR dose_min<=dose_max)
);

CREATE UNIQUE INDEX uq_phyto_use_product_crop_target
  ON public.product_authorized_uses(product_id,upper(crop_name),upper(target_name));
CREATE INDEX idx_phyto_use_domain ON public.product_authorized_uses(domain_id);

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS plant_protection_product_id UUID
  REFERENCES public.plant_protection_products(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_stock_items_phyto_product
  ON public.stock_items(plant_protection_product_id);

CREATE OR REPLACE FUNCTION public.sync_phyto_use_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  SELECT domain_id INTO NEW.domain_id FROM plant_protection_products WHERE id=NEW.product_id;
  IF NEW.domain_id IS NULL THEN RAISE EXCEPTION 'Produit phytosanitaire introuvable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sync_phyto_use_domain BEFORE INSERT OR UPDATE OF product_id,domain_id
ON public.product_authorized_uses FOR EACH ROW EXECUTE FUNCTION public.sync_phyto_use_domain();

CREATE OR REPLACE FUNCTION public.guard_stock_phyto_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID;
BEGIN
  IF NEW.plant_protection_product_id IS NULL THEN RETURN NEW; END IF;
  SELECT domain_id INTO v_domain FROM plant_protection_products
  WHERE id=NEW.plant_protection_product_id AND is_active;
  IF v_domain IS DISTINCT FROM NEW.domain_id THEN
    RAISE EXCEPTION 'Le produit phytosanitaire et l’article doivent appartenir au même domaine';
  END IF;
  IF NEW.category::TEXT<>'phytosanitaires' THEN
    RAISE EXCEPTION 'Un produit phytosanitaire ne peut être lié qu’à la catégorie phytosanitaires';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_stock_phyto_product BEFORE INSERT OR UPDATE OF plant_protection_product_id,domain_id,category
ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.guard_stock_phyto_product();

ALTER TABLE public.plant_protection_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_authorized_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY phyto_products_select ON public.plant_protection_products FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY phyto_products_insert ON public.plant_protection_products FOR INSERT TO authenticated
  WITH CHECK (has_domain_permission(domain_id,auth.uid(),'agronomie','create'));
CREATE POLICY phyto_products_update ON public.plant_protection_products FOR UPDATE TO authenticated
  USING (has_domain_permission(domain_id,auth.uid(),'agronomie','edit'))
  WITH CHECK (has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));
CREATE POLICY phyto_products_delete ON public.plant_protection_products FOR DELETE TO authenticated
  USING (has_domain_permission(domain_id,auth.uid(),'agronomie','delete'));
CREATE POLICY phyto_uses_select ON public.product_authorized_uses FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY phyto_uses_insert ON public.product_authorized_uses FOR INSERT TO authenticated
  WITH CHECK (has_domain_permission(domain_id,auth.uid(),'agronomie','create'));
CREATE POLICY phyto_uses_update ON public.product_authorized_uses FOR UPDATE TO authenticated
  USING (has_domain_permission(domain_id,auth.uid(),'agronomie','edit'))
  WITH CHECK (has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));
CREATE POLICY phyto_uses_delete ON public.product_authorized_uses FOR DELETE TO authenticated
  USING (has_domain_permission(domain_id,auth.uid(),'agronomie','delete'));

COMMIT;
