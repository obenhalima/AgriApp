BEGIN;

-- A dated cutover keeps posted movements and campaign costs at their recorded value.
ALTER TABLE public.inventory_cost_settings ADD COLUMN effective_at timestamptz;

CREATE OR REPLACE FUNCTION public.apply_inventory_method_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE entry jsonb;
BEGIN
 IF NEW.plan->>'mode' IS DISTINCT FROM 'cutover' THEN
  RAISE EXCEPTION 'Relancez le contrôle de bascule de méthode';
 END IF;
 INSERT INTO public.inventory_cost_settings(domain_id,method,updated_by,effective_at)
 VALUES(NEW.domain_id,NEW.method,auth.uid(),(NEW.plan->>'effective_at')::timestamptz)
 ON CONFLICT(domain_id) DO UPDATE SET method=excluded.method,updated_at=now(),
  updated_by=auth.uid(),effective_at=excluded.effective_at;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.plan->'balances') LOOP
  UPDATE public.warehouse_stocks SET
   fifo_layers=CASE WHEN NEW.method='fifo' THEN entry->'layers' ELSE NULL END,updated_at=now()
  WHERE domain_id=NEW.domain_id AND warehouse_id=(entry->>'warehouse')::uuid
   AND stock_item_id=(entry->>'item')::uuid;
 END LOOP;
 UPDATE public.inventory_method_changes SET applied_at=clock_timestamp(),
  result=result||jsonb_build_object('status','applied','operation_id',NEW.id) WHERE id=NEW.id;
 RETURN NEW;
END $fn$;

