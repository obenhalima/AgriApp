-- ============================================================
-- RLS POLICIES pour le système de permissions — Phase 3
-- ============================================================

-- Helper : vérifier si un utilisateur est admin (rôle is_admin=TRUE)
CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.id = p_user_id AND p.is_active = TRUE AND r.is_admin = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- roles, modules, permissions, role_permissions
-- Lecture : tout utilisateur connecté
-- Écriture : admin seulement
-- ------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Pour l'instant, on ouvre la lecture en public (le service role des Edge Functions bypasse).
-- Quand l'auth sera pleinement déployée, on remplacera USING (TRUE) par USING (auth.uid() IS NOT NULL).

CREATE POLICY "roles_read" ON roles FOR SELECT USING (TRUE);
CREATE POLICY "modules_read" ON modules FOR SELECT USING (TRUE);
CREATE POLICY "permissions_read" ON permissions FOR SELECT USING (TRUE);
CREATE POLICY "role_permissions_read" ON role_permissions FOR SELECT USING (TRUE);

CREATE POLICY "roles_write_admin" ON roles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "modules_write_admin" ON modules FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "permissions_write_admin" ON permissions FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "role_permissions_write_admin" ON role_permissions FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ------------------------------------------------------------
-- profiles
-- Lecture : tout utilisateur connecté peut lire les profils actifs (pour affichage d'auteurs, etc.)
-- Écriture : chaque user peut modifier son propre profil ; admin peut tout
-- ------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (TRUE);

CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role_id IS NOT DISTINCT FROM (SELECT role_id FROM profiles WHERE id = auth.uid()));
-- L'utilisateur ne peut pas changer son propre role_id ; seul admin peut.

CREATE POLICY "profiles_admin_all" ON profiles FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
