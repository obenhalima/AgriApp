SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public' AND routine_name IN ('can_manage_profile','list_managed_user_profiles')
ORDER BY routine_name;

SELECT policyname,cmd FROM pg_policies
WHERE schemaname='public' AND tablename='profiles'
ORDER BY policyname;

SELECT trigger_name FROM information_schema.triggers
WHERE trigger_schema='public' AND event_object_table='profiles'
  AND trigger_name='trg_guard_profile_global_security';
