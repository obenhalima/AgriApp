-- ============================================================
-- Sync Paie → Coûts : split brut / charges sociales
--
-- Nouveau mapping :
--   • Salaires bruts (gross_salary) :
--       - fermier / saisonnier / tacheron → MOD       (Main d'œuvre directe)
--       - staff_admin                     → MO_ADMIN  (Main d'œuvre Admin & Tech)
--   • Charges patronales (CNSS + AMO + Alloc fam + FP) :
--       - tous workers confondus          → CHARGES_SOC (Charges sociales CNSS & AMO)
--
-- Ajoute la catégorie CHARGES_SOC sous CHARGES_FIXES.
-- Backfill ensuite toutes les périodes validées.
-- ============================================================

-- 1. Ajout de la catégorie "Charges sociales CNSS & AMO"
INSERT INTO account_categories (parent_id, code, label, type, level, display_order, is_active)
SELECT
  (SELECT id FROM account_categories WHERE code = 'CHARGES_FIXES' AND parent_id IS NULL LIMIT 1),
  'CHARGES_SOC',
  'Charges sociales CNSS & AMO',
  'charge_fixe',
  2,
  3,  -- juste après MOD (1) et MO_ADMIN (2)
  TRUE
ON CONFLICT (code) DO NOTHING;

-- 2. Vérifie l'existence
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM account_categories WHERE code = 'CHARGES_SOC' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Catégorie CHARGES_SOC non créée';
  END IF;
  RAISE NOTICE '✓ Catégorie CHARGES_SOC : %', v_id;
END $$;

-- 3. Refonte de la fonction sync
CREATE OR REPLACE FUNCTION sync_payslip_period_to_cost_entries(p_period_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period payroll_periods%ROWTYPE;
  v_inserted INTEGER := 0;
BEGIN
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  DELETE FROM cost_entries WHERE payroll_period_id = p_period_id;

  IF v_period.status NOT IN ('valide', 'paye', 'cloture') THEN
    RETURN 0;
  END IF;

  WITH
    -- 1. Bulletins → champs distincts pour brut et charges sociales
    worker_payslips AS (
      SELECT
        COALESCE(ps.gross_salary, 0) AS gross,
        COALESCE(ps.cnss_employer, 0)
          + COALESCE(ps.amo_employer, 0)
          + COALESCE(ps.family_allowance_employer, 0)
          + COALESCE(ps.prof_training_employer, 0) AS charges_soc,
        CASE
          WHEN w.category = 'staff_admin' THEN 'MO_ADMIN'
          ELSE 'MOD'  -- fermier, saisonnier, tacheron → MOD
        END AS gross_cat_code,
        COALESCE(
          (SELECT id FROM campaigns
           WHERE farm_id = w.farm_id
             AND v_period.pay_date BETWEEN COALESCE(planting_start, DATE '1900-01-01')
                                       AND COALESCE(campaign_end, DATE '2100-12-31')
           ORDER BY planting_start DESC LIMIT 1),
          (SELECT id FROM campaigns WHERE farm_id = w.farm_id ORDER BY created_at DESC LIMIT 1),
          (SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1)
        ) AS campaign_id
      FROM payslips ps
      JOIN workers w ON w.id = ps.worker_id
      WHERE ps.period_id = p_period_id
    ),
    -- 2. Agrégats : 2 sources d'amounts par campagne
    --    a) gross par (campagne × MOD/MO_ADMIN)
    --    b) charges_soc par campagne → CHARGES_SOC (workers confondus)
    aggregates AS (
      SELECT campaign_id, gross_cat_code AS cat_code, SUM(gross) AS total_amount
      FROM worker_payslips
      GROUP BY campaign_id, gross_cat_code
      HAVING SUM(gross) > 0
      UNION ALL
      SELECT campaign_id, 'CHARGES_SOC' AS cat_code, SUM(charges_soc)
      FROM worker_payslips
      GROUP BY campaign_id
      HAVING SUM(charges_soc) > 0
    ),
    -- 3. Serres de chaque campagne avec surface
    campaign_greenhouses AS (
      SELECT DISTINCT
        cp.campaign_id,
        g.id AS greenhouse_id,
        COALESCE(NULLIF(g.exploitable_area, 0), g.total_area, 0)::numeric AS area
      FROM campaign_plantings cp
      JOIN greenhouses g ON g.id = cp.greenhouse_id
    ),
    campaign_total_area AS (
      SELECT campaign_id, SUM(area) AS total_area
      FROM campaign_greenhouses
      GROUP BY campaign_id
    ),
    -- 4. Répartition au prorata par surface
    distributed AS (
      SELECT
        a.campaign_id,
        a.cat_code,
        cg.greenhouse_id,
        ROUND( (a.total_amount * cg.area / cta.total_area)::numeric, 2 ) AS amount
      FROM aggregates a
      JOIN campaign_greenhouses cg ON cg.campaign_id = a.campaign_id
      JOIN campaign_total_area cta ON cta.campaign_id = a.campaign_id
      WHERE cta.total_area > 0 AND a.total_amount > 0
    ),
    fallback_no_greenhouse AS (
      SELECT
        a.campaign_id,
        a.cat_code,
        NULL::UUID AS greenhouse_id,
        a.total_amount AS amount
      FROM aggregates a
      LEFT JOIN campaign_total_area cta ON cta.campaign_id = a.campaign_id
      WHERE a.total_amount > 0 AND (cta.total_area IS NULL OR cta.total_area = 0)
    ),
    final_distribution AS (
      SELECT * FROM distributed
      UNION ALL
      SELECT * FROM fallback_no_greenhouse
    )
  INSERT INTO cost_entries (
    campaign_id, greenhouse_id, account_category_id, cost_category,
    amount, entry_date, description, is_planned, payroll_period_id
  )
  SELECT
    fd.campaign_id,
    fd.greenhouse_id,
    ac.id,
    LOWER(ac.code),
    fd.amount,
    v_period.pay_date,
    'Paie ' || v_period.code || ' — ' || ac.label
      || COALESCE(' [' || (SELECT code FROM greenhouses WHERE id = fd.greenhouse_id) || ']', ''),
    FALSE,
    p_period_id
  FROM final_distribution fd
  JOIN account_categories ac ON ac.code = fd.cat_code
  WHERE fd.amount > 0
    AND fd.campaign_id IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 4. BACKFILL : recalcule toutes les périodes validées avec le nouveau split
DO $$
DECLARE
  p RECORD;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  FOR p IN SELECT id, code FROM payroll_periods
           WHERE status IN ('valide', 'paye', 'cloture')
           ORDER BY period_year, period_month
  LOOP
    n := sync_payslip_period_to_cost_entries(p.id);
    total := total + n;
    RAISE NOTICE '✓ Période %: % cost_entries (brut + charges soc, par surface)', p.code, n;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % cost_entries au total', total;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;
