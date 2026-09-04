-- ============================================================
-- 072_multi_domain_foundation.sql
-- Fondation multi-domaines FarmPilot (migration A)
--
-- Cette migration est additive : elle ne modifie pas encore les tables
-- métier et ne remplace pas les politiques RLS existantes.
-- Elle crée :
--   - domains
--   - domain_memberships
--   - profiles.is_platform_admin
--   - le domaine initial DOM-BENHALIMA
--   - les appartenances issues de profiles.role_id
--   - les helpers de sécurité multi-domaines
--
-- IMPORTANT : aucun utilisateur ne devient automatiquement
-- super-administrateur de la plateforme.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Préconditions
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Migration 072 impossible : table public.profiles absente';
  END IF;

  IF to_regclass('public.roles') IS NULL THEN
    RAISE EXCEPTION 'Migration 072 impossible : table public.roles absente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.is_active = TRUE
      AND p.role_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Migration 072 interrompue : au moins un profil actif ne possède aucun rôle';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.is_active = TRUE
      AND r.is_active = FALSE
  ) THEN
    RAISE EXCEPTION
      'Migration 072 interrompue : au moins un profil actif utilise un rôle inactif';
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Profil plateforme
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Administration globale de la plateforme FarmPilot. Ne doit jamais être déduite du rôle admin d''un domaine.';

