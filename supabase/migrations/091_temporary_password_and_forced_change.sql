-- Migration 091 — Mot de passe temporaire administrateur et changement obligatoire
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password
  ON public.profiles(must_change_password) WHERE must_change_password;

CREATE TABLE IF NOT EXISTS public.temporary_password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('applique','echec')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temporary_password_resets_target
  ON public.temporary_password_resets(target_user_id,requested_at DESC);

ALTER TABLE public.temporary_password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS temporary_password_resets_select ON public.temporary_password_resets;
CREATE POLICY temporary_password_resets_select ON public.temporary_password_resets
FOR SELECT TO authenticated
USING(public.is_platform_admin(auth.uid()) OR (domain_id IS NOT NULL AND public.is_domain_admin(domain_id,auth.uid())));

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Force la page de changement de mot de passe avant tout accès fonctionnel.';
COMMENT ON TABLE public.temporary_password_resets IS
  'Audit des réinitialisations administratives. Le mot de passe temporaire n’est jamais stocké.';

COMMIT;
