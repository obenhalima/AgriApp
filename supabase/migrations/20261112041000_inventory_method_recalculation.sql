BEGIN;

CREATE TABLE public.inventory_method_changes (
 id uuid PRIMARY KEY,
 domain_id uuid NOT NULL REFERENCES public.domains(id),
 method text NOT NULL CHECK(method IN ('cump','fifo')),
 actor_id uuid NOT NULL DEFAULT auth.uid(),
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 fingerprint text NOT NULL,
 before_data jsonb NOT NULL,
 plan jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 applied_at timestamptz
);
ALTER TABLE public.inventory_method_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_method_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.inventory_method_changes TO authenticated;
CREATE POLICY inventory_method_changes_read ON public.inventory_method_changes FOR SELECT TO authenticated
 USING(public.is_domain_admin(domain_id,auth.uid()));

CREATE FUNCTION public.inventory_method_snapshot(p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object(
 'items',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.stock_items s WHERE s.domain_id=p_domain),'[]'),
 'method',coalesce((SELECT method FROM public.inventory_cost_settings WHERE domain_id=p_domain),'cump'),
 'movements',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.stock_movements m WHERE m.domain_id=p_domain),'[]'),
 'balances',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.warehouse_id,b.stock_item_id) FROM public.warehouse_stocks b WHERE b.domain_id=p_domain),'[]'),
 'costs',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.cost_entries c WHERE c.domain_id=p_domain AND c.source_stock_movement_id IS NOT NULL),'[]'),
 'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.movement_id) FROM public.stock_consumption_allocations a WHERE a.domain_id=p_domain),'[]'),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.external_id) FROM public.stock_history_lines h WHERE h.domain_id=p_domain),'[]'),
 'reviews',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.movement_id) FROM public.inventory_consumption_reviews r WHERE r.domain_id=p_domain),'[]'),
 'transfers',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.stock_transfers t WHERE t.domain_id=p_domain),'[]'),
 'confirmations',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.historical_cost_confirmations h WHERE h.domain_id=p_domain),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.inventory_value_events e
  WHERE e.warehouse_id IN (SELECT id FROM public.warehouses WHERE domain_id=p_domain)),'[]'));
$fn$;
REVOKE ALL ON FUNCTION public.inventory_method_snapshot(uuid) FROM PUBLIC,anon,authenticated;

-- Authorization is tied to a private, pending audit receipt in this transaction.
CREATE FUNCTION public.inventory_method_update_allowed(p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT pg_trigger_depth()>=2 AND EXISTS(SELECT 1 FROM public.inventory_method_changes
 WHERE id::text=current_setting('app.inventory_method_change',true) AND domain_id=p_domain
 AND actor_id=auth.uid() AND transaction_id=txid_current() AND applied_at IS NULL);
$fn$;
REVOKE ALL ON FUNCTION public.inventory_method_update_allowed(uuid) FROM PUBLIC,anon,authenticated;

-- Extend the installed guards, retaining every existing protection and exception.
DO $install$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.immutable_stock_movement()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M', $guard$BEGIN
 IF TG_OP='UPDATE' AND public.inventory_method_update_allowed(OLD.domain_id)
 AND (to_jsonb(NEW)-ARRAY['unit_cost','total_cost','valuation_verified','costing_method','fifo_sources'])
  =(to_jsonb(OLD)-ARRAY['unit_cost','total_cost','valuation_verified','costing_method','fifo_sources']) THEN RETURN NEW; END IF;
 $guard$,'i');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.guard_generated_consumption_cost()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M', $guard$BEGIN
 IF TG_OP='UPDATE' AND OLD.source_stock_movement_id IS NOT NULL
 AND public.inventory_method_update_allowed(OLD.domain_id)
 AND (to_jsonb(NEW)-ARRAY['amount','cost_quality','updated_at'])=(to_jsonb(OLD)-ARRAY['amount','cost_quality','updated_at']) THEN RETURN NEW; END IF;
 $guard$,'i');
 EXECUTE definition;
END $install$;

