-- ============================================================
-- Migration 049 — Fréquence du bordereau par marché
--
-- Permet de configurer la cadence de paiement par marché :
--   - 'weekly'  : bordereau hebdomadaire (par défaut pour les exports)
--   - 'monthly' : bordereau mensuel (par défaut pour les marchés locaux)
--   - 'none'    : pas de bordereau, tarif/facture direct par dispatch
--                 (typiquement pour ventes immédiates, cash, marché de gros)
-- ============================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS bordereau_frequency VARCHAR(20) DEFAULT 'monthly';

-- Contrainte de validation
ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS chk_bordereau_frequency;
ALTER TABLE markets
  ADD CONSTRAINT chk_bordereau_frequency
  CHECK (bordereau_frequency IN ('weekly', 'monthly', 'none'));

-- Backfill intelligent selon le type de marché
UPDATE markets SET bordereau_frequency = 'weekly'
 WHERE type = 'export' AND bordereau_frequency IS NULL;

UPDATE markets SET bordereau_frequency = 'monthly'
 WHERE type != 'export' AND bordereau_frequency IS NULL;

COMMENT ON COLUMN markets.bordereau_frequency IS
'Cadence du bordereau station pour ce marché : weekly (export), monthly (local), none (vente directe sans bordereau).';

-- ─── Extension de station_settlements : supporter période mensuelle ───
-- Actuellement period_start/end sont des dates quelconques.
-- On garde la flexibilité mais on ajoute une colonne pour identifier le type.

ALTER TABLE station_settlements
  ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) DEFAULT 'weekly';

ALTER TABLE station_settlements
  DROP CONSTRAINT IF EXISTS chk_period_type;
ALTER TABLE station_settlements
  ADD CONSTRAINT chk_period_type
  CHECK (period_type IN ('weekly', 'monthly', 'custom'));

COMMENT ON COLUMN station_settlements.period_type IS
'Type de période du bordereau : weekly (lundi→dimanche ISO), monthly (1er→fin du mois), custom (autre).';

-- ─── Update trigger de génération du code pour gérer mensuel ───
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

  IF NEW.period_type = 'monthly' THEN
    -- Format : SET-2026-M06 (Mois 06)
    v_base := 'SET-' || to_char(NEW.period_start, 'YYYY') || '-M' || to_char(NEW.period_start, 'MM');
  ELSE
    -- Format hebdo : SET-2026-S21 (Semaine ISO 21)
    v_base := 'SET-' || to_char(NEW.period_start, 'IYYY') || '-S' || to_char(NEW.period_start, 'IW');
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

-- Note : l'index unique sur (period_start, period_end) doit etre relâché pour
-- permettre 1 bordereau hebdo ET 1 bordereau mensuel sur la même semaine.
-- On le remplace par une contrainte composite (period_start, period_end, period_type).

DROP INDEX IF EXISTS uq_settlement_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_period_type
  ON station_settlements(period_start, period_end, period_type);
