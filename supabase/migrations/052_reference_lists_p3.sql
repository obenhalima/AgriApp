-- ============================================================
-- Migration 052 — Référentiels P3a : listes restantes
--
-- Migre vers le système no-code (reference_lists/values) :
--   • payment_method   (unifié RH + factures)
--   • operation_type   (agronomie)
--   • variety_destination (variétés)
--   • worker_category  (RH, avec metadata : icône, couleur, fréquence)
--   • family_status    (RH)
--   • contract_type    (RH)
--
-- + relâche 2 enums en VARCHAR (Option A) : varieties.destination,
--   cultural_operations.operation_type.
-- ============================================================

-- ─── Relâche les enums concernés (idempotent, défensif) ─────
DO $$
BEGIN
  ALTER TABLE varieties ALTER COLUMN destination DROP DEFAULT;
  ALTER TABLE varieties ALTER COLUMN destination TYPE VARCHAR(50) USING destination::text;
  ALTER TABLE varieties ALTER COLUMN destination SET DEFAULT 'mixte';
EXCEPTION WHEN others THEN RAISE NOTICE 'varieties.destination skip: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE cultural_operations ALTER COLUMN operation_type TYPE VARCHAR(50) USING operation_type::text;
EXCEPTION WHEN others THEN RAISE NOTICE 'cultural_operations.operation_type skip: %', SQLERRM;
END $$;

-- ─── Listes ─────────────────────────────────────────────────
INSERT INTO reference_lists (key, label, description) VALUES
  ('payment_method',      'Modes de paiement',     'Moyens de règlement (factures clients/fournisseurs + paie RH)'),
  ('operation_type',      'Types d''opérations',   'Interventions culturales (/agronomie)'),
  ('variety_destination', 'Destinations variété',  'Débouché commercial de la variété (/varietes)'),
  ('worker_category',     'Catégories employés',   'Type de personnel RH (/rh/employes)'),
  ('family_status',       'État civil',            'Situation familiale des employés (/rh)'),
  ('contract_type',       'Types de contrats',     'Nature du contrat de travail (/rh)')
ON CONFLICT (key) DO NOTHING;

-- payment_method (unifie RH 'virement/cash/cheque' + factures 'virement/cheque/especes/lettre_change')
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('payment_method', 'virement',      'Virement',          1, true),
  ('payment_method', 'cheque',        'Chèque',            2, false),
  ('payment_method', 'especes',       'Espèces',           3, false),
  ('payment_method', 'cash',          'Cash',              4, false),
  ('payment_method', 'lettre_change', 'Lettre de change',  5, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- operation_type
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('operation_type', 'traitement',    'Traitement',     1, true),
  ('operation_type', 'irrigation',    'Irrigation',     2, false),
  ('operation_type', 'fertilisation', 'Fertilisation',  3, false),
  ('operation_type', 'taille',        'Taille',         4, false),
  ('operation_type', 'effeuillage',   'Effeuillage',    5, false),
  ('operation_type', 'palissage',     'Palissage',      6, false),
  ('operation_type', 'desherbage',    'Désherbage',     7, false),
  ('operation_type', 'inspection',    'Inspection',     8, false),
  ('operation_type', 'plantation',    'Plantation',     9, false),
  ('operation_type', 'recolte',       'Récolte',        10, false),
  ('operation_type', 'autre',         'Autre',          99, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- variety_destination
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('variety_destination', 'mixte',               'Mixte',               1, true),
  ('variety_destination', 'export',              'Export',              2, false),
  ('variety_destination', 'local',               'Local',               3, false),
  ('variety_destination', 'grande_distribution', 'Grande distribution', 4, false),
  ('variety_destination', 'industrie',           'Industrie',           5, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- worker_category (metadata : icône, couleur, fréquence de paie par défaut)
INSERT INTO reference_values (list_key, code, label, color, icon, metadata, order_idx, is_default) VALUES
  ('worker_category', 'fermier',     'Fermier',          '#10b981', '🌾',  '{"defaultFreq":"quinzaine"}',  1, true),
  ('worker_category', 'staff_admin', 'Staff admin',      '#8b5cf6', '🧑‍💼', '{"defaultFreq":"mensuel"}',    2, false),
  ('worker_category', 'saisonnier',  'Saisonnier',       '#f59e0b', '🌻',  '{"defaultFreq":"journalier"}', 3, false),
  ('worker_category', 'tacheron',    'Staff à la tâche', '#ec4899', '🛠️',  '{"defaultFreq":"journalier"}', 4, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- family_status
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('family_status', 'celibataire', 'Célibataire', 1, true),
  ('family_status', 'marie',       'Marié(e)',    2, false),
  ('family_status', 'divorce',     'Divorcé(e)',  3, false),
  ('family_status', 'veuf',        'Veuf(ve)',    4, false)
ON CONFLICT (list_key, code) DO NOTHING;

-- contract_type
INSERT INTO reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('contract_type', 'CDI',        'CDI',        1, true),
  ('contract_type', 'CDD',        'CDD',        2, false),
  ('contract_type', 'saisonnier', 'Saisonnier', 3, false)
ON CONFLICT (list_key, code) DO NOTHING;
