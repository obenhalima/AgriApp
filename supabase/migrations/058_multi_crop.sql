-- ============================================================
-- Migration 058 — Multi-culture (Lot A : fondation)
--
-- Introduit la notion de CULTURE (crops) parente des variétés.
--   • crops : catalogue des cultures + comportement (cycle, unité, Brix…)
--   • varieties.crop_id : chaque variété appartient à une culture (défaut Tomate)
--   • crop_variety_catalog : suggestions de variétés réelles (assiste la saisie)
--
-- Données issues du référentiel vérifié (REFERENTIEL_CULTURES.md).
-- ============================================================

-- ─── 1. Table des cultures ──────────────────────────────────
CREATE TABLE IF NOT EXISTS crops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  family        VARCHAR(80),
  icon          VARCHAR(20),
  color         VARCHAR(20),
  cycle_days_first_harvest INT,         -- jours plantation → 1ère récolte
  harvest_duration_days    INT,         -- étalement de récolte
  default_unit  VARCHAR(30) DEFAULT 'kg',
  brix_relevant BOOLEAN DEFAULT FALSE,  -- afficher/exiger le Brix au tri ?
  default_markets JSONB DEFAULT '[]',   -- ex: ["export","local"]
  variety_segments JSONB DEFAULT '[]',  -- types de variété propres à la culture
  is_active     BOOLEAN DEFAULT TRUE,
  order_idx     INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crops_read" ON crops;
CREATE POLICY "crops_read" ON crops FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "crops_write" ON crops;
CREATE POLICY "crops_write" ON crops FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ─── 2. Rattachement variété → culture ──────────────────────
ALTER TABLE varieties ADD COLUMN IF NOT EXISTS crop_id UUID REFERENCES crops(id);

-- ─── 3. Catalogue de suggestions de variétés ────────────────
CREATE TABLE IF NOT EXISTS crop_variety_catalog (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crop_code  VARCHAR(50) NOT NULL,
  name       VARCHAR(120) NOT NULL,
  segment    VARCHAR(80),
  breeder    VARCHAR(80),
  traits     TEXT,
  verified   BOOLEAN DEFAULT FALSE,
  order_idx  INT DEFAULT 0,
  UNIQUE (crop_code, name)
);
ALTER TABLE crop_variety_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_read" ON crop_variety_catalog;
CREATE POLICY "catalog_read" ON crop_variety_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "catalog_write" ON crop_variety_catalog;
CREATE POLICY "catalog_write" ON crop_variety_catalog FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE crops; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE crop_variety_catalog; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─── 4. Seed des cultures ───────────────────────────────────
-- is_active = TRUE : tomate + légumes serre (choix Domaine BENHALIMA).
-- Fruits rouges + plein champ seedés mais INACTIFS (activables sans code).
INSERT INTO crops (code, name, family, icon, color, cycle_days_first_harvest, harvest_duration_days, default_unit, brix_relevant, default_markets, variety_segments, is_active, order_idx) VALUES
  ('tomate',        'Tomate',          'Solanacées',     '🍅', '#ef4444', 75,  180, 'kg',        true,  '["export","local"]',      '["ronde","grappe","cerise","cocktail","allongee","beef","coeur_de_boeuf"]', true,  1),
  ('poivron',       'Poivron doux',    'Solanacées',     '🫑', '#22c55e', 85,  150, 'kg',        false, '["export","local"]',      '["california","lamuyo","conique"]',                                          true,  2),
  ('piment_fort',   'Piment fort',     'Solanacées',     '🌶️', '#dc2626', 80,  150, 'kg',        false, '["local","industrie"]',   '["fort_long","doux_long","rond"]',                                           false, 3),
  ('aubergine',     'Aubergine',       'Solanacées',     '🍆', '#7c3aed', 80,  150, 'kg',        false, '["local","export"]',      '["longue","ovale","globe","blanche"]',                                       true,  4),
  ('concombre',     'Concombre',       'Cucurbitacées',  '🥒', '#16a34a', 40,  90,  'piece',     false, '["export","local"]',      '["long_hollandais","beit_alpha","mini"]',                                    true,  5),
  ('courgette',     'Courgette',       'Cucurbitacées',  '🥒', '#84cc16', 45,  75,  'kg',        false, '["export","local"]',      '["verte","jaune","ronde"]',                                                  true,  6),
  ('melon',         'Melon',           'Cucurbitacées',  '🍈', '#f59e0b', 85,  45,  'piece',     true,  '["export","local"]',      '["charentais","galia","canari","piel_de_sapo"]',                             true,  7),
  ('pasteque',      'Pastèque',        'Cucurbitacées',  '🍉', '#ec4899', 85,  45,  'piece',     true,  '["local","export"]',      '["rouge_pepins","sans_pepins","mini"]',                                      true,  8),
  ('haricot_vert',  'Haricot vert',    'Fabacées',       '🫛', '#65a30d', 65,  90,  'kg',        false, '["export"]',              '["filet_extrafin","filet_fin","mangetout","beurre"]',                        true,  9),
  ('petits_pois',   'Petits pois',     'Fabacées',       '🫛', '#4d7c0f', 65,  45,  'kg',        false, '["local"]',               '["a_ecosser","mangetout"]',                                                  false, 10),
  ('fraise',        'Fraise',          'Rosacées',       '🍓', '#e11d48', 75,  150, 'barquette', true,  '["export"]',              '["frais","iqf_surgele"]',                                                    false, 11),
  ('framboise',     'Framboise',       'Rosacées',       '🫐', '#be123c', 90,  120, 'barquette', true,  '["export"]',              '["remontante","non_remontante"]',                                            false, 12),
  ('myrtille',      'Myrtille',        'Éricacées',      '🫐', '#4338ca', 730, 210, 'barquette', true,  '["export"]',              '["southern_highbush"]',                                                      false, 13),
  ('oignon',        'Oignon',          'Amaryllidacées', '🧅', '#a16207', 120, 30,  'kg',        false, '["local","export"]',      '["jaune","rouge","blanc"]',                                                  false, 14),
  ('pomme_de_terre','Pomme de terre',  'Solanacées',     '🥔', '#ca8a04', 100, 20,  'kg',        false, '["local","export"]',      '["primeur","conservation"]',                                                 false, 15)
