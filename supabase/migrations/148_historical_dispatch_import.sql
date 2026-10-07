-- Reprise atomique récoltes + envois, sans pesée, tri, tarification ni facture.
-- Dépend des migrations 145 à 147. Réappliquer un fichier identique ne recrée rien.
BEGIN;
CREATE TABLE public.harvest_dispatch_import_receipts (
 domain_id uuid NOT NULL REFERENCES public.domains(id),
 source_ref text NOT NULL,
 payload jsonb NOT NULL,
 dispatch_id uuid REFERENCES public.harvest_lots(id) ON DELETE SET NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(domain_id,source_ref)
);
ALTER TABLE public.harvest_dispatch_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harvest_dispatch_import_receipts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.import_historical_harvest_workflow(p_domain uuid,p_rows jsonb,p_dispatches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; d jsonb; s jsonb; receipt public.harvest_dispatch_import_receipts%ROWTYPE;
 h public.harvests%ROWTYPE; cp public.campaign_plantings%ROWTYPE;
 mid uuid; buyer uuid; lid uuid; farm uuid; source_farm uuid; variety uuid;
 first_planting uuid; first_greenhouse uuid; dt date; total numeric; qty numeric; used numeric;
 made integer:=0; skipped integer:=0;
BEGIN
 -- Existing import enforces auth, active domain/profile, scoped create permission and DAR.
 result:=public.import_historical_harvests(p_domain,p_rows);
 IF jsonb_typeof(p_dispatches) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste des envois requise'; END IF;
 IF jsonb_array_length(p_dispatches)>500 OR octet_length(p_dispatches::text)>2000000 THEN
  RAISE EXCEPTION '500 envois et 2 Mo maximum';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_dispatches) x GROUP BY x->>'ref' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Référence envoi répétée';
 END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p_dispatches) LOOP
  BEGIN
   IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR length(btrim(COALESCE(d->>'ref',''))) NOT BETWEEN 1 AND 50
    OR length(COALESCE(d->>'notes',''))>4000 THEN RAISE EXCEPTION 'Référence ou observations invalides'; END IF;
   SELECT * INTO receipt FROM public.harvest_dispatch_import_receipts WHERE domain_id=p_domain AND source_ref=d->>'ref';
   IF FOUND THEN
    IF receipt.dispatch_id IS NULL THEN RAISE EXCEPTION 'Envoi importé puis supprimé : rapprochement administratif requis'; END IF;
    IF receipt.payload IS DISTINCT FROM d THEN RAISE EXCEPTION 'Référence déjà importée avec un contenu différent'; END IF;
    skipped:=skipped+1; CONTINUE;
   END IF;
   IF EXISTS(SELECT 1 FROM public.harvest_lots WHERE lot_number=d->>'ref') THEN RAISE EXCEPTION 'Référence envoi déjà utilisée'; END IF;
   dt:=(d->>'date')::date; mid:=(d->>'market_id')::uuid;
   IF dt IS NULL OR dt>(now() AT TIME ZONE 'Africa/Casablanca')::date THEN RAISE EXCEPTION 'Date envoi invalide ou future'; END IF;
   SELECT client_id INTO buyer FROM public.markets WHERE id=mid AND is_active;
   IF NOT FOUND OR buyer IS NULL OR NOT EXISTS(SELECT 1 FROM public.clients WHERE id=buyer AND is_active) THEN
    RAISE EXCEPTION 'Marché actif avec client destinataire actif requis';
   END IF;
   IF jsonb_typeof(d->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sources requises'; END IF;
   IF jsonb_array_length(d->'sources') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Entre 1 et 500 récoltes sources requises'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'sources') x GROUP BY x->>'harvest_ref' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Récolte répétée dans les sources';
   END IF;
   total:=0; farm:=NULL; variety:=NULL; first_planting:=NULL;
   -- Lock all harvests in a consistent order. A competing manual dispatch also takes these locks.
   FOR s IN SELECT value FROM jsonb_array_elements(d->'sources') ORDER BY value->>'harvest_ref' LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE x->>'ref'=s->>'harvest_ref') THEN
     RAISE EXCEPTION 'La récolte source doit figurer dans le fichier';
    END IF;
    SELECT hh.* INTO h FROM public.harvest_import_receipts ir JOIN public.harvests hh ON hh.id=ir.harvest_id
     WHERE ir.domain_id=p_domain AND ir.source_ref=s->>'harvest_ref' AND hh.domain_id=p_domain FOR UPDATE OF hh;
    IF NOT FOUND THEN RAISE EXCEPTION 'Récolte source introuvable pour ce domaine'; END IF;
    IF h.harvest_date>dt THEN RAISE EXCEPTION 'Envoi antérieur à la récolte'; END IF;
    SELECT * INTO cp FROM public.campaign_plantings WHERE id=h.campaign_planting_id AND domain_id=p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plantation source invalide'; END IF;
    SELECT g.farm_id INTO source_farm FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id
     WHERE g.id=cp.greenhouse_id AND f.domain_id=p_domain;
    IF source_farm IS NULL OR cp.variety_id IS NULL THEN RAISE EXCEPTION 'Ferme ou variété source absente'; END IF;
    IF farm IS NULL THEN farm:=source_farm; variety:=cp.variety_id; first_planting:=cp.id; first_greenhouse:=cp.greenhouse_id;
    ELSIF farm IS DISTINCT FROM source_farm OR variety IS DISTINCT FROM cp.variety_id THEN
     RAISE EXCEPTION 'Un envoi doit concerner une seule ferme et une seule variété';
    END IF;
    qty:=(s->>'kg')::numeric;
    IF qty IS NULL OR qty<=0 OR qty>=100000000 OR qty<>round(qty,2) THEN RAISE EXCEPTION 'Contribution source positive à deux décimales requise'; END IF;
    SELECT COALESCE(sum(qty_contributed_kg),0) INTO used FROM public.harvest_lot_sources WHERE harvest_id=h.id;
    SELECT used+COALESCE(sum(l.quantity_kg),0) INTO used FROM public.harvest_lots l
     WHERE l.harvest_id=h.id AND l.category='station_dispatch'
      AND NOT EXISTS(SELECT 1 FROM public.harvest_lot_sources x WHERE x.harvest_lot_id=l.id);
    IF used+qty>COALESCE(h.actual_kg,h.estimated_kg,h.total_qty)+0.01 THEN
     RAISE EXCEPTION 'Quantité déjà envoyée ou contribution supérieure au disponible pour %',s->>'harvest_ref';
    END IF;
    total:=total+qty;
   END LOOP;
   IF (d->>'kg')::numeric IS NULL OR total>=100000000 OR abs(total-(d->>'kg')::numeric)>0.01 THEN
    RAISE EXCEPTION 'La somme des sources doit correspondre aux kg de départ';
   END IF;
   INSERT INTO public.harvest_lots(domain_id,lot_number,harvest_id,campaign_planting_id,harvest_date,quantity_kg,estimated_kg,
    category,variety_id,greenhouse_id,market_id,client_id,tri_status,notes)
   VALUES(p_domain,d->>'ref',NULL,first_planting,dt,total,total,'station_dispatch',variety,first_greenhouse,mid,buyer,'pending',NULLIF(d->>'notes',''))
   RETURNING id INTO lid;
   FOR s IN SELECT value FROM jsonb_array_elements(d->'sources') LOOP
    SELECT harvest_id INTO h.id FROM public.harvest_import_receipts WHERE domain_id=p_domain AND source_ref=s->>'harvest_ref';
    INSERT INTO public.harvest_lot_sources(harvest_lot_id,harvest_id,qty_contributed_kg) VALUES(lid,h.id,(s->>'kg')::numeric);
   END LOOP;
   INSERT INTO public.harvest_dispatch_import_receipts(domain_id,source_ref,payload,dispatch_id,created_by)
    VALUES(p_domain,d->>'ref',d,lid,auth.uid());
   made:=made+1;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Envoi % : %. Import annulé, aucune création conservée.',d->>'ref',SQLERRM;
  END;
 END LOOP;
 RETURN result||jsonb_build_object('dispatches_created',made,'dispatches_already_imported',skipped);
END $$;
REVOKE ALL ON FUNCTION public.import_historical_harvest_workflow(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_historical_harvest_workflow(uuid,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
