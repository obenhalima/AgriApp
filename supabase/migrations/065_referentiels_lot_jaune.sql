-- ============================================================
-- Migration 065 — Référentiels no-code (lot 🟡) : colonnes déjà souples
--
-- Bascule dans le no-code 3 listes codées en dur, dont la colonne DB est déjà
-- un VARCHAR libre (aucune contrainte à relâcher) :
--   • leave_type        — types de congés (/rh/conges) — porte icône+couleur
--   • no_harvest_reason — motifs « journée sans récolte » (/recoltes, web)
--   • pay_frequency     — fréquence de paie (/rh/employes, /rh/paie)
--
-- NB : les CODES de pay_frequency pilotent le calcul de paie (mensuel/
-- quinzaine/journalier) — libellés éditables, codes à conserver (comme
-- worker_category). Les motifs no-harvest côté BOT Telegram restent i18n
-- (4 langues) et ne sont pas remplacés ici.
-- ============================================================

SET search_path = public;

INSERT INTO public.reference_lists (key, label, description) VALUES
  ('leave_type',        'Types de congés',              'Nature d''une absence (/rh/conges).'),
  ('no_harvest_reason', 'Motifs « journée sans récolte »','Raison d''une journée sans récolte (/recoltes).'),
  ('pay_frequency',     'Fréquences de paie',           'Rythme de paie d''un employé. Les codes pilotent le calcul de paie — ne pas les changer, seulement les libellés.')
ON CONFLICT (key) DO NOTHING;

-- leave_type (avec icône + couleur)
INSERT INTO public.reference_values (list_key, code, label, color, icon, order_idx, is_default) VALUES
  ('leave_type', 'annuel',     'Congé annuel',  '#10b981', '🏖️', 1, true),
  ('leave_type', 'maladie',    'Arrêt maladie', '#f59e0b', '🤒', 2, false),
  ('leave_type', 'maternite',  'Maternité',     '#ec4899', '🤰', 3, false),
  ('leave_type', 'paternite',  'Paternité',     '#3b82f6', '👨‍🍼', 4, false),
  ('leave_type', 'sans_solde', 'Sans solde',    '#6b7280', '⏸️', 5, false),
  ('leave_type', 'special',    'Congé spécial', '#a855f7', '⭐', 6, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- no_harvest_reason
INSERT INTO public.reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('no_harvest_reason', 'panne_irrigation', 'Panne d''irrigation',     1, true),
  ('no_harvest_reason', 'meteo',            'Météo défavorable',       2, false),
  ('no_harvest_reason', 'main_oeuvre',      'Manque de main d''œuvre', 3, false),
  ('no_harvest_reason', 'maladie',          'Maladie / phytopathologie', 4, false),
  ('no_harvest_reason', 'maintenance',      'Maintenance',             5, false),
  ('no_harvest_reason', 'autre',            'Autre',                   6, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- pay_frequency (libellés éditables ; codes figés = logique paie)
INSERT INTO public.reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('pay_frequency', 'mensuel',    'Mensuel',    1, false),
  ('pay_frequency', 'quinzaine',  'Quinzaine',  2, true),
  ('pay_frequency', 'journalier', 'Journalier', 3, false)
ON CONFLICT (list_key, code) DO NOTHING;
