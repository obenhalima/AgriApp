-- ============================================================
-- FarmPilot — migrations 054 à 059 à appliquer d'un coup
-- Généré pour Dashboard Supabase → SQL Editor (copier-coller tout, Run)
-- Idempotent (IF NOT EXISTS / ON CONFLICT) : ré-exécution sans danger.
-- ============================================================


-- ▼▼▼ ============ 054_harvest_trays.sql ============ ▼▼▼

-- ============================================================
-- Migration 054 — Récolte en plateaux (Lot 1)
--
-- Réalité terrain : au champ, le caporal ne connaît pas le poids réel.
-- Il compte des PLATEAUX (types variés, chacun ayant un poids théorique).
-- Le poids ESTIMÉ = Σ (nb plateaux × poids théorique du type).
-- Le poids RÉEL viendra de la pesée station (Lot 2).
--
-- Contenu :
--   1. Référentiel no-code 'tray_type' (poids théorique dans metadata.poids_kg)
--   2. Table harvest_tray_lines (lignes de plateaux par récolte)
--   3. harvests.estimated_kg (poids estimé total)
-- ============================================================

-- ─── 1. Référentiel des types de plateaux ───────────────────
-- (suppose migration 050 appliquée : tables reference_lists/values)
INSERT INTO reference_lists (key, label, description) VALUES
  ('tray_type', 'Types de plateaux', 'Contenants de récolte au champ. Le poids théorique (kg) sert à estimer le tonnage avant pesée station.')
ON CONFLICT (key) DO NOTHING;

