-- Table prix station (prix reçu après envoi à la station)
CREATE TABLE IF NOT EXISTS harvest_station_prices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id      UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  qty_sent_kg     DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg    DECIMAL(8,4),
  amount_total    DECIMAL(12,2),
  station_ref     VARCHAR(100),
  receipt_date    DATE,
  price_set_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE harvest_station_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_station_prices FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_station_prices_harvest ON harvest_station_prices(harvest_id);
