DO $$
DECLARE movement uuid; actor uuid; ctx jsonb; surfaces jsonb; request uuid:=gen_random_uuid();
 before_stock jsonb; after_stock jsonb; before_movement jsonb; price numeric; actual numeric;
BEGIN
 SELECT c.source_stock_movement_id,d.user_id INTO movement,actor FROM cost_entries c
 JOIN domain_memberships d ON d.domain_id=c.domain_id JOIN profiles p ON p.id=d.user_id
 WHERE c.cost_quality='provisional' AND NOT c.is_planned AND c.source_stock_movement_id IS NOT NULL
 AND p.is_active AND is_domain_member(c.domain_id,d.user_id) AND has_domain_permission(c.domain_id,d.user_id,'couts','edit') LIMIT 1;
 IF movement IS NULL THEN RAISE EXCEPTION 'Recette non exécutée : aucune consommation provisoire et personne habilitée'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 ctx:=historical_cost_context(movement);
 SELECT coalesce(jsonb_object_agg(l->>'id',coalesce(l->'surface','1'::jsonb)),'{}'::jsonb) INTO surfaces FROM jsonb_array_elements(ctx->'lines') l;
 -- Les surfaces absentes de l'historique sont une fixture explicite, pas une donnée réelle confirmée.
 SELECT jsonb_object_agg(key,CASE WHEN value='null'::jsonb THEN '1'::jsonb ELSE value END) INTO surfaces FROM jsonb_each(surfaces);
 SELECT jsonb_agg(to_jsonb(w) ORDER BY w.warehouse_id,w.stock_item_id) INTO before_stock FROM warehouse_stocks w;
 SELECT to_jsonb(m) INTO before_movement FROM stock_movements m WHERE id=movement;
 price:=(ctx->>'unit_cost')::numeric+1;
 BEGIN
  PERFORM confirm_historical_consumption_cost(gen_random_uuid(),movement,'stale',price,surfaces,'Test périmé');
  RAISE EXCEPTION 'FAIL stale accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL stale accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM confirm_historical_consumption_cost(gen_random_uuid(),movement,ctx->>'version',price,surfaces,'x');
  RAISE EXCEPTION 'FAIL short reason accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL short reason accepted' THEN RAISE; END IF; END;
 PERFORM confirm_historical_consumption_cost(request,movement,ctx->>'version',price,surfaces,'Recette transaction annulée');
 PERFORM confirm_historical_consumption_cost(request,movement,ctx->>'version',price,surfaces,'Recette transaction annulée');
 IF (SELECT count(*) FROM historical_cost_confirmations WHERE id=request AND applied_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'FAIL audit/idempotence'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=movement AND cost_quality IS DISTINCT FROM 'verified') THEN RAISE EXCEPTION 'FAIL quality'; END IF;
 SELECT sum(amount) INTO actual FROM cost_entries WHERE source_stock_movement_id=movement;
 IF actual<>round(price*(ctx->>'quantity')::numeric,2) THEN RAISE EXCEPTION 'FAIL total'; END IF;
 SELECT jsonb_agg(to_jsonb(w) ORDER BY w.warehouse_id,w.stock_item_id) INTO after_stock FROM warehouse_stocks w;
 IF before_stock IS DISTINCT FROM after_stock OR before_movement IS DISTINCT FROM (SELECT to_jsonb(m) FROM stock_movements m WHERE id=movement) THEN RAISE EXCEPTION 'FAIL stock changed'; END IF;
 BEGIN
  UPDATE cost_entries SET amount=0 WHERE source_stock_movement_id=movement;
  RAISE EXCEPTION 'FAIL direct update accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL direct update accepted' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
 BEGIN
  PERFORM historical_cost_context(movement); RAISE EXCEPTION 'FAIL unauthorized accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL unauthorized accepted' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS historical confirmation: permission, version, reason, recalculation, audit, retry, immutable costs and unchanged stock/movement. ROLLBACK follows.';
END $$;
