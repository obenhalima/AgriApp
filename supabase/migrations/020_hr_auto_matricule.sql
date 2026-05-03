-- ============================================================
-- Génération automatique du matricule employé
-- Format : <PREFIXE>-<NUMERO 4 chiffres>
--   FRM-0001 → fermier
--   ADM-0001 → staff admin
--   SAI-0001 → saisonnier
--   TAC-0001 → tâcheron (staff à la tâche)
--   EMP-0001 → catégorie inconnue (fallback)
--
-- Le trigger BEFORE INSERT s'exécute uniquement si matricule est NULL/vide.
-- L'utilisateur peut donc forcer un matricule manuel s'il le souhaite (ex. import).
-- ============================================================

CREATE OR REPLACE FUNCTION generate_worker_matricule()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix VARCHAR(3);
  v_next_num INTEGER;
BEGIN
  -- Si l'utilisateur a fourni un matricule, on n'écrase pas
  IF NEW.matricule IS NOT NULL AND TRIM(NEW.matricule) <> '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.category
    WHEN 'fermier'     THEN 'FRM'
    WHEN 'staff_admin' THEN 'ADM'
    WHEN 'saisonnier'  THEN 'SAI'
    WHEN 'tacheron'    THEN 'TAC'
    ELSE 'EMP'
  END;

  -- Cherche le plus grand numéro existant pour ce préfixe
  SELECT COALESCE(MAX(
    NULLIF(REGEXP_REPLACE(matricule, '^[A-Z]+-', ''), '')::INTEGER
  ), 0) + 1
    INTO v_next_num
    FROM workers
    WHERE matricule ~ ('^' || v_prefix || '-[0-9]+$');

  NEW.matricule := v_prefix || '-' || LPAD(v_next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workers_matricule ON workers;
CREATE TRIGGER trg_workers_matricule
  BEFORE INSERT ON workers
  FOR EACH ROW
  EXECUTE FUNCTION generate_worker_matricule();
