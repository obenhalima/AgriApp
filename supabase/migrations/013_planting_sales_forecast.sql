-- ============================================================
-- Enrichissement campaign_plantings pour la génération automatique
-- du CA budget (CA Export + CA Marché Local) par serre × mois
-- ============================================================

ALTER TABLE campaign_plantings
  -- Fenêtre de récolte (la distribution mensuelle du volume utilise ces dates)
  ADD COLUMN harvest_start_date DATE,
  ADD COLUMN harvest_end_date   DATE,
  -- Répartition Export / Marché Local (en %, somme export + local = 100)
  ADD COLUMN export_share_pct   DECIMAL(5,2) NOT NULL DEFAULT 100
    CHECK (export_share_pct BETWEEN 0 AND 100),
  -- Prix MAD/kg (NULL = hérite de varieties.avg_price_export / avg_price_local)
  ADD COLUMN price_per_kg_export DECIMAL(10,2)
    CHECK (price_per_kg_export IS NULL OR price_per_kg_export >= 0),
  ADD COLUMN price_per_kg_local  DECIMAL(10,2)
    CHECK (price_per_kg_local IS NULL OR price_per_kg_local >= 0);

-- Cohérence : date fin >= date début (quand les deux sont renseignées)
ALTER TABLE campaign_plantings
  ADD CONSTRAINT chk_harvest_dates
  CHECK (harvest_end_date IS NULL OR harvest_start_date IS NULL OR harvest_end_date >= harvest_start_date);

-- Index sur les dates de récolte pour optimiser les requêtes de génération
CREATE INDEX idx_campaign_plantings_harvest ON campaign_plantings(harvest_start_date, harvest_end_date);

-- ------------------------------------------------------------
-- Vue pratique : volume total prévu par plantation avec prix effectifs
-- (prix sur la plantation si renseigné, sinon sur la variété)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_planting_forecasts AS
SELECT
  cp.id                AS planting_id,
  cp.campaign_id,
  cp.greenhouse_id,
  cp.variety_id,
  cp.planted_area,
  cp.target_yield_per_m2,
  cp.target_total_production                                               AS total_volume_kg,
  cp.planting_date,
  cp.harvest_start_date,
  cp.harvest_end_date,
  cp.export_share_pct,
  COALESCE(cp.price_per_kg_export, v.avg_price_export, 0)                   AS effective_price_export,
  COALESCE(cp.price_per_kg_local,  v.avg_price_local,  0)                   AS effective_price_local,
  g.farm_id,
  g.code                                                                    AS greenhouse_code,
  g.name                                                                    AS greenhouse_name,
  v.commercial_name                                                         AS variety_name,
  cp.target_total_production * cp.export_share_pct / 100
    * COALESCE(cp.price_per_kg_export, v.avg_price_export, 0)               AS ca_export_total,
  cp.target_total_production * (100 - cp.export_share_pct) / 100
    * COALESCE(cp.price_per_kg_local, v.avg_price_local, 0)                 AS ca_local_total
FROM campaign_plantings cp
JOIN greenhouses g ON g.id = cp.greenhouse_id
JOIN varieties   v ON v.id = cp.variety_id;
