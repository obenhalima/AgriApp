-- ============================================================
-- Ajout du profil "staff à la tâche" (tâcheron/dépannage)
-- + champs pour suivre la mission (libellé, jours planifiés, dates)
-- ============================================================

-- Nouveaux champs sur workers pour les missions ponctuelles
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS mission_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mission_days_planned INTEGER,
  ADD COLUMN IF NOT EXISTS mission_start_date DATE,
  ADD COLUMN IF NOT EXISTS mission_end_date DATE,
  ADD COLUMN IF NOT EXISTS mission_days_done INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workers_mission_dates ON workers(mission_start_date, mission_end_date);

-- Note : la colonne workers.category accepte déjà des chaînes libres
-- (VARCHAR(20)). On utilisera 'tacheron' pour ce nouveau profil.
-- Aucune contrainte d'enum à modifier.
