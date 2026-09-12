-- Lecture seule après migration 113. Ne consomme aucun code et n'en affiche aucun.
SELECT tablename,policyname,cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('chatbot_users','chatbot_messages');

SELECT
 has_function_privilege('authenticated','public.invite_telegram_worker(uuid,uuid,text)','EXECUTE') AS admin_rpc_available,
 NOT has_function_privilege('authenticated','public.enroll_telegram_user(text,text,text)','EXECUTE') AS enrollment_denied_to_browser,
 NOT has_function_privilege('anon','public.telegram_access_context(text)','EXECUTE') AS context_denied_to_public,
 has_function_privilege('service_role','public.enroll_telegram_user(text,text,text)','EXECUTE') AS webhook_rpc_available,
 NOT has_table_privilege('authenticated','public.chatbot_users','UPDATE') AS direct_update_denied;
-- Toutes les colonnes ci-dessus doivent être true.

SELECT count(*) AS historical_accounts_to_reinvite
FROM public.chatbot_users WHERE is_active AND (domain_id IS NULL OR farm_id IS NULL);

-- Anomalies de rattachement : ces comptes doivent être refusés par /statut.
SELECT u.id,u.domain_id,u.farm_id,u.worker_id
FROM public.chatbot_users u
LEFT JOIN public.workers w ON w.id=u.worker_id
LEFT JOIN public.teams t ON t.id=w.team_id
LEFT JOIN public.farms f ON f.id=COALESCE(w.farm_id,t.farm_id)
LEFT JOIN public.domains d ON d.id=f.domain_id
WHERE u.is_active AND u.enrolled_at IS NOT NULL
AND (NOT COALESCE(w.is_active,FALSE) OR NOT COALESCE(f.is_active,FALSE)
  OR NOT COALESCE(d.is_active,FALSE) OR u.farm_id IS DISTINCT FROM f.id
  OR u.domain_id IS DISTINCT FROM f.domain_id);
