-- ============================================================
-- Migration 057 — Traçabilité du récolteur (CA par utilisateur)
--
-- Qui a saisi la récolte ? Sert à calculer le « CA généré par moi ».
-- On stocke l'id du profil + un snapshot du nom (évite les jointures
-- avec la table legacy users dont la clé diffère de auth/profiles).
-- ============================================================

ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS recorded_by      UUID,           -- = profiles.id (auth.uid())
  ADD COLUMN IF NOT EXISTS recorded_by_name VARCHAR(255);   -- snapshot du nom au moment de la saisie

CREATE INDEX IF NOT EXISTS idx_harvests_recorded_by ON harvests(recorded_by);

COMMENT ON COLUMN harvests.recorded_by IS 'Profil (auth) qui a saisi la récolte. Sert à attribuer le CA généré.';
