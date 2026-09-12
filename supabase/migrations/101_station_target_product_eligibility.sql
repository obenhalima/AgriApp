-- Migration 101 — Éligibilité produit par station, cible, ONSSA et stock
BEGIN;

ALTER TABLE public.plant_protection_products
  DROP CONSTRAINT IF EXISTS plant_protection_products_authorization_status_check;
ALTER TABLE public.plant_protection_products
  ADD CONSTRAINT plant_protection_products_authorization_status_check
  CHECK(authorization_status IN ('a_verifier','autorise','suspendu','retire','expire'));

ALTER TABLE public.plant_protection_products
  ADD COLUMN IF NOT EXISTS catalog_source VARCHAR(30) NOT NULL DEFAULT 'manuel'
    CHECK(catalog_source IN ('manuel','onssa','liste_positive'));

ALTER TABLE public.phyto_positive_list_entries
  ADD COLUMN IF NOT EXISTS station_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS station_approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS station_approved_at TIMESTAMPTZ;

UPDATE public.plant_protection_products
SET authorization_status='a_verifier',catalog_source='liste_positive',updated_at=NOW()
WHERE authorization_number LIKE 'IMPORT-LP-%' AND authorization_status='suspendu';

UPDATE public.phyto_positive_list_entries
SET station_approved=TRUE,
    station_approved_by=COALESCE(station_approved_by,(SELECT imported_by FROM public.phyto_positive_lists l WHERE l.id=list_id)),
    station_approved_at=COALESCE(station_approved_at,created_at)
WHERE review_status='valide';

CREATE OR REPLACE FUNCTION public.mark_positive_entry_station_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.review_status='valide' THEN
    NEW.station_approved:=TRUE;
    NEW.station_approved_by:=COALESCE(NEW.station_approved_by,auth.uid());
    NEW.station_approved_at:=COALESCE(NEW.station_approved_at,NOW());
  ELSE
    NEW.station_approved:=FALSE;
    NEW.station_approved_by:=NULL;
    NEW.station_approved_at:=NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_positive_entry_station_approval ON public.phyto_positive_list_entries;
CREATE TRIGGER trg_positive_entry_station_approval
BEFORE INSERT OR UPDATE OF review_status,station_approved ON public.phyto_positive_list_entries
FOR EACH ROW EXECUTE FUNCTION public.mark_positive_entry_station_approval();

CREATE OR REPLACE FUNCTION public.mark_imported_phyto_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.authorization_number LIKE 'IMPORT-LP-%' THEN
    NEW.catalog_source:='liste_positive';
    IF NEW.authorization_status='suspendu' THEN NEW.authorization_status:='a_verifier'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mark_imported_phyto_product ON public.plant_protection_products;
CREATE TRIGGER trg_mark_imported_phyto_product
BEFORE INSERT OR UPDATE OF authorization_number,authorization_status ON public.plant_protection_products
FOR EACH ROW EXECUTE FUNCTION public.mark_imported_phyto_product();

CREATE OR REPLACE VIEW public.v_active_station_phyto_products
WITH (security_invoker=TRUE) AS
SELECT
  e.domain_id,e.list_id,l.version,e.target_id,t.canonical_name AS target_name,
  e.product_id,e.authorized_use_id,e.commercial_name,e.station_approved,
  p.authorization_status,p.safety_data_verified,p.is_active,
  EXISTS(
    SELECT 1 FROM public.stock_items si
    WHERE si.domain_id=e.domain_id AND si.plant_protection_product_id=e.product_id
      AND si.category='phytosanitaires' AND si.is_active
  ) AS linked_to_stock,
  (e.station_approved AND p.authorization_status='autorise' AND p.safety_data_verified AND p.is_active
    AND e.authorized_use_id IS NOT NULL) AS regulatory_ready
FROM public.phyto_positive_list_entries e
JOIN public.phyto_positive_lists l ON l.id=e.list_id AND l.status='active'
JOIN public.plant_protection_products p ON p.id=e.product_id
LEFT JOIN public.phyto_targets t ON t.id=e.target_id
WHERE e.review_status='valide' AND e.station_approved;

GRANT SELECT ON public.v_active_station_phyto_products TO authenticated;

COMMIT;
