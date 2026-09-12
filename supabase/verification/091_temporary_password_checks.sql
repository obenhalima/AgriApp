SELECT column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('must_change_password','password_changed_at')
ORDER BY column_name;

SELECT to_regclass('public.temporary_password_resets') AS audit_table;

SELECT policyname,cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='temporary_password_resets';
