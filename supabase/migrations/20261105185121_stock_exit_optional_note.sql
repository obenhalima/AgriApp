-- La note de sortie est facultative. Le motif de rejet reste obligatoire.
BEGIN;
CREATE OR REPLACE FUNCTION public.submit_allocated_stock_exit(p_warehouse uuid,p_item uuid,p_quantity numeric,p_date date,p_reason text,p_reference text,p_farm uuid,p_plantings uuid[],p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE d uuid; req uuid; targets jsonb; fingerprint text; old public.stock_exit_requests%ROWTYPE;
BEGIN
 p_reason:=coalesce(p_reason,'');
 SELECT domain_id INTO d FROM public.stock_items WHERE id=p_item AND is_active;
 IF auth.uid() IS NULL OR d IS NULL OR NOT coalesce(public.has_domain_permission(d,auth.uid(),'stocks','create'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Permission de demande refusée' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_quantity IS NULL OR p_quantity<=0 OR p_quantity>99999999.99 OR p_quantity<>round(p_quantity,2)
 OR p_date IS NULL OR length(coalesce(p_reference,''))>100 THEN RAISE EXCEPTION 'Quantité, date, motif ou référence invalides'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND domain_id=d AND farm_id=p_farm AND is_active) THEN RAISE EXCEPTION 'Entrepôt actif de la ferme et du client requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(d::text||p_request::text,165));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_warehouse,p_item,p_quantity,p_date,p_reason,p_reference,p_farm,(SELECT jsonb_agg(id ORDER BY id) FROM unnest(p_plantings) id))::text,'UTF8')),'hex');
 SELECT * INTO old FROM public.stock_exit_requests WHERE domain_id=d AND allocation_request_id=p_request;
 IF FOUND THEN IF old.allocation_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Cette demande a déjà été envoyée avec un autre contenu'; END IF; RETURN old.id; END IF;
 targets:=public.stock_allocation_targets(d,p_farm,p_plantings);
 req:=public.submit_warehouse_stock_exit(p_warehouse,p_item,p_quantity,p_date,p_reason,p_reference);
 UPDATE public.stock_exit_requests SET allocation_farm_id=p_farm,allocation_targets=targets,allocation_request_id=p_request,allocation_fingerprint=fingerprint WHERE id=req;
 RETURN req;
END $fn$;
REVOKE ALL ON FUNCTION public.submit_allocated_stock_exit(uuid,uuid,numeric,date,text,text,uuid,uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_allocated_stock_exit(uuid,uuid,numeric,date,text,text,uuid,uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
