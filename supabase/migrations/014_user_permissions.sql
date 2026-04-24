-- ============================================================
-- PHASE 3 — GESTION DES UTILISATEURS, RÔLES ET PERMISSIONS
--
-- Modèle RBAC (Role-Based Access Control) :
--   profiles ← auth.users (1-1)
--   roles              : types de profils (Admin, Direction, Agronome...)
--   modules            : hiérarchie des fonctionnalités (items sidebar)
--   permissions        : atomes (module × action), ex: "couts.view"
--   role_permissions   : matrice rôle × permission
--
-- Actions standards : view / create / edit / delete / admin
-- Un rôle 'is_admin=TRUE' bypass toutes les vérifications.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUM des actions
-- ------------------------------------------------------------
CREATE TYPE permission_action AS ENUM ('view', 'create', 'edit', 'delete', 'admin');

-- ------------------------------------------------------------
-- 2. ROLES
-- ------------------------------------------------------------
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- rôle par défaut, non supprimable
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,   -- bypass total
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_roles_code ON roles(code);

-- ------------------------------------------------------------
-- 3. MODULES (hiérarchiques)
-- ------------------------------------------------------------
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  icon VARCHAR(10),
  color VARCHAR(30),
  path VARCHAR(100),          -- route Next.js (ex: /couts)
  section VARCHAR(50),        -- section sidebar (PILOTAGE, COMMERCE...)
  display_order INTEGER NOT NULL DEFAULT 99,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modules_parent ON modules(parent_id);
CREATE INDEX idx_modules_section ON modules(section);

-- ------------------------------------------------------------
-- 4. PERMISSIONS (module × action)
-- ------------------------------------------------------------
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  action permission_action NOT NULL,
  code VARCHAR(100) NOT NULL,     -- `${module.code}.${action}` pour recherche rapide
  UNIQUE (module_id, action),
  UNIQUE (code)
);

CREATE INDEX idx_permissions_module ON permissions(module_id);

-- ------------------------------------------------------------
-- 5. ROLE_PERMISSIONS
-- ------------------------------------------------------------
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ------------------------------------------------------------
-- 6. PROFILES (extension auth.users)
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(150),
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- ------------------------------------------------------------
-- 7. TRIGGER auto-création du profil à la signup
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- SEEDS
-- ============================================================

-- ----- 7 rôles système -----
INSERT INTO roles (code, name, description, is_system, is_admin) VALUES
  ('admin',            'Administrateur',         'Accès complet — gère utilisateurs, rôles, tous modules',                  TRUE, TRUE),
  ('direction',        'Direction',              'Vision globale, rapports, validation budgets',                            TRUE, FALSE),
  ('chef_exploitation','Chef d''exploitation',   'Gère la production au quotidien (hors finances sensibles)',               TRUE, FALSE),
  ('agronome',         'Agronome',               'Production, récoltes, agronomie, variétés, campagnes',                    TRUE, FALSE),
  ('commercial',       'Responsable commercial', 'Marchés, clients, commandes, factures',                                   TRUE, FALSE),
  ('comptable',        'Comptable',              'Coûts, budgets, plan comptable, compte d''exploitation',                  TRUE, FALSE),
  ('operateur',        'Opérateur',              'Saisie limitée (récoltes, production)',                                   TRUE, FALSE);

-- ----- Modules (niveau 1 = sections, niveau 2 = items) -----
-- Pour simplifier, on considère chaque item de sidebar comme un module distinct avec son path.
-- La hiérarchie parent_id est réservée aux sous-modules.
INSERT INTO modules (code, label, icon, color, path, section, display_order) VALUES
  -- PILOTAGE
  ('dashboard',            'Dashboard',           '📊', '#6366f1', '/',              'PILOTAGE',     10),
  ('recoltes',             'Récoltes',            '🌿', '#10b981', '/recoltes',      'PILOTAGE',     20),
  ('production',           'Production',          '⚙️', '#f59e0b', '/production',    'PILOTAGE',     30),
  ('agronomie',            'Agronomie',           '🔬', '#06b6d4', '/agronomie',     'PILOTAGE',     40),
  -- COMMERCE
  ('marches',              'Marchés',             '🌍', '#3b82f6', '/marches',       'COMMERCE',     10),
  ('clients',              'Clients',             '🤝', '#8b5cf6', '/clients',       'COMMERCE',     20),
  ('commandes',            'Commandes',           '📋', '#ec4899', '/commandes',     'COMMERCE',     30),
  ('factures',             'Factures',            '🧾', '#f43f5e', '/factures',      'COMMERCE',     40),
  -- EXPLOITATION
  ('fermes',               'Fermes',              '🏭', '#64748b', '/fermes',        'EXPLOITATION', 10),
  ('serres',               'Serres',              '🏗️', '#0ea5e9', '/serres',        'EXPLOITATION', 20),
  ('varietes',             'Variétés',            '🧬', '#a855f7', '/varietes',      'EXPLOITATION', 30),
  ('campagnes',            'Campagnes',           '📅', '#22c55e', '/campagnes',     'EXPLOITATION', 40),
  -- RESSOURCES
  ('fournisseurs',         'Fournisseurs',        '🏢', '#f97316', '/fournisseurs',  'RESSOURCES',   10),
  ('achats',               'Achats',              '🛒', '#eab308', '/achats',        'RESSOURCES',   20),
  ('stocks',               'Stocks',              '📦', '#14b8a6', '/stocks',        'RESSOURCES',   30),
  -- FINANCES
  ('couts',                'Coûts',               '💰', '#f59e0b', '/couts',         'FINANCES',     10),
  ('marges',               'Marges',              '📈', '#10b981', '/marges',        'FINANCES',     20),
  ('analytique',           'IA & Prévisions',     '🤖', '#6366f1', '/analytique',    'FINANCES',     30),
  -- PARAMÉTRAGE
  ('plan_comptable',       'Plan comptable',      '📒', '#0ea5e9', '/admin/account-categories', 'PARAMETRAGE', 10),
  ('budgets',              'Budgets',             '💼', '#8b5cf6', '/admin/budgets', 'PARAMETRAGE', 20),
  ('compte_exploitation',  'Compte d''exploitation','📈', '#10b981', '/admin/compte-exploitation', 'PARAMETRAGE', 30),
  ('workflows',            'Workflows',           '🔀', '#64748b', '/admin/workflows', 'PARAMETRAGE', 40),
  -- ADMINISTRATION (nouveau)
  ('users',                'Utilisateurs',        '👥', '#ef4444', '/admin/users',   'ADMINISTRATION', 10),
  ('roles',                'Rôles & Permissions', '🔐', '#ef4444', '/admin/roles',   'ADMINISTRATION', 20);

