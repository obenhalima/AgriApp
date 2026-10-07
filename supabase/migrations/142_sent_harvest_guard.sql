-- Lot 1: durable dispatch lock. LOCAL PREPARATION; apply only after SQL review/recette.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.harvests, public.harvest_lots, public.harvest_lot_sources IN ACCESS EXCLUSIVE MODE;

-- Private ledger: removing a dispatch/source must never unlock its source harvest.
CREATE TABLE public.harvest_dispatch_locks (
 harvest_id uuid PRIMARY KEY REFERENCES public.harvests(id) ON DELETE RESTRICT,
 locked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.harvest_dispatch_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harvest_dispatch_locks FROM PUBLIC, anon, authenticated;

INSERT INTO public.harvest_dispatch_locks(harvest_id)
 SELECT harvest_id FROM public.harvest_lot_sources
 UNION
 SELECT harvest_id FROM public.harvest_lots WHERE category='station_dispatch' AND harvest_id IS NOT NULL;

CREATE FUNCTION public.lock_dispatch_harvest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d uuid; lot_domain uuid;
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Envoi requis dans une transaction READ COMMITTED';
 END IF;
 IF TG_TABLE_NAME='harvest_lots' THEN
  IF NEW.category IS DISTINCT FROM 'station_dispatch' OR NEW.harvest_id IS NULL THEN RETURN NEW; END IF;
  lot_domain:=NEW.domain_id;
 ELSE
  SELECT domain_id INTO lot_domain FROM public.harvest_lots WHERE id=NEW.harvest_lot_id;
 END IF;
 -- Serialize against edits/deletes; at repeatable read, a competing update aborts.
 SELECT domain_id INTO d FROM public.harvests WHERE id=NEW.harvest_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Récolte source introuvable'; END IF;
 IF lot_domain IS NULL OR d IS DISTINCT FROM lot_domain THEN
  RAISE EXCEPTION 'Envoi et récolte doivent appartenir au même client' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.harvest_dispatch_locks(harvest_id) VALUES(NEW.harvest_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_dispatch_harvest() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_lock_dispatch_source BEFORE INSERT OR UPDATE OF harvest_id,harvest_lot_id
 ON public.harvest_lot_sources FOR EACH ROW EXECUTE FUNCTION public.lock_dispatch_harvest();
CREATE TRIGGER zzz_lock_direct_dispatch BEFORE INSERT OR UPDATE OF harvest_id,category,domain_id
 ON public.harvest_lots FOR EACH ROW EXECUTE FUNCTION public.lock_dispatch_harvest();

CREATE FUNCTION public.guard_sent_harvest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected_kg numeric;
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Modification de récolte requise dans une transaction READ COMMITTED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.harvest_dispatch_locks WHERE harvest_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Récolte déjà envoyée : suppression interdite.' USING ERRCODE='23514';
 END IF;
 -- Preserve the productivity snapshot if its older BEFORE trigger recomputed it.
 NEW.harvest_person_target:=OLD.harvest_person_target;
 -- total_qty is generated (not available in NEW before storage).
 IF (to_jsonb(NEW)-ARRAY['actual_kg','updated_at','total_qty'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['actual_kg','updated_at','total_qty']) THEN
  RAISE EXCEPTION 'Récolte déjà envoyée : modification interdite. Utilisez le parcours de pesée Station pour le poids réel.' USING ERRCODE='23514';
 END IF;
 IF NEW.actual_kg IS DISTINCT FROM OLD.actual_kg THEN
  SELECT sum(s.qty_contributed_kg) INTO expected_kg
  FROM public.harvest_lot_sources s JOIN public.harvest_lots l ON l.id=s.harvest_lot_id
  WHERE s.harvest_id=OLD.id AND l.weighed_kg IS NOT NULL;
  IF expected_kg IS NULL OR NEW.actual_kg IS DISTINCT FROM expected_kg THEN
   RAISE EXCEPTION 'Poids réel incohérent avec les pesées Station enregistrées.' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_sent_harvest() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_guard_sent_harvest BEFORE UPDATE OR DELETE ON public.harvests
 FOR EACH ROW EXECUTE FUNCTION public.guard_sent_harvest();

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_harvests(p_harvest_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[]; h record; deleted integer;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_admin_caller(),false) THEN
  RAISE EXCEPTION 'Permission refusée : admin requis' USING ERRCODE='42501';
 END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_harvest_ids) id WHERE id IS NOT NULL;
 IF coalesce(cardinality(ids),0)=0 THEN
  RETURN jsonb_build_object('status','success','deleted_harvests',0,'deleted_lots',0,'deleted_sources',0);
 END IF;
 FOR h IN SELECT id,domain_id FROM public.harvests WHERE id=ANY(ids) ORDER BY id FOR UPDATE LOOP
  IF NOT coalesce(public.has_domain_permission(h.domain_id,auth.uid(),'recoltes','delete'),false) THEN
   RAISE EXCEPTION 'Suppression non autorisée sur ce client' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.harvests WHERE id=ANY(ids))<>cardinality(ids) THEN
  RAISE EXCEPTION 'Une récolte sélectionnée est introuvable. Actualisez la liste.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.harvest_dispatch_locks WHERE harvest_id=ANY(ids)) THEN
  RAISE EXCEPTION 'Sélection contenant une récolte déjà envoyée : aucune suppression effectuée.' USING ERRCODE='23514';
 END IF;
 -- No deletion of dispatches, sources, or unrelated orphaned lots.
 DELETE FROM public.harvests WHERE id=ANY(ids);
 GET DIAGNOSTICS deleted=ROW_COUNT;
 RETURN jsonb_build_object('status','success','deleted_harvests',deleted,'deleted_lots',0,'deleted_sources',0);
END $$;
REVOKE ALL ON FUNCTION public.admin_bulk_delete_harvests(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_harvests(uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
