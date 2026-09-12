-- Vérifications manuelles après application de la migration 085.
SELECT to_regclass('public.password_reset_requests') AS password_reset_requests_table;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'password_reset_requests'
ORDER BY policyname;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'password_reset_requests'
ORDER BY indexname;
