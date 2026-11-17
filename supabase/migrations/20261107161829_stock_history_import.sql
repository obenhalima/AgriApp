-- Reprise additive et chronologique. Les mouvements existants restent une base de départ.
-- Prérequis : 115, 164 et stock_exit_multi_greenhouse.
BEGIN;
CREATE TABLE public.stock_history_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid NOT NULL REFERENCES public.domains(id),
 request_id uuid NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(domain_id,request_id), UNIQUE(domain_id,payload_hash)
);
CREATE TABLE public.stock_history_lines (
 domain_id uuid NOT NULL REFERENCES public.domains(id), external_id text NOT NULL,
 batch_id uuid NOT NULL REFERENCES public.stock_history_batches(id),
 movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id),
 supplier_id uuid REFERENCES public.suppliers(id), payload jsonb NOT NULL,
 PRIMARY KEY(domain_id,external_id)
);
CREATE INDEX stock_history_lines_batch ON public.stock_history_lines(batch_id);
CREATE INDEX stock_history_lines_supplier ON public.stock_history_lines(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_history_pair_date ON public.stock_movements(stock_item_id,warehouse_id,movement_date);
ALTER TABLE public.stock_history_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_history_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_history_batches,public.stock_history_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.stock_history_batches,public.stock_history_lines TO authenticated;
CREATE POLICY stock_history_batches_read ON public.stock_history_batches FOR SELECT TO authenticated
 USING(public.is_domain_admin(domain_id,auth.uid()));
CREATE POLICY stock_history_lines_read ON public.stock_history_lines FOR SELECT TO authenticated
 USING(public.is_domain_admin(domain_id,auth.uid()));

CREATE FUNCTION public.get_stock_history_catalog(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
 THEN RAISE EXCEPTION 'Reprise historique réservée aux administrateurs du client' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'unit',unit,'category',category) ORDER BY code) FROM public.stock_items WHERE domain_id=p_domain AND is_active),'[]'),
 'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'code',w.code,'name',w.name,'farm_id',f.id,'farm_code',f.code,'farm_name',f.name) ORDER BY w.code) FROM public.warehouses w JOIN public.farms f ON f.id=w.farm_id AND f.domain_id=p_domain AND f.is_active WHERE w.domain_id=p_domain AND w.is_active),'[]'),
 'suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'name',name) ORDER BY code) FROM public.suppliers WHERE domain_id=p_domain AND is_active),'[]'),
 'plantings',coalesce((SELECT jsonb_agg(jsonb_build_object('ref','P-'||substr(md5(cp.id::text),1,12),'id',cp.id,'campaign',c.code,'campaign_name',c.name,'farm',f.code,'greenhouse',g.code,'variety',v.commercial_name,'area',cp.planted_area) ORDER BY f.code,c.code,g.code,cp.id)
 FROM public.campaign_plantings cp JOIN public.campaigns c ON c.id=cp.campaign_id AND c.domain_id=p_domain
 JOIN public.greenhouses g ON g.id=cp.greenhouse_id JOIN public.farms f ON f.id=g.farm_id AND f.domain_id=p_domain AND f.is_active
 JOIN public.varieties v ON v.id=cp.variety_id WHERE cp.domain_id=p_domain AND cp.planted_area>0),'[]'),
 'balances',coalesce((SELECT jsonb_agg(jsonb_build_object('item',s.code,'warehouse',w.code,'quantity',b.current_qty,'value',b.inventory_value,'verified',b.valuation_verified,
 'last_date',greatest((SELECT max(movement_date) FROM public.stock_movements m WHERE m.stock_item_id=b.stock_item_id AND m.warehouse_id=b.warehouse_id),
 (SELECT max((created_at AT TIME ZONE 'Africa/Casablanca')::date) FROM public.inventory_value_events e WHERE e.stock_item_id=b.stock_item_id AND e.warehouse_id=b.warehouse_id AND e.event_kind='valuation_correction'))))
 FROM public.warehouse_stocks b JOIN public.stock_items s ON s.id=b.stock_item_id JOIN public.warehouses w ON w.id=b.warehouse_id WHERE b.domain_id=p_domain),'[]'),
 'movement_count',(SELECT count(*) FROM public.stock_movements WHERE domain_id=p_domain));
