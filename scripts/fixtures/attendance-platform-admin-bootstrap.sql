ALTER TABLE public.profiles ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT is_platform_admin FROM profiles WHERE id=p_user_id AND is_active),false)
$$;
CREATE OR REPLACE FUNCTION public.is_domain_member(d uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT d='11111111-1111-4111-8111-111111111111'::uuid AND u='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid AND coalesce(current_setting('test.member',true),'yes')<>'no'
$$;
CREATE OR REPLACE FUNCTION public.has_domain_permission(d uuid,u uuid,m text,a text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_platform_admin(u) OR coalesce(current_setting('test.allowed',true),'yes')='yes'
$$;
