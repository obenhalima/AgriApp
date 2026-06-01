-- ============================================================
-- Migration 045 — Table de paramètres globaux (app_settings)
--
-- Stocke les paramètres organisationnels :
--   - 'organization' : nom du domaine, adresse, contact (en-têtes factures)
--   - 'current_campaign_id' : la campagne marquée comme "live" dans la UI
--
-- Pattern key-value JSONB : facilement extensible, pas besoin de migration
-- pour ajouter de nouveaux paramètres.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- ─── Initial : valeurs par défaut ────────────────────────────
INSERT INTO app_settings (key, value, description)
VALUES (
  'organization',
  jsonb_build_object(
    'name', 'Domaine BENHALIMA',
    'tagline', 'Production maraîchère',
    'address', NULL,
    'city', NULL,
    'country', 'Maroc',
    'phone', NULL,
    'email', NULL,
    'website', NULL,
    'tax_id', NULL,
    'logo_url', NULL
  ),
  'Informations affichées dans les en-têtes des factures, bordereaux et documents imprimables'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, description)
VALUES (
  'current_campaign_id',
  jsonb_build_object('id', NULL),
  'ID de la campagne marquée comme "live" dans la UI (badge Topbar, filtres par défaut). NULL = auto-détection via status=en_cours.'
)
ON CONFLICT (key) DO NOTHING;

-- ─── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_app_settings_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_update ON app_settings;
CREATE TRIGGER trg_app_settings_update
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION trg_app_settings_updated();

-- ─── RLS : lecture authenticated, écriture admin uniquement ───
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_app_settings" ON app_settings;
CREATE POLICY "auth_read_app_settings" ON app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_app_settings" ON app_settings;
CREATE POLICY "admin_write_app_settings" ON app_settings
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ─── Realtime ────────────────────────────────────────────────
-- Pour que la UI se mette à jour quand un admin change le nom du domaine
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE app_settings IS
'Paramètres globaux de l''application (clé-valeur JSONB). Lecture publique, écriture admin.';