END $fn$;
REVOKE ALL ON FUNCTION public.get_stock_history_catalog(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_stock_history_catalog(uuid) TO authenticated;

CREATE FUNCTION public.import_stock_history(p_domain uuid,p_request uuid,p_rows jsonb,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='60s' AS $fn$
DECLARE r jsonb; canonical jsonb:='[]'; prepared jsonb:='[]'; states jsonb:='{}'; state jsonb; previous jsonb;
 item public.stock_items%ROWTYPE; warehouse public.warehouses%ROWTYPE; supplier uuid; planting_ids uuid[]; targets jsonb;
 n int:=0; incoming int:=0; outgoing int:=0; skipped int:=0; unvalued int:=0; cost_count int:=0;
 qty numeric; price numeric; q numeric; val numeric; amount numeric; verified boolean; day date; sequence int;
 ref text; pair text; fingerprint text; batch uuid:=gen_random_uuid(); movement uuid; result jsonb; after_result jsonb:='[]'; total numeric:=0;
 seen text[]:='{}'; positions text[]:='{}'; latest date; new_costs int; old_setting text;
BEGIN
 PERFORM public.get_stock_history_catalog(p_domain);
 IF NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','edit'),false)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false)
 THEN RAISE EXCEPTION 'Droits de modification des stocks et coûts requis' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_apply IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Fichier et référence de validation requis'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 OR pg_column_size(p_rows)>5242880 THEN RAISE EXCEPTION 'Entre 1 et 1 000 mouvements, maximum 5 Mo'; END IF;
 -- Normalize before hashing, independent of Excel row order and whitespace.
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  n:=n+1;
  IF jsonb_typeof(r)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE e.key NOT IN ('external_id','date','order','type','item','unit','warehouse','quantity','price','reference','supplier','farm','campaign','plantings','notes') OR jsonb_typeof(e.value)<>'string')
  THEN RAISE EXCEPTION 'Ligne % : colonnes ou valeurs invalides',n+1; END IF;
  r:=(SELECT jsonb_object_agg(key,btrim(value #>> '{}')) FROM jsonb_each(r));
  IF length(coalesce(r->>'external_id','')) NOT BETWEEN 1 AND 100 OR length(coalesce(r->>'reference',''))>100 OR length(coalesce(r->>'notes',''))>2000 THEN RAISE EXCEPTION 'Ligne % : identifiant, référence ou note invalide',n+1; END IF;
  IF (r->>'external_id')=ANY(seen) THEN RAISE EXCEPTION 'Identifiant de mouvement répété : %',r->>'external_id'; END IF;
  seen:=array_append(seen,r->>'external_id');
  IF coalesce(r->>'date','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Ligne % : date AAAA-MM-JJ requise',n+1; END IF;
  day:=(r->>'date')::date;
  IF day>(now() AT TIME ZONE 'Africa/Casablanca')::date THEN RAISE EXCEPTION 'Ligne % : date future interdite',n+1; END IF;
  IF coalesce(r->>'order','')!~'^[0-9]{1,7}$' THEN RAISE EXCEPTION 'Ligne % : ordre entier positif requis',n+1; END IF;
  sequence:=(r->>'order')::int;
  IF sequence NOT BETWEEN 1 AND 1000000 OR (day::text||'/'||sequence)=ANY(positions) THEN RAISE EXCEPTION 'Ligne % : ordre unique par date requis',n+1; END IF;
  positions:=array_append(positions,day::text||'/'||sequence);
  IF coalesce(r->>'quantity','')!~'^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Ligne % : quantité positive à deux décimales requise',n+1; END IF;
  qty:=(r->>'quantity')::numeric;
  IF qty<=0 OR qty>99999999.99 THEN RAISE EXCEPTION 'Ligne % : quantité hors limites',n+1; END IF;
  IF coalesce(r->>'price','')<>'' AND (r->>'price')!~'^[0-9]+(\.[0-9]{1,8})?$' THEN RAISE EXCEPTION 'Ligne % : prix positif ou nul à huit décimales requis',n+1; END IF;
  price:=nullif(r->>'price','')::numeric;
  IF price>99999999.99 THEN RAISE EXCEPTION 'Ligne % : prix hors limites',n+1; END IF;
  IF coalesce(r->>'type','') NOT IN ('entree','sortie') THEN RAISE EXCEPTION 'Ligne % : type entree ou sortie requis',n+1; END IF;
  r:=r||jsonb_build_object('order',sequence::text,'quantity',trim_scale(qty)::text,'price',coalesce(trim_scale(price)::text,''),'item',upper(r->>'item'),'warehouse',upper(r->>'warehouse'),'supplier',upper(coalesce(r->>'supplier','')),'farm',upper(r->>'farm'),'campaign',upper(coalesce(r->>'campaign','')),
   'plantings',coalesce((SELECT string_agg(btrim(v),';' ORDER BY btrim(v)) FROM unnest(string_to_array(coalesce(r->>'plantings',''),';')) v WHERE btrim(v)<>''),''));
  canonical:=canonical||jsonb_build_array(r);
 END LOOP;
 SELECT jsonb_agg(value ORDER BY value->>'date',(value->>'order')::int) INTO canonical FROM jsonb_array_elements(canonical);
 fingerprint:=encode(sha256(convert_to(canonical::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('stock-history:'||p_domain::text,0));
 SELECT b.result,b.payload_hash INTO result,ref FROM public.stock_history_batches b WHERE b.domain_id=p_domain AND b.request_id=p_request;
 IF FOUND THEN IF ref<>fingerprint THEN RAISE EXCEPTION 'Cette validation correspond à un autre fichier'; END IF; RETURN result; END IF;
 SELECT b.result INTO result FROM public.stock_history_batches b WHERE b.domain_id=p_domain AND b.payload_hash=fingerprint;
 IF FOUND THEN RETURN result; END IF;
 -- Same lock order as ordinary stock posting, before reading balances or CUMP.
 PERFORM s.id FROM public.stock_items s WHERE s.domain_id=p_domain AND upper(s.code) IN (SELECT value->>'item' FROM jsonb_array_elements(canonical)) ORDER BY s.id FOR UPDATE;
 FOR r IN SELECT value FROM jsonb_array_elements(canonical) LOOP
  ref:=r->>'external_id'; day:=(r->>'date')::date; qty:=(r->>'quantity')::numeric; price:=nullif(r->>'price','')::numeric;
  SELECT l.payload INTO previous FROM public.stock_history_lines l WHERE l.domain_id=p_domain AND l.external_id=ref;
  IF FOUND THEN
   IF previous<>r THEN RAISE EXCEPTION 'Identifiant déjà importé avec un contenu différent : %',ref; END IF;
   skipped:=skipped+1; CONTINUE;
  END IF;
  SELECT * INTO item FROM public.stock_items WHERE domain_id=p_domain AND upper(code)=r->>'item' AND is_active;
  IF NOT FOUND OR item.unit IS DISTINCT FROM r->>'unit' THEN RAISE EXCEPTION 'Mouvement % : article actif ou unité incompatible',ref; END IF;
  SELECT w.* INTO warehouse FROM public.warehouses w JOIN public.farms f ON f.id=w.farm_id AND f.domain_id=p_domain AND upper(f.code)=r->>'farm' AND f.is_active WHERE w.domain_id=p_domain AND upper(w.code)=r->>'warehouse' AND w.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mouvement % : entrepôt et ferme incompatibles',ref; END IF;
  supplier:=NULL; targets:=NULL;
  IF r->>'type'='entree' THEN
   IF coalesce(r->>'campaign','')<>'' OR coalesce(r->>'plantings','')<>'' THEN RAISE EXCEPTION 'Mouvement % : une entrée ne porte pas d’affectation de consommation',ref; END IF;
   IF r->>'supplier'<>'' THEN
    SELECT id INTO supplier FROM public.suppliers WHERE domain_id=p_domain AND upper(code)=r->>'supplier' AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mouvement % : fournisseur actif du client requis',ref; END IF;
   END IF;
  ELSE
   IF price IS NOT NULL OR r->>'supplier'<>'' THEN RAISE EXCEPTION 'Mouvement % : prix et fournisseur à renseigner sur les entrées uniquement',ref; END IF;
   SELECT array_agg(cp.id ORDER BY cp.id) INTO planting_ids FROM public.campaign_plantings cp JOIN public.campaigns c ON c.id=cp.campaign_id AND c.domain_id=p_domain AND upper(c.code)=r->>'campaign'
    WHERE cp.domain_id=p_domain AND ('P-'||substr(md5(cp.id::text),1,12))=ANY(string_to_array(r->>'plantings',';'));
   IF coalesce(cardinality(planting_ids),0)<>(SELECT count(*) FROM unnest(string_to_array(r->>'plantings',';')) v WHERE v<>'') THEN RAISE EXCEPTION 'Mouvement % : références de plantations invalides ou répétées',ref; END IF;
   targets:=public.stock_allocation_targets(p_domain,warehouse.farm_id,planting_ids);
  END IF;
  pair:=warehouse.id::text||'/'||item.id::text;
  IF NOT states ? pair THEN
   SELECT b.current_qty,b.inventory_value,b.valuation_verified INTO q,val,verified FROM public.warehouse_stocks b WHERE b.warehouse_id=warehouse.id AND b.stock_item_id=item.id FOR UPDATE;
   IF NOT FOUND THEN q:=0; val:=0; verified:=true; END IF;
   IF q IS NULL OR q<0 OR q::text IN ('NaN','Infinity','-Infinity') OR val<0 OR val::text IN ('NaN','Infinity','-Infinity') OR (q=0 AND val IS DISTINCT FROM 0::numeric)
   THEN RAISE EXCEPTION 'Mouvement % : solde ou valeur existante incohérents, rapprochement préalable requis',ref; END IF;
   SELECT greatest((SELECT max(movement_date) FROM public.stock_movements WHERE stock_item_id=item.id AND warehouse_id=warehouse.id),
    (SELECT max((created_at AT TIME ZONE 'Africa/Casablanca')::date) FROM public.inventory_value_events WHERE stock_item_id=item.id AND warehouse_id=warehouse.id AND event_kind='valuation_correction')) INTO latest;
   IF q<>0 AND latest IS NULL THEN RAISE EXCEPTION 'Mouvement % : solde existant sans historique daté, rapprochement préalable requis pour % / %',ref,item.code,warehouse.code; END IF;
   states:=jsonb_set(states,ARRAY[pair],jsonb_build_object('item',item.code,'warehouse',warehouse.code,'quantity',q,'value',val,'verified',verified,'last_date',latest));
  END IF;
  state:=states->pair; q:=(state->>'quantity')::numeric; val:=(state->>'value')::numeric; verified:=(state->>'verified')::boolean;
  IF day<=nullif(state->>'last_date','')::date THEN RAISE EXCEPTION 'Mouvement % : historique déjà présent jusqu’au % pour % / %. Réconcilier la reprise existante avant d’importer cette période.',ref,state->>'last_date',item.code,warehouse.code; END IF;
  IF r->>'type'='entree' THEN
   amount:=round(qty*price,6); val:=val+amount; verified:=verified AND price IS NOT NULL; q:=q+qty; incoming:=incoming+1;
  ELSE
   IF qty>q THEN RAISE EXCEPTION 'Mouvement % : stock insuffisant à la date %, disponible %, demandé %',ref,day,q,qty; END IF;
   amount:=CASE WHEN qty=q THEN val ELSE round(qty*val/nullif(q,0),6) END;
   price:=val/nullif(q,0); val:=val-amount; q:=q-qty; outgoing:=outgoing+1;
   IF abs(round(amount,2))>=10000000000 THEN RAISE EXCEPTION 'Mouvement % : coût de sortie hors limites',ref; END IF;
   IF amount IS NULL THEN unvalued:=unvalued+1; ELSE total:=total+round(amount,2); END IF;
  END IF;
  IF q>=10000000000 OR abs(amount)>=100000000000000 OR abs(val)>=100000000000000 THEN RAISE EXCEPTION 'Mouvement % : montant ou solde hors limites',ref; END IF;
  IF q=0 THEN val:=0; verified:=true; END IF;
  states:=jsonb_set(states,ARRAY[pair],state||jsonb_build_object('quantity',q,'value',val,'verified',verified));
  prepared:=prepared||jsonb_build_array(jsonb_build_object('row',r,'item_id',item.id,'warehouse_id',warehouse.id,'farm_id',warehouse.farm_id,'supplier_id',supplier,'targets',targets,'unit_cost',price,'total_cost',amount));
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'warehouse',value->>'item'),'[]') INTO after_result FROM jsonb_each(states);
 result:=jsonb_build_object('status',CASE WHEN p_apply THEN 'applied' ELSE 'preview' END,'entries',incoming,'exits',outgoing,'skipped',skipped,'unvalued',unvalued,'cost_total',total,'balances',after_result,'operation_id',CASE WHEN p_apply THEN batch END);
 IF NOT p_apply THEN RETURN result; END IF;
 INSERT INTO public.stock_history_batches(id,domain_id,request_id,payload_hash,result) VALUES(batch,p_domain,p_request,fingerprint,result);
 old_setting:=current_setting('app.approved_stock_exit',true);
 PERFORM set_config('app.approved_stock_exit','true',true);
 FOR state IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  r:=state->'row';
  INSERT INTO public.stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,unit_cost,movement_date,reference,notes,created_by)
  VALUES(p_domain,(state->>'item_id')::uuid,(state->>'warehouse_id')::uuid,(r->>'type')::public.movement_type,(r->>'quantity')::numeric,
   CASE WHEN r->>'type'='entree' THEN nullif(r->>'price','')::numeric END,(r->>'date')::date,coalesce(nullif(r->>'reference',''),r->>'external_id'),nullif(r->>'notes',''),auth.uid()) RETURNING id INTO movement;
  IF r->>'type'='sortie' THEN
   INSERT INTO public.stock_consumption_allocations(movement_id,domain_id,farm_id,targets,origin)
   VALUES(movement,p_domain,(state->>'farm_id')::uuid,state->'targets','request');
   SELECT count(*) INTO new_costs FROM public.cost_entries WHERE source_stock_movement_id=movement;
   IF state->>'total_cost' IS NOT NULL AND new_costs=0 THEN RAISE EXCEPTION 'Imputation du coût impossible pour %',r->>'external_id'; END IF;
   cost_count:=cost_count+new_costs;
  END IF;
  INSERT INTO public.stock_history_lines(domain_id,external_id,batch_id,movement_id,supplier_id,payload)
  VALUES(p_domain,r->>'external_id',batch,movement,(state->>'supplier_id')::uuid,r);
 END LOOP;
 PERFORM set_config('app.approved_stock_exit',coalesce(old_setting,'false'),true);
 result:=result||jsonb_build_object('cost_lines',cost_count);
 UPDATE public.stock_history_batches SET result=stock_history_batches.result||jsonb_build_object('cost_lines',cost_count) WHERE id=batch;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.import_stock_history(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_stock_history(uuid,uuid,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
