BEGIN;
CREATE TABLE public.stock_product_review_batches(
 id uuid PRIMARY KEY,domain_id uuid NOT NULL REFERENCES public.domains(id),actor_id uuid NOT NULL DEFAULT auth.uid(),
 payload_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_product_review_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_product_review_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.stock_product_review_batches TO authenticated;
CREATE POLICY stock_product_reviews_read ON public.stock_product_review_batches FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'couts','view'));

-- Preserve the individual entry point and enforce the client's FIFO price there too.
ALTER FUNCTION public.review_inventory_consumption_multi(uuid,uuid[],numeric,text) RENAME TO review_inventory_consumption_before_products;
REVOKE ALL ON FUNCTION public.review_inventory_consumption_before_products(uuid,uuid[],numeric,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.review_inventory_consumption_multi(p_movement uuid,p_plantings uuid[],p_unit_cost numeric,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE movement public.stock_movements%ROWTYPE; price numeric;
BEGIN
 SELECT * INTO movement FROM public.stock_movements WHERE id=p_movement;
 IF auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(movement.domain_id,auth.uid(),'couts','edit'),false)
 THEN RAISE EXCEPTION 'Rapprochement non autorisé' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.domains WHERE id=movement.domain_id FOR UPDATE;
 SELECT * INTO movement FROM public.stock_movements WHERE id=p_movement FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.inventory_cost_settings WHERE domain_id=movement.domain_id AND method='fifo') THEN
  price:=movement.total_cost/nullif(movement.quantity,0);
  IF price IS NULL THEN RAISE EXCEPTION 'FIFO exige de valoriser les entrées avant de rapprocher les sorties'; END IF;
  IF p_unit_cost IS NULL OR abs(p_unit_cost-price)>0.00000001 THEN RAISE EXCEPTION 'Le prix FIFO provient des entrées et doit être conservé'; END IF;
 END IF;
 PERFORM public.review_inventory_consumption_before_products(p_movement,p_plantings,p_unit_cost,p_reason);
END $fn$;
REVOKE ALL ON FUNCTION public.review_inventory_consumption_multi(uuid,uuid[],numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_inventory_consumption_multi(uuid,uuid[],numeric,text) TO authenticated;

CREATE FUNCTION public.stock_product_review_context(p_domain uuid,p_movements uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE movements jsonb; method text; catalog jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','view'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Accès aux coûts requis' USING ERRCODE='42501'; END IF;
 IF cardinality(p_movements) NOT BETWEEN 1 AND 1000 OR p_movements IS NULL
 OR cardinality(p_movements)<>(SELECT count(DISTINCT id) FROM unnest(p_movements) id)
 THEN RAISE EXCEPTION 'Sélectionnez entre 1 et 1 000 sorties distinctes'; END IF;
 IF (SELECT count(*) FROM public.stock_movements WHERE id=ANY(p_movements) AND domain_id=p_domain AND movement_type='sortie' AND transfer_id IS NULL)<>cardinality(p_movements)
 OR EXISTS(SELECT 1 FROM public.cost_entries WHERE source_stock_movement_id=ANY(p_movements))
 OR EXISTS(SELECT 1 FROM public.inventory_consumption_reviews WHERE movement_id=ANY(p_movements))
 THEN RAISE EXCEPTION 'Les sorties ont changé ou sont déjà rapprochées. Actualisez.'; END IF;
 SELECT coalesce((SELECT s.method FROM public.inventory_cost_settings s WHERE s.domain_id=p_domain),'cump') INTO method;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'item',s.id,'code',s.code,'name',s.name,'unit',s.unit,'quantity',m.quantity,
  'date',m.movement_date,'reference',coalesce(m.reference,''),'warehouse',w.name,'farm',w.farm_id,'price',m.total_cost/nullif(m.quantity,0),
  'fixed',EXISTS(SELECT 1 FROM public.stock_consumption_allocations a WHERE a.movement_id=m.id),
  'targets',(SELECT a.targets FROM public.stock_consumption_allocations a WHERE a.movement_id=m.id),
  'linked',EXISTS(SELECT 1 FROM public.cultural_consumptions WHERE movement_id=m.id) OR EXISTS(SELECT 1 FROM public.treatment_application_products WHERE stock_movement_id=m.id)) ORDER BY s.code,m.movement_date,m.id),'[]')
 INTO movements FROM public.stock_movements m JOIN public.stock_items s ON s.id=m.stock_item_id AND s.domain_id=p_domain
 JOIN public.warehouses w ON w.id=m.warehouse_id AND w.domain_id=p_domain WHERE m.id=ANY(p_movements) AND m.domain_id=p_domain;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',cp.id,'ref','P-'||substr(md5(cp.id::text),1,12),
  'farm_id',f.id,'farm_name',f.name,'campaign_id',c.id,'campaign_name',c.name,
  'greenhouse_id',g.id,'greenhouse_name',coalesce(g.name,g.code),'variety_name',v.commercial_name,'area',cp.planted_area) ORDER BY cp.id),'[]')
 INTO catalog FROM public.campaign_plantings cp JOIN public.greenhouses g ON g.id=cp.greenhouse_id
 JOIN public.farms f ON f.id=g.farm_id JOIN public.campaigns c ON c.id=cp.campaign_id JOIN public.varieties v ON v.id=cp.variety_id
 WHERE cp.domain_id=p_domain AND f.domain_id=p_domain AND c.domain_id=p_domain AND f.is_active AND cp.planted_area>0;
 RETURN jsonb_build_object('method',method,'movements',movements,'plantings',catalog,'version',encode(sha256(convert_to(movements::text||catalog::text||method,'UTF8')),'hex'));
