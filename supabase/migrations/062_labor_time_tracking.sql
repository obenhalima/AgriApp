-- ============================================================
-- Migration 062 — Saisie du temps de travail (Phase 2, Lot 2A)
--
-- Réanime la table labor_entries (présente depuis 001 mais jamais utilisée)
-- pour capter les HEURES réelles par serre/culture/tâche → productivité MO
-- réelle (cueillette kg/heure, coût MO réel, au lieu du prorata surface).
--
-- Saisie FLEXIBLE : soit un ouvrier nommé (worker_id), soit une équipe
-- anonyme (worker_id NULL + worker_count). hours_worked = heures PAR PERSONNE.
--   person_hours = hours_worked × worker_count   (dénominateur des ratios)
--   total_cost   = (person_hours / 8) × daily_rate
-- ============================================================

SET search_path = public;

-- ─── 1. Assouplir + enrichir labor_entries ──────────────────
-- worker_id devient optionnel (équipe anonyme)
ALTER TABLE public.labor_entries ALTER COLUMN worker_id DROP NOT NULL;

-- Nombre d'ouvriers (équipe) — 1 par défaut (ouvrier seul)
ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS worker_count INT NOT NULL DEFAULT 1;

-- Attribution fine optionnelle à la plantation (sinon niveau serre)
ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS campaign_planting_id UUID REFERENCES public.campaign_plantings(id);

-- Traçabilité de la saisie
ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS recorded_via VARCHAR(20) DEFAULT 'web';
ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS recorded_by_name VARCHAR(255);

-- Recalcule les colonnes générées pour tenir compte de worker_count
ALTER TABLE public.labor_entries DROP COLUMN IF EXISTS total_cost;
ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS person_hours DECIMAL(10, 2)
  GENERATED ALWAYS AS (hours_worked * worker_count) STORED;
ALTER TABLE public.labor_entries ADD COLUMN total_cost DECIMAL(12, 2)
  GENERATED ALWAYS AS ((hours_worked * worker_count / 8.0) * COALESCE(daily_rate, 0)) STORED;

CREATE INDEX IF NOT EXISTS idx_labor_entries_greenhouse ON public.labor_entries(greenhouse_id);
CREATE INDEX IF NOT EXISTS idx_labor_entries_planting   ON public.labor_entries(campaign_planting_id);
CREATE INDEX IF NOT EXISTS idx_labor_entries_date       ON public.labor_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_labor_entries_campaign2  ON public.labor_entries(campaign_id);

COMMENT ON TABLE public.labor_entries IS
  'Pointage du temps de travail (heures par serre/culture/tâche). person_hours = hours_worked × worker_count.';

-- ─── 2. RLS : lecture ouverte, saisie ouverte, correction admin ─────
ALTER TABLE public.labor_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labor_read   ON public.labor_entries;
DROP POLICY IF EXISTS labor_insert ON public.labor_entries;
DROP POLICY IF EXISTS labor_update ON public.labor_entries;
DROP POLICY IF EXISTS labor_delete ON public.labor_entries;
CREATE POLICY labor_read   ON public.labor_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY labor_insert ON public.labor_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY labor_update ON public.labor_entries FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY labor_delete ON public.labor_entries FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.labor_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─── 3. Référentiel no-code des tâches (labor_task) ─────────────────
INSERT INTO public.reference_lists (key, label, description) VALUES
  ('labor_task', 'Tâches de main-d''œuvre', 'Types d''opérations pour le pointage du temps. La tâche « cueillette » (is_harvest) alimente le kg/heure.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.reference_values (list_key, code, label, metadata, order_idx, is_default) VALUES
  ('labor_task', 'cueillette',   'Cueillette / Récolte',      '{"is_harvest": true}', 1, true),
  ('labor_task', 'taille',       'Taille',                    '{}', 2, false),
  ('labor_task', 'effeuillage',  'Effeuillage',               '{}', 3, false),
  ('labor_task', 'palissage',    'Palissage / Tuteurage',     '{}', 4, false),
  ('labor_task', 'traitement',   'Traitement / Pulvérisation','{}', 5, false),
  ('labor_task', 'fertigation',  'Irrigation / Fertigation',  '{}', 6, false),
  ('labor_task', 'plantation',   'Plantation',                '{}', 7, false),
  ('labor_task', 'desherbage',   'Désherbage',                '{}', 8, false),
  ('labor_task', 'entretien',    'Entretien / Nettoyage',     '{}', 9, false),
  ('labor_task', 'autre',        'Autre',                     '{}', 10, false)
ON CONFLICT (list_key, code) DO NOTHING;
