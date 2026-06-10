-- ============================================================
-- Migration 054 — Récolte en plateaux (Lot 1)
--
-- Réalité terrain : au champ, le caporal ne connaît pas le poids réel.
-- Il compte des PLATEAUX (types variés, chacun ayant un poids théorique).
-- Le poids ESTIMÉ = Σ (nb plateaux × poids théorique du type).
-- Le poids RÉEL viendra de la pesée station (Lot 2).
--
-- Contenu :
--   1. Référentiel no-code 'tray_type' (poids théorique dans metadata.poids_kg)
--   2. Table harvest_tray_lines (lignes de plateaux par récolte)
--   3. harvests.estimated_kg (poids estimé total)
-- ============================================================

-- ─── 1. Référentiel des types de plateaux ───────────────────
-- (suppose migration 050 appliquée : tables reference_lists/values)
INSERT INTO reference_lists (key, label, description) VALUES
  ('tray_type', 'Types de plateaux', 'Contenants de récolte au champ. Le poids théorique (kg) sert à estimer le tonnage avant pesée station.')
ON CONFLICT (key) DO NOTHING;

-- Valeurs d'EXEMPLE — à ajuster dans /admin/referentiels selon tes vrais plateaux.
-- Le poids théorique est dans metadata.poids_kg.
INSERT INTO reference_values (list_key, code, label, metadata, order_idx, is_default) VALUES
  ('tray_type', 'plateau_10', 'Plateau 10 kg', '{"poids_kg": 10}', 1, true),
  ('tray_type', 'plateau_25', 'Plateau 25 kg', '{"poids_kg": 25}', 2, false),
  ('tray_type', 'caisse_20',  'Caisse 20 kg',  '{"poids_kg": 20}', 3, false),
  ('tray_type', 'cagette_6',  'Cagette 6 kg',  '{"poids_kg": 6}',  4, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- ─── 2. Poids estimé sur la récolte ─────────────────────────
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS estimated_kg DECIMAL(10, 2);

COMMENT ON COLUMN harvests.estimated_kg IS
  'Poids estimé (kg) = Σ lignes de plateaux. Source de vérité avant pesée station. Lot 2 ajoutera actual_kg.';

-- ─── 3. Lignes de plateaux par récolte ──────────────────────
CREATE TABLE IF NOT EXISTS harvest_tray_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id       UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  tray_type_code   VARCHAR(50) NOT NULL,           -- code du référentiel tray_type
  tray_type_label  VARCHAR(120),                   -- libellé figé au moment de la saisie
  nb_trays         INT NOT NULL CHECK (nb_trays > 0),
  poids_unitaire_kg DECIMAL(8, 2) NOT NULL DEFAULT 0, -- poids théorique figé (snapshot)
  line_kg          DECIMAL(10, 2) GENERATED ALWAYS AS (nb_trays * poids_unitaire_kg) STORED,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tray_lines_harvest ON harvest_tray_lines(harvest_id);

-- RLS : lecture + écriture authenticated (le caporal saisit sa propre récolte)
ALTER TABLE harvest_tray_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_tray_lines" ON harvest_tray_lines;
CREATE POLICY "auth_read_tray_lines" ON harvest_tray_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_tray_lines" ON harvest_tray_lines;
CREATE POLICY "auth_write_tray_lines" ON harvest_tray_lines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE harvest_tray_lines; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMENT ON TABLE harvest_tray_lines IS 'Lignes de plateaux d''une récolte (type + nombre). line_kg = nb × poids théorique figé.';
