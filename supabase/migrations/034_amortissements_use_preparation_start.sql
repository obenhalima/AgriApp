-- ============================================================
-- Aligne le calcul des amortissements sur preparation_start
-- (début des coûts d'une campagne) au lieu de planting_start.
--
-- Concerne :
--   • sync_asset_budget_lines       (budget_lines)
--   • sync_version_amortizations    (budget_lines via version)
--   • generate_full_asset_depreciation (cost_entries) : on garde
--     planting_start car les charges réelles d'amortissement existent
--     pendant toute la vie de l'actif, pas juste pendant une campagne.
--     C'est seulement la fenêtre de la campagne pour budget_lines qui
--     est concernée.
--
-- Backfill ensuite tous les actifs et toutes les versions.
-- ============================================================

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
  JOIN campaigns c ON m.month_start
       BETWEEN COALESCE(c.preparation_start, c.planting_start, DATE '1900-01-01')   -- ← MODIFIÉ
           AND COALESCE(c.campaign_end, DATE '2100-12-31')
  JOIN budget_versions bv ON bv.campaign_id = c.id AND bv.is_active = TRUE
  WHERE (v_asset.farm_id IS NULL OR c.farm_id = v_asset.farm_id);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION sync_version_amortizations(p_version_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version budget_versions%ROWTYPE;
  v_campaign campaigns%ROWTYPE;
  v_inserted INTEGER := 0;
  v_camp_start DATE;
  asset_rec RECORD;
  n INTEGER;
BEGIN
  SELECT * INTO v_version FROM budget_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_campaign FROM campaigns WHERE id = v_version.campaign_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Date début effective de la campagne pour le budget
  v_camp_start := COALESCE(v_campaign.preparation_start, v_campaign.planting_start, DATE '1900-01-01');

  DELETE FROM budget_lines
  WHERE version_id = p_version_id AND source_asset_id IS NOT NULL;

  FOR asset_rec IN
    SELECT a.id FROM assets a
    WHERE a.is_active = TRUE
      AND (a.farm_id IS NULL OR a.farm_id = v_campaign.farm_id)
      AND a.acquisition_date <= COALESCE(v_campaign.campaign_end, DATE '2100-12-31')
      AND (a.acquisition_date + (a.useful_life_years || ' years')::INTERVAL)::DATE >= v_camp_start
  LOOP
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
      DATE_TRUNC('month', GREATEST(a.acquisition_date, v_camp_start))::DATE,   -- ← MODIFIÉ
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

-- Backfill
DO $$
DECLARE
  a RECORD; n_b INTEGER; total INTEGER := 0;
BEGIN
  FOR a IN SELECT id, code FROM assets WHERE is_active = TRUE
  LOOP
    n_b := sync_asset_budget_lines(a.id);
    total := total + n_b;
    RAISE NOTICE '✓ %: % budget_lines', a.code, n_b;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % budget_lines au total', total;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;
