-- ============================================================
-- Sync automatique Paie → Coûts (compte d'exploitation)
--
-- À la validation d'une période de paie, on génère 5 cost_entries
-- agrégées par campagne :
--   • SAL_BRUT   = Σ gross_salary
--   • CNSS_PAT   = Σ cnss_employer
--   • AMO_PAT    = Σ amo_employer
--   • ALLOC_FAM  = Σ family_allowance_employer
--   • FORM_PRO   = Σ prof_training_employer
--
-- Idempotent : re-validation = recalcul propre (pas de doublons).
-- Réversible : retour à 'brouillon' = suppression des cost_entries.
--
-- Backfill : applique le sync sur toutes les périodes déjà validées
-- en fin de migration.
-- ============================================================

-- 1. Nouvelle colonne sur cost_entries pour tracer la source
ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cost_entries_payroll_period
  ON cost_entries(payroll_period_id) WHERE payroll_period_id IS NOT NULL;

-- 2. Fonction de sync d'une période → cost_entries
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

  -- Toujours nettoyer les anciennes entrées de cette période (idempotent)
  DELETE FROM cost_entries WHERE payroll_period_id = p_period_id;

  -- Si la période est revenue en brouillon (ou n'a jamais été validée),
  -- on s'arrête là : pas de cost_entries.
  IF v_period.status NOT IN ('valide', 'paye', 'cloture') THEN
    RETURN 0;
  END IF;

  -- Pour chaque worker × période, on associe une campagne :
  --   1. Campagne de la ferme du worker active à la pay_date
  --   2. Sinon dernière campagne de la ferme du worker
  --   3. Sinon dernière campagne créée du système
  WITH worker_campaigns AS (
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
        (SELECT id FROM campaigns WHERE farm_id = w.farm_id
         ORDER BY created_at DESC LIMIT 1),
        (SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1)
      ) AS campaign_id
    FROM payslips ps
    JOIN workers w ON w.id = ps.worker_id
    WHERE ps.period_id = p_period_id
  ),
  aggregates AS (
    SELECT campaign_id, 'SAL_BRUT'  AS cat_code, SUM(gross_salary)              AS amount FROM worker_campaigns GROUP BY campaign_id
    UNION ALL
    SELECT campaign_id, 'CNSS_PAT'              , SUM(cnss_employer)            FROM worker_campaigns GROUP BY campaign_id
    UNION ALL
    SELECT campaign_id, 'AMO_PAT'               , SUM(amo_employer)             FROM worker_campaigns GROUP BY campaign_id
    UNION ALL
    SELECT campaign_id, 'ALLOC_FAM'             , SUM(family_allowance_employer) FROM worker_campaigns GROUP BY campaign_id
    UNION ALL
    SELECT campaign_id, 'FORM_PRO'              , SUM(prof_training_employer)   FROM worker_campaigns GROUP BY campaign_id
  )
  INSERT INTO cost_entries (
    campaign_id, greenhouse_id, account_category_id, cost_category,
    amount, entry_date, description, is_planned, payroll_period_id
  )
  SELECT
    a.campaign_id,
    NULL::UUID,
    ac.id,
    LOWER(ac.code),
    ROUND(a.amount::numeric, 2),
    v_period.pay_date,
    'Paie ' || v_period.code || ' — ' || ac.label,
    FALSE,
    p_period_id
  FROM aggregates a
  JOIN account_categories ac ON ac.code = a.cat_code
  WHERE a.amount > 0
    AND a.campaign_id IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 3. Trigger : changement de statut sur payroll_periods
CREATE OR REPLACE FUNCTION trg_payroll_period_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM sync_payslip_period_to_cost_entries(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_period_after_update ON payroll_periods;
CREATE TRIGGER trg_payroll_period_after_update
AFTER UPDATE OF status ON payroll_periods
FOR EACH ROW
EXECUTE FUNCTION trg_payroll_period_status_change();

-- 4. Trigger : modifications individuelles d'un bulletin
--    Si la période est déjà validée, on re-sync pour refléter les nouveaux montants.
CREATE OR REPLACE FUNCTION trg_payslip_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id UUID;
  v_period_status TEXT;
BEGIN
  v_period_id := COALESCE(NEW.period_id, OLD.period_id);
  IF v_period_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO v_period_status FROM payroll_periods WHERE id = v_period_id;
  IF v_period_status IN ('valide', 'paye', 'cloture') THEN
    PERFORM sync_payslip_period_to_cost_entries(v_period_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payslip_after_change ON payslips;
CREATE TRIGGER trg_payslip_after_change
AFTER INSERT OR UPDATE OR DELETE ON payslips
FOR EACH ROW
EXECUTE FUNCTION trg_payslip_change();

-- 5. BACKFILL : applique le sync sur les périodes déjà validées
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
    RAISE NOTICE '✓ Période %: % cost_entries créées', p.code, n;
  END LOOP;
  RAISE NOTICE '═════════════════════════════════════';
  RAISE NOTICE '   Backfill terminé : % cost_entries au total', total;
  RAISE NOTICE '═════════════════════════════════════';
END $$;
