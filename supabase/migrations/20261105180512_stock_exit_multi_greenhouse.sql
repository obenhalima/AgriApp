-- Affectations multi-serres, sans modifier les mouvements ou coûts historiques.
-- Pré-requis : workflow 080/106B, valorisation 115/118, interventions 135B.
BEGIN;
ALTER TABLE public.stock_exit_requests ADD COLUMN allocation_farm_id uuid REFERENCES public.farms(id),
 ADD COLUMN allocation_targets jsonb, ADD COLUMN allocation_request_id uuid, ADD COLUMN allocation_fingerprint text;
CREATE UNIQUE INDEX stock_exit_allocation_request ON public.stock_exit_requests(domain_id,allocation_request_id) WHERE allocation_request_id IS NOT NULL;
CREATE TABLE public.stock_consumption_allocations(
 movement_id uuid PRIMARY KEY REFERENCES public.stock_movements(id), domain_id uuid NOT NULL REFERENCES public.domains(id),
 farm_id uuid NOT NULL REFERENCES public.farms(id), targets jsonb NOT NULL CHECK(jsonb_typeof(targets)='array' AND jsonb_array_length(targets)>0),
 origin text NOT NULL CHECK(origin IN ('request','review')), created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL DEFAULT auth.uid()
);
CREATE INDEX stock_consumption_allocations_domain ON public.stock_consumption_allocations(domain_id);
ALTER TABLE public.stock_consumption_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_consumption_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.stock_consumption_allocations TO authenticated;
CREATE POLICY stock_consumption_allocations_read ON public.stock_consumption_allocations FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view') OR public.has_domain_permission(domain_id,auth.uid(),'couts','view'));

-- Internal snapshot of the selected planted areas. Never trusts browser-supplied weights.
CREATE FUNCTION public.stock_allocation_targets(p_domain uuid,p_farm uuid,p_plantings uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;
BEGIN
 IF p_plantings IS NULL OR cardinality(p_plantings) NOT BETWEEN 1 AND 200
 OR cardinality(p_plantings)<>(SELECT count(DISTINCT id) FROM unnest(p_plantings) id)
 THEN RAISE EXCEPTION 'Choisir entre 1 et 200 plantations distinctes'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.farms WHERE id=p_farm AND domain_id=p_domain AND is_active) THEN RAISE EXCEPTION 'Ferme active du client requise'; END IF;
 SELECT jsonb_agg(jsonb_build_object('planting_id',cp.id,'campaign_id',cp.campaign_id,'greenhouse_id',cp.greenhouse_id,'variety_id',cp.variety_id,'area',cp.planted_area) ORDER BY cp.id) INTO result
 FROM public.campaign_plantings cp JOIN public.greenhouses g ON g.id=cp.greenhouse_id JOIN public.campaigns c ON c.id=cp.campaign_id
 WHERE cp.id=ANY(p_plantings) AND cp.domain_id=p_domain AND c.domain_id=p_domain AND g.farm_id=p_farm
 AND cp.planted_area>0 AND cp.planted_area::text NOT IN('NaN','Infinity','-Infinity');
 IF coalesce(jsonb_array_length(result),0)<>cardinality(p_plantings) THEN RAISE EXCEPTION 'Serres, surfaces ou plantations incompatibles avec la ferme et le client'; END IF;
 IF (SELECT count(DISTINCT x->>'campaign_id') FROM jsonb_array_elements(result) x)<>1 THEN RAISE EXCEPTION 'Choisir une seule campagne pour cette sortie'; END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.stock_allocation_targets(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_stock_allocation_catalog(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 OR NOT (coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','create'),false) OR coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false))
 THEN RAISE EXCEPTION 'Consultation des affectations interdite' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',cp.id,'farm_id',f.id,'farm_name',f.name,'campaign_id',c.id,'campaign_name',c.name,
   'greenhouse_id',g.id,'greenhouse_name',coalesce(g.name,g.code),'variety_name',v.commercial_name,'area',cp.planted_area) ORDER BY f.name,c.name,g.code,cp.id)
 FROM public.campaign_plantings cp JOIN public.greenhouses g ON g.id=cp.greenhouse_id JOIN public.farms f ON f.id=g.farm_id
 JOIN public.campaigns c ON c.id=cp.campaign_id JOIN public.varieties v ON v.id=cp.variety_id
 WHERE cp.domain_id=p_domain AND f.domain_id=p_domain AND c.domain_id=p_domain AND f.is_active AND cp.planted_area>0),'[]');
