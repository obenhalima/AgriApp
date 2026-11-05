BEGIN;
CREATE OR REPLACE FUNCTION public.execute_stock_exit_request(p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE r public.stock_exit_requests%ROWTYPE; movement uuid; existing public.stock_movements%ROWTYPE; available numeric; warehouse_name text;
BEGIN
 SELECT * INTO r FROM public.stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT (coalesce(public.has_domain_permission(r.domain_id,auth.uid(),'stocks','edit'),false) OR coalesce(public.is_domain_responsible(r.domain_id,auth.uid(),'stocks'),false) OR (r.status='approuvee' AND r.approved_by IS NULL AND r.requested_by=auth.uid() AND coalesce(public.has_domain_permission(r.domain_id,auth.uid(),'stocks','create'),false)))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Permission d’exécution refusée' USING ERRCODE='42501'; END IF;
 IF r.stock_movement_id IS NOT NULL THEN
   IF r.status NOT IN ('approuvee','executee') THEN RAISE EXCEPTION 'Demande incohérente : mouvement déjà lié, contrôle requis'; END IF;
   SELECT * INTO existing FROM public.stock_movements WHERE id=r.stock_movement_id;
   IF NOT FOUND OR existing.domain_id IS DISTINCT FROM r.domain_id OR existing.stock_item_id IS DISTINCT FROM r.stock_item_id
   OR existing.warehouse_id IS DISTINCT FROM r.warehouse_id OR existing.quantity IS DISTINCT FROM r.quantity
   OR existing.movement_type<>'sortie' OR existing.transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Le mouvement lié ne correspond pas à la demande : contrôle requis'; END IF;
   UPDATE public.stock_exit_requests SET status='executee',executed_by=coalesce(executed_by,existing.created_by),executed_at=coalesce(executed_at,now()),updated_at=now() WHERE id=r.id;
   RETURN r.stock_movement_id;
 END IF;
 IF r.status<>'approuvee' THEN RAISE EXCEPTION 'La sortie doit être approuvée avant exécution'; END IF;
 IF r.allocation_targets IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=r.warehouse_id AND domain_id=r.domain_id AND farm_id=r.allocation_farm_id AND is_active) THEN RAISE EXCEPTION 'Entrepôt et ferme incompatibles'; END IF;
 PERFORM public.stock_allocation_targets(r.domain_id,r.allocation_farm_id,ARRAY(SELECT (x->>'planting_id')::uuid FROM jsonb_array_elements(r.allocation_targets) x));
 END IF;
 PERFORM 1 FROM public.stock_items WHERE id=r.stock_item_id AND domain_id=r.domain_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Article actif du client requis'; END IF;
 SELECT coalesce(b.current_qty,0),w.name INTO available,warehouse_name FROM public.warehouses w
 LEFT JOIN public.warehouse_stocks b ON b.warehouse_id=w.id AND b.stock_item_id=r.stock_item_id WHERE w.id=r.warehouse_id;
 IF coalesce(available,0)<r.quantity THEN RAISE EXCEPTION 'Stock insuffisant dans % : quantité demandée %, disponible %. Demande non comptabilisée.',coalesce(warehouse_name,'cet entrepôt'),r.quantity,coalesce(available,0); END IF;
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

NOTIFY pgrst,'reload schema';
COMMIT;
