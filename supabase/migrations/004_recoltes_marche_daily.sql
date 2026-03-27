
-- ═══════════════════════════════════════════════════
-- TABLE : harvest_market_prices
-- Prix par marché pour chaque récolte
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS harvest_market_prices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id      UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  market_id       UUID NOT NULL REFERENCES markets(id),
  qty_sent_kg     DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg    DECIMAL(8,4),
  amount_total    DECIMAL(12,2) GENERATED ALWAYS AS (qty_sent_kg * price_per_kg) STORED,
  currency        VARCHAR(10) DEFAULT 'MAD',
  station_ref     VARCHAR(100),
  receipt_date    DATE,
  price_set_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(harvest_id, market_id)
);

ALTER TABLE harvest_market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_market_prices FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_hmp_harvest ON harvest_market_prices(harvest_id);
CREATE INDEX IF NOT EXISTS idx_hmp_market  ON harvest_market_prices(market_id);
CREATE INDEX IF NOT EXISTS idx_hmp_no_price ON harvest_market_prices(harvest_id) WHERE price_per_kg IS NULL;

-- ═══════════════════════════════════════════════════
-- TABLE : harvest_daily_status
-- Statut journalier (récolte / sans récolte / etc.)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS harvest_daily_status (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_date     DATE NOT NULL UNIQUE,
  status          VARCHAR(30) NOT NULL DEFAULT 'sans_recolte',
  campaign_id     UUID REFERENCES campaigns(id),
  greenhouse_id   UUID REFERENCES greenhouses(id),
  reason          TEXT,
  noted_by        VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE harvest_daily_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_daily_status FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_hds_date ON harvest_daily_status(status_date);
