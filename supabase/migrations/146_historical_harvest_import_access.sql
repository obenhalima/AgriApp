-- Aligne l'import sur les droits existants : membre autorisé ou administrateur plateforme actif.
BEGIN;
CREATE OR REPLACE FUNCTION public.import_historical_harvests(p_domain uuid,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; t jsonb; existing public.harvest_import_receipts%ROWTYPE;
 hid uuid; pid uuid; dt date; total numeric; cnt integer; unit numeric;
 label text; made integer:=0; skipped integer:=0; actor text;
BEGIN
 IF auth.uid() IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
 OR NOT (COALESCE(public.is_domain_member(p_domain,auth.uid()),false)
         OR COALESCE(public.is_platform_admin(auth.uid()),false))
 OR NOT COALESCE(public.has_domain_permission(p_domain,auth.uid(),'recoltes','create'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 THEN RAISE EXCEPTION 'Import non autorisé pour ce client'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste de récoltes requise'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>2000000
 THEN RAISE EXCEPTION 'Importer entre 1 et 500 récoltes par fichier (2 Mo maximum)'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY x->>'ref' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Référence répétée dans le fichier'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,145));
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  BEGIN
   IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR length(btrim(COALESCE(r->>'ref',''))) NOT BETWEEN 1 AND 50
   OR length(COALESCE(r->>'notes',''))>4000 THEN RAISE EXCEPTION 'Référence (1 à 50 caractères) ou observations invalides'; END IF;
   SELECT * INTO existing FROM public.harvest_import_receipts WHERE domain_id=p_domain AND source_ref=r->>'ref';
   IF FOUND THEN
    IF existing.harvest_id IS NULL THEN RAISE EXCEPTION 'Cette référence a été importée puis supprimée. Rapprochement administratif requis avant toute nouvelle reprise'; END IF;
    IF existing.payload IS DISTINCT FROM r THEN RAISE EXCEPTION 'Référence déjà importée avec un contenu différent'; END IF;
    skipped:=skipped+1; CONTINUE;
   END IF;
   IF EXISTS(SELECT 1 FROM public.harvests WHERE domain_id=p_domain AND lot_number=r->>'ref') THEN RAISE EXCEPTION 'Référence déjà utilisée par une récolte'; END IF;
   pid:=(r->>'planting_id')::uuid; dt:=(r->>'date')::date;
   IF dt IS NULL OR dt>(now() AT TIME ZONE 'Africa/Casablanca')::date
   OR NOT EXISTS(SELECT 1 FROM public.campaign_plantings cp JOIN public.greenhouses g ON g.id=cp.greenhouse_id JOIN public.farms f ON f.id=g.farm_id JOIN public.campaigns c ON c.id=cp.campaign_id
    WHERE cp.id=pid AND cp.domain_id=p_domain AND f.domain_id=p_domain AND c.domain_id=p_domain)
   THEN RAISE EXCEPTION 'Date invalide ou plantation hors du client'; END IF;
   IF jsonb_typeof(r->'trays') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Plateaux requis'; END IF;
   IF jsonb_array_length(r->'trays') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Entre 1 et 50 lignes de plateaux requises'; END IF;
   total:=0;
   FOR t IN SELECT value FROM jsonb_array_elements(r->'trays') LOOP
    cnt:=(t->>'count')::integer; unit:=(t->>'unit_kg')::numeric;
    IF cnt IS NULL OR cnt<=0 OR (t->>'count')::numeric<>cnt OR unit IS NULL OR unit<=0 OR unit>=1000000 OR unit<>round(unit,2)
    OR NOT EXISTS(SELECT 1 FROM public.reference_values WHERE list_key='tray_type' AND code=t->>'code' AND is_active)
    THEN RAISE EXCEPTION 'Type, nombre ou poids unitaire de plateau invalide'; END IF;
    total:=total+cnt*unit;
   END LOOP;
   IF (r->>'people') IS NOT NULL AND (r->>'people')::numeric<>(r->>'people')::integer THEN RAISE EXCEPTION 'Effectif entier requis'; END IF;
   IF total<=0 OR total>=100000000 OR (r->>'kg')::numeric IS NULL OR abs(total-(r->>'kg')::numeric)>0.01 THEN RAISE EXCEPTION 'Poids incohérent avec les plateaux'; END IF;
   INSERT INTO public.harvests(domain_id,campaign_planting_id,harvest_date,lot_number,estimated_kg,qty_category_1,qty_category_2,qty_category_3,qty_waste,notes,recorded_by,recorded_by_name,harvest_people,harvest_hours,harvest_full_day)
   VALUES(p_domain,pid,dt,r->>'ref',total,total,0,0,0,NULLIF(r->>'notes',''),auth.uid(),actor,(r->>'people')::integer,(r->>'hours')::numeric,COALESCE((r->>'full_day')::boolean,false)) RETURNING id INTO hid;
   FOR t IN SELECT value FROM jsonb_array_elements(r->'trays') LOOP
    SELECT rv.label INTO label FROM public.reference_values rv WHERE list_key='tray_type' AND code=t->>'code' AND is_active LIMIT 1;
    INSERT INTO public.harvest_tray_lines(harvest_id,tray_type_code,tray_type_label,nb_trays,poids_unitaire_kg)
    VALUES(hid,t->>'code',label,(t->>'count')::integer,(t->>'unit_kg')::numeric);
   END LOOP;
   INSERT INTO public.harvest_import_receipts(domain_id,source_ref,payload,harvest_id,created_by) VALUES(p_domain,r->>'ref',r,hid,auth.uid());
   made:=made+1;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Récolte % : %. Aucun enregistrement de ce lot conservé.',r->>'ref',SQLERRM;
  END;
 END LOOP;
 RETURN jsonb_build_object('created',made,'already_imported',skipped);
END $$;
REVOKE ALL ON FUNCTION public.import_historical_harvests(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_historical_harvests(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
