-- ============================================================
-- Migration 071 — Bordereau par marché (B1) + semaine S1 par marché (B4)
--
-- Retours test :
--   B1 « Dans saisie bordereau station, il faut saisir des bordereaux par marché »
--   B4 « Pour le numéro de semaine, il faut paramétrer la S1… définie par marché »
--
-- B1 : un bordereau est désormais rattaché à UN marché (station_settlements.market_id).
--      L'unicité passe de (semaine) à (semaine × marché).
-- B4 : chaque marché définit le lundi de sa S1 (markets.week1_start_date).
--      Le n° de semaine AFFICHÉ = 1 + floor((lundi_période − week1_start_date)/7).
--      Le calcul se fait côté app ; la colonne stocke juste la référence.
--
-- Le code auto (SET-YYYY-Www) est complété par le code marché quand il est
-- renseigné (ex. SET-2026-W36-CASA) pour lever l'ambiguïté entre marchés.
-- Les bordereaux existants (market_id NULL) restent « tous marchés » (legacy).
-- ============================================================

SET search_path = public;

-- ─── B4 : date de début S1 par marché ───────────────────────
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS week1_start_date DATE;

COMMENT ON COLUMN markets.week1_start_date IS
  'Lundi de la semaine S1 station pour ce marché (B4). N° de semaine affiché d''un bordereau = 1 + floor((lundi_période − week1_start_date)/7 j). NULL → numérotation ISO.';

-- ─── B1 : bordereau rattaché à un marché ────────────────────
ALTER TABLE station_settlements
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN station_settlements.market_id IS
  'Marché du bordereau (B1 : un bordereau par marché). NULL = bordereau legacy « tous marchés ».';

CREATE INDEX IF NOT EXISTS idx_settlement_market ON station_settlements(market_id);

-- Unicité : (semaine × marché) au lieu de (semaine) seule.
-- (market_id NULL → lignes distinctes : les legacy « tous marchés » restent tolérés.)
DROP INDEX IF EXISTS uq_settlement_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_period_market
  ON station_settlements(period_start, period_end, market_id);

-- ─── Code auto enrichi du code marché ───────────────────────
CREATE OR REPLACE FUNCTION trg_gen_settlement_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INT := 2;
  v_mcode TEXT;
BEGIN
  IF NEW.code IS NOT NULL AND length(trim(NEW.code)) > 0 THEN
    RETURN NEW;  -- code fourni manuellement, on respecte
  END IF;

  -- ISO week : IYYY = année ISO, IW = numéro semaine ISO (01-53)
  v_base := 'SET-' || to_char(NEW.period_start, 'IYYY') || '-W' || to_char(NEW.period_start, 'IW');

  -- Suffixe marché si renseigné (lisibilité entre bordereaux du même créneau)
  IF NEW.market_id IS NOT NULL THEN
    SELECT code INTO v_mcode FROM markets WHERE id = NEW.market_id;
    IF v_mcode IS NOT NULL AND length(trim(v_mcode)) > 0 THEN
      v_base := v_base || '-' || upper(trim(v_mcode));
    END IF;
  END IF;

  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM station_settlements WHERE code = v_candidate) LOOP
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  NEW.code := v_candidate;
  RETURN NEW;
END;
$$;
