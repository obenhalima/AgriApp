BEGIN;
ALTER FUNCTION public.mobile_can_review(TEXT,UUID,UUID) RENAME TO mobile_can_review_before_session_guard;
REVOKE ALL ON FUNCTION public.mobile_can_review_before_session_guard(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.mobile_can_review(p_kind TEXT,p_id UUID,p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND is_active AND NOT coalesce(must_change_password,false))
 AND public.mobile_can_review_before_session_guard(p_kind,p_id,p_user);
$$;
REVOKE ALL ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) TO service_role;
ALTER TABLE public.mobile_push_subscriptions ADD CONSTRAINT push_keys_shape CHECK (
 length(endpoint) BETWEEN 15 AND 4096 AND jsonb_typeof(keys)='object'
 AND coalesce(keys->>'p256dh','') ~ '^[A-Za-z0-9_-]{20,200}$'
 AND coalesce(keys->>'auth','') ~ '^[A-Za-z0-9_-]{20,200}$'
);
NOTIFY pgrst,'reload schema';
COMMIT;
