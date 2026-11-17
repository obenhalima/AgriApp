  -- Outil de migration à appliquer manuellement après stock_history_import et 136.
  -- Aucun effacement lors de l'installation. Seul le RPC confirmé déclenche la remise à zéro.
  BEGIN;
  CREATE TABLE public.stock_history_resets (
   id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
   actor_id uuid NOT NULL DEFAULT auth.uid(), transaction_id bigint NOT NULL DEFAULT txid_current(),
   fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
  );
  ALTER TABLE public.stock_history_resets ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.stock_history_resets FROM PUBLIC,anon,authenticated;
  GRANT SELECT ON public.stock_history_resets TO authenticated;
  CREATE POLICY stock_history_resets_read ON public.stock_history_resets FOR SELECT TO authenticated
   USING(public.is_domain_admin(domain_id,auth.uid()));

  -- Private snapshot also detects edits to quantities, prices and allocations between preview and apply.
  CREATE FUNCTION public.stock_history_reset_snapshot(p_domain uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  DECLARE result jsonb:='{}'; relation text; predicate text; rows jsonb;
  BEGIN
   FOREACH relation IN ARRAY ARRAY['stock_items','stock_movements','warehouse_stocks','inventory_value_events',
    'cost_entries','inventory_consumption_reviews','stock_consumption_allocations','historical_cost_confirmations',
    'stock_initialization_lines','stock_initialization_batches','stock_history_lines','stock_history_batches',
    'stock_exit_requests','stock_transfers'] LOOP
    predicate:=CASE WHEN relation='cost_entries' THEN 'source_stock_movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=$1)'
     WHEN relation IN ('inventory_consumption_reviews','stock_consumption_allocations','historical_cost_confirmations') THEN 'movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=$1)'
     ELSE 'domain_id=$1' END;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]'') FROM public.%I t WHERE %s',relation,predicate) INTO rows USING p_domain;
    result:=jsonb_set(result,ARRAY[relation],rows);
   END LOOP;
   RETURN result;
  END $fn$;
  REVOKE ALL ON FUNCTION public.stock_history_reset_snapshot(uuid) FROM PUBLIC,anon,authenticated;

  -- Only the private receipt trigger can pass these guards in the same transaction.
  CREATE FUNCTION public.stock_history_reset_context(p_domain uuid) RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
   SELECT pg_trigger_depth()>=2 AND EXISTS(SELECT 1 FROM public.stock_history_resets r
   WHERE r.id::text=current_setting('app.stock_history_reset',true) AND r.domain_id=p_domain
   AND r.actor_id=auth.uid() AND r.transaction_id=txid_current() AND r.applied_at IS NULL)
  $fn$;
  REVOKE ALL ON FUNCTION public.stock_history_reset_context(uuid) FROM PUBLIC,anon,authenticated;

  CREATE OR REPLACE FUNCTION public.immutable_stock_movement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  BEGIN
   IF TG_OP='DELETE' AND public.stock_history_reset_context(OLD.domain_id) THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Mouvement enregistré : créer un mouvement correctif';
  END $fn$;
  REVOKE ALL ON FUNCTION public.immutable_stock_movement() FROM PUBLIC,anon,authenticated;

  CREATE OR REPLACE FUNCTION public.guard_generated_consumption_cost() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  BEGIN
   IF TG_OP IN ('UPDATE','DELETE') AND OLD.source_stock_movement_id IS NOT NULL THEN
    IF TG_OP='DELETE' AND public.stock_history_reset_context(OLD.domain_id) THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND pg_trigger_depth()>=2 AND EXISTS (
     SELECT 1 FROM public.historical_cost_confirmations h
     WHERE h.id::text=current_setting('app.historical_cost_confirmation',true)
     AND h.movement_id=OLD.source_stock_movement_id AND h.domain_id=OLD.domain_id
     AND h.actor_id=auth.uid() AND h.transaction_id=txid_current() AND h.applied_at IS NULL
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Coût généré par un mouvement de stock : correction via confirmation historique dédiée';
   END IF;
   IF TG_OP IN ('INSERT','UPDATE') AND NEW.source_stock_movement_id IS NOT NULL AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Imputation automatique uniquement'; END IF;
   RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END $fn$;
  REVOKE ALL ON FUNCTION public.guard_generated_consumption_cost() FROM PUBLIC,anon,authenticated;

  CREATE FUNCTION public.apply_stock_history_reset() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  DECLARE old_setting text:=current_setting('app.stock_history_reset',true);
  BEGIN
   PERFORM set_config('app.stock_history_reset',NEW.id::text,true);
   DELETE FROM public.stock_history_lines WHERE domain_id=NEW.domain_id;
   DELETE FROM public.stock_initialization_lines WHERE domain_id=NEW.domain_id;
   DELETE FROM public.historical_cost_confirmations WHERE movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=NEW.domain_id);
   DELETE FROM public.inventory_consumption_reviews WHERE movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=NEW.domain_id);
   DELETE FROM public.stock_consumption_allocations WHERE movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=NEW.domain_id);
   DELETE FROM public.cost_entries WHERE source_stock_movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=NEW.domain_id);
   DELETE FROM public.inventory_value_events WHERE domain_id=NEW.domain_id;
   DELETE FROM public.stock_movements WHERE domain_id=NEW.domain_id;
   DELETE FROM public.stock_history_batches WHERE domain_id=NEW.domain_id;
   DELETE FROM public.stock_initialization_batches WHERE domain_id=NEW.domain_id;
   UPDATE public.warehouse_stocks SET current_qty=0,inventory_value=0,valuation_verified=true,updated_at=now() WHERE domain_id=NEW.domain_id;
   UPDATE public.stock_items SET current_qty=0,updated_at=now() WHERE domain_id=NEW.domain_id;
   UPDATE public.stock_history_resets SET applied_at=clock_timestamp(),result=result||jsonb_build_object('status','applied','operation_id',NEW.id) WHERE id=NEW.id;
   PERFORM set_config('app.stock_history_reset',coalesce(old_setting,''),true);
   RETURN NEW;
  END $fn$;
  REVOKE ALL ON FUNCTION public.apply_stock_history_reset() FROM PUBLIC,anon,authenticated;
  CREATE TRIGGER apply_stock_history_reset AFTER INSERT ON public.stock_history_resets FOR EACH ROW EXECUTE FUNCTION public.apply_stock_history_reset();

  CREATE FUNCTION public.reset_stock_history(p_domain uuid,p_request uuid,p_expected text DEFAULT NULL,p_confirmation text DEFAULT NULL,p_apply boolean DEFAULT false) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='60s' AS $fn$
  DECLARE snapshot jsonb; fingerprint text; result jsonb; code text; blockers jsonb; receipt public.stock_history_resets%ROWTYPE;
  BEGIN
   IF auth.uid() IS NULL OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
   OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','edit'),false)
   OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'couts','edit'),false)
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
   THEN RAISE EXCEPTION 'Remise à zéro réservée aux administrateurs du client' USING ERRCODE='42501'; END IF;
   SELECT d.code INTO code FROM public.domains d WHERE d.id=p_domain AND d.is_active;
   IF code IS NULL OR p_request IS NULL OR p_apply IS NULL THEN RAISE EXCEPTION 'Client et référence de confirmation requis'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('stock-history:'||p_domain::text,0));
   SELECT * INTO receipt FROM public.stock_history_resets WHERE id=p_request;
   IF FOUND THEN
    IF receipt.domain_id<>p_domain OR receipt.fingerprint IS DISTINCT FROM p_expected OR p_confirmation IS DISTINCT FROM code THEN RAISE EXCEPTION 'Cette confirmation appartient à une autre remise à zéro'; END IF;
    RETURN receipt.result;
   END IF;
   IF p_apply THEN
    IF p_confirmation IS DISTINCT FROM code THEN RAISE EXCEPTION 'Recopiez exactement le code du client pour confirmer'; END IF;
    LOCK TABLE public.stock_items,public.stock_movements,public.warehouse_stocks,public.inventory_value_events,
     public.cost_entries,public.inventory_consumption_reviews,public.stock_consumption_allocations,public.historical_cost_confirmations,
     public.stock_initialization_lines,public.stock_initialization_batches,public.stock_history_lines,public.stock_history_batches,
     public.stock_exit_requests,public.stock_transfers,public.treatment_application_products,public.cultural_consumptions IN SHARE ROW EXCLUSIVE MODE;
   END IF;
   snapshot:=public.stock_history_reset_snapshot(p_domain);
   fingerprint:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
   SELECT jsonb_build_object(
    'purchases',(SELECT count(*) FROM public.stock_movements WHERE domain_id=p_domain AND po_id IS NOT NULL),
    'transfers',(SELECT count(*) FROM public.stock_transfers WHERE domain_id=p_domain),
    'requests',(SELECT count(*) FROM public.stock_exit_requests WHERE domain_id=p_domain AND (stock_movement_id IS NOT NULL OR coalesce(status::text,'') NOT IN ('annulee','rejetee'))),
    'treatments',(SELECT count(*) FROM public.treatment_application_products WHERE stock_movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=p_domain)),
    'cultural',(SELECT count(*) FROM public.cultural_consumptions WHERE movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=p_domain)),
    'inconsistent',(SELECT count(*) FROM public.cost_entries WHERE source_stock_movement_id IN (SELECT id FROM public.stock_movements WHERE domain_id=p_domain) AND domain_id IS DISTINCT FROM p_domain)
     +(SELECT count(*) FROM public.stock_movements m JOIN public.stock_items s ON s.id=m.stock_item_id JOIN public.warehouses w ON w.id=m.warehouse_id WHERE (m.domain_id=p_domain OR s.domain_id=p_domain OR w.domain_id=p_domain) AND (m.domain_id IS DISTINCT FROM s.domain_id OR m.domain_id IS DISTINCT FROM w.domain_id))
     +(SELECT count(*) FROM public.warehouse_stocks b JOIN public.stock_items s ON s.id=b.stock_item_id JOIN public.warehouses w ON w.id=b.warehouse_id WHERE (b.domain_id=p_domain OR s.domain_id=p_domain OR w.domain_id=p_domain) AND (b.domain_id IS DISTINCT FROM s.domain_id OR b.domain_id IS DISTINCT FROM w.domain_id))
     +(SELECT count(*) FROM (
       SELECT domain_id,movement_id FROM public.stock_consumption_allocations
       UNION ALL SELECT domain_id,movement_id FROM public.inventory_consumption_reviews
       UNION ALL SELECT domain_id,movement_id FROM public.historical_cost_confirmations
       UNION ALL SELECT domain_id,movement_id FROM public.stock_initialization_lines
       UNION ALL SELECT domain_id,movement_id FROM public.stock_history_lines
      ) links JOIN public.stock_movements m ON m.id=links.movement_id
      WHERE (links.domain_id=p_domain OR m.domain_id=p_domain) AND links.domain_id IS DISTINCT FROM m.domain_id)
   ) INTO blockers;
   result:=jsonb_build_object('status','preview','domain_code',code,'fingerprint',fingerprint,'operation_id',NULL,'blockers',blockers,
    'movements',jsonb_array_length(snapshot->'stock_movements'),'costs',jsonb_array_length(snapshot->'cost_entries'),
    'balances',jsonb_array_length(snapshot->'warehouse_stocks'),'items',jsonb_array_length(snapshot->'stock_items'));
   IF NOT p_apply THEN RETURN result; END IF;
   IF p_expected IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Le stock a changé. Relancez l’aperçu avant de confirmer.'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each_text(blockers) b WHERE b.value::bigint>0) THEN RAISE EXCEPTION 'Des opérations liées empêchent cette remise à zéro. Consultez les blocages de l’aperçu.'; END IF;
   INSERT INTO public.stock_history_resets(id,domain_id,fingerprint,result) VALUES(p_request,p_domain,fingerprint,result);
   SELECT r.result INTO result FROM public.stock_history_resets r WHERE r.id=p_request;
   RETURN result;
  END $fn$;
  REVOKE ALL ON FUNCTION public.reset_stock_history(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION public.reset_stock_history(uuid,uuid,text,text,boolean) TO authenticated;
  NOTIFY pgrst,'reload schema';
  COMMIT;
