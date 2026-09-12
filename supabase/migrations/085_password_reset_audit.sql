-- Migration 085 — Audit des réinitialisations de mot de passe demandées par un administrateur
BEGIN;
CREATE TABLE public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'envoye' CHECK(delivery_status IN ('envoye','echec')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_target ON public.password_reset_requests(target_user_id,requested_at DESC);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY password_reset_audit_select ON public.password_reset_requests FOR SELECT TO authenticated
USING(public.is_platform_admin(auth.uid()) OR (domain_id IS NOT NULL AND public.is_domain_admin(domain_id,auth.uid())));
COMMIT;
