-- Migration 084 — Administration des utilisateurs limitée aux sociétés administrées

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_profile(p_target UUID,p_actor UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_platform_admin(p_actor) OR EXISTS(
    SELECT 1 FROM domain_memberships actor_dm
    JOIN roles actor_role ON actor_role.id=actor_dm.role_id AND actor_role.is_admin AND actor_role.is_active
    JOIN domain_memberships target_dm ON target_dm.domain_id=actor_dm.domain_id AND target_dm.user_id=p_target AND target_dm.is_active
    WHERE actor_dm.user_id=p_actor AND actor_dm.is_active
  );
$$;

DROP POLICY IF EXISTS profiles_read ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_scoped_select ON public.profiles;
DROP POLICY IF EXISTS profiles_scoped_update ON public.profiles;
DROP POLICY IF EXISTS profiles_platform_all ON public.profiles;
CREATE POLICY profiles_scoped_select ON public.profiles FOR SELECT TO authenticated
  USING(id=auth.uid() OR public.can_manage_profile(id,auth.uid()));
CREATE POLICY profiles_scoped_update ON public.profiles FOR UPDATE TO authenticated
  USING(public.can_manage_profile(id,auth.uid())) WITH CHECK(public.can_manage_profile(id,auth.uid()));
CREATE POLICY profiles_platform_all ON public.profiles FOR ALL TO authenticated
  USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_profile_global_security()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.role_id IS DISTINCT FROM NEW.role_id
     AND COALESCE(auth.jwt()->>'role','')<>'service_role'
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Le rôle global est réservé au super-administrateur';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_global_security ON public.profiles;
CREATE TRIGGER trg_guard_profile_global_security BEFORE UPDATE OF role_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_global_security();

CREATE OR REPLACE FUNCTION public.list_managed_user_profiles()
RETURNS TABLE(id UUID,email VARCHAR,full_name VARCHAR,role_id UUID,phone VARCHAR,is_active BOOLEAN,is_platform_admin BOOLEAN,last_login_at TIMESTAMPTZ,created_at TIMESTAMPTZ,role_name VARCHAR,role_code VARCHAR,is_admin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT p.id,p.email,p.full_name,p.role_id,p.phone,p.is_active,p.is_platform_admin,p.last_login_at,p.created_at,
    r.name,r.code,COALESCE(r.is_admin,FALSE)
  FROM profiles p LEFT JOIN roles r ON r.id=p.role_id
  WHERE public.is_platform_admin(auth.uid()) OR public.can_manage_profile(p.id,auth.uid())
  ORDER BY p.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_managed_user_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_managed_user_profiles() TO authenticated;

COMMIT;
