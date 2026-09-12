SELECT jsonb_build_object(
 'inbox',to_regprocedure('public.mobile_approval_items()') IS NOT NULL,
 'decision',to_regprocedure('public.mobile_review(text,uuid,integer,boolean,text)') IS NOT NULL,
 'queue',to_regprocedure('public.mobile_claim_notifications()') IS NOT NULL,
 'temporary_password_guard',to_regprocedure('public.mobile_can_review_before_session_guard(text,uuid,uuid)') IS NOT NULL,
 'tenant_policy_guard',position('p.process_code=a.process_code' IN pg_get_functiondef('public.mobile_can_review(text,uuid,uuid)'::regprocedure))>0,
 'anonymous_queue_access',has_function_privilege('anon','public.mobile_claim_notifications()','EXECUTE'),
 'browser_queue_access',has_function_privilege('authenticated','public.mobile_claim_notifications()','EXECUTE'),
 'push_devices',(SELECT count(*) FROM mobile_push_subscriptions),
 'telegram_links',(SELECT count(*) FROM mobile_telegram_links WHERE chat_id IS NOT NULL),
 'notifications_sent',(SELECT count(*) FROM mobile_notifications WHERE sent_at IS NOT NULL)
) AS mobile_status;
