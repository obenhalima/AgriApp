-- ============================================================
-- PHASE 2.2 — BUDGET DÉTAILLÉ PAR CAMPAGNE
--
-- Deux tables :
--   - budget_versions : une version = un scénario budgétaire rattaché à une campagne
--                       (brouillon → validé → figé)
--   - budget_lines    : chaque ligne = montant mensuel pour une combinaison
--                       (version, ferme, serre NULLable, catégorie comptable, mois)
-- ============================================================

-- ------------------------------------------------------------
-- 1. VERSIONS DE BUDGET (scénarios)
-- ------------------------------------------------------------
CREATE TYPE budget_status AS ENUM ('brouillon', 'valide', 'fige');

CREATE TABLE budget_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  status budget_status NOT NULL DEFAULT 'brouillon',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  validated_at TIMESTAMPTZ,
  frozen_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, code)
);

CREATE INDEX idx_budget_versions_campaign ON budget_versions(campaign_id);

-- Une seule version "figée" autorisée par campagne (la référence officielle)
CREATE UNIQUE INDEX uq_budget_one_frozen_per_campaign
  ON budget_versions(campaign_id)
  WHERE status = 'fige';

-- ------------------------------------------------------------
-- 2. LIGNES DE BUDGET (détail mensuel)
-- ------------------------------------------------------------
CREATE TABLE budget_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  greenhouse_id UUID REFERENCES greenhouses(id) ON DELETE RESTRICT,  -- NULL = niveau ferme
  account_category_id UUID NOT NULL REFERENCES account_categories(id) ON DELETE RESTRICT,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  quantity DECIMAL(14, 4),                -- optionnel : pour budgets volumétriques (ex: kg de semences)
  unit_price DECIMAL(12, 4),              -- optionnel : prix unitaire de référence
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes de rapport (toujours par version + période)
CREATE INDEX idx_budget_lines_version      ON budget_lines(version_id);
CREATE INDEX idx_budget_lines_farm         ON budget_lines(farm_id);
CREATE INDEX idx_budget_lines_greenhouse   ON budget_lines(greenhouse_id);
CREATE INDEX idx_budget_lines_cat          ON budget_lines(account_category_id);
CREATE INDEX idx_budget_lines_period       ON budget_lines(period_year, period_month);

-- ------------------------------------------------------------
-- Unicité : une seule ligne par (version, ferme, [serre], catégorie, mois)
-- Partial indexes parce que PostgreSQL traite NULL comme distinct par défaut.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX uq_budget_lines_farm_level
  ON budget_lines (version_id, farm_id, account_category_id, period_year, period_month)
  WHERE greenhouse_id IS NULL;

CREATE UNIQUE INDEX uq_budget_lines_greenhouse_level
  ON budget_lines (version_id, farm_id, greenhouse_id, account_category_id, period_year, period_month)
  WHERE greenhouse_id IS NOT NULL;

-- ------------------------------------------------------------
-- Contrainte : une ligne niveau ferme doit avoir farm_id, et si greenhouse_id
-- est renseigné, il doit appartenir à cette ferme.
-- (Vérification en trigger car CHECK ne peut pas SELECT.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tg_check_budget_line_farm_greenhouse()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.greenhouse_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM greenhouses g
      WHERE g.id = NEW.greenhouse_id AND g.farm_id = NEW.farm_id
    ) THEN
      RAISE EXCEPTION 'La serre (%) n''appartient pas à la ferme (%)', NEW.greenhouse_id, NEW.farm_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_line_farm_greenhouse
  BEFORE INSERT OR UPDATE ON budget_lines
  FOR EACH ROW EXECUTE FUNCTION tg_check_budget_line_farm_greenhouse();

-- ------------------------------------------------------------
-- Vue d'agrégation : consolidation des lignes niveau ferme + serre
-- Utilisée par les rapports CPC (Phase 2.6)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_budget_by_farm_month AS
SELECT
  bl.version_id,
  bl.farm_id,
  f.code        AS farm_code,
  f.name        AS farm_name,
  bl.account_category_id,
  ac.code       AS category_code,
  ac.label      AS category_label,
  ac.type       AS category_type,
  bl.period_year,
  bl.period_month,
  SUM(bl.amount) AS total_amount
FROM budget_lines bl
JOIN farms f               ON f.id = bl.farm_id
JOIN account_categories ac ON ac.id = bl.account_category_id
GROUP BY
  bl.version_id, bl.farm_id, f.code, f.name,
  bl.account_category_id, ac.code, ac.label, ac.type,
  bl.period_year, bl.period_month;
