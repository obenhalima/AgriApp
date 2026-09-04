-- Gestion atomique des domaines autorisés d'un utilisateur.
CREATE OR REPLACE FUNCTION public.set_user_domain_memberships(
  p_user_id UUID,
  p_memberships JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_domain_id UUID;
  v_role_id UUID;
  v_active_count INTEGER;
  v_default_count INTEGER;
  v_target_active BOOLEAN;
  v_target_platform_admin BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès réservé au super-administrateur plateforme';
  END IF;

  SELECT is_active, is_platform_admin INTO v_target_active, v_target_platform_admin
  FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF jsonb_typeof(COALESCE(p_memberships, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'La liste des domaines est invalide';
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE((x->>'is_active')::boolean, TRUE)),
         count(*) FILTER (WHERE COALESCE((x->>'is_default')::boolean, FALSE))
  INTO v_active_count, v_default_count
  FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb)) x;

  IF v_target_active AND NOT v_target_platform_admin AND v_active_count = 0 THEN
    RAISE EXCEPTION 'Un utilisateur actif doit appartenir à au moins un domaine';
  END IF;
  IF v_default_count > 1 THEN
    RAISE EXCEPTION 'Un seul domaine par défaut est autorisé';
  END IF;

  DELETE FROM public.domain_memberships WHERE user_id = p_user_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb))
  LOOP
    v_domain_id := (v_item->>'domain_id')::uuid;
    v_role_id := (v_item->>'role_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.domains WHERE id = v_domain_id AND is_active) THEN
      RAISE EXCEPTION 'Domaine invalide ou inactif';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_role_id AND is_active) THEN
      RAISE EXCEPTION 'Rôle invalide ou inactif';
    END IF;
    INSERT INTO public.domain_memberships(domain_id, user_id, role_id, is_active, is_default, activated_at)
    VALUES (
      v_domain_id, p_user_id, v_role_id,
      COALESCE((v_item->>'is_active')::boolean, TRUE),
      COALESCE((v_item->>'is_default')::boolean, FALSE),
      CASE WHEN COALESCE((v_item->>'is_active')::boolean, TRUE) THEN NOW() ELSE NULL END
    );
  END LOOP;

  IF v_active_count > 0 AND v_default_count = 0 THEN
    UPDATE public.domain_memberships
    SET is_default = TRUE, updated_at = NOW()
    WHERE id = (
      SELECT id FROM public.domain_memberships
      WHERE user_id = p_user_id AND is_active
      ORDER BY created_at LIMIT 1
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_domain_memberships(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_domain_memberships(UUID, JSONB) TO authenticated, service_role;