-- ────────────────────────────────────────────────────────────
-- 3. Domaines
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.domains (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code        VARCHAR(50)  NOT NULL,
  name        VARCHAR(180) NOT NULL,
  legal_name  VARCHAR(255),
  address     TEXT,
  city        VARCHAR(100),
  region      VARCHAR(100),
  country     VARCHAR(100) NOT NULL DEFAULT 'Maroc',
  currency    VARCHAR(3)   NOT NULL DEFAULT 'MAD',
  timezone    VARCHAR(80)  NOT NULL DEFAULT 'Africa/Casablanca',
  locale      VARCHAR(10)  NOT NULL DEFAULT 'fr-MA',
  logo_url    TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT domains_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT domains_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT domains_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT domains_timezone_not_blank CHECK (btrim(timezone) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_code_upper
  ON public.domains (upper(code));

COMMENT ON TABLE public.domains IS
  'Clients/tenants FarmPilot. Un domaine possède une ou plusieurs fermes.';

-- ────────────────────────────────────────────────────────────
-- 4. Appartenances utilisateur ↔ domaine
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.domain_memberships (
  id            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  domain_id     UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  invited_at    TIMESTAMPTZ,
  activated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT domain_memberships_domain_user_unique UNIQUE (domain_id, user_id),
  CONSTRAINT domain_memberships_default_must_be_active
    CHECK (NOT is_default OR is_active)
);

CREATE INDEX IF NOT EXISTS idx_domain_memberships_user
  ON public.domain_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_domain_memberships_domain
  ON public.domain_memberships(domain_id);

CREATE INDEX IF NOT EXISTS idx_domain_memberships_role
  ON public.domain_memberships(role_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_memberships_one_default
  ON public.domain_memberships(user_id)
  WHERE is_default = TRUE;

COMMENT ON TABLE public.domain_memberships IS
  'Appartenance d''un utilisateur à un domaine avec rôle propre à ce domaine.';

-- ────────────────────────────────────────────────────────────
-- 5. Domaine initial et backfill
-- ────────────────────────────────────────────────────────────

INSERT INTO public.domains (
  code, name, legal_name, country, currency, timezone, locale, is_active
)
VALUES (
  'DOM-BENHALIMA',
  'Domaine BENHALIMA',
  'Domaine BENHALIMA',
  'Maroc',
  'MAD',
  'Africa/Casablanca',
  'fr-MA',
  TRUE
)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_domain_id UUID;
BEGIN
  SELECT d.id
  INTO v_domain_id
  FROM public.domains d
  WHERE upper(d.code) = 'DOM-BENHALIMA';

  IF v_domain_id IS NULL THEN
    RAISE EXCEPTION 'Migration 072 impossible : domaine DOM-BENHALIMA introuvable';
  END IF;

  INSERT INTO public.domain_memberships (
    domain_id,
    user_id,
    role_id,
    is_active,
    is_default,
    invited_at,
    activated_at
  )
  SELECT
    v_domain_id,
    p.id,
    p.role_id,
    p.is_active,
    p.is_active,
    p.invited_at,
    COALESCE(p.activated_at, CASE WHEN p.is_active THEN NOW() ELSE NULL END)
  FROM public.profiles p
  WHERE p.role_id IS NOT NULL
  ON CONFLICT (domain_id, user_id) DO NOTHING;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Helpers de sécurité
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.is_platform_admin
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.is_active = TRUE
  ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_domain_member(
  p_domain_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.domain_memberships dm
    JOIN public.domains d ON d.id = dm.domain_id
    JOIN public.profiles p ON p.id = dm.user_id
    WHERE dm.domain_id = p_domain_id
      AND dm.user_id = p_user_id
      AND dm.is_active = TRUE
      AND d.is_active = TRUE
      AND p.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_domain_admin(
  p_domain_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.domain_memberships dm
      JOIN public.domains d ON d.id = dm.domain_id
      JOIN public.profiles p ON p.id = dm.user_id
      JOIN public.roles r ON r.id = dm.role_id
      WHERE dm.domain_id = p_domain_id
        AND dm.user_id = p_user_id
        AND dm.is_active = TRUE
        AND d.is_active = TRUE
        AND p.is_active = TRUE
        AND r.is_active = TRUE
        AND r.is_admin = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_domain_permission(
  p_domain_id UUID,
  p_user_id UUID,
  p_module_code TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(p_user_id)
    OR public.is_domain_admin(p_domain_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.domain_memberships dm
      JOIN public.domains d ON d.id = dm.domain_id
      JOIN public.profiles pr ON pr.id = dm.user_id
      JOIN public.roles r ON r.id = dm.role_id
      JOIN public.role_permissions rp
        ON rp.role_id = r.id
       AND rp.granted = TRUE
      JOIN public.permissions pe ON pe.id = rp.permission_id
      JOIN public.modules m ON m.id = pe.module_id
      WHERE dm.domain_id = p_domain_id
        AND dm.user_id = p_user_id
        AND dm.is_active = TRUE
        AND d.is_active = TRUE
        AND pr.is_active = TRUE
        AND r.is_active = TRUE
        AND m.is_active = TRUE
        AND m.code = p_module_code
        AND pe.action::TEXT = p_action
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_domain_ids()
RETURNS TABLE(domain_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dm.domain_id
  FROM public.domain_memberships dm
  JOIN public.domains d ON d.id = dm.domain_id
  JOIN public.profiles p ON p.id = dm.user_id
  WHERE dm.user_id = auth.uid()
    AND dm.is_active = TRUE
    AND d.is_active = TRUE
    AND p.is_active = TRUE
  ORDER BY dm.is_default DESC, dm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_domain_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_domain_admin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_domain_permission(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_domain_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_domain_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_domain_admin(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_domain_permission(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_domain_ids() TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 7. RLS du socle
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domains_member_select ON public.domains;
DROP POLICY IF EXISTS domains_platform_all ON public.domains;

CREATE POLICY domains_member_select
ON public.domains
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_domain_member(id, auth.uid())
);

CREATE POLICY domains_platform_all
ON public.domains
FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS memberships_self_select ON public.domain_memberships;
DROP POLICY IF EXISTS memberships_domain_admin_select ON public.domain_memberships;
DROP POLICY IF EXISTS memberships_domain_admin_insert ON public.domain_memberships;
DROP POLICY IF EXISTS memberships_domain_admin_update ON public.domain_memberships;
DROP POLICY IF EXISTS memberships_domain_admin_delete ON public.domain_memberships;
DROP POLICY IF EXISTS memberships_platform_all ON public.domain_memberships;

CREATE POLICY memberships_self_select
ON public.domain_memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY memberships_domain_admin_select
ON public.domain_memberships
FOR SELECT
TO authenticated
USING (public.is_domain_admin(domain_id, auth.uid()));

CREATE POLICY memberships_domain_admin_insert
ON public.domain_memberships
FOR INSERT
TO authenticated
WITH CHECK (public.is_domain_admin(domain_id, auth.uid()));

CREATE POLICY memberships_domain_admin_update
ON public.domain_memberships
FOR UPDATE
TO authenticated
USING (public.is_domain_admin(domain_id, auth.uid()))
WITH CHECK (public.is_domain_admin(domain_id, auth.uid()));

CREATE POLICY memberships_domain_admin_delete
ON public.domain_memberships
FOR DELETE
TO authenticated
USING (public.is_domain_admin(domain_id, auth.uid()));

CREATE POLICY memberships_platform_all
ON public.domain_memberships
FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Droits de table : la RLS reste la frontière effective.
GRANT SELECT ON public.domains TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domains TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 8. Assertions post-migration
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_active_profiles BIGINT;
  v_active_memberships BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_active_profiles
  FROM public.profiles
  WHERE is_active = TRUE;

  SELECT COUNT(*)
  INTO v_active_memberships
  FROM public.domain_memberships dm
  JOIN public.domains d ON d.id = dm.domain_id
  WHERE upper(d.code) = 'DOM-BENHALIMA'
    AND dm.is_active = TRUE;

  IF v_active_memberships <> v_active_profiles THEN
    RAISE EXCEPTION
      'Migration 072 incohérente : % profils actifs mais % appartenances actives DOM-BENHALIMA',
      v_active_profiles,
      v_active_memberships;
  END IF;

  IF EXISTS (
    SELECT user_id
    FROM public.domain_memberships
    WHERE is_default = TRUE
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 072 incohérente : plusieurs domaines par défaut pour un utilisateur';
  END IF;

END;
$$;

COMMIT;
