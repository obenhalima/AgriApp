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
