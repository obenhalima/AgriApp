-- Migration 103 — Nettoyage et interdiction des cibles biologiques vides
BEGIN;

-- Rend le correctif autonome si la migration 102 n'a pas encore été appliquée.
ALTER TABLE public.phyto_targets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.phyto_targets(id) ON DELETE RESTRICT;

UPDATE public.phyto_positive_list_entries e
SET target_id=NULL,target_label='Cible à identifier',review_status='a_controler',
    station_approved=FALSE,station_approved_by=NULL,station_approved_at=NULL
WHERE NULLIF(btrim(e.target_label),'') IS NULL
   OR e.target_id IN (SELECT id FROM public.phyto_targets WHERE NULLIF(btrim(canonical_name),'') IS NULL);

UPDATE public.phyto_targets
SET merged_into_id=NULL
WHERE merged_into_id IN (SELECT id FROM public.phyto_targets WHERE NULLIF(btrim(canonical_name),'') IS NULL);

DELETE FROM public.phyto_targets WHERE NULLIF(btrim(canonical_name),'') IS NULL;

ALTER TABLE public.phyto_targets DROP CONSTRAINT IF EXISTS phyto_target_name_not_blank;
ALTER TABLE public.phyto_targets ADD CONSTRAINT phyto_target_name_not_blank
  CHECK(NULLIF(btrim(canonical_name),'') IS NOT NULL);

ALTER TABLE public.phyto_positive_list_entries DROP CONSTRAINT IF EXISTS positive_entry_target_label_not_blank;
ALTER TABLE public.phyto_positive_list_entries ADD CONSTRAINT positive_entry_target_label_not_blank
  CHECK(NULLIF(btrim(target_label),'') IS NOT NULL);

CREATE OR REPLACE FUNCTION public.guard_positive_entry_validation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.review_status='valide' AND (
    NEW.target_id IS NULL OR NEW.product_id IS NULL
    OR lower(btrim(NEW.target_label))='cible à identifier'
  ) THEN
    RAISE EXCEPTION 'Une ligne ne peut pas être validée sans cible et produit correctement reliés';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_positive_entry_validation ON public.phyto_positive_list_entries;
CREATE TRIGGER trg_guard_positive_entry_validation
BEFORE INSERT OR UPDATE OF review_status,target_id,product_id,target_label
ON public.phyto_positive_list_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_positive_entry_validation();

COMMIT;
