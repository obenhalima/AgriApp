-- ============================================================
-- Migration 055 — Pesée station + répartition prorata (Lot 2)
--
-- L'envoi (harvest_lot) part avec un poids ESTIMÉ (somme des plateaux).
-- Le lendemain, la station renvoie le TONNAGE RÉEL pesé. On le redescend
-- au prorata de l'estimation sur chaque récolte source (harvest_lot_sources)
-- et on remplit harvests.actual_kg.
-- ============================================================

-- ─── 1. Colonnes ────────────────────────────────────────────
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS actual_kg DECIMAL(10, 2);
COMMENT ON COLUMN harvests.actual_kg IS
  'Poids réel attribué à la récolte après pesée station (réparti au prorata de l''estimation). NULL tant que non pesé.';

ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS estimated_kg DECIMAL(10, 2),  -- snapshot de l'estimation à l'envoi
  ADD COLUMN IF NOT EXISTS weighed_kg   DECIMAL(10, 2),  -- tonnage réel pesé par la station
  ADD COLUMN IF NOT EXISTS weighed_at   TIMESTAMPTZ;
COMMENT ON COLUMN harvest_lots.weighed_kg IS 'Tonnage réel pesé par la station. Une fois saisi, quantity_kg = weighed_kg et le tri travaille dessus.';

-- ─── 2. RPC de pesée + répartition prorata ──────────────────
-- SECURITY DEFINER : permet au personnel station (authenticated) de mettre à
-- jour harvest_lot_sources (table admin-write) de façon atomique.
CREATE OR REPLACE FUNCTION admin_weigh_station_dispatch(
  p_dispatch_id UUID,
  p_real_kg     DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_est DECIMAL;
  v_count     INT;
  r           RECORD;
  v_new       DECIMAL;
BEGIN
  IF p_real_kg IS NULL OR p_real_kg <= 0 THEN
    RAISE EXCEPTION 'Le tonnage réel doit être > 0';
  END IF;

  -- Somme des contributions estimées (clé de répartition)
  SELECT COALESCE(SUM(qty_contributed_kg), 0), COUNT(*)
    INTO v_total_est, v_count
  FROM harvest_lot_sources
  WHERE harvest_lot_id = p_dispatch_id;

  IF v_count = 0 OR v_total_est <= 0 THEN
    RAISE EXCEPTION 'Envoi sans récoltes sources pesables (estimation nulle).';
  END IF;

  -- Répartit le poids réel au prorata de l'estimation, sur chaque source
  FOR r IN
    SELECT id, harvest_id, qty_contributed_kg
    FROM harvest_lot_sources
    WHERE harvest_lot_id = p_dispatch_id
  LOOP
    v_new := ROUND(p_real_kg * (r.qty_contributed_kg / v_total_est), 2);
    UPDATE harvest_lot_sources SET qty_contributed_kg = v_new WHERE id = r.id;
  END LOOP;

  -- Marque l'envoi pesé : quantity_kg = réel (le tri travaillera dessus)
  UPDATE harvest_lots
  SET weighed_kg   = p_real_kg,
      quantity_kg  = p_real_kg,
      weighed_at   = NOW(),
      estimated_kg = COALESCE(estimated_kg, v_total_est)
  WHERE id = p_dispatch_id;

  -- Recalcule harvests.actual_kg = Σ contributions sur les envois PESÉS
  -- (une récolte peut être répartie sur plusieurs envois)
  UPDATE harvests h
  SET actual_kg = sub.total
  FROM (
    SELECT hls.harvest_id, SUM(hls.qty_contributed_kg) AS total
    FROM harvest_lot_sources hls
    JOIN harvest_lots hl ON hl.id = hls.harvest_lot_id
    WHERE hl.weighed_kg IS NOT NULL
      AND hls.harvest_id IN (
        SELECT harvest_id FROM harvest_lot_sources WHERE harvest_lot_id = p_dispatch_id
      )
    GROUP BY hls.harvest_id
  ) sub
  WHERE h.id = sub.harvest_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'estimated_kg', v_total_est,
    'real_kg', p_real_kg,
    'ecart_kg', ROUND(p_real_kg - v_total_est, 2),
    'sources', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_weigh_station_dispatch(UUID, DECIMAL) TO authenticated;