CREATE FUNCTION public.apply_inventory_method_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE entry jsonb; before_setting text:=current_setting('app.inventory_method_change',true);
BEGIN
 PERFORM set_config('app.inventory_method_change',NEW.id::text,true);
 INSERT INTO public.inventory_cost_settings(domain_id,method,updated_by) VALUES(NEW.domain_id,NEW.method,auth.uid())
 ON CONFLICT(domain_id) DO UPDATE SET method=excluded.method,updated_at=now(),updated_by=auth.uid();
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.plan->'movements') LOOP
  UPDATE public.stock_movements SET unit_cost=nullif(entry->>'unit_cost','')::numeric,
   total_cost=nullif(entry->>'total_cost','')::numeric,valuation_verified=(entry->>'verified')::boolean,
   costing_method=NEW.method,fifo_sources=entry->'sources' WHERE id=(entry->>'id')::uuid AND domain_id=NEW.domain_id;
 END LOOP;
 UPDATE public.stock_transfers t SET unit_cost=m.unit_cost FROM public.stock_movements m
  WHERE m.transfer_id=t.id AND m.movement_type='sortie' AND m.domain_id=NEW.domain_id AND t.domain_id=NEW.domain_id;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.plan->'costs') LOOP
  UPDATE public.cost_entries SET amount=(entry->>'amount')::numeric,cost_quality='verified'
   WHERE id=(entry->>'id')::uuid AND domain_id=NEW.domain_id;
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.plan->'balances') LOOP
  UPDATE public.warehouse_stocks SET inventory_value=(entry->>'value')::numeric,valuation_verified=true,
   fifo_layers=CASE WHEN NEW.method='fifo' THEN entry->'layers' ELSE NULL END,updated_at=now()
   WHERE warehouse_id=(entry->>'warehouse')::uuid AND stock_item_id=(entry->>'item')::uuid AND domain_id=NEW.domain_id;
  INSERT INTO public.inventory_value_events(domain_id,warehouse_id,stock_item_id,event_kind,quantity_after,value_after,verified,reason)
   VALUES(NEW.domain_id,(entry->>'warehouse')::uuid,(entry->>'item')::uuid,'method_recalculation',
    (entry->>'quantity')::numeric,(entry->>'value')::numeric,true,'Recalcul historique '||upper(NEW.method)||' · '||NEW.id::text);
 END LOOP;
 UPDATE public.stock_items SET current_qty=current_qty WHERE domain_id=NEW.domain_id;
 UPDATE public.inventory_method_changes SET applied_at=clock_timestamp(),result=result||jsonb_build_object('status','applied','operation_id',NEW.id) WHERE id=NEW.id;
 PERFORM set_config('app.inventory_method_change',coalesce(before_setting,''),true);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.apply_inventory_method_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apply_inventory_method_change AFTER INSERT ON public.inventory_method_changes
 FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_method_change();