END $fn$;
REVOKE ALL ON FUNCTION public.get_stock_allocation_catalog(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_stock_allocation_catalog(uuid) TO authenticated;

CREATE FUNCTION public.submit_allocated_stock_exit(p_warehouse uuid,p_item uuid,p_quantity numeric,p_date date,p_reason text,p_reference text,p_farm uuid,p_plantings uuid[],p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE d uuid; req uuid; targets jsonb; fingerprint text; old public.stock_exit_requests%ROWTYPE;
BEGIN
 SELECT domain_id INTO d FROM public.stock_items WHERE id=p_item AND is_active;
 IF auth.uid() IS NULL OR d IS NULL OR NOT coalesce(public.has_domain_permission(d,auth.uid(),'stocks','create'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Permission de demande refusée' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_quantity IS NULL OR p_quantity<=0 OR p_quantity>99999999.99 OR p_quantity<>round(p_quantity,2)
 OR p_date IS NULL OR length(btrim(coalesce(p_reason,'')))<1 OR length(coalesce(p_reference,''))>100 THEN RAISE EXCEPTION 'Quantité, date, motif ou référence invalides'; END IF;
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

-- Preserve the previous treatment/cultural logic. Manual allocations use a dedicated path.
ALTER FUNCTION public.post_consumption_cost(uuid) RENAME TO post_consumption_cost_before_multi;
REVOKE ALL ON FUNCTION public.post_consumption_cost_before_multi(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.post_consumption_cost(p_movement uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.stock_consumption_allocations%ROWTYPE; m public.stock_movements%ROWTYPE; review public.inventory_consumption_reviews%ROWTYPE;
 t jsonb; total numeric; allocated numeric:=0; part numeric; n integer; i integer:=0; category text; cat uuid;
BEGIN
 SELECT * INTO a FROM public.stock_consumption_allocations WHERE movement_id=p_movement;
 IF NOT FOUND THEN PERFORM public.post_consumption_cost_before_multi(p_movement); RETURN; END IF;
 SELECT * INTO m FROM public.stock_movements WHERE id=p_movement;
 IF m.domain_id IS DISTINCT FROM a.domain_id OR m.movement_type<>'sortie' OR m.transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Affectation et mouvement incompatibles'; END IF;
 SELECT * INTO review FROM public.inventory_consumption_reviews WHERE movement_id=p_movement;
 IF FOUND THEN m.total_cost:=m.quantity*review.unit_cost; m.valuation_verified:=true;
 ELSIF a.origin='review' THEN RETURN; END IF;
 IF m.total_cost IS NULL OR EXISTS(SELECT 1 FROM public.cost_entries WHERE source_stock_movement_id=p_movement) THEN RETURN; END IF;
 SELECT s.category::text INTO category FROM public.stock_items s WHERE s.id=m.stock_item_id;
 SELECT id INTO cat FROM public.account_categories WHERE code=public.map_purchase_cat_to_account_code(category) LIMIT 1;
 SELECT sum((x->>'area')::numeric) INTO total FROM jsonb_array_elements(a.targets) x;
 IF coalesce(total,0)<=0 THEN RAISE EXCEPTION 'Surfaces positives requises'; END IF;
 SELECT count(*) INTO n FROM (SELECT x->>'campaign_id',x->>'greenhouse_id',x->>'variety_id' FROM jsonb_array_elements(a.targets) x GROUP BY 1,2,3) grouped;
 FOR t IN SELECT jsonb_build_object('campaign_id',x->>'campaign_id','greenhouse_id',x->>'greenhouse_id','variety_id',x->>'variety_id','area',sum((x->>'area')::numeric))
   FROM jsonb_array_elements(a.targets) x GROUP BY x->>'campaign_id',x->>'greenhouse_id',x->>'variety_id' ORDER BY x->>'campaign_id',x->>'greenhouse_id',x->>'variety_id' LOOP
   i:=i+1; part:=CASE WHEN i=n THEN round(m.total_cost,2)-allocated ELSE greatest(0,least(round(m.total_cost,2)-allocated,round(m.total_cost*(t->>'area')::numeric/total,2))) END; allocated:=allocated+part;
   INSERT INTO public.cost_entries(domain_id,campaign_id,greenhouse_id,variety_id,account_category_id,cost_category,amount,entry_date,description,is_planned,source_stock_movement_id,allocation_method,cost_quality)
   VALUES(m.domain_id,(t->>'campaign_id')::uuid,(t->>'greenhouse_id')::uuid,(t->>'variety_id')::uuid,cat,category,part,m.movement_date,'Consommation stock multi-serres '||coalesce(m.reference,''),false,m.id,'surface_plantee_confirmee',CASE WHEN m.valuation_verified THEN 'verified' ELSE 'provisional' END);
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.post_consumption_cost(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.trigger_consumption_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN PERFORM public.post_consumption_cost(NEW.id);
 ELSIF TG_TABLE_NAME='inventory_consumption_reviews' THEN PERFORM public.post_consumption_cost(NEW.movement_id);
 ELSE PERFORM public.post_consumption_cost(NEW.stock_movement_id); END IF;
 RETURN NEW;
END $fn$;
CREATE FUNCTION public.trigger_manual_stock_allocation_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF NEW.origin='request' THEN PERFORM public.post_consumption_cost(NEW.movement_id); END IF; RETURN NEW; END $fn$;
REVOKE ALL ON FUNCTION public.trigger_manual_stock_allocation_cost() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER manual_stock_allocation_cost AFTER INSERT ON public.stock_consumption_allocations FOR EACH ROW EXECUTE FUNCTION public.trigger_manual_stock_allocation_cost();

ALTER FUNCTION public.execute_stock_exit_request(uuid) RENAME TO execute_stock_exit_request_before_multi;
REVOKE ALL ON FUNCTION public.execute_stock_exit_request_before_multi(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.execute_stock_exit_request(p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE r public.stock_exit_requests%ROWTYPE; movement uuid;
BEGIN
 SELECT * INTO r FROM public.stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(r.domain_id,auth.uid(),'stocks','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Permission d’exécution refusée' USING ERRCODE='42501'; END IF;
 IF r.allocation_targets IS NULL THEN RETURN public.execute_stock_exit_request_before_multi(p_request_id); END IF;
 IF r.status='executee' AND r.stock_movement_id IS NOT NULL THEN RETURN r.stock_movement_id; END IF;
 IF r.status<>'approuvee' THEN RAISE EXCEPTION 'La sortie doit être approuvée avant exécution'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=r.warehouse_id AND domain_id=r.domain_id AND farm_id=r.allocation_farm_id AND is_active) THEN RAISE EXCEPTION 'Entrepôt et ferme incompatibles'; END IF;
 PERFORM public.stock_allocation_targets(r.domain_id,r.allocation_farm_id,ARRAY(SELECT (x->>'planting_id')::uuid FROM jsonb_array_elements(r.allocation_targets) x));
 PERFORM 1 FROM public.stock_items WHERE id=r.stock_item_id AND domain_id=r.domain_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Article actif du client requis'; END IF;
 PERFORM set_config('app.approved_stock_exit','true',true);
 INSERT INTO public.stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date,reference,notes,created_by)
 VALUES(r.domain_id,r.stock_item_id,r.warehouse_id,'sortie',r.quantity,r.requested_for,r.reference,r.reason,auth.uid()) RETURNING id INTO movement;
 INSERT INTO public.stock_consumption_allocations(movement_id,domain_id,farm_id,targets,origin) VALUES(movement,r.domain_id,r.allocation_farm_id,r.allocation_targets,'request');
 UPDATE public.stock_exit_requests SET status='executee',executed_by=auth.uid(),executed_at=now(),stock_movement_id=movement,updated_at=now() WHERE id=r.id;
 RETURN movement;
END $fn$;
REVOKE ALL ON FUNCTION public.execute_stock_exit_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_stock_exit_request(uuid) TO authenticated;

CREATE FUNCTION public.stock_consumption_allocation_context(p_movement uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE m public.stock_movements%ROWTYPE; w public.warehouses%ROWTYPE; targets jsonb; linked boolean;
BEGIN
 SELECT * INTO m FROM public.stock_movements WHERE id=p_movement;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(m.domain_id,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Rapprochement non autorisé' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM public.warehouses WHERE id=m.warehouse_id AND domain_id=m.domain_id;
 SELECT a.targets INTO targets FROM public.stock_consumption_allocations a WHERE a.movement_id=m.id;
 linked:=EXISTS(SELECT 1 FROM public.cultural_consumptions WHERE movement_id=m.id) OR EXISTS(SELECT 1 FROM public.treatment_application_products WHERE stock_movement_id=m.id);
 RETURN jsonb_build_object('domain_id',m.domain_id,'farm_id',w.farm_id,'farm_name',(SELECT name FROM public.farms WHERE id=w.farm_id),'warehouse_name',w.name,
  'linked',linked,'fixed',targets IS NOT NULL,'targets',coalesce(targets,'[]'),'plantings',public.get_stock_allocation_catalog(m.domain_id));
END $fn$;
REVOKE ALL ON FUNCTION public.stock_consumption_allocation_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_consumption_allocation_context(uuid) TO authenticated;

CREATE FUNCTION public.review_inventory_consumption_multi(p_movement uuid,p_plantings uuid[],p_unit_cost numeric,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE m public.stock_movements%ROWTYPE; farm uuid; targets jsonb;
BEGIN
 SELECT * INTO m FROM public.stock_movements WHERE id=p_movement FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(m.domain_id,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Rapprochement non autorisé' USING ERRCODE='42501'; END IF;
 IF m.movement_type<>'sortie' OR m.transfer_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.cost_entries WHERE source_stock_movement_id=m.id) THEN RAISE EXCEPTION 'Seule une consommation non encore imputée peut être rapprochée'; END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<0 OR p_unit_cost>99999999.99 OR p_unit_cost::text IN('NaN','Infinity','-Infinity') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Prix historique et justificatif requis'; END IF;
 IF EXISTS(SELECT 1 FROM public.cultural_consumptions WHERE movement_id=m.id) OR EXISTS(SELECT 1 FROM public.treatment_application_products WHERE stock_movement_id=m.id) THEN
   IF coalesce(cardinality(p_plantings),0)>0 THEN RAISE EXCEPTION 'Les cibles du traitement ou de l’intervention liée sont conservées automatiquement'; END IF;
   PERFORM public.review_inventory_consumption(m.id,NULL,p_unit_cost,p_reason); RETURN;
 END IF;
 SELECT w.farm_id INTO farm FROM public.warehouses w JOIN public.farms f ON f.id=w.farm_id WHERE w.id=m.warehouse_id AND w.domain_id=m.domain_id AND f.domain_id=m.domain_id;
 IF farm IS NULL THEN RAISE EXCEPTION 'Ferme de l’entrepôt non renseignée'; END IF;
 SELECT a.targets INTO targets FROM public.stock_consumption_allocations a WHERE a.movement_id=m.id;
 IF targets IS NULL THEN
   targets:=public.stock_allocation_targets(m.domain_id,farm,p_plantings);
   INSERT INTO public.stock_consumption_allocations(movement_id,domain_id,farm_id,targets,origin) VALUES(m.id,m.domain_id,farm,targets,'review');
 ELSIF coalesce(cardinality(p_plantings),0)>0 THEN RAISE EXCEPTION 'Conserver les affectations de la sortie approuvée'; END IF;
 INSERT INTO public.inventory_consumption_reviews(movement_id,domain_id,unit_cost,reason) VALUES(m.id,m.domain_id,p_unit_cost,p_reason);
 IF NOT EXISTS(SELECT 1 FROM public.cost_entries WHERE source_stock_movement_id=m.id) THEN RAISE EXCEPTION 'Imputation impossible : contrôler les affectations'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.review_inventory_consumption_multi(uuid,uuid[],numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_inventory_consumption_multi(uuid,uuid[],numeric,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
