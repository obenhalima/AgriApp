-- ============================================================
-- TOMATOPILOT — ACCES ADMINISTRES & MODULES
-- Version 1.1
-- ============================================================

-- Supabase Auth gere deja les mots de passe.
-- On rend donc le champ optionnel dans la table metier.
ALTER TABLE public.users
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN password_hash DROP NOT NULL;

-- Synchronisation entre auth.users et public.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    password_hash,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULL,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'responsable_ferme',
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_created();

-- Catalogue des modules applicatifs
CREATE TABLE IF NOT EXISTS public.app_modules (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  route VARCHAR(120) UNIQUE NOT NULL,
  section VARCHAR(100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.app_modules (code, label, route, section, sort_order)
VALUES
  ('dashboard', 'Tableau de bord', '/', NULL, 0),
  ('serres', 'Serres', '/serres', 'Exploitation', 10),
  ('varietes', 'Varietes', '/varietes', 'Exploitation', 20),
  ('campagnes', 'Campagnes', '/campagnes', 'Exploitation', 30),
  ('production', 'Suivi production', '/production', 'Production', 40),
  ('recoltes', 'Recoltes', '/recoltes', 'Production', 50),
  ('agronomie', 'Agronomie', '/agronomie', 'Production', 60),
  ('marches', 'Marches', '/marches', 'Commerce', 70),
  ('clients', 'Clients', '/clients', 'Commerce', 80),
  ('commandes', 'Commandes', '/commandes', 'Commerce', 90),
  ('factures', 'Factures', '/factures', 'Commerce', 100),
  ('fournisseurs', 'Fournisseurs', '/fournisseurs', 'Achats', 110),
  ('achats', 'Bons de commande', '/achats', 'Achats', 120),
  ('stocks', 'Stocks', '/stocks', 'Achats', 130),
  ('couts', 'Couts & Budget', '/couts', 'Finances', 140),
  ('marges', 'Marges', '/marges', 'Finances', 150),
  ('analytique', 'IA & Previsions', '/analytique', 'Finances', 160)
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  route = EXCLUDED.route,
  section = EXCLUDED.section,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

-- Acces aux modules par utilisateur
CREATE TABLE IF NOT EXISTS public.user_module_access (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL REFERENCES public.app_modules(code) ON DELETE CASCADE,
  can_access BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES public.users(id),
  PRIMARY KEY (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON public.user_module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_module ON public.user_module_access(module_key);

-- RLS sur les nouvelles tables
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_modules_select_authenticated ON public.app_modules;
CREATE POLICY app_modules_select_authenticated
ON public.app_modules
FOR SELECT
TO authenticated
USING (is_active = TRUE);

DROP POLICY IF EXISTS user_module_access_select_self ON public.user_module_access;
CREATE POLICY user_module_access_select_self
ON public.user_module_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Helper RPC pour recuperer les modules du user connecte
CREATE OR REPLACE FUNCTION public.get_my_module_keys()
RETURNS TABLE (module_key VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uma.module_key
  FROM public.user_module_access uma
  WHERE uma.user_id = auth.uid()
    AND uma.can_access = TRUE
  ORDER BY uma.module_key;
$$;
