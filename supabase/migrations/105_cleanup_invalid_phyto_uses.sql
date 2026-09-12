-- Migration 105 — Retrait des faux usages créés depuis des cibles mal interprétées
BEGIN;

UPDATE public.product_authorized_uses
SET is_active=FALSE,updated_at=NOW(),
    notes=concat_ws(E'\n',notes,'Désactivé automatiquement : cible non biologique détectée lors du correctif 105.')
WHERE is_active AND NOT public.is_plausible_phyto_target(target_name);

-- Empêche qu'un usage à cible invalide soit réactivé ultérieurement.
CREATE OR REPLACE FUNCTION public.guard_phyto_use_target_quality()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_active AND NOT public.is_plausible_phyto_target(NEW.target_name) THEN
    RAISE EXCEPTION 'La cible de cet usage n’est pas une cible biologique valide';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_phyto_use_target_quality ON public.product_authorized_uses;
CREATE TRIGGER trg_guard_phyto_use_target_quality
BEFORE INSERT OR UPDATE OF target_name,is_active ON public.product_authorized_uses
FOR EACH ROW EXECUTE FUNCTION public.guard_phyto_use_target_quality();

COMMIT;
