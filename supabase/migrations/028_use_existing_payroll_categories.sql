-- ============================================================
-- Refonte du sync Paie → Coûts pour utiliser les catégories
-- EXISTANTES du plan comptable (au lieu de créer des doublons).
--
-- Mapping :
--   worker.category IN ('fermier', 'saisonnier', 'tacheron') → MOD       (Main d'œuvre directe)
--   worker.category = 'staff_admin'                          → MO_ADMIN  (Main d'œuvre Admin & Tech)
--
-- Le total_employer_cost (brut + CNSS pat + AMO pat + alloc fam + FP)
-- est imputé en bloc sur la catégorie correspondante.
--
-- Suppression des 5 catégories en double créées par la 018 :
--   SAL_BRUT, CNSS_PAT, AMO_PAT, ALLOC_FAM, FORM_PRO
-- ============================================================

-- 1. Suppression des cost_entries qui pointent sur les catégories en double
DELETE FROM cost_entries
WHERE account_category_id IN (
  SELECT id FROM account_categories
  WHERE code IN ('SAL_BRUT', 'CNSS_PAT', 'AMO_PAT', 'ALLOC_FAM', 'FORM_PRO')
);

-- 2. Suppression des catégories en double
DELETE FROM account_categories
WHERE code IN ('SAL_BRUT', 'CNSS_PAT', 'AMO_PAT', 'ALLOC_FAM', 'FORM_PRO');

-- 3. Vérification que MOD et MO_ADMIN existent (créés par la migration 009)
DO $$
DECLARE
  v_mod_id UUID;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_mod_id FROM account_categories WHERE code = 'MOD' LIMIT 1;
  SELECT id INTO v_admin_id FROM account_categories WHERE code = 'MO_ADMIN' LIMIT 1;
  IF v_mod_id IS NULL THEN
    RAISE EXCEPTION 'Catégorie MOD introuvable — migration 009 manquante ?';
  END IF;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Catégorie MO_ADMIN introuvable — migration 009 manquante ?';
  END IF;
  RAISE NOTICE '✓ Catégories MOD (%) et MO_ADMIN (%) trouvées', v_mod_id, v_admin_id;
END $$;

-- 4. Redéfinition de la fonction de sync
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
    -- 1. Bulletins → campagne + classification (MOD vs MO_ADMIN) + total employer
    worker_payslips AS (
      SELECT
        COALESCE(ps.total_employer_cost, 0) AS amount,
        CASE
          WHEN w.category = 'staff_admin' THEN 'MO_ADMIN'
          ELSE 'MOD'  -- fermier, saisonnier, tacheron, ou inconnu → MOD
        END AS cat_code,
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
    -- 2. Agrégat par (campagne × catégorie)
    aggregates AS (
      SELECT campaign_id, cat_code, SUM(amount) AS total_amount
      FROM worker_payslips
      GROUP BY campaign_id, cat_code
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
    -- 4. Répartition au prorata des surfaces
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

-- 5. BACKFILL : applique le nouveau sync sur toutes les périodes validées
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
    RAISE NOTICE '✓ Période %: % cost_entries (MOD/MO_ADMIN par surface)', p.code, n;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % cost_entries au total', total;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;