CREATE FUNCTION public.change_inventory_cost_method_cutover(p_domain uuid,p_method text,p_request uuid,
 p_expected text DEFAULT NULL,p_confirmation text DEFAULT NULL,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
 SET lock_timeout='5s' SET statement_timeout='60s' AS $fn$
DECLARE code text; snapshot jsonb; fingerprint text; result jsonb; receipt public.inventory_method_changes%ROWTYPE;
 blockers jsonb:='[]'; balances jsonb:='[]'; b record; m record; bad record;
 effective timestamptz:=statement_timestamp(); day date:=(statement_timestamp() AT TIME ZONE 'Africa/Casablanca')::date;
 stock_value numeric; cost_value numeric; unpriced integer; lots integer:=0; current_method text;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Paramétrage réservé aux administrateurs du client' USING ERRCODE='42501'; END IF;
 IF p_method IS NULL OR p_method NOT IN('cump','fifo') OR p_request IS NULL OR p_apply IS NULL THEN
  RAISE EXCEPTION 'Client, méthode et référence requis'; END IF;
 SELECT d.code INTO code FROM public.domains d WHERE d.id=p_domain AND d.is_active;
 IF code IS NULL THEN RAISE EXCEPTION 'Client actif requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-method:'||p_request::text,0));
 SELECT * INTO receipt FROM public.inventory_method_changes WHERE id=p_request;
 IF FOUND THEN
  IF receipt.domain_id<>p_domain OR receipt.method<>p_method OR receipt.plan->>'mode' IS DISTINCT FROM 'cutover'
   OR receipt.fingerprint IS DISTINCT FROM p_expected OR p_confirmation IS DISTINCT FROM code THEN
   RAISE EXCEPTION 'Confirmation incompatible avec cette bascule'; END IF;
  RETURN receipt.result;
 END IF;
 IF p_apply THEN
  -- Match the existing lock order. Recheck the entire preview under the write lock.
  LOCK TABLE public.stock_items,public.stock_movements,public.warehouse_stocks,public.cost_entries,
   public.inventory_consumption_reviews,public.stock_consumption_allocations,public.historical_cost_confirmations,
   public.stock_history_lines,public.inventory_value_events,public.inventory_cost_settings,
   public.stock_transfers IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.domains WHERE id=p_domain FOR UPDATE;
 END IF;
 snapshot:=public.inventory_method_snapshot(p_domain);
 current_method:=snapshot->>'method';
 fingerprint:=encode(sha256(convert_to(snapshot::text||p_method||day::text||'cutover-v1','UTF8')),'hex');
 IF p_apply AND (p_confirmation IS DISTINCT FROM code OR p_expected IS DISTINCT FROM fingerprint) THEN
  RAISE EXCEPTION 'Le stock, les coûts ou la date ont changé. Relancez le contrôle et confirmez le code client.';
 END IF;
 IF current_method=p_method THEN
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','same_method','message','Cette méthode est déjà active pour ce client.'));
 END IF;
 FOR b IN SELECT ws.*,s.code item_code,s.name item_name,w.code warehouse,
  coalesce((SELECT sum(CASE WHEN sm.movement_type='sortie' THEN -sm.quantity ELSE sm.quantity END)
   FROM public.stock_movements sm WHERE sm.domain_id=p_domain AND sm.stock_item_id=ws.stock_item_id
   AND sm.warehouse_id=ws.warehouse_id),0) ledger_qty
  FROM public.warehouse_stocks ws JOIN public.stock_items s ON s.id=ws.stock_item_id
  JOIN public.warehouses w ON w.id=ws.warehouse_id WHERE ws.domain_id=p_domain
  ORDER BY s.code,w.code LOOP
  IF b.current_qty IS NULL OR b.current_qty<0 OR b.current_qty::text IN('NaN','Infinity','-Infinity')
   OR b.current_qty IS DISTINCT FROM b.ledger_qty
   OR (b.current_qty=0 AND coalesce(b.inventory_value,0)<>0) THEN
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code','balance_mismatch','item_code',b.item_code,
    'item_name',b.item_name,'warehouse',b.warehouse,'message','Rapprochez la quantité en stock et les mouvements de cet entrepôt.'));
  END IF;
  IF b.current_qty>0 AND (b.inventory_value IS NULL OR b.inventory_value<0
   OR b.inventory_value::text IN('NaN','Infinity','-Infinity') OR b.valuation_verified IS DISTINCT FROM true) THEN
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code','opening_unvalued','item_code',b.item_code,
    'item_name',b.item_name,'warehouse',b.warehouse,'message','Complétez et confirmez la valeur CUMP du stock restant.'));
  END IF;
  IF b.current_qty>0 THEN lots:=lots+1; END IF;
  balances:=balances||jsonb_build_array(jsonb_build_object('warehouse',b.warehouse_id,'item',b.stock_item_id,
   'quantity',b.current_qty,'value',b.inventory_value,'layers',CASE WHEN b.current_qty>0 THEN
    jsonb_build_array(jsonb_build_object('movement_id',NULL,'quantity',b.current_qty,'value',b.inventory_value,
     'opening_method',current_method,'cutover_id',p_request,'effective_date',day)) ELSE '[]'::jsonb END));
 END LOOP;
 -- Missing balance rows, invalid movements and unresolved historical exits are actionable individually.
 FOR m IN SELECT sm.*,s.code item_code,s.name item_name,w.code warehouse
  FROM public.stock_movements sm JOIN public.stock_items s ON s.id=sm.stock_item_id
  LEFT JOIN public.warehouses w ON w.id=sm.warehouse_id WHERE sm.domain_id=p_domain
  AND (sm.warehouse_id IS NULL OR sm.movement_date IS NULL OR sm.movement_date>day
   OR sm.quantity IS NULL OR sm.quantity<=0 OR sm.quantity::text IN('NaN','Infinity','-Infinity')
   OR sm.unit_cost<0 OR sm.unit_cost::text IN('NaN','Infinity','-Infinity')
   OR sm.total_cost<0 OR sm.total_cost::text IN('NaN','Infinity','-Infinity')
   OR NOT EXISTS(SELECT 1 FROM public.warehouse_stocks ws WHERE ws.stock_item_id=sm.stock_item_id AND ws.warehouse_id=sm.warehouse_id AND ws.domain_id=p_domain)
   OR (sm.movement_type='sortie' AND NOT (
    (sm.valuation_verified IS TRUE AND sm.unit_cost IS NOT NULL AND sm.total_cost IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.inventory_consumption_reviews r WHERE r.movement_id=sm.id
      AND r.domain_id=p_domain AND r.unit_cost>=0 AND r.unit_cost::text NOT IN('NaN','Infinity','-Infinity'))))
   OR (sm.movement_type='sortie' AND sm.transfer_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM public.cost_entries ce WHERE ce.domain_id=p_domain AND ce.source_stock_movement_id=sm.id))
   OR EXISTS(SELECT 1 FROM public.cost_entries ce WHERE ce.domain_id=p_domain AND ce.source_stock_movement_id=sm.id AND ce.cost_quality IS DISTINCT FROM 'verified')) LOOP
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','movement_incomplete','item_code',m.item_code,
   'item_name',m.item_name,'warehouse',m.warehouse,'reference',coalesce(m.reference,m.id::text),
   'message','Contrôlez la date, la quantité, le solde et la valorisation de ce mouvement et de ses coûts.'));
 END LOOP;
 FOR bad IN SELECT DISTINCT item_code,warehouse FROM (
  SELECT s.code item_code,w.code warehouse,
   sum(CASE WHEN sm.movement_type='sortie' THEN -sm.quantity ELSE sm.quantity END)
    OVER(PARTITION BY sm.stock_item_id,sm.warehouse_id ORDER BY sm.movement_date,sm.created_at,
     coalesce((h.payload->>'order')::int,0),sm.id ROWS UNBOUNDED PRECEDING) running_qty
  FROM public.stock_movements sm JOIN public.stock_items s ON s.id=sm.stock_item_id
  LEFT JOIN public.stock_history_lines h ON h.movement_id=sm.id
  JOIN public.warehouses w ON w.id=sm.warehouse_id WHERE sm.domain_id=p_domain
 ) chronology WHERE running_qty<0 LOOP
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','negative_history','item_code',bad.item_code,
   'warehouse',bad.warehouse,'message','Corrigez la chronologie des mouvements : un solde historique devient négatif.'));
 END LOOP;
 SELECT count(*) INTO unpriced FROM public.stock_movements WHERE domain_id=p_domain
  AND movement_type<>'sortie' AND transfer_id IS NULL AND unit_cost IS NULL;
 SELECT CASE WHEN count(*) FILTER(WHERE current_qty>0 AND inventory_value IS NULL)>0 THEN NULL
  ELSE coalesce(sum(inventory_value),0) END INTO stock_value FROM public.warehouse_stocks WHERE domain_id=p_domain;
 SELECT coalesce(sum(amount),0) INTO cost_value FROM public.cost_entries WHERE domain_id=p_domain AND source_stock_movement_id IS NOT NULL;
 result:=jsonb_build_object('status',CASE WHEN jsonb_array_length(blockers)>0 THEN 'blocked' ELSE 'preview' END,
  'mode','cutover','domain_code',code,'fingerprint',fingerprint,'method',p_method,'effective_at',effective,'effective_date',day,
  'blockers',blockers,'opening_lots',lots,'historical_unpriced_receipts',unpriced,
  'movements',jsonb_array_length(snapshot->'movements'),'exits',(SELECT count(*) FROM public.stock_movements WHERE domain_id=p_domain AND movement_type='sortie'),
  'cost_before',cost_value,'cost_after',cost_value,'stock_before',stock_value,'stock_after',stock_value,'campaigns','[]'::jsonb);
 IF NOT p_apply THEN RETURN result; END IF;
 IF jsonb_array_length(blockers)>0 THEN RAISE EXCEPTION 'Activation impossible. Corrigez les éléments signalés puis relancez le contrôle.'; END IF;
 INSERT INTO public.inventory_method_changes(id,domain_id,method,fingerprint,before_data,plan,result)
 VALUES(p_request,p_domain,p_method,fingerprint,snapshot,
  jsonb_build_object('mode','cutover','effective_at',effective,'balances',balances),result);
 SELECT r.result INTO result FROM public.inventory_method_changes r WHERE r.id=p_request;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.change_inventory_cost_method_cutover(uuid,text,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_inventory_cost_method_cutover(uuid,text,uuid,text,text,boolean) TO authenticated;

-- Older clients also use the safe cutover. Full historical replay is retired.
CREATE OR REPLACE FUNCTION public.change_inventory_cost_method(p_domain uuid,p_method text,p_request uuid,
 p_expected text DEFAULT NULL,p_confirmation text DEFAULT NULL,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
 SELECT public.change_inventory_cost_method_cutover(p_domain,p_method,p_request,p_expected,p_confirmation,p_apply);
$fn$;

-- The normal posting trigger remains the single source of CUMP/FIFO calculation.
-- Reject backdating across a cutover for both methods, including bulk imports.
DO $install$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.post_warehouse_movement()'::regprocedure) INTO definition;
 IF position('inventory_cost_settings s WHERE s.domain_id=d)' IN definition)=0 THEN
  RAISE EXCEPTION 'Fonction de valorisation incompatible avec la bascule FIFO'; END IF;
 definition:=replace(definition,
  'SELECT coalesce((SELECT s.method FROM public.inventory_cost_settings s WHERE s.domain_id=d),''cump'') INTO method;',
  $guard$SELECT coalesce((SELECT s.method FROM public.inventory_cost_settings s WHERE s.domain_id=d),'cump') INTO method;
 IF NEW.movement_date IS NULL OR NEW.movement_date < (SELECT (s.effective_at AT TIME ZONE 'Africa/Casablanca')::date FROM public.inventory_cost_settings s WHERE s.domain_id=d) THEN
  RAISE EXCEPTION 'Date antérieure à la bascule de valorisation. Utilisez une date à partir de son activation.';
 END IF;$guard$);
 EXECUTE definition;
 SELECT pg_get_functiondef('public.import_stock_history(uuid,uuid,jsonb,boolean)'::regprocedure) INTO definition;
 IF position('SELECT * INTO item FROM public.stock_items' IN definition)=0 THEN
  RAISE EXCEPTION 'Fonction de reprise incompatible avec la bascule FIFO'; END IF;
 definition:=replace(definition,'SELECT * INTO item FROM public.stock_items',
  $guard$IF day < (SELECT (s.effective_at AT TIME ZONE 'Africa/Casablanca')::date
   FROM public.inventory_cost_settings s WHERE s.domain_id=p_domain) THEN
   RAISE EXCEPTION 'Mouvement % : date antérieure à la bascule de valorisation',ref;
  END IF;
  SELECT * INTO item FROM public.stock_items$guard$);
 EXECUTE definition;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