ON CONFLICT (code) DO NOTHING;

-- ─── 5. Rattache les variétés existantes à Tomate ───────────
UPDATE varieties SET crop_id = (SELECT id FROM crops WHERE code = 'tomate')
WHERE crop_id IS NULL;

-- ─── 6. Seed du catalogue de variétés VÉRIFIÉES ─────────────
-- Poivron (Syngenta Maroc)
INSERT INTO crop_variety_catalog (crop_code, name, segment, breeder, traits, verified, order_idx) VALUES
  ('poivron', 'Masami',   'california', 'Syngenta', 'California rouge (bloc), fruits uniformes, vigoureux, bonne nouaison au froid', true, 1),
  ('poivron', 'Saidah',   'california', 'Syngenta', 'California doux (distrib. Casem)', true, 2),
  ('poivron', 'Saitama',  'california', 'Syngenta', 'Tolère froid et chaleur', true, 3),
  ('poivron', 'Tzil',     'california', 'Syngenta', 'Adapté au cycle d''hiver', true, 4),
  ('poivron', 'Angelito', 'mini',       'Syngenta', 'Mini / snacking, petit calibre', true, 5),
  ('piment_fort', 'Sahem','fort_long',  'Syngenta', 'Piment fort, forte teneur en capsaïcine (distrib. Casem)', true, 1)
ON CONFLICT (crop_code, name) DO NOTHING;

-- Fraise
INSERT INTO crop_variety_catalog (crop_code, name, segment, breeder, traits, verified, order_idx) VALUES
  ('fraise', 'Camarosa',    'frais',       NULL, 'Dominante, double usage frais + surgelé', true, 1),
  ('fraise', 'Festival',    'frais',       NULL, '~80% de la surface avec Camarosa/Splendor', true, 2),
  ('fraise', 'Splendor',    'frais',       NULL, NULL, true, 3),
  ('fraise', 'Sabrina',     'frais',       NULL, NULL, true, 4),
  ('fraise', 'San Andreas', 'frais',       NULL, 'Remontante, frais + IQF', true, 5),
  ('fraise', 'Fortuna',     'frais',       NULL, 'Frais + IQF', true, 6),
  ('fraise', 'Chandler',    'frais',       NULL, 'Variété historique', true, 7),
  ('fraise', 'Oso Grande',  'frais',       NULL, 'Variété historique', true, 8)
ON CONFLICT (crop_code, name) DO NOTHING;

-- Framboise
INSERT INTO crop_variety_catalog (crop_code, name, segment, breeder, traits, verified, order_idx) VALUES
  ('framboise', 'Adelita',    'remontante', NULL, '~21%, faible besoin en froid (low-chill)', true, 1),
  ('framboise', 'Carmina',    'remontante', NULL, '~17% des surfaces', true, 2),
  ('framboise', 'Maravilla',  'remontante', NULL, 'Très cultivée', true, 3),
  ('framboise', 'Cardinal',   'remontante', NULL, NULL, true, 4),
  ('framboise', 'Sevillana',  'remontante', NULL, NULL, true, 5),
  ('framboise', 'Alicia',     'remontante', NULL, NULL, true, 6),
  ('framboise', 'Marabia',    'remontante', NULL, NULL, true, 7),
  ('framboise', 'Glen Lyon',  'remontante', NULL, NULL, true, 8),
  ('framboise', 'Brillance',  'remontante', NULL, NULL, true, 9)
ON CONFLICT (crop_code, name) DO NOTHING;

COMMENT ON TABLE crops IS 'Cultures (tomate, poivron…) parentes des variétés. Portent le comportement métier (cycle, unité, Brix).';
COMMENT ON TABLE crop_variety_catalog IS 'Suggestions de variétés réelles par culture. Assiste la création (import 1-clic). verified=true → donnée sourcée.';
