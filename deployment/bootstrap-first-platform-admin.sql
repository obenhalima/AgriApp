\set ON_ERROR_STOP on

-- Run with psql -v admin_id=<Auth user UUID> after creating the Auth account.
-- The current connection must be the new instance's database owner.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
LOCK TABLE public.domains IN SHARE MODE;
LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE;

SELECT set_config('itrix.bootstrap_admin_id', :'admin_id', true);

DO $bootstrap$
DECLARE
  admin_id uuid := current_setting('itrix.bootstrap_admin_id')::uuid;
  admin_role_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.domains) THEN
    RAISE EXCEPTION 'Bootstrap réservé à une instance sans société';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE is_platform_admin AND id <> admin_id
  ) THEN
    RAISE EXCEPTION 'Un autre super-administrateur existe déjà';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.id = admin_id AND p.is_active AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Le compte Auth désigné doit être confirmé et son profil actif';
  END IF;

  SELECT id INTO STRICT admin_role_id FROM public.roles
  WHERE code = 'admin' AND is_system AND is_active AND is_admin;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_id AND is_platform_admin) THEN
    -- The first assignment is the only case without an existing platform admin.
    ALTER TABLE public.profiles DISABLE TRIGGER trg_guard_platform_admin_change;
    UPDATE public.profiles SET is_platform_admin = true, updated_at = now()
      WHERE id = admin_id;
    ALTER TABLE public.profiles ENABLE TRIGGER trg_guard_platform_admin_change;
  END IF;

  IF NOT public.is_platform_admin(admin_id) THEN
    RAISE EXCEPTION 'Attribution du rôle plateforme non confirmée';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  UPDATE public.profiles SET role_id = admin_role_id, updated_at = now()
    WHERE id = admin_id AND role_id IS DISTINCT FROM admin_role_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_id AND role_id = admin_role_id) THEN
    RAISE EXCEPTION 'Attribution du rôle administrateur non confirmée';
  END IF;
END
$bootstrap$;

COMMIT;
