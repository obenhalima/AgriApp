-- ============================================================
-- PHASE 2.1 — PLAN COMPTABLE NORMALISÉ
-- Hiérarchie d'agrégation alignée sur le CPC (Compte de Produits et Charges)
-- utilisé pour la génération du compte d'exploitation et des statistiques.
--
-- 4 types racines :
--   - produit           → PRODUITS (CA Export, CA Local, Autres revenus, Prod. encours)
--   - charge_variable   → Intrants, Énergie, Transport sur ventes
--   - charge_fixe       → MOD, MO Admin, Loyers, Entretien, Autres FG...
--   - amortissement     → Constructions, Serres, Irrigation, Plastique, Fibre coco, MMB...
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table hiérarchique
-- ------------------------------------------------------------
CREATE TABLE account_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES account_categories(id) ON DELETE RESTRICT,
  code VARCHAR(30) UNIQUE NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('produit', 'charge_variable', 'charge_fixe', 'amortissement')),
  level INTEGER NOT NULL DEFAULT 1
    CHECK (level BETWEEN 1 AND 3),
  display_order INTEGER NOT NULL DEFAULT 0,
  -- Applicable uniquement quand type='amortissement' : durée par défaut en années
  default_depreciation_years INTEGER
    CHECK (default_depreciation_years IS NULL OR default_depreciation_years > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_account_cat_parent ON account_categories(parent_id);
CREATE INDEX idx_account_cat_type   ON account_categories(type);

-- ------------------------------------------------------------
-- 2. SEED des catégories (3 niveaux)
-- ------------------------------------------------------------

-- ----- LEVEL 1 : types racines -----
INSERT INTO account_categories (code, label, type, level, display_order) VALUES
  ('PRODUITS',       'Produits',          'produit',         1, 1),
  ('CHARGES_VAR',    'Charges variables', 'charge_variable', 1, 2),
  ('CHARGES_FIXES',  'Charges fixes',     'charge_fixe',     1, 3),
  ('AMORTISSEMENTS', 'Amortissements',    'amortissement',   1, 4);

-- ----- LEVEL 2 : sous-groupes -----
WITH parents AS (SELECT code, id FROM account_categories WHERE level = 1)
INSERT INTO account_categories (parent_id, code, label, type, level, display_order)
SELECT p.id, v.code, v.label, v.type, 2, v.display_order
FROM (VALUES
  -- Produits
  ('PRODUITS',      'CA_EXPORT',    'CA Export',              'produit',          1),
  ('PRODUITS',      'CA_LOCAL',     'CA Marché local',        'produit',          2),
  ('PRODUITS',      'AUTRES_REV',   'Autres revenus',         'produit',          3),
  ('PRODUITS',      'PROD_ENCOURS', 'Production en-cours',    'produit',          4),
  -- Charges variables
  ('CHARGES_VAR',   'INTRANTS',     'Intrants',               'charge_variable',  1),
  ('CHARGES_VAR',   'ENERGIE',      'Énergie',                'charge_variable',  2),
  ('CHARGES_VAR',   'TRANSPORT_V',  'Transport sur ventes',   'charge_variable',  3)
) AS v(parent_code, code, label, type, display_order)
JOIN parents p ON p.code = v.parent_code;

-- ----- LEVEL 3 : postes (feuilles) détaillés -----
WITH parents AS (SELECT code, id FROM account_categories WHERE level = 2)
INSERT INTO account_categories (parent_id, code, label, type, level, display_order)
SELECT p.id, v.code, v.label, v.type, 3, v.display_order
FROM (VALUES
  -- Intrants
  ('INTRANTS',      'SEMENCES',          'Semences',                   'charge_variable',  1),
  ('INTRANTS',      'PLANTS',            'Plants',                     'charge_variable',  2),
  ('INTRANTS',      'ENGRAIS',           'Engrais',                    'charge_variable',  3),
  ('INTRANTS',      'PHYTOS',            'Phytosanitaires',            'charge_variable',  4),
  ('INTRANTS',      'INSECTES_AUX',      'Insectes auxiliaires',       'charge_variable',  5),
  ('INTRANTS',      'RUCHES',            'Ruches',                     'charge_variable',  6),
  ('INTRANTS',      'AUTRES_FOURNI',     'Autres fournitures agricoles','charge_variable', 7),
  -- Énergie
  ('ENERGIE',       'ELECTRICITE',       'Électricité',                'charge_variable',  1),
  ('ENERGIE',       'EAU',               'Eau',                        'charge_variable',  2),
  -- Transport (seule feuille sous son parent)
  ('TRANSPORT_V',   'TRANSPORT_VENTES',  'Transport sur ventes',       'charge_variable',  1)
) AS v(parent_code, code, label, type, display_order)
JOIN parents p ON p.code = v.parent_code;

-- ----- LEVEL 2 : feuilles directes sous les charges fixes -----
WITH parents AS (SELECT code, id FROM account_categories WHERE code = 'CHARGES_FIXES')
INSERT INTO account_categories (parent_id, code, label, type, level, display_order)
SELECT p.id, v.code, v.label, v.type, 2, v.display_order
FROM (VALUES
  ('MOD',            'Main d''œuvre directe',      'charge_fixe', 1),
  ('MO_ADMIN',       'Main d''œuvre Admin & Tech', 'charge_fixe', 2),
  ('LOYER_FERMES',   'Loyers fermes',              'charge_fixe', 3),
  ('ENTRETIEN',      'Entretien & maintenance',    'charge_fixe', 4),
  ('PRESTATIONS',    'Prestations & analyses',     'charge_fixe', 5),
  ('REFACTURATION',  'Refacturations',             'charge_fixe', 6),
  ('AUTRES_FG',      'Autres frais généraux',      'charge_fixe', 7)
) AS v(code, label, type, display_order), parents p;

-- ----- LEVEL 2 : feuilles directes sous les amortissements -----
WITH parents AS (SELECT code, id FROM account_categories WHERE code = 'AMORTISSEMENTS')
INSERT INTO account_categories (parent_id, code, label, type, level, display_order, default_depreciation_years)
SELECT p.id, v.code, v.label, v.type, 2, v.display_order, v.years
FROM (VALUES
  ('AMT_CONSTRUCTIONS', 'Constructions',            'amortissement',  1, 20),
  ('AMT_SERRES',        'Serres',                   'amortissement',  2, 15),
  ('AMT_IRRIGATION',    'Irrigation',               'amortissement',  3, 10),
  ('AMT_ELECTRIF',      'Électrification',          'amortissement',  4, 10),
  ('AMT_FILET',         'Filet',                    'amortissement',  5,  5),
  ('AMT_MMB',           'Matériel, mobilier, bureau','amortissement', 6,  5),
  ('AMT_MEL_AGRI',      'Mel agricole',             'amortissement',  7,  3),
  ('AMT_PLASTIQUE',     'Plastique',                'amortissement',  8,  3),
  ('AMT_FIBRE_COCO',    'Fibre de coco',            'amortissement',  9,  2)
) AS v(code, label, type, display_order, years), parents p;

-- ------------------------------------------------------------
-- 3. Ajout de account_category_id sur cost_entries (nullable pour rétrocompat)
-- ------------------------------------------------------------
ALTER TABLE cost_entries
  ADD COLUMN account_category_id UUID REFERENCES account_categories(id) ON DELETE RESTRICT;

CREATE INDEX idx_cost_entries_account_cat ON cost_entries(account_category_id);

-- ------------------------------------------------------------
-- 4. Mapping initial depuis cost_entries.cost_category (VARCHAR libre)
--     vers account_category_id lorsque possible
-- ------------------------------------------------------------
UPDATE cost_entries ce
SET account_category_id = ac.id
FROM account_categories ac
WHERE ce.account_category_id IS NULL
  AND (
    (LOWER(ce.cost_category) = 'semences'        AND ac.code = 'SEMENCES') OR
    (LOWER(ce.cost_category) = 'plants'          AND ac.code = 'PLANTS') OR
    (LOWER(ce.cost_category) = 'engrais'         AND ac.code = 'ENGRAIS') OR
    (LOWER(ce.cost_category) = 'phytosanitaires' AND ac.code = 'PHYTOS') OR
    (LOWER(ce.cost_category) = 'insectes'        AND ac.code = 'INSECTES_AUX') OR
    (LOWER(ce.cost_category) = 'ruches'          AND ac.code = 'RUCHES') OR
    (LOWER(ce.cost_category) = 'irrigation'      AND ac.code = 'AUTRES_FOURNI') OR
    (LOWER(ce.cost_category) = 'emballage'       AND ac.code = 'AUTRES_FOURNI') OR
    (LOWER(ce.cost_category) = 'energie'         AND ac.code = 'ELECTRICITE') OR
    (LOWER(ce.cost_category) = 'transport'       AND ac.code = 'TRANSPORT_VENTES') OR
    (LOWER(ce.cost_category) = 'services'        AND ac.code = 'PRESTATIONS') OR
    (LOWER(ce.cost_category) = 'equipement'      AND ac.code = 'AMT_MMB') OR
    (LOWER(ce.cost_category) = 'divers'          AND ac.code = 'AUTRES_FG')
  );

-- ------------------------------------------------------------
-- 5. Vue utile pour l'arbre complet (niveau 1 → 3 avec ancêtre racine)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_account_categories_tree AS
WITH RECURSIVE tree AS (
  SELECT id, parent_id, code, label, type, level, display_order, default_depreciation_years, is_active,
         code::TEXT  AS root_code,
         label::TEXT AS root_label,
         label::TEXT AS path
  FROM account_categories
  WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.code, c.label, c.type, c.level, c.display_order,
         c.default_depreciation_years, c.is_active,
         t.root_code, t.root_label,
         (t.path || ' › ' || c.label)::TEXT
  FROM account_categories c
  JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree;
