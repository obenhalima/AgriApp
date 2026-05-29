-- ============================================================
-- Migration 039 — RPC admin_bulk_delete_harvests
--
-- Permet de supprimer plusieurs récoltes d'un coup en bypassant
-- les RLS (SECURITY DEFINER). Cascade automatique :
--   1. harvest_lot_sources (liens N→1)
--   2. harvest_lots (dispatches associés)
--   3. harvests (la récolte elle-même)
--
-- Retourne JSONB { deleted_harvests, deleted_lots, deleted_sources }
-- ============================================================

CREATE OR REPLACE FUNCTION admin_bulk_delete_harvests(p_harvest_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sources_count INTEGER := 0;
  v_lots_count INTEGER := 0;
  v_harvests_count INTEGER := 0;
  v_count INTEGER;
BEGIN
  -- Auth check (réutilise le helper de la migration 036)
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  IF p_harvest_ids IS NULL OR array_length(p_harvest_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'success', 'message', 'Aucun ID fourni', 'deleted_harvests', 0);
  END IF;

  -- 1. Supprime les harvest_lot_sources qui pointent vers ces récoltes
  DELETE FROM harvest_lot_sources WHERE harvest_id = ANY(p_harvest_ids);
  GET DIAGNOSTICS v_sources_count = ROW_COUNT;

  -- 2. Supprime les harvest_lots qui pointent vers ces récoltes (legacy 1-to-1)
  --    Les harvest_lots composites (harvest_id NULL) qui contenaient ces récoltes
  --    via harvest_lot_sources auront leurs sources supprimées en 1.
  --    Si après, le composite n'a plus aucune source, on peut le supprimer aussi.
  DELETE FROM harvest_lots WHERE harvest_id = ANY(p_harvest_ids);
  GET DIAGNOSTICS v_lots_count = ROW_COUNT;

  -- 3. Supprime les harvest_lots composites devenus orphelins (plus aucune source)
  DELETE FROM harvest_lots
   WHERE harvest_id IS NULL
     AND id NOT IN (SELECT harvest_lot_id FROM harvest_lot_sources)
     AND category = 'station_dispatch';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_lots_count := v_lots_count + v_count;

  -- 4. Supprime les harvests
  DELETE FROM harvests WHERE id = ANY(p_harvest_ids);
  GET DIAGNOSTICS v_harvests_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', format('%s récolte(s) supprimée(s), %s envoi(s) liés, %s source(s)',
                      v_harvests_count, v_lots_count, v_sources_count),
    'deleted_harvests', v_harvests_count,
    'deleted_lots', v_lots_count,
    'deleted_sources', v_sources_count
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_bulk_delete_harvests(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_bulk_delete_harvests(UUID[]) TO authenticated;

COMMENT ON FUNCTION admin_bulk_delete_harvests(UUID[]) IS
  'Supprime un batch de récoltes + cascade (sources, lots, composites orphelins). Admin only.';
