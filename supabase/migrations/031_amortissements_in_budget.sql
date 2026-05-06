-- ============================================================
-- Synchronisation Amortissements → budget_lines
--
-- Quand un actif est créé/modifié, on alimente automatiquement les
-- budgets prévisionnels avec la dotation mensuelle pour chaque version
-- de budget actif dont la campagne couvre une partie de la vie utile.
--
-- Inversement, quand une nouvelle version de budget est créée pour
-- une campagne, on injecte les amortissements de tous les actifs
-- pertinents.
--
-- Idempotent : la traçabilité via source_asset_id permet de re-générer
-- proprement (DELETE puis INSERT).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Lien budget_lines → assets pour traçabilité
-- ────────────────────────────────────────────────────────────
ALTER TABLE budget_lines
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES assets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_budget_lines_asset
  ON budget_lines(source_asset_id) WHERE source_asset_id IS NOT NULL;

-- 2. Recréer les unique indexes en incluant source_asset_id
--    (permet plusieurs lignes par clé si elles viennent d'actifs différents,
--     tout en gardant l'unicité des saisies manuelles)
DROP INDEX IF EXISTS uq_budget_lines_farm_level;
DROP INDEX IF EXISTS uq_budget_lines_greenhouse_level;

CREATE UNIQUE INDEX uq_budget_lines_farm_level
  ON budget_lines (version_id, farm_id, account_category_id, period_year, period_month, COALESCE(source_asset_id, '00000000-0000-0000-0000-000000000000'::UUID))
  WHERE greenhouse_id IS NULL;

CREATE UNIQUE INDEX uq_budget_lines_greenhouse_level
  ON budget_lines (version_id, farm_id, greenhouse_id, account_category_id, period_year, period_month, COALESCE(source_asset_id, '00000000-0000-0000-0000-000000000000'::UUID))
  WHERE greenhouse_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Fonction : synchronise les budget_lines pour UN actif
--    (toutes versions actives concernées)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_asset_budget_lines(p_asset_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset assets%ROWTYPE;
  v_inserted INTEGER := 0;
  v_monthly NUMERIC;
  v_end_date DATE;
BEGIN
  SELECT * INTO v_asset FROM assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Idempotent
  DELETE FROM budget_lines WHERE source_asset_id = p_asset_id;

  IF NOT v_asset.is_active THEN RETURN 0; END IF;

  v_monthly := ROUND(
    ((v_asset.acquisition_cost - COALESCE(v_asset.residual_value, 0)) / (v_asset.useful_life_years * 12))::numeric, 2
  );
  IF v_monthly <= 0 THEN RETURN 0; END IF;

  v_end_date := (v_asset.acquisition_date + (v_asset.useful_life_years || ' years')::INTERVAL - INTERVAL '1 day')::DATE;
  IF v_asset.disposal_date IS NOT NULL AND v_asset.disposal_date < v_end_date THEN
    v_end_date := v_asset.disposal_date;
  END IF;

  -- Pour chaque (mois × version × ferme matchant), insère une budget_line
  WITH months AS (
    SELECT
      d::DATE AS month_start,
      EXTRACT(YEAR FROM d)::INT AS yr,
      EXTRACT(MONTH FROM d)::INT AS mo
    FROM generate_series(
      DATE_TRUNC('month', v_asset.acquisition_date)::DATE,
      DATE_TRUNC('month', v_end_date)::DATE,
      INTERVAL '1 month'
    ) d
  )
  INSERT INTO budget_lines (
    version_id, farm_id, greenhouse_id, account_category_id,
    period_year, period_month, amount, notes, source_asset_id
  )
  SELECT DISTINCT
    bv.id,
    COALESCE(v_asset.farm_id, c.farm_id),
    v_asset.greenhouse_id,
    v_asset.account_category_id,
    m.yr, m.mo,
    v_monthly,
    'Amortissement auto — ' || v_asset.code || ' / ' || v_asset.label,
    v_asset.id
  FROM months m
  JOIN campaigns c ON m.month_start BETWEEN COALESCE(c.planting_start, DATE '1900-01-01')
                                         AND COALESCE(c.campaign_end, DATE '2100-12-31')
  JOIN budget_versions bv ON bv.campaign_id = c.id AND bv.is_active = TRUE
  WHERE (v_asset.farm_id IS NULL OR c.farm_id = v_asset.farm_id);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Fonction : synchronise les amortissements pour UNE version de budget
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_version_amortizations(p_version_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version budget_versions%ROWTYPE;
  v_campaign campaigns%ROWTYPE;
  v_inserted INTEGER := 0;
  asset_rec RECORD;
  n INTEGER;
BEGIN
  SELECT * INTO v_version FROM budget_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_campaign FROM campaigns WHERE id = v_version.campaign_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Vide d'abord les budget_lines auto-générées de cette version
  DELETE FROM budget_lines
  WHERE version_id = p_version_id
    AND source_asset_id IS NOT NULL;

  -- Re-sync chaque actif actif concerné (farm match + dates qui chevauchent)
  FOR asset_rec IN
    SELECT a.id FROM assets a
    WHERE a.is_active = TRUE
      AND (a.farm_id IS NULL OR a.farm_id = v_campaign.farm_id)
      AND a.acquisition_date <= COALESCE(v_campaign.campaign_end, DATE '2100-12-31')
      AND (a.acquisition_date + (a.useful_life_years || ' years')::INTERVAL)::DATE
            >= COALESCE(v_campaign.planting_start, DATE '1900-01-01')
  LOOP
    -- Insert pour ce seul actif et cette version uniquement
    n := 0;
    INSERT INTO budget_lines (
      version_id, farm_id, greenhouse_id, account_category_id,
      period_year, period_month, amount, notes, source_asset_id
    )
    SELECT DISTINCT
      p_version_id,
      COALESCE(a.farm_id, v_campaign.farm_id),
      a.greenhouse_id,
      a.account_category_id,
      EXTRACT(YEAR FROM m.month_start)::INT,
      EXTRACT(MONTH FROM m.month_start)::INT,
      ROUND( ((a.acquisition_cost - COALESCE(a.residual_value, 0)) / (a.useful_life_years * 12))::numeric, 2 ),
      'Amortissement auto — ' || a.code || ' / ' || a.label,
      a.id
    FROM assets a
    CROSS JOIN LATERAL generate_series(
      DATE_TRUNC('month', GREATEST(a.acquisition_date, COALESCE(v_campaign.planting_start, a.acquisition_date)))::DATE,
      DATE_TRUNC('month', LEAST(
        (a.acquisition_date + (a.useful_life_years || ' years')::INTERVAL - INTERVAL '1 day')::DATE,
        COALESCE(a.disposal_date, DATE '9999-12-31'),
        COALESCE(v_campaign.campaign_end, DATE '2100-12-31')
      ))::DATE,
      INTERVAL '1 month'
    ) AS m(month_start)
    WHERE a.id = asset_rec.id;

    GET DIAGNOSTICS n = ROW_COUNT;
    v_inserted := v_inserted + n;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Trigger : régénérer les budget_lines quand un actif change
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_asset_to_budget_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM budget_lines WHERE source_asset_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM sync_asset_budget_lines(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_budget_sync ON assets;
CREATE TRIGGER trg_assets_budget_sync
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION trg_asset_to_budget_lines();

-- ────────────────────────────────────────────────────────────
-- 6. Trigger : alimenter une nouvelle version de budget avec
--    les amortissements existants
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_budget_version_amortizations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_version_amortizations(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_versions_amort_sync ON budget_versions;
CREATE TRIGGER trg_budget_versions_amort_sync
AFTER INSERT ON budget_versions
FOR EACH ROW
EXECUTE FUNCTION trg_budget_version_amortizations();

-- ────────────────────────────────────────────────────────────
-- 7. BACKFILL : alimente les versions existantes avec les actifs existants
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v RECORD;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  FOR v IN SELECT id, code FROM budget_versions WHERE is_active = TRUE
  LOOP
    n := sync_version_amortizations(v.id);
    total := total + n;
    RAISE NOTICE '✓ Version %: % budget_lines amortissements injectées', v.code, n;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % budget_lines au total', total;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;
