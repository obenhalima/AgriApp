-- Ajouter les colonnes prix station sur la table harvests
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS qty_sent_to_station   DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_kg_station  DECIMAL(8,3),
  ADD COLUMN IF NOT EXISTS amount_station        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS station_receipt_date  DATE,
  ADD COLUMN IF NOT EXISTS station_ref           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS price_set_at          TIMESTAMPTZ;

-- Index pour retrouver facilement les récoltes sans prix
CREATE INDEX IF NOT EXISTS idx_harvests_no_price
  ON harvests(price_per_kg_station)
  WHERE price_per_kg_station IS NULL AND qty_sent_to_station > 0;

-- Commentaires
COMMENT ON COLUMN harvests.qty_sent_to_station   IS 'Quantite en kg envoyee a la station de conditionnement';
COMMENT ON COLUMN harvests.price_per_kg_station  IS 'Prix recu de la station (MAD/kg) - saisi apres reception';
COMMENT ON COLUMN harvests.amount_station        IS 'Montant total recu station = qty_sent * price_per_kg';
COMMENT ON COLUMN harvests.station_receipt_date  IS 'Date de reception du prix de la station';
COMMENT ON COLUMN harvests.station_ref           IS 'Reference bordereau station';
