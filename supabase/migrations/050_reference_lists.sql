-- ============================================================
-- Migration 050 — Référentiels dynamiques (No-Code) · Phase P1
--
-- Permet de gérer SANS CODE les listes déroulantes de l'app :
-- types de clients/marchés/variétés, catégories, unités, etc.
--
-- 2 tables génériques :
--   • reference_lists   : les catégories de listes (ex: 'client_type')
--   • reference_values  : les valeurs de chaque liste (code + label + couleur…)
--
-- + relâche 4 enums Postgres en VARCHAR pour autoriser l'ajout de
--   nouvelles valeurs depuis l'admin (Option A). Les enums restent
--   définis (non droppés) — seules les colonnes deviennent VARCHAR.
-- ============================================================

-- ─── 1. Tables génériques ───────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_lists (
  key         VARCHAR(50) PRIMARY KEY,
  label       VARCHAR(120) NOT NULL,
  description TEXT,
  is_system   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reference_values (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_key    VARCHAR(50) NOT NULL REFERENCES reference_lists(key) ON DELETE CASCADE,
  code        VARCHAR(50) NOT NULL,
  label       VARCHAR(120) NOT NULL,
  color       VARCHAR(20),
  icon        VARCHAR(20),
  metadata    JSONB DEFAULT '{}',
  order_idx   INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_key, code)
);

CREATE INDEX IF NOT EXISTS idx_refvalues_list
  ON reference_values(list_key, order_idx) WHERE is_active;

-- ─── 2. RLS : lecture authenticated, écriture admin ─────────
ALTER TABLE reference_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_read" ON reference_lists;
CREATE POLICY "ref_read" ON reference_lists FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ref_write" ON reference_lists;
CREATE POLICY "ref_write" ON reference_lists FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "refv_read" ON reference_values;
CREATE POLICY "refv_read" ON reference_values FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "refv_write" ON reference_values;
CREATE POLICY "refv_write" ON reference_values FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ─── 3. Realtime (UI live quand un admin modifie) ───────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reference_lists; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reference_values; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─── 4. Relâche les 4 enums en VARCHAR (Option A) ───────────
-- L'enum reste défini (on ne le DROP pas), seule la colonne change de type.
-- Permet d'ajouter de nouvelles valeurs via l'admin sans migration future.

-- clients.type (a un DEFAULT 'grossiste' → drop puis re-set)
DO $$
BEGIN
  ALTER TABLE clients ALTER COLUMN type DROP DEFAULT;
  ALTER TABLE clients ALTER COLUMN type TYPE VARCHAR(50) USING type::text;
  ALTER TABLE clients ALTER COLUMN type SET DEFAULT 'grossiste';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'clients.type deja VARCHAR ou erreur (skip): %', SQLERRM;
END $$;

-- suppliers.category (NOT NULL, pas de default)
DO $$
BEGIN
  ALTER TABLE suppliers ALTER COLUMN category TYPE VARCHAR(50) USING category::text;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'suppliers.category deja VARCHAR ou erreur (skip): %', SQLERRM;
END $$;

-- varieties.type (tomato_type, NOT NULL)
DO $$
BEGIN
  ALTER TABLE varieties ALTER COLUMN type TYPE VARCHAR(50) USING type::text;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'varieties.type deja VARCHAR ou erreur (skip): %', SQLERRM;
END $$;

-- stock_items.category (stock_category, NOT NULL)
DO $$
BEGIN
  ALTER TABLE stock_items ALTER COLUMN category TYPE VARCHAR(50) USING category::text;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'stock_items.category deja VARCHAR ou erreur (skip): %', SQLERRM;
END $$;

-- ─── 5. Seed des listes (idempotent) ────────────────────────
INSERT INTO reference_lists (key, label, description) VALUES
  ('client_type',         'Types de clients',        'Catégorie commerciale du client (champ Type sur /clients)'),
  ('market_type',         'Types de marchés',        'Nature du marché (champ Type sur /marches)'),
  ('supplier_category',   'Catégories fournisseurs', 'Domaine d''activité du fournisseur (/fournisseurs)'),
  ('variety_type',        'Types de variétés',       'Type de tomate (champ Type sur /varietes)'),
  ('stock_category',      'Catégories de stock',     'Famille d''article (champ Catégorie sur /stocks)'),
  ('unit',                'Unités de mesure',        'Unité de quantité (kg, L, unité… sur /stocks et /agronomie)')
