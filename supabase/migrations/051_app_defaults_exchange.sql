-- ============================================================
-- Migration 051 — Paramètres par défaut + taux de change · No-Code P2
--
-- 1. app_settings clé 'defaults' : valeurs par défaut globales
--    (devise, pays, TVA, délai paiement, mois début campagne)
-- 2. Table exchange_rates : taux de change historisés (→ MAD)
-- 3. reference_list 'currency' : devises paramétrables
-- ============================================================

-- ─── 1. Valeurs par défaut globales (app_settings) ──────────
INSERT INTO app_settings (key, value, description)
VALUES (
  'defaults',
  jsonb_build_object(
    'default_currency', 'MAD',
    'default_country', 'Maroc',
    'campaign_start_month', 7,          -- juillet (1-12)
    'vat_rate', 0.20,                    -- TVA 20%
    'default_payment_terms_days', 30
  ),
  'Valeurs par défaut pré-remplies dans les formulaires (devise, pays, TVA, délai de paiement, mois de début de campagne)'
)
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Table exchange_rates (taux vers MAD) ────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency VARCHAR(10) NOT NULL,           -- 'EUR'
  to_currency   VARCHAR(10) NOT NULL DEFAULT 'MAD',
  rate          DECIMAL(12, 4) NOT NULL CHECK (rate > 0),  -- 1 EUR = 11.0000 MAD
  valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID REFERENCES users(id)
);

-- Index : retrouve rapidement le taux le plus récent pour une paire
CREATE INDEX IF NOT EXISTS idx_exchange_latest
  ON exchange_rates(from_currency, to_currency, valid_from DESC);

-- Une seule ligne par (paire, date) pour éviter les doublons le même jour
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_pair_date
  ON exchange_rates(from_currency, to_currency, valid_from);

-- Seed des taux actuels (ceux qui étaient hardcodés dans le générateur)
INSERT INTO exchange_rates (from_currency, to_currency, rate, valid_from, notes) VALUES
  ('EUR', 'MAD', 11.0000, CURRENT_DATE, 'Taux initial (seed migration 051)'),
  ('USD', 'MAD', 10.0000, CURRENT_DATE, 'Taux initial (seed migration 051)'),
  ('GBP', 'MAD', 12.5000, CURRENT_DATE, 'Taux initial (seed migration 051)'),
  ('MAD', 'MAD', 1.0000,  CURRENT_DATE, 'Identité')
ON CONFLICT (from_currency, to_currency, valid_from) DO NOTHING;

-- RLS : lecture authenticated, écriture admin
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exch_read" ON exchange_rates;
CREATE POLICY "exch_read" ON exchange_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exch_write" ON exchange_rates;
CREATE POLICY "exch_write" ON exchange_rates FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE exchange_rates; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─── 3. Liste de référence 'currency' (devises paramétrables) ─
-- (suppose la migration 050 appliquée : tables reference_lists/values)
INSERT INTO reference_lists (key, label, description) VALUES
  ('currency', 'Devises', 'Monnaies utilisables sur les marchés et achats (/marches, /achats)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('currency', 'MAD', 'Dirham marocain (MAD)', 1, true),
  ('currency', 'EUR', 'Euro (EUR)',            2, false),
  ('currency', 'USD', 'Dollar US (USD)',       3, false),
  ('currency', 'GBP', 'Livre sterling (GBP)',  4, false)
ON CONFLICT (list_key, code) DO NOTHING;

COMMENT ON TABLE exchange_rates IS 'Taux de change historisés vers MAD. Le taux courant = ligne la plus récente (valid_from max) pour une paire donnée.';
