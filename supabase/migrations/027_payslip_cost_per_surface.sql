-- ============================================================
-- Sync Paie → Coûts AVEC RÉPARTITION PAR SURFACE
--
-- Refonte de sync_payslip_period_to_cost_entries() :
--   • Pour chaque (campagne, catégorie), au lieu de créer 1 cost_entry
--     au niveau ferme (greenhouse_id=NULL), on crée N cost_entries
--     proportionnelles à la surface de chaque serre plantée.
--
--   • Ratio : exploitable_area de chaque serre / Σ exploitable_area
--   • Fallback total_area si exploitable_area est NULL
--   • Si la campagne n'a aucune serre plantée → 1 cost_entry niveau ferme
--
-- Backfill : recalcule toutes les périodes déjà validées avec la nouvelle
-- répartition.
-- ============================================================

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

  -- Idempotent : nettoyage avant ré-insertion
  DELETE FROM cost_entries WHERE payroll_period_id = p_period_id;

  IF v_period.status NOT IN ('valide', 'paye', 'cloture') THEN
    RETURN 0;
  END IF;

  WITH
    -- 1. Bulletins → campagne + montants par catégorie
    worker_campaigns AS (
      SELECT
        COALESCE(ps.gross_salary, 0)              AS gross_salary,
        COALESCE(ps.cnss_employer, 0)             AS cnss_employer,
        COALESCE(ps.amo_employer, 0)              AS amo_employer,
        COALESCE(ps.family_allowance_employer, 0) AS family_allowance_employer,
        COALESCE(ps.prof_training_employer, 0)    AS prof_training_employer,
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
    -- 2. Agrégats par (campagne × catégorie)
    aggregates AS (
      SELECT campaign_id, 'SAL_BRUT'  AS cat_code, SUM(gross_salary)               AS total_amount FROM worker_campaigns GROUP BY campaign_id
      UNION ALL
      SELECT campaign_id, 'CNSS_PAT'              , SUM(cnss_employer)             FROM worker_campaigns GROUP BY campaign_id
      UNION ALL
      SELECT campaign_id, 'AMO_PAT'               , SUM(amo_employer)              FROM worker_campaigns GROUP BY campaign_id
      UNION ALL
      SELECT campaign_id, 'ALLOC_FAM'             , SUM(family_allowance_employer) FROM worker_campaigns GROUP BY campaign_id
      UNION ALL
      SELECT campaign_id, 'FORM_PRO'              , SUM(prof_training_employer)    FROM worker_campaigns GROUP BY campaign_id
    ),
    -- 3. Liste des serres de chaque campagne (via campaign_plantings) avec surface
    --    Une serre apparaît une seule fois même si plusieurs variétés.
    campaign_greenhouses AS (
      SELECT DISTINCT
        cp.campaign_id,
        g.id AS greenhouse_id,
        COALESCE(NULLIF(g.exploitable_area, 0), g.total_area, 0)::numeric AS area
      FROM campaign_plantings cp
      JOIN greenhouses g ON g.id = cp.greenhouse_id
    ),
    -- 4. Surface totale par campagne (pour calculer les ratios)
    campaign_total_area AS (
      SELECT campaign_id, SUM(area) AS total_area
      FROM campaign_greenhouses
      GROUP BY campaign_id
    ),
    -- 5. Répartition au prorata pour les campagnes avec serres + surface > 0
    distributed_per_greenhouse AS (
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
    -- 6. Fallback : campagnes SANS serres ou avec total surface = 0 → 1 ligne niveau ferme
    fallback_no_greenhouse AS (
      SELECT
        a.campaign_id,
        a.cat_code,
        NULL::UUID AS greenhouse_id,
        a.total_amount AS amount
      FROM aggregates a
      LEFT JOIN campaign_total_area cta ON cta.campaign_id = a.campaign_id
      WHERE a.total_amount > 0
        AND (cta.total_area IS NULL OR cta.total_area = 0)
    ),
    -- 7. Union des 2 cas
    final_distribution AS (
      SELECT * FROM distributed_per_greenhouse
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

-- ────────────────────────────────────────────────────────────
-- BACKFILL : recalcule toutes les périodes existantes avec la
-- nouvelle répartition par surface.
-- ────────────────────────────────────────────────────────────
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
    RAISE NOTICE '✓ Période %: % cost_entries (réparties par surface)', p.code, n;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % cost_entries au total', total;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;