ON CONFLICT (key) DO NOTHING;

-- client_type
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('client_type', 'grossiste',       'Grossiste',        1, true),
  ('client_type', 'exportateur',     'Exportateur',      2, false),
  ('client_type', 'grande_surface',  'Grande surface',   3, false),
  ('client_type', 'detail',          'Détail',           4, false),
  ('client_type', 'industrie',       'Industrie',        5, false),
  ('client_type', 'institutionnel',  'Institutionnel',   6, false),
  ('client_type', 'station',         'Station',          7, false),
  ('client_type', 'autre',           'Autre',            99, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- market_type
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('market_type', 'local',                'Local',                1, true),
  ('market_type', 'export',               'Export',               2, false),
  ('market_type', 'grande_distribution',  'Grande distribution',  3, false),
  ('market_type', 'grossiste',            'Grossiste',            4, false),
  ('market_type', 'industrie',            'Industrie',            5, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- supplier_category
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('supplier_category', 'semences',        'Semences',         1, false),
  ('supplier_category', 'engrais',         'Engrais',          2, false),
  ('supplier_category', 'phytosanitaires', 'Phytosanitaires',  3, false),
  ('supplier_category', 'irrigation',      'Irrigation',       4, false),
  ('supplier_category', 'emballage',       'Emballage',        5, false),
  ('supplier_category', 'transport',       'Transport',        6, false),
  ('supplier_category', 'energie',         'Énergie',          7, false),
  ('supplier_category', 'services',        'Services',         8, true),
  ('supplier_category', 'equipement',      'Équipement',       9, false),
  ('supplier_category', 'autre',           'Autre',            99, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- variety_type (tomato_type)
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('variety_type', 'ronde',           'Ronde',            1, true),
  ('variety_type', 'grappe',          'Grappe',           2, false),
  ('variety_type', 'cerise',          'Cerise',           3, false),
  ('variety_type', 'allongee',        'Allongée',         4, false),
  ('variety_type', 'cocktail',        'Cocktail',         5, false),
  ('variety_type', 'beef',            'Beef',             6, false),
  ('variety_type', 'coeur_de_boeuf',  'Cœur de bœuf',     7, false),
  ('variety_type', 'olivette',        'Olivette',         8, false),
  ('variety_type', 'autre',           'Autre',            99, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- stock_category
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('stock_category', 'semences',        'Semences',         1, false),
  ('stock_category', 'plants',          'Plants',           2, false),
  ('stock_category', 'engrais',         'Engrais',          3, false),
  ('stock_category', 'phytosanitaires', 'Phytosanitaires',  4, false),
  ('stock_category', 'emballages',      'Emballages',       5, false),
  ('stock_category', 'consommables',    'Consommables',     6, true),
  ('stock_category', 'pieces_rechange', 'Pièces de rechange', 7, false),
  ('stock_category', 'autre',           'Autre',            99, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- unit
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('unit', 'kg',      'Kilogramme (kg)',  1, true),
  ('unit', 'L',       'Litre (L)',        2, false),
  ('unit', 'unite',   'Unité',            3, false),
  ('unit', 'sac',     'Sac',              4, false),
  ('unit', 'boite',   'Boîte',            5, false),
  ('unit', 'rouleau', 'Rouleau',          6, false),
  ('unit', 'm2',      'Mètre carré (m²)', 7, false),
  ('unit', 'autre',   'Autre',            99, false)
ON CONFLICT (list_key, code) DO NOTHING;

COMMENT ON TABLE reference_lists IS 'Catégories de listes déroulantes paramétrables (no-code). Lecture publique, écriture admin.';
COMMENT ON TABLE reference_values IS 'Valeurs de chaque liste de référence (code stocké en DB + label affiché + couleur/icône/ordre).';