END $fn$;
REVOKE ALL ON FUNCTION public.stock_product_review_context(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_product_review_context(uuid,uuid[]) TO authenticated;

CREATE FUNCTION public.review_stock_products(p_domain uuid,p_request uuid,p_rows jsonb,p_expected text,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='60s' AS $fn$
DECLARE ids uuid[]; context jsonb; row jsonb; movement jsonb; price numeric; targets uuid[]; total numeric:=0;
 payload_hash text; receipt public.stock_product_review_batches%ROWTYPE; result jsonb; reason text; product_prices jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Droit de modification des coûts requis' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000
 OR pg_column_size(p_rows)>5242880 OR p_apply IS NULL THEN RAISE EXCEPTION 'Fichier de rapprochement invalide'; END IF;
 payload_hash:=encode(sha256(convert_to(p_domain::text||p_rows::text||coalesce(p_expected,''),'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('stock-product-review:'||p_request::text,0));
 SELECT * INTO receipt FROM public.stock_product_review_batches WHERE id=p_request;
 IF FOUND THEN
  IF receipt.domain_id<>p_domain OR receipt.actor_id<>auth.uid() OR receipt.payload_hash<>payload_hash THEN RAISE EXCEPTION 'Cette confirmation concerne un autre fichier'; END IF;
  RETURN receipt.result;
 END IF;
 SELECT array_agg((value->>'id')::uuid ORDER BY value->>'id') INTO ids FROM jsonb_array_elements(p_rows);
 PERFORM 1 FROM public.domains WHERE id=p_domain FOR UPDATE;
 PERFORM id FROM public.stock_movements WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 context:=public.stock_product_review_context(p_domain,ids);
 IF context->>'version' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Le stock ou les affectations ont changé. Rechargez les sorties avant de confirmer.'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT value INTO movement FROM jsonb_array_elements(context->'movements') WHERE value->>'id'=row->>'id';
  IF movement IS NULL THEN RAISE EXCEPTION 'Sortie inaccessible'; END IF;
  price:=nullif(row->>'price','')::numeric;
  IF context->>'method'='fifo' THEN
   IF movement->>'price' IS NULL THEN RAISE EXCEPTION 'FIFO exige de valoriser les entrées avant de rapprocher les sorties'; END IF;
   IF price IS NOT NULL AND abs(price-(movement->>'price')::numeric)>0.00000001 THEN RAISE EXCEPTION 'Le prix FIFO provient des entrées et doit être conservé'; END IF;
  END IF;
  price:=coalesce((movement->>'price')::numeric,price);
  IF price IS NULL OR price<0 OR price>99999999.99 OR price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'CUMP confirmé requis pour chaque article non valorisé'; END IF;
  IF context->>'method'='cump' AND movement->>'price' IS NULL THEN
   IF product_prices ? (movement->>'item') AND (product_prices->>(movement->>'item'))::numeric<>price THEN RAISE EXCEPTION 'Un seul CUMP confirmé par article est requis'; END IF;
   product_prices:=product_prices||jsonb_build_object(movement->>'item',price);
  END IF;
  reason:=btrim(coalesce(row->>'reason',''));
  IF length(reason)<5 THEN
   IF movement->>'price' IS NULL THEN RAISE EXCEPTION 'Justificatif du CUMP requis'; END IF;
   reason:='Rapprochement selon le prix calculé des entrées';
  END IF;
  IF length(reason)>2000 OR jsonb_typeof(row->'plantings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Affectations ou justificatif invalides'; END IF;
  SELECT array_agg(value::uuid) INTO targets FROM jsonb_array_elements_text(row->'plantings');
  IF (movement->>'fixed')::boolean OR (movement->>'linked')::boolean THEN
   IF coalesce(cardinality(targets),0)>0 THEN RAISE EXCEPTION 'Les affectations existantes doivent être conservées'; END IF;
  ELSE
   PERFORM public.stock_allocation_targets(p_domain,(movement->>'farm')::uuid,targets);
  END IF;
  total:=total+round((movement->>'quantity')::numeric*price,2);
  IF p_apply THEN PERFORM public.review_inventory_consumption_multi((row->>'id')::uuid,targets,price,reason); END IF;
 END LOOP;
 result:=jsonb_build_object('status',CASE WHEN p_apply THEN 'applied' ELSE 'preview' END,'count',cardinality(ids),'amount',total);
 IF p_apply THEN INSERT INTO public.stock_product_review_batches(id,domain_id,payload_hash,result) VALUES(p_request,p_domain,payload_hash,result); END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.review_stock_products(uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_stock_products(uuid,uuid,jsonb,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
