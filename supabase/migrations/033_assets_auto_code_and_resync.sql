-- ============================================================
-- 1. Génération automatique du code d'actif (BEFORE INSERT)
-- 2. Re-backfill complet : actifs → cost_entries + budget_lines
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Trigger d'auto-génération du code
--    Préfixe selon catégorie comptable :
--      AMT_SERRES         → SERR
--      AMT_CONSTRUCTIONS  → CONST
--      AMT_IRRIGATION     → IRRI
--      AMT_MMB            → MMB
--      AMT_VEHICULES      → VEH
--      AMT_INFORMATIQUE   → INFO
--      autre              → AMT
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_asset_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_cat_code TEXT;
  v_next_num INTEGER;
BEGIN
  -- Si le code est fourni manuellement (ex: import, seed), on ne touche pas
  IF NEW.code IS NOT NULL AND TRIM(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_cat_code FROM account_categories WHERE id = NEW.account_category_id;

  v_prefix := CASE v_cat_code
    WHEN 'AMT_SERRES'        THEN 'SERR'
    WHEN 'AMT_CONSTRUCTIONS' THEN 'CONST'
    WHEN 'AMT_IRRIGATION'    THEN 'IRRI'
    WHEN 'AMT_MMB'           THEN 'MMB'
    WHEN 'AMT_VEHICULES'     THEN 'VEH'
    WHEN 'AMT_INFORMATIQUE'  THEN 'INFO'
    WHEN 'AMT_OUTILLAGE'     THEN 'OUTIL'
    WHEN 'AMT_AGENCEMENTS'   THEN 'AGE'
    ELSE 'AMT'
  END;

  -- Prochain numéro libre pour ce préfixe
  SELECT COALESCE(MAX(
    NULLIF(REGEXP_REPLACE(code, '^[A-Z]+-', ''), '')::INTEGER
  ), 0) + 1
    INTO v_next_num
    FROM assets
    WHERE code ~ ('^' || v_prefix || '-[0-9]+$');

  NEW.code := v_prefix || '-' || LPAD(v_next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_auto_code ON assets;
CREATE TRIGGER trg_assets_auto_code
BEFORE INSERT ON assets
FOR EACH ROW
EXECUTE FUNCTION generate_asset_code();

-- ────────────────────────────────────────────────────────────
-- 2. Re-backfill : régénère cost_entries ET budget_lines pour tous les actifs
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  a RECORD;
  n_cost INTEGER := 0;
  n_budget INTEGER := 0;
  n_versions INTEGER := 0;
  total_cost INTEGER := 0;
  total_budget INTEGER := 0;
BEGIN
  -- Diagnostic préalable
  SELECT COUNT(*) INTO n_versions FROM budget_versions WHERE is_active = TRUE;
  RAISE NOTICE '──────────────────────────────────────────';
  RAISE NOTICE 'État avant re-sync :';
  RAISE NOTICE '  • Actifs              : %', (SELECT COUNT(*) FROM assets WHERE is_active = TRUE);
  RAISE NOTICE '  • Versions de budget  : %', n_versions;
  RAISE NOTICE '  • cost_entries assets : %', (SELECT COUNT(*) FROM cost_entries WHERE source_asset_id IS NOT NULL);
  RAISE NOTICE '  • budget_lines assets : %', (SELECT COUNT(*) FROM budget_lines WHERE source_asset_id IS NOT NULL);
  RAISE NOTICE '──────────────────────────────────────────';

  IF n_versions = 0 THEN
    RAISE NOTICE '⚠ AUCUNE version de budget active n''existe.';
    RAISE NOTICE '   → Les budget_lines amortissements ne peuvent PAS être créées.';
    RAISE NOTICE '   → Crée d''abord une version sur /admin/budgets.';
    RAISE NOTICE '──────────────────────────────────────────';
  END IF;

  FOR a IN SELECT id, code FROM assets ORDER BY code
  LOOP
    n_cost := generate_full_asset_depreciation(a.id);
    n_budget := sync_asset_budget_lines(a.id);
    total_cost := total_cost + n_cost;
    total_budget := total_budget + n_budget;
    RAISE NOTICE '✓ %: % cost_entries · % budget_lines', a.code, n_cost, n_budget;
  END LOOP;

  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '   Résultat : % cost_entries + % budget_lines', total_cost, total_budget;
  RAISE NOTICE '══════════════════════════════════════════';
END $$;
