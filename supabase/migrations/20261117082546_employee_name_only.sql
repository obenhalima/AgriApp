BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.guard_employee_recovery_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.employee_import IS NOT NULL THEN
    IF NEW.employee_import IS DISTINCT FROM OLD.employee_import THEN
      RAISE EXCEPTION 'La provenance de l’import doit être conservée';
    END IF;
    IF coalesce(btrim(NEW.last_name),'')='' THEN
      RAISE EXCEPTION 'Le nom est requis';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM farms WHERE id=NEW.farm_id
      AND domain_id=(OLD.employee_import->>'domain_id')::uuid) THEN
      RAISE EXCEPTION 'Ferme inaccessible pour ce client';
    END IF;
  END IF;
  RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
