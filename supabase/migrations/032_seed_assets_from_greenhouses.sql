-- ============================================================
-- Seed initial des actifs immobilisés à partir des serres existantes
--
-- Crée 1 asset par greenhouse possédant une date de mise en service,
-- avec un coût d'acquisition ESTIMÉ basé sur la surface × taux/m² selon
-- le type de serre. L'utilisateur peut ensuite éditer chaque actif sur
-- /admin/amortissements pour saisir le coût réel.
--
-- Idempotent : ON CONFLICT (code) DO NOTHING. Re-jouable sans casser
-- les actifs existants.
-- ============================================================

DO $$
DECLARE
  v_amt_serres_id UUID;
  v_inserted INTEGER;
BEGIN
  -- Catégorie AMT_SERRES doit exister (migration 009)
  SELECT id INTO v_amt_serres_id FROM account_categories WHERE code = 'AMT_SERRES' LIMIT 1;
  IF v_amt_serres_id IS NULL THEN
    RAISE EXCEPTION 'Catégorie AMT_SERRES introuvable — migration 009 manquante';
  END IF;

  -- Insère 1 asset par serre avec commissioning_date
  INSERT INTO assets (
    code, label, account_category_id,
    acquisition_date, acquisition_cost,
    useful_life_years, depreciation_method, residual_value,
    farm_id, greenhouse_id, is_active,
    notes
  )
  SELECT
    'SERR-' || g.code,
    'Serre ' || g.code || ' — ' || COALESCE(g.name, '?') || ' (' || g.type::TEXT || ')',
    v_amt_serres_id,
    g.commissioning_date,
    -- Coût estimé : surface × taux par type
    ROUND(
      COALESCE(g.exploitable_area, g.total_area, 0)::numeric
      * CASE g.type::TEXT
          WHEN 'tunnel'           THEN 80   -- bâche simple
          WHEN 'multichapelle'    THEN 150  -- multichapelle standard
          WHEN 'canarienne'       THEN 200  -- haut de gamme
          WHEN 'verre'            THEN 800  -- serre verre (rare)
          ELSE 100                          -- autre / défaut
        END
    , 2),
    15,         -- 15 ans (durée standard pour AMT_SERRES)
    'linear',
    0,          -- valeur résiduelle 0
    g.farm_id,
    g.id,
    g.status::TEXT IN ('active', 'maintenance'),  -- inactif si abandoned
    'Coût ESTIMÉ — à valider/ajuster (' ||
      COALESCE(g.exploitable_area, g.total_area, 0)::TEXT || ' m² × taux ' ||
      CASE g.type::TEXT
        WHEN 'tunnel' THEN '80'
        WHEN 'multichapelle' THEN '150'
        WHEN 'canarienne' THEN '200'
        WHEN 'verre' THEN '800'
        ELSE '100'
      END || ' MAD/m²)'
  FROM greenhouses g
  WHERE g.commissioning_date IS NOT NULL
    AND COALESCE(g.exploitable_area, g.total_area, 0) > 0
  ON CONFLICT (code) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '   ✓ % actifs créés depuis greenhouses', v_inserted;
  RAISE NOTICE '   Va sur /admin/amortissements pour valider/ajuster les coûts.';
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;

-- ============================================================
-- Pour les serres SANS commissioning_date :
-- ============================================================
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphans FROM greenhouses
  WHERE commissioning_date IS NULL OR COALESCE(exploitable_area, total_area, 0) = 0;
  IF v_orphans > 0 THEN
    RAISE NOTICE '⚠ % serre(s) sans commissioning_date ou sans surface — pas d''actif créé', v_orphans;
    RAISE NOTICE '   → renseigne ces champs sur /serres puis re-exécute cette migration.';
  END IF;
END $$;
