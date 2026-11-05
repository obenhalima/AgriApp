-- Validation et comptabilisation atomiques. Une erreur annule toute la validation.
BEGIN;
CREATE OR REPLACE FUNCTION public.execute_stock_exit_request(p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE r public.stock_exit_requests%ROWTYPE; movement uuid;
BEGIN
 SELECT * INTO r FROM public.stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT (coalesce(public.has_domain_permission(r.domain_id,auth.uid(),'stocks','edit'),false) OR coalesce(public.is_domain_responsible(r.domain_id,auth.uid(),'stocks'),false) OR (r.status='approuvee' AND r.approved_by IS NULL AND r.requested_by=auth.uid() AND coalesce(public.has_domain_permission(r.domain_id,auth.uid(),'stocks','create'),false)))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Permission d’exécution refusée' USING ERRCODE='42501'; END IF;
 IF r.status='executee' AND r.stock_movement_id IS NOT NULL THEN RETURN r.stock_movement_id; END IF;
 IF r.status<>'approuvee' THEN RAISE EXCEPTION 'La sortie doit être approuvée avant exécution'; END IF;
 IF r.allocation_targets IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=r.warehouse_id AND domain_id=r.domain_id AND farm_id=r.allocation_farm_id AND is_active) THEN RAISE EXCEPTION 'Entrepôt et ferme incompatibles'; END IF;
 PERFORM public.stock_allocation_targets(r.domain_id,r.allocation_farm_id,ARRAY(SELECT (x->>'planting_id')::uuid FROM jsonb_array_elements(r.allocation_targets) x));
 END IF;
 PERFORM 1 FROM public.stock_items WHERE id=r.stock_item_id AND domain_id=r.domain_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Article actif du client requis'; END IF;
 PERFORM set_config('app.approved_stock_exit','true',true);
 INSERT INTO public.stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date,reference,notes,created_by,campaign_id,greenhouse_id)
 VALUES(r.domain_id,r.stock_item_id,r.warehouse_id,'sortie',r.quantity,r.requested_for,r.reference,r.reason,auth.uid(),CASE WHEN r.allocation_targets IS NULL THEN r.campaign_id END,CASE WHEN r.allocation_targets IS NULL THEN r.greenhouse_id END) RETURNING id INTO movement;
 IF r.allocation_targets IS NOT NULL THEN
 INSERT INTO public.stock_consumption_allocations(movement_id,domain_id,farm_id,targets,origin) VALUES(movement,r.domain_id,r.allocation_farm_id,r.allocation_targets,'request');
 END IF;
 UPDATE public.stock_exit_requests SET status='executee',executed_by=auth.uid(),executed_at=now(),stock_movement_id=movement,updated_at=now() WHERE id=r.id;
 RETURN movement;
END $fn$;
REVOKE ALL ON FUNCTION public.execute_stock_exit_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_stock_exit_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_stock_exit_request(p_request_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE request public.stock_exit_requests%ROWTYPE;
BEGIN
 SELECT * INTO request FROM public.stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR (request.requested_by=auth.uid() AND NOT (request.status='approuvee' AND request.approved_by IS NULL))
 OR NOT (coalesce(public.is_domain_responsible(request.domain_id,auth.uid(),'stocks'),false) OR (request.status='approuvee' AND request.approved_by IS NULL AND request.requested_by=auth.uid() AND coalesce(public.has_domain_permission(request.domain_id,auth.uid(),'stocks','create'),false)))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Validation réservée au responsable, distinct du demandeur' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Décision requise'; END IF;
 IF p_approve AND request.status='executee' AND request.stock_movement_id IS NOT NULL THEN RETURN; END IF;
 IF request.status='approuvee' AND p_approve THEN
   PERFORM public.execute_stock_exit_request(request.id); RETURN;
 END IF;
 IF request.status<>'soumise' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
 IF p_approve THEN
   UPDATE public.stock_exit_requests SET status='approuvee',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=request.id;
   PERFORM public.execute_stock_exit_request(request.id);
 ELSE
   IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Le motif de rejet est obligatoire'; END IF;
   UPDATE public.stock_exit_requests SET status='rejetee',rejected_by=auth.uid(),rejected_at=now(),rejection_reason=p_reason,updated_at=now() WHERE id=request.id;
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.review_stock_exit_request(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_stock_exit_request(uuid,boolean,text) TO authenticated;
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
 IF EXISTS(SELECT 1 FROM public.stock_exit_requests WHERE id=req AND status='approuvee') THEN PERFORM public.execute_stock_exit_request(req); END IF;
 RETURN req;
END $fn$;
REVOKE ALL ON FUNCTION public.submit_allocated_stock_exit(uuid,uuid,numeric,date,text,text,uuid,uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_allocated_stock_exit(uuid,uuid,numeric,date,text,text,uuid,uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
