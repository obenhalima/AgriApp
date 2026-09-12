-- Migration 083 — Gestion sécurisée d'une affectation utilisateur par l'admin du domaine

BEGIN;

CREATE OR REPLACE FUNCTION public.set_user_membership_in_managed_domain(
  p_user_id UUID,
  p_domain_id UUID,
  p_role_id UUID,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_target_active BOOLEAN; v_target_platform BOOLEAN; v_was_default BOOLEAN; v_active_count INTEGER;
BEGIN
  IF NOT public.is_domain_admin(p_domain_id,auth.uid()) THEN
    RAISE EXCEPTION 'Administration refusée pour ce domaine';
  END IF;
  IF p_user_id=auth.uid() AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Un administrateur ne peut pas modifier sa propre affectation';
  END IF;
  SELECT is_active,is_platform_admin INTO v_target_active,v_target_platform FROM profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable'; END IF;
  IF v_target_platform AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Un super-administrateur ne peut être modifié que par un super-administrateur';
  END IF;
  IF p_enabled AND NOT EXISTS(SELECT 1 FROM roles WHERE id=p_role_id AND is_active) THEN
    RAISE EXCEPTION 'Rôle invalide ou inactif';
  END IF;

  SELECT COALESCE(is_default,FALSE) INTO v_was_default FROM domain_memberships
  WHERE domain_id=p_domain_id AND user_id=p_user_id;

  IF p_enabled THEN
    INSERT INTO domain_memberships(domain_id,user_id,role_id,is_active,is_default,activated_at)
    VALUES(p_domain_id,p_user_id,p_role_id,TRUE,
      NOT EXISTS(SELECT 1 FROM domain_memberships WHERE user_id=p_user_id AND is_active),NOW())
    ON CONFLICT(domain_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,is_active=TRUE,
      activated_at=COALESCE(domain_memberships.activated_at,NOW()),updated_at=NOW();
  ELSE
    UPDATE domain_memberships SET is_active=FALSE,is_default=FALSE,updated_at=NOW()
    WHERE domain_id=p_domain_id AND user_id=p_user_id;
    SELECT count(*) INTO v_active_count FROM domain_memberships WHERE user_id=p_user_id AND is_active;
    IF v_target_active AND NOT v_target_platform AND v_active_count=0 THEN
      RAISE EXCEPTION 'Un utilisateur actif doit conserver au moins un domaine';
    END IF;
    IF v_was_default THEN
      UPDATE domain_memberships SET is_default=TRUE,updated_at=NOW()
      WHERE id=(SELECT id FROM domain_memberships WHERE user_id=p_user_id AND is_active ORDER BY created_at LIMIT 1);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_membership_in_managed_domain(UUID,UUID,UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_membership_in_managed_domain(UUID,UUID,UUID,BOOLEAN) TO authenticated;

COMMIT;
