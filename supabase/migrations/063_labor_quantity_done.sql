-- ============================================================
-- Migration 063 — Quantité réalisée sur le pointage (Lot 2C)
--
-- Objectif : calculer un RENDEMENT pour les tâches non-récolte.
-- Un rendement exige 2 choses : le temps ET le travail accompli.
--   • Cueillette  → les kg viennent déjà des récoltes  → kg/h OK
--   • Effeuillage, taille, palissage… → on ne captait QUE les heures
--     → impossible de calculer un rendement.
--
-- On ajoute donc quantity_done (+ son unité, figée à la saisie).
--   rendement = quantity_done / person_hours   (ex. 400 m ÷ 30 h = 13,3 m/h)
--
-- L'unité est configurable PAR TÂCHE (no-code) via reference_values.metadata:
--   {"unit": "ml"} mètres linéaires · {"unit": "plants"} · {"unit": "kg"}
-- ============================================================

SET search_path = public;

ALTER TABLE public.labor_entries
  ADD COLUMN IF NOT EXISTS quantity_done DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS quantity_unit VARCHAR(20);

COMMENT ON COLUMN public.labor_entries.quantity_done IS
  'Quantité de travail réalisée (ex. 400 mètres effeuillés). Rendement = quantity_done / person_hours.';
COMMENT ON COLUMN public.labor_entries.quantity_unit IS
  'Unité figée à la saisie (ml / plants / kg), issue du référentiel labor_task.';

-- ─── Unités par défaut sur les tâches (ajustables dans /admin/référentiels) ──
-- Mètres linéaires : le mode de mesure du domaine pour les travaux sur rang
UPDATE public.reference_values
   SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"unit": "ml"}'::jsonb
 WHERE list_key = 'labor_task'
   AND code IN ('effeuillage', 'taille', 'palissage', 'desherbage', 'traitement', 'fertigation', 'entretien');

UPDATE public.reference_values
   SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"unit": "plants"}'::jsonb
 WHERE list_key = 'labor_task' AND code = 'plantation';

-- Cueillette : l'unité est le kg, mais la quantité vient des RÉCOLTES (pas saisie)
UPDATE public.reference_values
   SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"unit": "kg"}'::jsonb
 WHERE list_key = 'labor_task' AND code = 'cueillette';