CREATE FUNCTION public.change_inventory_cost_method(p_domain uuid,p_method text,p_request uuid,
 p_expected text DEFAULT NULL,p_confirmation text DEFAULT NULL,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='60s' AS $fn$
DECLARE code text; snapshot jsonb; fingerprint text; result jsonb; receipt public.inventory_method_changes%ROWTYPE;
 m record; c record; balance record; pair text; states jsonb:='{}'; state jsonb; layers jsonb; consumed jsonb;
 q numeric; val numeric; price numeric; amount numeric; count_out int:=0; old_cost numeric:=0; new_cost numeric:=0;
 movements jsonb:='[]'; costs jsonb:='[]'; balances jsonb:='[]'; prepared jsonb; weight numeric; weight_sum numeric;
 allocated numeric; part numeric; n integer; i integer; weights jsonb; campaign_totals jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Paramétrage réservé aux administrateurs du client' USING ERRCODE='42501'; END IF;
 IF p_method IS NULL OR p_method NOT IN('cump','fifo') OR p_request IS NULL OR p_apply IS NULL THEN RAISE EXCEPTION 'Client, méthode et référence requis'; END IF;
 SELECT d.code INTO code FROM public.domains d WHERE d.id=p_domain AND d.is_active;
 IF code IS NULL THEN RAISE EXCEPTION 'Client actif requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-method:'||p_request::text,0));
 SELECT * INTO receipt FROM public.inventory_method_changes WHERE id=p_request;
 IF FOUND THEN
  IF receipt.domain_id<>p_domain OR receipt.method<>p_method OR receipt.fingerprint IS DISTINCT FROM p_expected OR p_confirmation IS DISTINCT FROM code
  THEN RAISE EXCEPTION 'Confirmation incompatible avec ce recalcul'; END IF;
  RETURN receipt.result;
 END IF;
 IF p_apply THEN
  LOCK TABLE public.stock_items,public.stock_movements,public.warehouse_stocks,public.cost_entries,
   public.inventory_consumption_reviews,public.stock_consumption_allocations,public.historical_cost_confirmations,
   public.stock_history_lines,public.inventory_value_events,public.inventory_cost_settings IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.domains WHERE id=p_domain FOR UPDATE;
 END IF;
 snapshot:=public.inventory_method_snapshot(p_domain);
 fingerprint:=encode(sha256(convert_to(snapshot::text||p_method,'UTF8')),'hex');
 IF p_apply AND (p_confirmation IS DISTINCT FROM code OR p_expected IS DISTINCT FROM fingerprint)
 THEN RAISE EXCEPTION 'Le stock ou les coûts ont changé. Relancez l’aperçu et confirmez le code client.'; END IF;
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE domain_id=p_domain AND
  (warehouse_id IS NULL OR quantity IS NULL OR quantity<=0 OR quantity::text IN('NaN','Infinity','-Infinity')))
 THEN RAISE EXCEPTION 'Complétez les entrepôts et quantités des mouvements historiques avant le recalcul'; END IF;
 -- Each receipt needs an evidenced price for a full historical replay.
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE domain_id=p_domain AND movement_type<>'sortie'
  AND transfer_id IS NULL AND unit_cost IS NULL) THEN RAISE EXCEPTION 'Complétez les prix des entrées historiques avant le recalcul de la campagne'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_value_events WHERE warehouse_id IN(SELECT id FROM public.warehouses WHERE domain_id=p_domain)
  AND event_kind='valuation_correction') THEN RAISE EXCEPTION 'Une correction de valeur existe. Rapprochez les prix des entrées avant le recalcul.'; END IF;
 FOR m IN SELECT sm.*,h.payload FROM public.stock_movements sm LEFT JOIN public.stock_history_lines h ON h.movement_id=sm.id
  WHERE sm.domain_id=p_domain ORDER BY sm.movement_date,sm.created_at,coalesce((h.payload->>'order')::int,0),
   CASE WHEN sm.transfer_id IS NOT NULL AND sm.movement_type='sortie' THEN 0 ELSE 1 END,sm.id LOOP
  pair:=m.warehouse_id::text||'/'||m.stock_item_id::text;
  state:=coalesce(states->pair,jsonb_build_object('warehouse',m.warehouse_id,'item',m.stock_item_id,'quantity',0,'value',0,'layers','[]'::jsonb));
  q:=(state->>'quantity')::numeric; val:=(state->>'value')::numeric; layers:=state->'layers'; price:=m.unit_cost;
  IF m.movement_type='sortie' THEN
   IF m.quantity>q THEN RAISE EXCEPTION 'Historique incomplet ou stock négatif au % pour le mouvement %',m.movement_date,coalesce(m.reference,m.id::text); END IF;
   IF p_method='fifo' THEN consumed:=public.consume_inventory_fifo(layers,m.quantity); amount:=(consumed->>'total')::numeric; layers:=consumed->'layers';
   ELSE amount:=CASE WHEN m.quantity=q THEN val ELSE round(m.quantity*val/q,6) END; consumed:=NULL; END IF;
   price:=amount/m.quantity; q:=q-m.quantity; val:=val-amount; count_out:=count_out+1;
  ELSE
   IF m.transfer_id IS NOT NULL THEN
    SELECT value INTO prepared FROM jsonb_array_elements(movements) WHERE value->>'transfer_id'=m.transfer_id::text AND value->>'type'='sortie';
    IF prepared IS NULL THEN RAISE EXCEPTION 'Expédition du transfert requise avant sa réception'; END IF;
    amount:=(prepared->>'total_cost')::numeric; price:=amount/m.quantity;
   ELSE amount:=round(m.quantity*price,6); END IF;
   IF p_method='fifo' THEN layers:=layers||jsonb_build_array(jsonb_build_object('movement_id',m.id,'quantity',m.quantity,'value',amount)); END IF;
   q:=q+m.quantity; val:=val+amount; consumed:=NULL;
  END IF;
  states:=jsonb_set(states,ARRAY[pair],state||jsonb_build_object('quantity',q,'value',val,'layers',layers));
  movements:=movements||jsonb_build_array(jsonb_build_object('id',m.id,'type',m.movement_type,'transfer_id',m.transfer_id,'unit_cost',price,'total_cost',amount,'verified',true,'sources',consumed->'sources'));
  IF m.movement_type='sortie' AND m.transfer_id IS NULL THEN
   SELECT count(*),sum(ce.amount) INTO n,weight_sum FROM public.cost_entries ce WHERE ce.source_stock_movement_id=m.id;
   IF n>0 THEN
    weights:='{}';
    FOR c IN SELECT * FROM public.cost_entries WHERE source_stock_movement_id=m.id ORDER BY id LOOP
     IF c.domain_id<>p_domain OR c.is_planned THEN RAISE EXCEPTION 'Affectation de coût incohérente'; END IF;
     SELECT (h.input->'weights'->>c.id::text)::numeric INTO weight FROM public.historical_cost_confirmations h
      WHERE h.movement_id=m.id AND h.domain_id=p_domain AND h.applied_at IS NOT NULL ORDER BY h.created_at DESC,h.id DESC LIMIT 1;
     IF weight IS NULL THEN
      SELECT sum((t->>'area')::numeric) INTO weight FROM public.stock_consumption_allocations a,
       jsonb_array_elements(a.targets) t WHERE a.movement_id=m.id AND t->>'campaign_id'=c.campaign_id::text
       AND t->>'greenhouse_id'=c.greenhouse_id::text AND (t->>'variety_id') IS NOT DISTINCT FROM c.variety_id::text;
     END IF;
     weight:=coalesce(weight,CASE WHEN n=1 THEN 1 ELSE nullif(c.amount,0) END);
     IF weight IS NULL OR weight<=0 THEN RAISE EXCEPTION 'Surfaces d’affectation historiques requises pour %',coalesce(m.reference,m.id::text); END IF;
     weights:=weights||jsonb_build_object(c.id::text,weight);
    END LOOP;
    SELECT sum(value::numeric) INTO weight_sum FROM jsonb_each_text(weights);
    allocated:=0; i:=0;
    FOR c IN SELECT * FROM public.cost_entries WHERE source_stock_movement_id=m.id ORDER BY id LOOP
     i:=i+1; part:=CASE WHEN i=n THEN round(amount,2)-allocated ELSE least(round(amount,2)-allocated,round(amount*(weights->>c.id::text)::numeric/weight_sum,2)) END;
     allocated:=allocated+part;
     costs:=costs||jsonb_build_array(jsonb_build_object('id',c.id,'campaign',c.campaign_id,'old',c.amount,'amount',part));
     old_cost:=old_cost+c.amount; new_cost:=new_cost+part;
    END LOOP;
   END IF;
  END IF;
 END LOOP;
 FOR balance IN SELECT * FROM public.warehouse_stocks WHERE domain_id=p_domain LOOP
  pair:=balance.warehouse_id::text||'/'||balance.stock_item_id::text;
  state:=coalesce(states->pair,jsonb_build_object('warehouse',balance.warehouse_id,'item',balance.stock_item_id,'quantity',0,'value',0,'layers','[]'::jsonb));
  IF (state->>'quantity')::numeric IS DISTINCT FROM balance.current_qty THEN RAISE EXCEPTION 'Historique incomplet pour un article de cet entrepôt. Complétez la reprise avant le recalcul.'; END IF;
  balances:=balances||jsonb_build_array(state);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('campaign_id',campaign,'name',(SELECT name FROM public.campaigns WHERE id=campaign),'before',old,'after',new)),'[]')
 INTO campaign_totals FROM (SELECT (x->>'campaign')::uuid campaign,sum((x->>'old')::numeric) old,sum((x->>'amount')::numeric) new FROM jsonb_array_elements(costs) x GROUP BY 1) grouped;
 result:=jsonb_build_object('status','preview','domain_code',code,'fingerprint',fingerprint,'method',p_method,
  'movements',jsonb_array_length(movements),'exits',count_out,'cost_before',old_cost,'cost_after',new_cost,'campaigns',campaign_totals,
  'stock_before',(SELECT CASE WHEN count(*) FILTER(WHERE b->>'inventory_value' IS NULL AND (b->>'current_qty')::numeric>0)>0
   THEN NULL ELSE coalesce(sum((b->>'inventory_value')::numeric),0) END FROM jsonb_array_elements(snapshot->'balances') b),
  'stock_after',(SELECT coalesce(sum((b->>'value')::numeric),0) FROM jsonb_array_elements(balances) b));
 IF NOT p_apply THEN RETURN result; END IF;
 INSERT INTO public.inventory_method_changes(id,domain_id,method,fingerprint,before_data,plan,result)
 VALUES(p_request,p_domain,p_method,fingerprint,snapshot,jsonb_build_object('movements',movements,'costs',costs,'balances',balances),result);
 SELECT r.result INTO result FROM public.inventory_method_changes r WHERE r.id=p_request;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.change_inventory_cost_method(uuid,text,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_inventory_cost_method(uuid,text,uuid,text,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
