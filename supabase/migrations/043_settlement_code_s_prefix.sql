-- ============================================================
-- Migration 043 — Codification française S{NN} au lieu de W{NN}
--
-- Met à jour le trigger trg_gen_settlement_code pour générer
-- 'SET-2026-S21' au lieu de 'SET-2026-W21'.
--
-- Les codes existants (W) ne sont PAS touchés pour préserver
-- les références historiques. Seuls les nouveaux bordereaux
-- utiliseront le préfixe 'S'.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_gen_settlement_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INT := 2;
BEGIN
  IF NEW.code IS NOT NULL AND length(trim(NEW.code)) > 0 THEN
    RETURN NEW;
  END IF;

  -- ISO week : IYYY = année ISO, IW = numéro semaine ISO (01-53)
  -- Préfixe 'S' (Semaine, FR) au lieu de 'W' (Week, EN)
  v_base := 'SET-' || to_char(NEW.period_start, 'IYYY') || '-S' || to_char(NEW.period_start, 'IW');
  v_candidate := v_base;

  -- Collision : suffixe -2, -3, ...
  WHILE EXISTS (SELECT 1 FROM station_settlements WHERE code = v_candidate) LOOP
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  NEW.code := v_candidate;
  RETURN NEW;
END;
$$;
