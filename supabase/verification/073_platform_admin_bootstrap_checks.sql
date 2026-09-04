-- Contrôles en lecture seule après migration 073.

-- Attendu : une ligne active avec is_platform_admin = true.
SELECT id, email, full_name, is_active, is_platform_admin
FROM public.profiles
WHERE lower(email) = 'agenttest@test.com';

-- Attendu : true.
SELECT public.is_platform_admin(p.id) AS helper_returns_true
FROM public.profiles p
WHERE lower(p.email) = 'agenttest@test.com';

-- Inventaire des super-administrateurs plateforme.
SELECT id, email, full_name, is_active
FROM public.profiles
WHERE is_platform_admin = TRUE
ORDER BY email;

-- Vérifier la présence de la politique durcie.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname = 'profiles_self_update';

-- Vérifier la garde de colonne contre les autres politiques permissives.
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
  AND trigger_name = 'trg_guard_platform_admin_change';
