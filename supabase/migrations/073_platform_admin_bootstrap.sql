-- ============================================================
-- 073_platform_admin_bootstrap.sql
-- Bootstrap du premier super-administrateur FarmPilot
-- + durcissement de l'auto-modification des profils.
--
-- Ce script attribue explicitement le statut plateforme à :
--   agenttest@test.com
--
-- Il ne crée pas un nouvel utilisateur Auth. Le profil doit déjà exister.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Préconditions
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_profile_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_platform_admin'
  ) THEN
    RAISE EXCEPTION
      'Migration 073 impossible : appliquer d''abord la migration 072';
  END IF;

  SELECT COUNT(*)
  INTO v_profile_count
  FROM public.profiles
  WHERE lower(email) = 'agenttest@test.com';

  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION
      'Migration 073 interrompue : attendu 1 profil agenttest@test.com, trouvé %',
      v_profile_count;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Empêcher toute auto-élévation plateforme
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;

CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role_id IS NOT DISTINCT FROM (
    SELECT p.role_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
  AND is_platform_admin IS NOT DISTINCT FROM (
    SELECT p.is_platform_admin
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

COMMENT ON POLICY profiles_self_update ON public.profiles IS
  'L utilisateur peut modifier ses informations personnelles, jamais son rôle global ni son statut plateforme.';

-- ────────────────────────────────────────────────────────────
-- 3. Attribution explicite du premier super-administrateur
-- ────────────────────────────────────────────────────────────

UPDATE public.profiles
SET
  is_platform_admin = TRUE,
  updated_at = NOW()
WHERE lower(email) = 'agenttest@test.com';

-- ────────────────────────────────────────────────────────────
-- 4. Garde de colonne indépendante des politiques permissives
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_platform_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_platform_admin IS DISTINCT FROM NEW.is_platform_admin
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION
      'Modification de is_platform_admin réservée aux super-administrateurs plateforme';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_platform_admin_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_platform_admin_change() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_platform_admin_change ON public.profiles;

CREATE TRIGGER trg_guard_platform_admin_change
BEFORE UPDATE OF is_platform_admin ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_platform_admin_change();

-- ────────────────────────────────────────────────────────────
-- 5. Assertion
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(email) = 'agenttest@test.com'
      AND is_active = TRUE
      AND is_platform_admin = TRUE
  ) THEN
    RAISE EXCEPTION
      'Migration 073 incohérente : le super-administrateur QA n''est pas actif';
  END IF;

  IF NOT public.is_platform_admin((
    SELECT id
    FROM public.profiles
    WHERE lower(email) = 'agenttest@test.com'
  )) THEN
    RAISE EXCEPTION
      'Migration 073 incohérente : is_platform_admin() retourne FALSE';
  END IF;
END;
$$;

COMMIT;
