-- Fixtures only inside transaction ending ROLLBACK; never run standalone.
DO $$
DECLARE d uuid;f uuid;c uuid;plant uuid;members uuid[];actor uuid;r1 uuid;r2 uuid;wh uuid:=gen_random_uuid();item uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();pid2 uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();o uuid;
 input jsonb;actual jsonb;result jsonb;cnt bigint;cost numeric;m uuid;program2 uuid;entry_qty numeric;sub1 uuid:=gen_random_uuid();sub2 uuid:=gen_random_uuid();suba uuid:=gen_random_uuid();cost_user uuid;
BEGIN
 SELECT ca.domain_id,ca.farm_id,ca.id,cp.id INTO d,f,c,plant FROM campaigns ca JOIN farms fa ON fa.id=ca.farm_id AND fa.is_active
 JOIN campaign_plantings cp ON cp.campaign_id=ca.id AND cp.domain_id=ca.domain_id AND cp.planted_area>=10 JOIN greenhouses g ON g.id=cp.greenhouse_id AND g.farm_id=ca.farm_id AND g.status='active'
 WHERE (SELECT count(*) FROM domain_memberships dm JOIN profiles p ON p.id=dm.user_id WHERE dm.domain_id=ca.domain_id AND dm.is_active AND p.is_active AND NOT coalesce(p.must_change_password,false) AND has_domain_permission(ca.domain_id,p.id,'agronomie','view'))>=3 LIMIT 1;
 SELECT array_agg(id ORDER BY id) INTO members FROM (SELECT p.id FROM domain_memberships dm JOIN profiles p ON p.id=dm.user_id WHERE dm.domain_id=d AND dm.is_active AND p.is_active AND NOT coalesce(p.must_change_password,false) AND has_domain_permission(d,p.id,'agronomie','view') LIMIT 3) x;
 actor:=members[1];r1:=members[2];r2:=members[3];IF r2 IS NULL THEN RAISE EXCEPTION 'Fixture : 3 membres agronomie et une plantation requis'; END IF;
 DELETE FROM user_capability_overrides WHERE domain_id=d AND user_id=ANY(members) AND capability_id IN(SELECT id FROM business_capabilities WHERE process_code IN('cultural','fertigation'));
 INSERT INTO user_capability_overrides(domain_id,farm_id,user_id,capability_id,granted,reason)
 SELECT d,f,u,bc.id,true,'QA ROLLBACK' FROM unnest(members) u CROSS JOIN business_capabilities bc WHERE process_code IN('cultural','fertigation');
 INSERT INTO warehouses(id,domain_id,farm_id,code,name,warehouse_type) VALUES(wh,d,f,'QA-'||left(wh::text,20),'QA intervention','intrants');
 INSERT INTO stock_items(id,domain_id,code,name,category,unit) VALUES(item,d,'QA-'||left(item::text,20),'Engrais QA culturale','engrais','kg');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO stock_movements(stock_item_id,movement_type,quantity,movement_date,warehouse_id,unit_cost,domain_id) VALUES(item,'entree',5,current_date,wh,12,d);
 input:=jsonb_build_object('domain_id',d,'farm_id',f,'campaign_id',c,'family','amendement','title','Programme QA','warehouse_id',wh,'water_liters',0,'scope_confirmed',true,'notes','Consignes QA',
 'targets',jsonb_build_array(jsonb_build_object('planting_id',plant,'area',10)),
 'products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'mode','fixed','dose',2)),
 'dates',jsonb_build_array(now()+interval '1 day',now()+interval '2 days',now()+interval '3 days'));
 IF has_table_privilege('authenticated','cultural_programs','INSERT') OR has_function_privilege('anon','save_cultural_program(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 BEGIN PERFORM save_cultural_program(pid,input||jsonb_build_object('farm_id',gen_random_uuid()));RAISE EXCEPTION 'Foreign farm accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Planification non%' THEN RAISE;END IF;END;
 PERFORM save_cultural_program(pid,input);PERFORM save_cultural_program(pid,input);
 IF (SELECT count(*) FROM cultural_occurrences WHERE program_id=pid)<>3 THEN RAISE EXCEPTION 'Duplicate creation'; END IF;
 INSERT INTO cultural_settings VALUES(d,'amendement',2,15) ON CONFLICT(domain_id,family) DO UPDATE SET levels=2;
 PERFORM cultural_action(pid,'submit');
 INSERT INTO mobile_push_subscriptions(id,user_id,endpoint,keys) VALUES
 (sub1,r1,'https://fcm.googleapis.com/qa-rollback/'||sub1,jsonb_build_object('auth',repeat('a',30),'p256dh',repeat('b',30))),
 (sub2,r2,'https://fcm.googleapis.com/qa-rollback/'||sub2,jsonb_build_object('auth',repeat('a',30),'p256dh',repeat('b',30))),
 (suba,actor,'https://fcm.googleapis.com/qa-rollback/'||suba,jsonb_build_object('auth',repeat('a',30),'p256dh',repeat('b',30)));
 INSERT INTO mobile_notification_preferences(user_id,push_enabled) SELECT unnest(members),true ON CONFLICT(user_id) DO UPDATE SET push_enabled=true;
 PERFORM mobile_refresh_notifications();
 IF EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=pid) THEN RAISE EXCEPTION 'Opt-in bypassed';END IF;
 UPDATE mobile_notification_rules SET enabled=true WHERE domain_id=d AND process='cultural';
 PERFORM mobile_refresh_notifications();PERFORM mobile_refresh_notifications();
 IF (SELECT count(*) FROM mobile_notifications WHERE entity_id=pid AND subscription_id=sub1 AND phase='pending')<>1 OR EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=pid AND phase='pending' AND user_id=actor) THEN RAISE EXCEPTION 'Notification recipients/dedupe wrong';END IF;
 BEGIN PERFORM cultural_action(pid,'approve');RAISE EXCEPTION 'Self approval';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Niveau modifié%' THEN RAISE;END IF;END;
 SELECT id INTO o FROM cultural_occurrences WHERE program_id=pid ORDER BY planned_at LIMIT 1;
 actual:=jsonb_build_object('performed_at',now(),'water_liters',0,'notes','Réalisé QA','homogeneous',true,'areas',jsonb_build_object(plant::text,10),'products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantity',2)));
 BEGIN PERFORM confirm_cultural_occurrence(o,actual);RAISE EXCEPTION 'Execution before approval';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme non approuvé%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',r1::text,true);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(mobile_approval_items()) x WHERE x->>'id'=pid::text AND x->>'kind'='cultural') THEN RAISE EXCEPTION 'Mobile card missing';END IF;
 PERFORM mobile_review('cultural',pid,1,true,'Accord N1');
 IF EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=pid AND phase='pending' AND NOT cancelled) THEN RAISE EXCEPTION 'Previous-level outbox not cancelled';END IF;
 PERFORM mobile_refresh_notifications();
 IF NOT EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=pid AND subscription_id=sub2 AND phase='pending' AND NOT cancelled) THEN RAISE EXCEPTION 'No level2 notification';END IF;
 IF cultural_can_review(pid,r1) OR cultural_can_review(pid,actor) THEN RAISE EXCEPTION 'Same person N2';END IF;
 BEGIN PERFORM mobile_review('cultural',pid,1,true,'Duplicate');RAISE EXCEPTION 'Stale level accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Niveau modifié%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',r2::text,true);PERFORM mobile_review('cultural',pid,2,true,'Accord N2');
 IF NOT EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=pid AND subscription_id=suba AND phase='approuvee') THEN RAISE EXCEPTION 'No requester result';END IF;
 UPDATE mobile_notification_rules SET enabled=false WHERE domain_id=d AND process='cultural';
 IF (SELECT status FROM cultural_programs WHERE id=pid)<>'approuvee' THEN RAISE EXCEPTION 'Not approved';END IF;
 result:=cultural_forecast(d);
 IF (SELECT count(*) FROM jsonb_array_elements(result) x WHERE x->>'program_id'=pid::text AND (x->>'missing')::numeric>0)<>1 THEN RAISE EXCEPTION 'Cumulative forecast wrong %',result; END IF;
 PERFORM confirm_cultural_occurrence(o,actual);PERFORM confirm_cultural_occurrence(o,actual);
 IF (SELECT current_qty FROM warehouse_stocks WHERE stock_item_id=item AND warehouse_id=wh)<>3 THEN RAISE EXCEPTION 'Double stock consumption';END IF;
 SELECT movement_id INTO m FROM cultural_consumptions WHERE occurrence_id=o;
 SELECT sum(amount) INTO cost FROM cost_entries WHERE source_stock_movement_id=m;
 IF cost<>24 OR cost IS NULL OR NOT EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m AND variety_id=(SELECT variety_id FROM campaign_plantings WHERE id=plant)) THEN RAISE EXCEPTION 'Cost allocation wrong %',cost;END IF;
 SELECT id INTO o FROM cultural_occurrences WHERE program_id=pid AND confirmed_at IS NULL ORDER BY planned_at LIMIT 1;
 BEGIN PERFORM confirm_cultural_occurrence(o,actual||jsonb_build_object('products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantity',4))));RAISE EXCEPTION 'Unjustified change';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Justificatif requis%' THEN RAISE;END IF;END;
 BEGIN PERFORM confirm_cultural_occurrence(o,actual||jsonb_build_object('deviation_reason','Écart QA','products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantity',4))));RAISE EXCEPTION 'Negative stock accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Stock insuffisant%' THEN RAISE;END IF;END;
 IF (SELECT current_qty FROM warehouse_stocks WHERE stock_item_id=item AND warehouse_id=wh)<>3 THEN RAISE EXCEPTION 'Failed actual changed balance';END IF;
 PERFORM skip_cultural_occurrence(o,'Non réalisée QA');PERFORM skip_cultural_occurrence(o,'Non réalisée QA');
 IF (SELECT current_qty FROM warehouse_stocks WHERE stock_item_id=item AND warehouse_id=wh)<>3 THEN RAISE EXCEPTION 'Skip consumed stock';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(cultural_forecast(d)) x WHERE x->>'occurrence_id'=o::text) THEN RAISE EXCEPTION 'Skipped occurrence forecasted';END IF;
 BEGIN PERFORM confirm_cultural_occurrence(o,actual);RAISE EXCEPTION 'Skipped occurrence executed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Occurrence déclarée%' THEN RAISE;END IF;END;
 PERFORM cultural_action(pid,'cancel',1,'Fin du test QA');
 IF (SELECT count(*) FROM cultural_occurrences WHERE program_id=pid AND confirmed_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'History lost';END IF;
 -- Fertigation recipe snapshot and recalculation using actual water.
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM save_fertigation_recipe(rid,jsonb_build_object('domain_id',d,'farm_id',f,'name','Recette QA culturale','basis','final_solution','lines',jsonb_build_array(jsonb_build_object('stock_item_id',item,'dose',1,'dose_unit','kg_m3'))));
 PERFORM save_cultural_program(pid2,input||jsonb_build_object('family','fertigation','recipe_id',rid,'water_liters',1000,'dates',jsonb_build_array(now()+interval '1 day')));
 INSERT INTO cultural_settings VALUES(d,'fertigation',0,15) ON CONFLICT(domain_id,family) DO UPDATE SET levels=0;
 PERFORM cultural_action(pid2,'submit');SELECT id INTO o FROM cultural_occurrences WHERE program_id=pid2;
 PERFORM confirm_cultural_occurrence(o,actual||'{"water_liters":2000}');
 IF (SELECT current_qty FROM warehouse_stocks WHERE stock_item_id=item AND warehouse_id=wh)<>1 THEN RAISE EXCEPTION 'Actual-water calculation failed';END IF;
 IF (SELECT status FROM cultural_programs WHERE id=pid2)<>'terminee' THEN RAISE EXCEPTION 'Program not completed';END IF;
 -- No-product work, disabled approval, no extra stock movements.
 SELECT count(*) INTO cnt FROM stock_movements; program2:=gen_random_uuid();
 INSERT INTO cultural_settings VALUES(d,'travaux',0,15) ON CONFLICT(domain_id,family) DO UPDATE SET levels=0;
 PERFORM save_cultural_program(program2,input||jsonb_build_object('family','travaux','products','[]'::jsonb,'dates',jsonb_build_array(now()+interval '1 day')));PERFORM cultural_action(program2,'submit');
 SELECT id INTO o FROM cultural_occurrences WHERE program_id=program2;
 PERFORM confirm_cultural_occurrence(o,actual||'{"products":[]}');
 IF (SELECT count(*) FROM stock_movements)<>cnt THEN RAISE EXCEPTION 'No-product work consumed stock';END IF;
 -- Unknown CUMP remains pending; later reconciliation allocates to the original targets only.
 UPDATE warehouse_stocks SET inventory_value=NULL,valuation_verified=false WHERE warehouse_id=wh AND stock_item_id=item;
 INSERT INTO cultural_settings VALUES(d,'amendement',0,15) ON CONFLICT(domain_id,family) DO UPDATE SET levels=0;
 program2:=gen_random_uuid();
 PERFORM save_cultural_program(program2,input||jsonb_build_object('products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'mode','fixed','dose',0.5)),'dates',jsonb_build_array(now()+interval '1 day')));
 PERFORM cultural_action(program2,'submit');SELECT id INTO o FROM cultural_occurrences WHERE program_id=program2;
 PERFORM confirm_cultural_occurrence(o,actual||jsonb_build_object('products',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantity',0.5))));
 SELECT movement_id INTO m FROM cultural_consumptions WHERE occurrence_id=o;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m) THEN RAISE EXCEPTION 'Unknown cost silently zeroed';END IF;
 SELECT p.id INTO cost_user FROM profiles p WHERE p.is_active AND NOT coalesce(p.must_change_password,false) AND is_domain_member(d,p.id) AND has_domain_permission(d,p.id,'couts','edit') AND has_domain_permission(d,p.id,'agronomie','view') LIMIT 1;
 IF cost_user IS NULL THEN RAISE EXCEPTION 'Fixture : membre autorisé au rapprochement requis';END IF;
 PERFORM set_config('request.jwt.claim.sub',cost_user::text,true);PERFORM review_inventory_consumption(m,NULL,10,'Prix réel QA');
 IF (SELECT sum(amount) FROM cost_entries WHERE source_stock_movement_id=m) IS DISTINCT FROM 5::numeric THEN RAISE EXCEPTION 'Reconciliation cost wrong';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Every family supports a validated program; no fake agronomic doses are created outside this rolled-back fixture.
 FOR result IN SELECT to_jsonb(cf) FROM cultural_families cf WHERE code<>'fertigation' LOOP
  program2:=gen_random_uuid();PERFORM save_cultural_program(program2,input||jsonb_build_object('family',result->>'code','water_liters',1000));
 END LOOP;
 -- Regression guard: a stock item reclassified as phyto cannot enter the non-phyto workflow.
 UPDATE stock_items SET category='phytosanitaires' WHERE id=item;
 BEGIN PERFORM save_cultural_program(gen_random_uuid(),input);RAISE EXCEPTION 'Phyto bypass accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Article actif hors phyto%' THEN RAISE;END IF;END;
 UPDATE stock_items SET category='engrais' WHERE id=item;
 BEGIN PERFORM cultural_workspace(gen_random_uuid());RAISE EXCEPTION 'Cross-client workspace';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE;END IF;END;
 PERFORM cultural_workspace(d);
 IF EXISTS(SELECT 1 FROM mobile_notification_rules WHERE domain_id=d AND process='cultural' AND enabled) THEN RAISE EXCEPTION 'Notifications enabled by default';END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM cultural_workspace(d);RAISE EXCEPTION 'Anon read';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE;END IF;END;
 RAISE NOTICE 'PASS: creation, 2 distinct levels, mobile, cumulative stock, real-water recalculation, real costs, rollback on shortage, retry, cancellation, work without stock.';
END $$;
