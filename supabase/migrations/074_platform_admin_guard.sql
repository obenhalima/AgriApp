-- ============================================================
-- 074_platform_admin_guard.sql
-- Protège le statut plateforme et le dernier super-admin actif.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_platform_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_active_platform_admins INTEGER;
BEGIN
  -- Toute attribution/retrait du statut plateforme exige déjà ce statut.
  IF OLD.is_platform_admin IS DISTINCT FROM NEW.is_platform_admin
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION
      'Modification de is_platform_admin réservée aux super-administrateurs plateforme';
  END IF;

  -- Un profil qui était un super-admin actif ne peut pas être retiré ou
  -- désactivé s'il est le dernier garant de l'administration plateforme.
  IF OLD.is_platform_admin = TRUE
     AND OLD.is_active = TRUE
     AND (NEW.is_platform_admin = FALSE OR NEW.is_active = FALSE) THEN
    SELECT COUNT(*)
    INTO v_other_active_platform_admins
    FROM public.profiles p
    WHERE p.id <> OLD.id
      AND p.is_platform_admin = TRUE
      AND p.is_active = TRUE;

    IF v_other_active_platform_admins = 0 THEN
      RAISE EXCEPTION
        'Impossible de retirer ou désactiver le dernier super-administrateur plateforme actif';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_platform_admin_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_platform_admin_change() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_platform_admin_change ON public.profiles;

CREATE TRIGGER trg_guard_platform_admin_change
BEFORE UPDATE OF is_platform_admin, is_active ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_platform_admin_change();

COMMIT;