-- ----- Générer toutes les permissions : chaque module × 5 actions -----
INSERT INTO permissions (module_id, action, code)
SELECT m.id, a.action, m.code || '.' || a.action
FROM modules m
CROSS JOIN (
  VALUES ('view'::permission_action), ('create'::permission_action), ('edit'::permission_action), ('delete'::permission_action), ('admin'::permission_action)
) AS a(action);

-- ----- Matrice role × permission -----
-- NOTE : le rôle 'admin' a is_admin=TRUE qui bypass, donc pas besoin de lignes ici.
-- On crée les lignes pour les autres rôles selon un mapping métier.

-- Helper : fonction pour ajouter des permissions à un rôle
CREATE OR REPLACE FUNCTION grant_role_permissions(
  p_role_code TEXT,
  p_module_codes TEXT[],
  p_actions permission_action[]
) RETURNS VOID AS $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE code = p_role_code;
  IF v_role_id IS NULL THEN RAISE NOTICE 'Role % introuvable', p_role_code; RETURN; END IF;

  INSERT INTO role_permissions (role_id, permission_id, granted)
  SELECT v_role_id, p.id, TRUE
  FROM permissions p
  JOIN modules m ON m.id = p.module_id
  WHERE m.code = ANY(p_module_codes)
    AND p.action = ANY(p_actions)
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- DIRECTION : voir tout + valider les budgets / factures
SELECT grant_role_permissions('direction',
  ARRAY['dashboard','recoltes','production','agronomie','marches','clients','commandes','factures','fermes','serres','varietes','campagnes','fournisseurs','achats','stocks','couts','marges','analytique','plan_comptable','budgets','compte_exploitation','workflows'],
  ARRAY['view'::permission_action]);
SELECT grant_role_permissions('direction',
  ARRAY['budgets','commandes','factures','compte_exploitation'],
  ARRAY['view'::permission_action,'create'::permission_action,'edit'::permission_action]);

-- CHEF D'EXPLOITATION : tout sauf finances sensibles
SELECT grant_role_permissions('chef_exploitation',
  ARRAY['dashboard','recoltes','production','agronomie','marches','clients','commandes','factures','fermes','serres','varietes','campagnes','fournisseurs','achats','stocks','couts','marges','plan_comptable','compte_exploitation','workflows'],
  ARRAY['view'::permission_action]);
SELECT grant_role_permissions('chef_exploitation',
  ARRAY['recoltes','production','agronomie','campagnes','fournisseurs','achats','stocks','commandes'],
  ARRAY['view'::permission_action,'create'::permission_action,'edit'::permission_action,'delete'::permission_action]);

-- AGRONOME : production + récoltes
SELECT grant_role_permissions('agronome',
  ARRAY['dashboard','recoltes','production','agronomie','varietes','campagnes','serres','stocks'],
  ARRAY['view'::permission_action,'create'::permission_action,'edit'::permission_action]);

-- COMMERCIAL : marchés + clients + commandes + factures
SELECT grant_role_permissions('commercial',
  ARRAY['dashboard','marches','clients','commandes','factures','recoltes','production'],
  ARRAY['view'::permission_action]);
SELECT grant_role_permissions('commercial',
  ARRAY['marches','clients','commandes','factures'],
  ARRAY['view'::permission_action,'create'::permission_action,'edit'::permission_action,'delete'::permission_action]);

-- COMPTABLE : couts + budgets + plan comptable + compte d'exploitation + factures
SELECT grant_role_permissions('comptable',
  ARRAY['dashboard','recoltes','achats','stocks'],
  ARRAY['view'::permission_action]);
SELECT grant_role_permissions('comptable',
  ARRAY['couts','budgets','plan_comptable','compte_exploitation','factures','marges'],
  ARRAY['view'::permission_action,'create'::permission_action,'edit'::permission_action,'delete'::permission_action]);

-- OPÉRATEUR : saisie récoltes + production uniquement
SELECT grant_role_permissions('operateur',
  ARRAY['dashboard','recoltes','production'],
  ARRAY['view'::permission_action,'create'::permission_action]);

-- Nettoyage : on peut garder la fonction pour pouvoir rejouer, ou la drop
-- DROP FUNCTION grant_role_permissions;
