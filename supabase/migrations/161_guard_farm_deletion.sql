-- Block farm deletion when referenced, including relationships configured CASCADE.
-- Installation does not delete or update any farm.
BEGIN;
CREATE FUNCTION public.guard_farm_dependencies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_fk record;v_ordinal integer;v_column text;v_exists boolean;v_label text;
BEGIN
 FOR v_fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid='public.farms'::regclass LOOP
  SELECT n INTO v_ordinal FROM generate_subscripts(v_fk.confkey,1) n
   JOIN pg_attribute a ON a.attrelid=v_fk.confrelid AND a.attnum=v_fk.confkey[n] WHERE a.attname='id';
  IF v_ordinal IS NULL THEN RAISE EXCEPTION 'Suppression bloquée : relation non reconnue vers cette ferme'; END IF;
  SELECT attname INTO v_column FROM pg_attribute WHERE attrelid=v_fk.conrelid AND attnum=v_fk.conkey[v_ordinal];
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',v_fk.conrelid::regclass,v_column) INTO v_exists USING OLD.id;
  IF v_exists THEN
   SELECT CASE relname WHEN 'greenhouses' THEN 'serres' WHEN 'campaigns' THEN 'campagnes'
    WHEN 'workers' THEN 'employés' WHEN 'warehouses' THEN 'entrepôts' WHEN 'farm_zones' THEN 'zones'
    WHEN 'budget_lines' THEN 'lignes budgétaires' WHEN 'assets' THEN 'immobilisations'
    ELSE relname END INTO v_label FROM pg_class WHERE oid=v_fk.conrelid;
   RAISE EXCEPTION 'Suppression impossible : cette ferme possède des données liées (%). Aucune donnée supprimée.',v_label USING ERRCODE='23503';
  END IF;
 END LOOP;
 -- Draft text codes are preparation, not operational records. Their existing
 -- fresh-reference validation must be rerun before any later integration.
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_farm_dependencies() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_farms_prevent_linked_delete BEFORE DELETE ON public.farms
 FOR EACH ROW EXECUTE FUNCTION public.guard_farm_dependencies();

CREATE FUNCTION public.delete_empty_farm(p_domain uuid,p_farm uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'fermes','delete'),false)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Suppression de ferme non autorisée pour ce client' USING ERRCODE='42501'; END IF;
 -- DELETE locks the farm row. Concurrent FK inserts cannot bypass dependency checks.
 DELETE FROM public.farms WHERE id=p_farm AND domain_id=p_domain RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Ferme introuvable pour ce client'; END IF;
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_empty_farm(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_empty_farm(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
