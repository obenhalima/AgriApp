-- ============================================================
-- Migration 066 — Référentiels no-code (lot 🟠) : relâche d'ENUM
--
-- Rend paramétrables 3 listes bloquées par des ENUM Postgres RIGIDES, en
-- relâchant la colonne en VARCHAR (même pattern que 050) puis en seedant le
-- référentiel. Les valeurs existantes sont préservées (USING col::text).
--
--   • greenhouse_type   — greenhouses.type   (type de serre)
--   • greenhouse_status — greenhouses.status (statut de serre) + couleur
--   • campaign_status   — campaigns.status   (statut de campagne) + couleur
--
-- ⚠️ campaign_status : les CODES pilotent de la logique (en_cours = campagne
-- active/live). Libellés & couleurs éditables, mais NE PAS changer les codes,
-- et une nouvelle valeur n'aura pas de comportement automatique.
--
-- EXCLUS volontairement : movement_type (détermine le signe +/- du stock),
-- alert_type / alert_severity (générés par l'app). Non paramétrables sans
-- logique associée.
-- ============================================================

SET search_path = public;

-- ─── 1. Relâche des ENUM en VARCHAR (idempotent / défensif) ─────────
DO $$ BEGIN
  ALTER TABLE greenhouses ALTER COLUMN type DROP DEFAULT;
  ALTER TABLE greenhouses ALTER COLUMN type TYPE VARCHAR(30) USING type::text;
  ALTER TABLE greenhouses ALTER COLUMN type SET DEFAULT 'tunnel';
EXCEPTION WHEN others THEN RAISE NOTICE 'greenhouses.type déjà VARCHAR ou skip : %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE greenhouses ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE greenhouses ALTER COLUMN status TYPE VARCHAR(30) USING status::text;
  ALTER TABLE greenhouses ALTER COLUMN status SET DEFAULT 'active';
EXCEPTION WHEN others THEN RAISE NOTICE 'greenhouses.status déjà VARCHAR ou skip : %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE campaigns ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE campaigns ALTER COLUMN status TYPE VARCHAR(30) USING status::text;
  ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'planification';
EXCEPTION WHEN others THEN RAISE NOTICE 'campaigns.status déjà VARCHAR ou skip : %', SQLERRM; END $$;

-- ─── 2. Référentiels ────────────────────────────────────────────────
INSERT INTO public.reference_lists (key, label, description) VALUES
  ('greenhouse_type',   'Types de serre',      'Type structurel d''une serre (/serres).'),
  ('greenhouse_status', 'Statuts de serre',    'État d''exploitation d''une serre (/serres).'),
  ('campaign_status',   'Statuts de campagne', 'Cycle de vie d''une campagne. Les codes pilotent la logique (en_cours = campagne active) — ne pas les changer.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('greenhouse_type', 'tunnel',    'Tunnel',    1, true),
  ('greenhouse_type', 'chapelle',  'Chapelle',  2, false),
  ('greenhouse_type', 'venlo',     'Venlo',     3, false),
  ('greenhouse_type', 'multispan', 'Multispan', 4, false),
  ('greenhouse_type', 'solaire',   'Solaire',   5, false),
  ('greenhouse_type', 'autre',     'Autre',     6, false)
ON CONFLICT (list_key, code) DO NOTHING;

INSERT INTO public.reference_values (list_key, code, label, color, order_idx, is_default) VALUES
  ('greenhouse_status', 'active',         'Active',         '#10b981', 1, true),
  ('greenhouse_status', 'en_preparation', 'En préparation', '#a855f7', 2, false),
  ('greenhouse_status', 'hors_service',   'Hors service',   '#ef4444', 3, false),
  ('greenhouse_status', 'renovation',     'Rénovation',     '#3b82f6', 4, false)
ON CONFLICT (list_key, code) DO NOTHING;

INSERT INTO public.reference_values (list_key, code, label, color, order_idx, is_default) VALUES
  ('campaign_status', 'planification', 'Planification', '#3b82f6', 1, true),
  ('campaign_status', 'en_cours',      'En cours',      '#10b981', 2, false),
  ('campaign_status', 'terminee',      'Terminée',      '#64748b', 3, false),
  ('campaign_status', 'annulee',       'Annulée',       '#ef4444', 4, false)
ON CONFLICT (list_key, code) DO NOTHING;
