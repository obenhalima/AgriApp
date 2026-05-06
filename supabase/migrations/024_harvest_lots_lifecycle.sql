-- ============================================================
-- Lifecycle harvest_lots refactorisé :
--   1. Composer un envoi station (1+ récoltes → 1 lot)
--   2. Saisir le tri à la station (freinte% + écart%)
--   3. Confirmer le prix (CA calculé sur qté acceptée)
--
-- Permet :
--   - harvest_id devient NULLABLE (lots composites n'ont pas un seul harvest)
--   - table harvest_lot_sources pour N récoltes → 1 dispatch
--   - colonnes dédiées pour freinte/écart/prix/CA (au lieu de notes JSON)
--   - tri_status pour suivre l'avancement (pending → tried → priced)
--
-- Compatibilité : les anciens lots avec certificate_number sont
-- automatiquement migrés vers tri_status='priced'.
-- ============================================================

-- 1. harvest_id devient NULLABLE pour les lots composites
ALTER TABLE harvest_lots ALTER COLUMN harvest_id DROP NOT NULL;

-- 2. Nouveaux champs pour le cycle de vie
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS freinte_pct      DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ecart_pct        DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_nette_kg     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS qty_acceptee_kg  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS price_per_kg     DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS ca_amount        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS station_ref      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS periode_debut    DATE,
  ADD COLUMN IF NOT EXISTS periode_fin      DATE,
  ADD COLUMN IF NOT EXISTS receipt_date     DATE,
  ADD COLUMN IF NOT EXISTS tri_status       VARCHAR(20) DEFAULT 'pending';
-- tri_status : 'pending' (envoyé, pas trié) | 'tried' (freinte/écart saisis) | 'priced' (prix confirmé)

CREATE INDEX IF NOT EXISTS idx_harvest_lots_tri_status ON harvest_lots(tri_status);

-- 3. Table de liaison N récoltes → 1 lot composite
CREATE TABLE IF NOT EXISTS harvest_lot_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_lot_id     UUID NOT NULL REFERENCES harvest_lots(id) ON DELETE CASCADE,
  harvest_id         UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  qty_contributed_kg DECIMAL(10,2) NOT NULL CHECK (qty_contributed_kg > 0),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (harvest_lot_id, harvest_id)
);

CREATE INDEX IF NOT EXISTS idx_hls_lot ON harvest_lot_sources(harvest_lot_id);
CREATE INDEX IF NOT EXISTS idx_hls_harvest ON harvest_lot_sources(harvest_id);

-- RLS standard (admin write, auth read) — couvert par 023 si appliquée
ALTER TABLE harvest_lot_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_harvest_lot_sources" ON harvest_lot_sources;
CREATE POLICY "auth_read_harvest_lot_sources" ON harvest_lot_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_harvest_lot_sources" ON harvest_lot_sources;
CREATE POLICY "admin_write_harvest_lot_sources" ON harvest_lot_sources FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 4. Migration des données existantes :
--    - Si certificate_number existe → tri_status = 'priced'
--    - Pour les anciens lots dispatché simple (1 harvest_id), on synchronise les colonnes
--      à partir des données dans notes JSON quand disponibles
UPDATE harvest_lots SET tri_status = 'priced'
WHERE category = 'station_dispatch' AND certificate_number IS NOT NULL AND (tri_status IS NULL OR tri_status = 'pending');

-- Tente de remplir les colonnes typées depuis le JSON notes (best-effort)
UPDATE harvest_lots
SET
  freinte_pct      = COALESCE(freinte_pct,     CAST(NULLIF(notes::jsonb->>'freinte_pct', '') AS DECIMAL)),
  ecart_pct        = COALESCE(ecart_pct,       CAST(NULLIF(notes::jsonb->>'ecart_pct', '') AS DECIMAL)),
  qty_nette_kg     = COALESCE(qty_nette_kg,    CAST(NULLIF(notes::jsonb->>'qty_nette', '') AS DECIMAL)),
  qty_acceptee_kg  = COALESCE(qty_acceptee_kg, CAST(NULLIF(notes::jsonb->>'qty_acceptee', '') AS DECIMAL)),
  price_per_kg     = COALESCE(price_per_kg,    CAST(NULLIF(notes::jsonb->>'price_per_kg', '') AS DECIMAL)),
  ca_amount        = COALESCE(ca_amount,       CAST(NULLIF(notes::jsonb->>'ca_amount', '') AS DECIMAL)),
  station_ref      = COALESCE(station_ref,     NULLIF(notes::jsonb->>'station_ref', '')),
  periode_debut    = COALESCE(periode_debut,   CAST(NULLIF(notes::jsonb->>'periode_debut', '') AS DATE)),
  periode_fin      = COALESCE(periode_fin,     CAST(NULLIF(notes::jsonb->>'periode_fin', '') AS DATE))
WHERE category = 'station_dispatch'
  AND notes IS NOT NULL
  AND notes ~ '^\s*\{'  -- ne tente la conversion JSON que si ça ressemble à un objet
  AND tri_status = 'priced';