-- Valeurs d'EXEMPLE — à ajuster dans /admin/referentiels selon tes vrais plateaux.
-- Le poids théorique est dans metadata.poids_kg.
INSERT INTO reference_values (list_key, code, label, metadata, order_idx, is_default) VALUES
  ('tray_type', 'plateau_10', 'Plateau 10 kg', '{"poids_kg": 10}', 1, true),
  ('tray_type', 'plateau_25', 'Plateau 25 kg', '{"poids_kg": 25}', 2, false),
  ('tray_type', 'caisse_20',  'Caisse 20 kg',  '{"poids_kg": 20}', 3, false),
  ('tray_type', 'cagette_6',  'Cagette 6 kg',  '{"poids_kg": 6}',  4, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- ─── 2. Poids estimé sur la récolte ─────────────────────────
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS estimated_kg DECIMAL(10, 2);

COMMENT ON COLUMN harvests.estimated_kg IS
  'Poids estimé (kg) = Σ lignes de plateaux. Source de vérité avant pesée station. Lot 2 ajoutera actual_kg.';

-- ─── 3. Lignes de plateaux par récolte ──────────────────────
CREATE TABLE IF NOT EXISTS harvest_tray_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id       UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  tray_type_code   VARCHAR(50) NOT NULL,           -- code du référentiel tray_type
  tray_type_label  VARCHAR(120),                   -- libellé figé au moment de la saisie
  nb_trays         INT NOT NULL CHECK (nb_trays > 0),
  poids_unitaire_kg DECIMAL(8, 2) NOT NULL DEFAULT 0, -- poids théorique figé (snapshot)
  line_kg          DECIMAL(10, 2) GENERATED ALWAYS AS (nb_trays * poids_unitaire_kg) STORED,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tray_lines_harvest ON harvest_tray_lines(harvest_id);

-- RLS : lecture + écriture authenticated (le caporal saisit sa propre récolte)
ALTER TABLE harvest_tray_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_tray_lines" ON harvest_tray_lines;
CREATE POLICY "auth_read_tray_lines" ON harvest_tray_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_tray_lines" ON harvest_tray_lines;
CREATE POLICY "auth_write_tray_lines" ON harvest_tray_lines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE harvest_tray_lines; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMENT ON TABLE harvest_tray_lines IS 'Lignes de plateaux d''une récolte (type + nombre). line_kg = nb × poids théorique figé.';

-- ▲▲▲ ============ fin 054_harvest_trays ============ ▲▲▲


-- ▼▼▼ ============ 055_station_weighing.sql ============ ▼▼▼

-- ============================================================
-- Migration 055 — Pesée station + répartition prorata (Lot 2)
--
-- L'envoi (harvest_lot) part avec un poids ESTIMÉ (somme des plateaux).
-- Le lendemain, la station renvoie le TONNAGE RÉEL pesé. On le redescend
-- au prorata de l'estimation sur chaque récolte source (harvest_lot_sources)
-- et on remplit harvests.actual_kg.
-- ============================================================

-- ─── 1. Colonnes ────────────────────────────────────────────
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS actual_kg DECIMAL(10, 2);
COMMENT ON COLUMN harvests.actual_kg IS
  'Poids réel attribué à la récolte après pesée station (réparti au prorata de l''estimation). NULL tant que non pesé.';

ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS estimated_kg DECIMAL(10, 2),  -- snapshot de l'estimation à l'envoi
  ADD COLUMN IF NOT EXISTS weighed_kg   DECIMAL(10, 2),  -- tonnage réel pesé par la station
  ADD COLUMN IF NOT EXISTS weighed_at   TIMESTAMPTZ;
COMMENT ON COLUMN harvest_lots.weighed_kg IS 'Tonnage réel pesé par la station. Une fois saisi, quantity_kg = weighed_kg et le tri travaille dessus.';

-- ─── 2. RPC de pesée + répartition prorata ──────────────────
-- SECURITY DEFINER : permet au personnel station (authenticated) de mettre à
-- jour harvest_lot_sources (table admin-write) de façon atomique.
CREATE OR REPLACE FUNCTION admin_weigh_station_dispatch(
  p_dispatch_id UUID,
  p_real_kg     DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_est DECIMAL;
  v_count     INT;
  r           RECORD;
  v_new       DECIMAL;
BEGIN
  IF p_real_kg IS NULL OR p_real_kg <= 0 THEN
    RAISE EXCEPTION 'Le tonnage réel doit être > 0';
  END IF;

  -- Somme des contributions estimées (clé de répartition)
  SELECT COALESCE(SUM(qty_contributed_kg), 0), COUNT(*)
    INTO v_total_est, v_count
  FROM harvest_lot_sources
  WHERE harvest_lot_id = p_dispatch_id;

  IF v_count = 0 OR v_total_est <= 0 THEN
    RAISE EXCEPTION 'Envoi sans récoltes sources pesables (estimation nulle).';
  END IF;

  -- Répartit le poids réel au prorata de l'estimation, sur chaque source
  FOR r IN
    SELECT id, harvest_id, qty_contributed_kg
    FROM harvest_lot_sources
    WHERE harvest_lot_id = p_dispatch_id
  LOOP
    v_new := ROUND(p_real_kg * (r.qty_contributed_kg / v_total_est), 2);
    UPDATE harvest_lot_sources SET qty_contributed_kg = v_new WHERE id = r.id;
  END LOOP;

  -- Marque l'envoi pesé : quantity_kg = réel (le tri travaillera dessus)
  UPDATE harvest_lots
  SET weighed_kg   = p_real_kg,
      quantity_kg  = p_real_kg,
      weighed_at   = NOW(),
      estimated_kg = COALESCE(estimated_kg, v_total_est)
  WHERE id = p_dispatch_id;

  -- Recalcule harvests.actual_kg = Σ contributions sur les envois PESÉS
  -- (une récolte peut être répartie sur plusieurs envois)
  UPDATE harvests h
  SET actual_kg = sub.total
  FROM (
    SELECT hls.harvest_id, SUM(hls.qty_contributed_kg) AS total
    FROM harvest_lot_sources hls
    JOIN harvest_lots hl ON hl.id = hls.harvest_lot_id
    WHERE hl.weighed_kg IS NOT NULL
      AND hls.harvest_id IN (
        SELECT harvest_id FROM harvest_lot_sources WHERE harvest_lot_id = p_dispatch_id
      )
    GROUP BY hls.harvest_id
  ) sub
  WHERE h.id = sub.harvest_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'estimated_kg', v_total_est,
    'real_kg', p_real_kg,
    'ecart_kg', ROUND(p_real_kg - v_total_est, 2),
    'sources', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_weigh_station_dispatch(UUID, DECIMAL) TO authenticated;

-- ▲▲▲ ============ fin 055_station_weighing ============ ▲▲▲


-- ▼▼▼ ============ 056_harvest_date_window.sql ============ ▼▼▼

-- ============================================================
-- Migration 056 — Interdire les récoltes hors plage de récolte
--
-- Une récolte ne peut être saisie que dans la fenêtre de récolte :
--   • bornes de la PLANTATION (first_harvest_date / last_harvest_date)
--     si définies,
--   • sinon bornes de la CAMPAGNE (harvest_start / harvest_end).
-- Si aucune borne n'est définie → aucune contrainte.
--
-- Pilotable no-code : app_settings 'business_params'.enforce_harvest_window
-- (true par défaut). Mettre à false pour désactiver le blocage.
-- ============================================================

-- Active le garde-fou par défaut dans business_params (si la clé existe)
UPDATE app_settings
SET value = value || '{"enforce_harvest_window": true}'::jsonb
WHERE key = 'business_params'
  AND NOT (value ? 'enforce_harvest_window');

CREATE OR REPLACE FUNCTION check_harvest_date_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_start   DATE;
  v_end     DATE;
  v_enforce BOOLEAN;
BEGIN
  -- Garde-fou activable/désactivable (no-code)
  SELECT COALESCE((value->>'enforce_harvest_window')::boolean, true)
    INTO v_enforce
  FROM app_settings WHERE key = 'business_params';
  IF v_enforce IS NULL THEN v_enforce := true; END IF;
  IF NOT v_enforce THEN RETURN NEW; END IF;

  -- Fenêtre : plantation si définie, sinon campagne
  SELECT COALESCE(cp.first_harvest_date, c.harvest_start),
         COALESCE(cp.last_harvest_date,  c.harvest_end)
    INTO v_start, v_end
  FROM campaign_plantings cp
  JOIN campaigns c ON c.id = cp.campaign_id
  WHERE cp.id = NEW.campaign_planting_id;

  IF v_start IS NOT NULL AND NEW.harvest_date < v_start THEN
    RAISE EXCEPTION 'Récolte le % impossible : avant le début de récolte (% ).', NEW.harvest_date, v_start
      USING HINT = 'Vérifie la plage de récolte de la campagne ou de la plantation.';
  END IF;

  IF v_end IS NOT NULL AND NEW.harvest_date > v_end THEN
    RAISE EXCEPTION 'Récolte le % impossible : après la fin de récolte (%).', NEW.harvest_date, v_end
      USING HINT = 'Vérifie la plage de récolte de la campagne ou de la plantation.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_harvest_window ON harvests;
CREATE TRIGGER trg_check_harvest_window
  BEFORE INSERT OR UPDATE OF harvest_date, campaign_planting_id ON harvests
  FOR EACH ROW EXECUTE FUNCTION check_harvest_date_window();

COMMENT ON FUNCTION check_harvest_date_window() IS
  'Bloque toute récolte hors plage (fenêtre plantation puis campagne). Désactivable via app_settings business_params.enforce_harvest_window.';

-- ▲▲▲ ============ fin 056_harvest_date_window ============ ▲▲▲


-- ▼▼▼ ============ 057_harvest_recorded_by.sql ============ ▼▼▼

-- ============================================================
-- Migration 057 — Traçabilité du récolteur (CA par utilisateur)
--
-- Qui a saisi la récolte ? Sert à calculer le « CA généré par moi ».
-- On stocke l'id du profil + un snapshot du nom (évite les jointures
-- avec la table legacy users dont la clé diffère de auth/profiles).
-- ============================================================

ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS recorded_by      UUID,           -- = profiles.id (auth.uid())
  ADD COLUMN IF NOT EXISTS recorded_by_name VARCHAR(255);   -- snapshot du nom au moment de la saisie

CREATE INDEX IF NOT EXISTS idx_harvests_recorded_by ON harvests(recorded_by);

COMMENT ON COLUMN harvests.recorded_by IS 'Profil (auth) qui a saisi la récolte. Sert à attribuer le CA généré.';

-- ▲▲▲ ============ fin 057_harvest_recorded_by ============ ▲▲▲


-- ▼▼▼ ============ 058_multi_crop.sql ============ ▼▼▼

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

-- ▲▲▲ ============ fin 058_multi_crop ============ ▲▲▲


-- ▼▼▼ ============ 059_security_hardening.sql ============ ▼▼▼

-- ============================================================
-- Migration 059 — Durcissement sécurité (Lot 1)
--
-- Corrige les findings de l'audit :
--   C1  admin_weigh_station_dispatch : aucun contrôle d'autorisation
--   C2  create_ecart_dispatch        : aucun contrôle d'autorisation
--   H1  paie/CNSS/congés lisibles par tout utilisateur connecté
--   H2  policies d'écriture ouvertes (USING(true) WITH CHECK(true))
--
-- Principe : lecture large conservée, ÉCRITURE / actions sensibles gated
-- sur is_admin(auth.uid()). (Un rôle « opérateur station » pourra assouplir
-- la pesée plus tard via le système de permissions.)
-- ============================================================

-- ─── C1. Pesée station : exiger l'admin ─────────────────────
CREATE OR REPLACE FUNCTION admin_weigh_station_dispatch(
  p_dispatch_id UUID,
  p_real_kg     DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_est DECIMAL;
  v_count     INT;
  r           RECORD;
  v_new       DECIMAL;
BEGIN
  -- Garde d'autorisation (correctif C1)
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé : privilèges administrateur requis pour la pesée.'
      USING ERRCODE = '42501';
  END IF;

  IF p_real_kg IS NULL OR p_real_kg <= 0 THEN
    RAISE EXCEPTION 'Le tonnage réel doit être > 0';
  END IF;

  SELECT COALESCE(SUM(qty_contributed_kg), 0), COUNT(*)
    INTO v_total_est, v_count
  FROM harvest_lot_sources
  WHERE harvest_lot_id = p_dispatch_id;

  IF v_count = 0 OR v_total_est <= 0 THEN
    RAISE EXCEPTION 'Envoi sans récoltes sources pesables (estimation nulle).';
  END IF;

  FOR r IN
    SELECT id, harvest_id, qty_contributed_kg
    FROM harvest_lot_sources
    WHERE harvest_lot_id = p_dispatch_id
  LOOP
    v_new := ROUND(p_real_kg * (r.qty_contributed_kg / v_total_est), 2);
    UPDATE harvest_lot_sources SET qty_contributed_kg = v_new WHERE id = r.id;
  END LOOP;

  UPDATE harvest_lots
  SET weighed_kg   = p_real_kg,
      quantity_kg  = p_real_kg,
      weighed_at   = NOW(),
      estimated_kg = COALESCE(estimated_kg, v_total_est)
  WHERE id = p_dispatch_id;

  UPDATE harvests h
  SET actual_kg = sub.total
  FROM (
    SELECT hls.harvest_id, SUM(hls.qty_contributed_kg) AS total
    FROM harvest_lot_sources hls
    JOIN harvest_lots hl ON hl.id = hls.harvest_lot_id
    WHERE hl.weighed_kg IS NOT NULL
      AND hls.harvest_id IN (
        SELECT harvest_id FROM harvest_lot_sources WHERE harvest_lot_id = p_dispatch_id
      )
    GROUP BY hls.harvest_id
  ) sub
  WHERE h.id = sub.harvest_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'estimated_kg', v_total_est,
    'real_kg', p_real_kg,
    'ecart_kg', ROUND(p_real_kg - v_total_est, 2),
    'sources', v_count
  );
END;
$$;

-- ─── C2. Création dispatch écart : exiger l'admin ───────────
CREATE OR REPLACE FUNCTION create_ecart_dispatch(
  p_parent_lot_id UUID,
  p_ecart_qty_kg DECIMAL DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_ecart_market_id UUID;
  v_ecart_client_id UUID;
  v_qty DECIMAL(10, 2);
  v_new_lot_id UUID;
  v_new_lot_number VARCHAR(50);
BEGIN
  -- Garde d'autorisation (correctif C2)
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé : privilèges administrateur requis.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_parent FROM harvest_lots WHERE id = p_parent_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch parent introuvable' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, client_id INTO v_ecart_market_id, v_ecart_client_id
    FROM markets
   WHERE is_ecart_market = TRUE AND is_active = TRUE
   LIMIT 1;

  IF v_ecart_market_id IS NULL THEN
    RAISE EXCEPTION 'Aucun marché écart configuré. Active is_ecart_market=true sur un marché dans /marches.'
      USING ERRCODE = 'P0001';
  END IF;

  v_qty := COALESCE(p_ecart_qty_kg, COALESCE(v_parent.quantity_kg, 0) - COALESCE(v_parent.qty_acceptee_kg, 0));
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantité écart nulle ou négative pour le lot %', v_parent.lot_number;
  END IF;

  v_new_lot_number := COALESCE(v_parent.lot_number, 'LOT') || '-ECART';

  INSERT INTO harvest_lots (
    lot_number, harvest_id, campaign_planting_id, harvest_date, receipt_date,
    quantity_kg, category, variety_id, greenhouse_id, market_id, client_id,
    tri_status, parent_dispatch_id, notes
  ) VALUES (
    v_new_lot_number, v_parent.harvest_id, v_parent.campaign_planting_id, CURRENT_DATE, CURRENT_DATE,
    v_qty, 'station_dispatch', v_parent.variety_id, v_parent.greenhouse_id, v_ecart_market_id, v_ecart_client_id,
    'pending', v_parent.id,
    'Écart du dispatch ' || v_parent.lot_number || ' vendu au client écart'
  )
  RETURNING id INTO v_new_lot_id;

  RETURN v_new_lot_id;
END;
$$;

-- ─── H1. Confidentialité paie : lecture admin uniquement ────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_periods','payslips','leave_requests','leave_balances','cnss_declarations']
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "auth read %I" ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "admin read %I" ON %I', t, t);
      EXECUTE format('CREATE POLICY "admin read %I" ON %I FOR SELECT TO authenticated USING (is_admin(auth.uid()))', t, t);
    EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'table % absente (skip)', t;
    END;
  END LOOP;
END $$;

-- ─── H2. Policies d'écriture ouvertes → écriture admin ──────
-- Prix station / prix marché / statut quotidien : lecture ouverte, écriture admin.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['harvest_market_prices','harvest_daily_status','harvest_station_prices']
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'read_'||t, t);
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'read_'||t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'write_'||t, t);
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()))', 'write_'||t, t);
    EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'table % absente (skip)', t;
    END;
  END LOOP;
END $$;

-- harvest_tray_lines : le caporal CRÉE ses lignes (INSERT ouvert, requis par
-- la saisie de récolte), mais modification/suppression réservées à l'admin.
DROP POLICY IF EXISTS "auth_write_tray_lines" ON harvest_tray_lines;
DROP POLICY IF EXISTS "tray_insert" ON harvest_tray_lines;
CREATE POLICY "tray_insert" ON harvest_tray_lines FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tray_update" ON harvest_tray_lines;
CREATE POLICY "tray_update" ON harvest_tray_lines FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "tray_delete" ON harvest_tray_lines;
CREATE POLICY "tray_delete" ON harvest_tray_lines FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

COMMENT ON FUNCTION admin_weigh_station_dispatch(UUID, DECIMAL) IS
  'Pesée station + répartition prorata. Réservé aux admins (correctif sécurité 059).';

-- ▲▲▲ ============ fin 059_security_hardening ============ ▲▲▲

