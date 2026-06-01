-- ============================================================
-- Migration 040 — Bordereaux station (settlements)
--
-- La station envoie chaque semaine un bordereau qui paye les
-- dispatches déjà triés. Un dispatch peut être tarifé partiellement
-- sur plusieurs bordereaux (split FIFO).
--
-- Workflow :
--   1. Création bordereau (status=brouillon) avec semaine ISO
--   2. Saisie : 1 ligne par (farm × market × variety) avec qty+prix
--   3. Validation : alloue qty FIFO sur les dispatches non tarifés
--      Update qty_priced_kg + tri_status='priced' quand totalement payé
-- ============================================================

-- ─── 1. En-tête bordereau ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS station_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(40) UNIQUE,                     -- 'SET-2026-W21' (auto-généré par trigger)
  period_start DATE NOT NULL,                  -- lundi semaine ISO
  period_end DATE NOT NULL,                    -- dimanche
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'brouillon',  -- brouillon | valide
  total_amount DECIMAL(12, 2) DEFAULT 0,       -- somme des amounts des lignes (mis à jour à la validation)
  total_qty_kg DECIMAL(10, 2) DEFAULT 0,       -- somme qty_kg
  notes TEXT,
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (status IN ('brouillon', 'valide'))
);

-- 1 seul bordereau par semaine (chevauchement non géré pour V1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_period
  ON station_settlements(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_settlement_status ON station_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_period ON station_settlements(period_start DESC);

-- ─── 2. Lignes du bordereau (1 par farm × market × variety) ─────
CREATE TABLE IF NOT EXISTS station_settlement_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id UUID NOT NULL REFERENCES station_settlements(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id),          -- NULL = toutes fermes
  market_id UUID NOT NULL REFERENCES markets(id),
  variety_id UUID NOT NULL REFERENCES varieties(id),
  qty_kg DECIMAL(10, 2) NOT NULL CHECK (qty_kg >= 0),
  price_per_kg DECIMAL(10, 4) NOT NULL CHECK (price_per_kg >= 0),
  amount DECIMAL(12, 2) GENERATED ALWAYS AS (qty_kg * price_per_kg) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Une seule ligne par combinaison farm×market×variety dans un settlement
  UNIQUE(settlement_id, farm_id, market_id, variety_id)
);

CREATE INDEX IF NOT EXISTS idx_sl_settlement ON station_settlement_lines(settlement_id);
CREATE INDEX IF NOT EXISTS idx_sl_market_variety ON station_settlement_lines(market_id, variety_id);

-- ─── 3. Allocations FIFO sur les dispatches ──────────────────────
-- 1 ligne du bordereau peut "consommer" plusieurs dispatches partiellement
-- (cumul FIFO jusqu'à atteindre qty_kg de la ligne)
CREATE TABLE IF NOT EXISTS station_settlement_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_line_id UUID NOT NULL REFERENCES station_settlement_lines(id) ON DELETE CASCADE,
  harvest_lot_id UUID NOT NULL REFERENCES harvest_lots(id) ON DELETE CASCADE,
  qty_allocated_kg DECIMAL(10, 2) NOT NULL CHECK (qty_allocated_kg > 0),
  price_per_kg DECIMAL(10, 4) NOT NULL,
  amount_allocated DECIMAL(12, 2) GENERATED ALWAYS AS (qty_allocated_kg * price_per_kg) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(settlement_line_id, harvest_lot_id)
);

CREATE INDEX IF NOT EXISTS idx_ssa_line ON station_settlement_allocations(settlement_line_id);
CREATE INDEX IF NOT EXISTS idx_ssa_lot ON station_settlement_allocations(harvest_lot_id);

-- ─── 4. Colonne sur harvest_lots pour tracker le cumul tarifé ────
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS qty_priced_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES station_settlements(id) ON DELETE SET NULL;
  -- settlement_id : dernier bordereau qui a tarifé ce lot (peut être multiples via allocations)

CREATE INDEX IF NOT EXISTS idx_hl_priced_remaining
  ON harvest_lots(market_id, variety_id, tri_status)
  WHERE tri_status = 'tried' AND category = 'station_dispatch';

-- ─── 5. RLS standard (lecture authenticated, écriture admin) ─────
ALTER TABLE station_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_settlement_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_station_settlements" ON station_settlements;
CREATE POLICY "auth_read_station_settlements" ON station_settlements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_station_settlements" ON station_settlements;
CREATE POLICY "admin_write_station_settlements" ON station_settlements FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth_read_settlement_lines" ON station_settlement_lines;
CREATE POLICY "auth_read_settlement_lines" ON station_settlement_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_settlement_lines" ON station_settlement_lines;
CREATE POLICY "admin_write_settlement_lines" ON station_settlement_lines FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth_read_settlement_allocations" ON station_settlement_allocations;
CREATE POLICY "auth_read_settlement_allocations" ON station_settlement_allocations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_settlement_allocations" ON station_settlement_allocations;
CREATE POLICY "admin_write_settlement_allocations" ON station_settlement_allocations FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ─── 6. Trigger pour auto-générer le code du bordereau ──────────────
-- Format : 'SET-YYYY-Www' basé sur la semaine ISO de period_start
-- Si déjà présent dans une autre ligne (collision), suffixe -2, -3, ...
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
    RETURN NEW;  -- code fourni manuellement, on respecte
  END IF;

  -- ISO week : IYYY = année ISO, IW = numéro semaine ISO (01-53)
  v_base := 'SET-' || to_char(NEW.period_start, 'IYYY') || '-W' || to_char(NEW.period_start, 'IW');
  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM station_settlements WHERE code = v_candidate) LOOP
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  NEW.code := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_gen_code ON station_settlements;
CREATE TRIGGER trg_settlement_gen_code
  BEFORE INSERT ON station_settlements
  FOR EACH ROW EXECUTE FUNCTION trg_gen_settlement_code();

-- ─── 7. Trigger pour maintenir total_amount/total_qty sur settlement ───
CREATE OR REPLACE FUNCTION trg_recompute_settlement_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_settlement UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_settlement := OLD.settlement_id;
  ELSE
    v_settlement := NEW.settlement_id;
  END IF;

  UPDATE station_settlements s
     SET total_amount = COALESCE((SELECT SUM(amount) FROM station_settlement_lines WHERE settlement_id = s.id), 0),
         total_qty_kg = COALESCE((SELECT SUM(qty_kg) FROM station_settlement_lines WHERE settlement_id = s.id), 0),
         updated_at = NOW()
   WHERE s.id = v_settlement;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sl_recompute_totals ON station_settlement_lines;
CREATE TRIGGER trg_sl_recompute_totals
  AFTER INSERT OR UPDATE OR DELETE ON station_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_settlement_totals();

COMMENT ON TABLE station_settlements IS 'Bordereau hebdomadaire envoyé par la station avec les paiements par variété × marché';
COMMENT ON TABLE station_settlement_lines IS 'Lignes d''un bordereau (1 par farm × market × variety)';
COMMENT ON TABLE station_settlement_allocations IS 'Allocation FIFO d''une ligne sur N dispatches (split partiel possible)';
COMMENT ON COLUMN harvest_lots.qty_priced_kg IS 'Quantité cumulée tarifée par les bordereaux station. Lot fully priced quand qty_priced_kg >= qty_acceptee_kg';
