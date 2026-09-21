-- Only inside a transaction followed by ROLLBACK. Never calls HTTP, claim or dispatch.
DO $$
DECLARE d uuid; f uuid; c uuid; g uuid; actor uuid; reviewer uuid; program uuid:=gen_random_uuid(); rejected uuid:=gen_random_uuid();
 subscription uuid:=gen_random_uuid(); requester_subscription uuid:=gen_random_uuid(); payload jsonb; item jsonb; n bigint; capability uuid;
BEGIN
 SELECT ca.domain_id,ca.farm_id,ca.id,gh.id INTO d,f,c,g FROM campaigns ca JOIN farms fa ON fa.id=ca.farm_id AND fa.is_active
 JOIN greenhouses gh ON gh.farm_id=ca.farm_id AND fa.domain_id=ca.domain_id AND gh.status='active'
 WHERE (SELECT count(*) FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=ca.domain_id AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(ca.domain_id,p.id,'agronomie','view'))>=2 LIMIT 1;
 SELECT p.id INTO actor FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=d AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(d,p.id,'agronomie','view') ORDER BY p.id LIMIT 1;
 SELECT p.id INTO reviewer FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=d AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(d,p.id,'agronomie','view') AND p.id<>actor ORDER BY p.id LIMIT 1;
 IF reviewer IS NULL OR g IS NULL THEN RAISE EXCEPTION 'Fixture requires a farm and two active agronomy members'; END IF;
 SELECT id INTO capability FROM business_capabilities WHERE code='irrigation.validate';
 DELETE FROM user_capability_overrides WHERE domain_id=d AND user_id IN(actor,reviewer) AND capability_id IN(SELECT id FROM business_capabilities WHERE process_code='irrigation');
 INSERT INTO user_capability_overrides(domain_id,farm_id,user_id,capability_id,granted,reason)
 SELECT d,f,u.id,bc.id,true,'QA rollback' FROM (VALUES(actor),(reviewer)) u(id) CROSS JOIN business_capabilities bc WHERE bc.process_code='irrigation';
 IF has_function_privilege('anon','mobile_approval_items()','EXECUTE') OR has_function_privilege('authenticated','mobile_refresh_irrigation_notifications()','EXECUTE') OR has_function_privilege('authenticated','mobile_review_before_irrigation(text,uuid,integer,boolean,text)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 IF mobile_can_review('irrigation',program,reviewer) THEN RAISE EXCEPTION 'Nonexistent program accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO irrigation_settings VALUES(d,true) ON CONFLICT(domain_id) DO UPDATE SET validation_enabled=true;
 INSERT INTO mobile_notification_rules(domain_id,process,enabled,reminder_hours) VALUES(d,'irrigation',false,24) ON CONFLICT(domain_id,process) DO UPDATE SET enabled=false,reminder_hours=24;
 INSERT INTO mobile_push_subscriptions(id,user_id,endpoint,keys) VALUES
 (subscription,reviewer,'https://fcm.googleapis.com/qa-rollback/'||subscription,jsonb_build_object('p256dh',repeat('a',30),'auth',repeat('b',30))),
 (requester_subscription,actor,'https://fcm.googleapis.com/qa-rollback/'||requester_subscription,jsonb_build_object('p256dh',repeat('a',30),'auth',repeat('b',30)));
 INSERT INTO mobile_notification_preferences(user_id,push_enabled) VALUES(actor,true),(reviewer,true) ON CONFLICT(user_id) DO UPDATE SET push_enabled=true;
 payload:=jsonb_build_object('domain_id',d,'farm_id',f,'campaign_id',c,'greenhouse_ids',jsonb_build_array(g),'title','Irrigation mobile QA rollback','water_source','Bassin QA','water',jsonb_build_object('mode','volume','volume',1250.5),'dates',jsonb_build_array(now()+interval '1 day',now()+interval '2 days'));
 PERFORM save_irrigation_program(program,payload); PERFORM irrigation_program_action(program,'submit');
 PERFORM mobile_refresh_irrigation_notifications();
 IF EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=program) THEN RAISE EXCEPTION 'Opt-in bypassed'; END IF;
 IF mobile_can_review('irrigation',program,actor) OR mobile_can_review('irrigation',program,gen_random_uuid()) THEN RAISE EXCEPTION 'Self or outsider eligible'; END IF;
 BEGIN PERFORM mobile_review('irrigation',program,1,true,NULL); RAISE EXCEPTION 'Self approval accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme déjà traité%' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(mobile_approval_items()) x WHERE x->>'id'=program::text) THEN RAISE EXCEPTION 'Self visible'; END IF;
 PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
 SELECT x INTO item FROM jsonb_array_elements(mobile_approval_items()) x WHERE x->>'id'=program::text;
 IF item IS NULL OR item->>'kind'<>'irrigation' OR jsonb_array_length(item->'entity'->'occurrences')<>2 OR (item->'entity'->>'planned_liters')::numeric<>1250.5 OR item->>'href'<>'/interventions?programme='||program THEN RAISE EXCEPTION 'Incomplete mobile context'; END IF;
 UPDATE user_capability_overrides SET granted=false WHERE domain_id=d AND user_id=reviewer AND capability_id=capability;
 IF mobile_can_review('irrigation',program,reviewer) THEN RAISE EXCEPTION 'Revoked validator eligible'; END IF;
 BEGIN PERFORM mobile_review('irrigation',program,1,true,NULL); RAISE EXCEPTION 'Revoked approval accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme déjà traité%' THEN RAISE; END IF; END;
 UPDATE user_capability_overrides SET granted=true WHERE domain_id=d AND user_id=reviewer AND capability_id=capability;
 UPDATE mobile_notification_rules SET enabled=true WHERE domain_id=d AND process='irrigation';
 PERFORM mobile_refresh_irrigation_notifications(); PERFORM mobile_refresh_irrigation_notifications();
 SELECT count(*) INTO n FROM mobile_notifications WHERE entity_id=program AND subscription_id=subscription AND phase='pending';
 IF n<>1 OR EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=program AND user_id=actor AND phase='pending') THEN RAISE EXCEPTION 'Pending recipients or deduplication wrong'; END IF;
 UPDATE irrigation_programs SET submitted_at=now()-interval '25 hours' WHERE id=program;
 PERFORM mobile_refresh_irrigation_notifications();
 IF (SELECT count(*) FROM mobile_notifications WHERE entity_id=program AND subscription_id=subscription AND phase='pending')<>2 THEN RAISE EXCEPTION 'Reminder not queued'; END IF;
 BEGIN PERFORM mobile_review('irrigation',program,2,true,NULL); RAISE EXCEPTION 'Wrong level accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme déjà traité%' THEN RAISE; END IF; END;
 BEGIN PERFORM mobile_review('irrigation',program,1,false,'non'); RAISE EXCEPTION 'Short refusal accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Motif du refus%' THEN RAISE; END IF; END;
 PERFORM mobile_review('irrigation',program,1,true,'Accord QA');
 IF (SELECT status FROM irrigation_programs WHERE id=program)<>'approuvee' OR (SELECT count(*) FROM mobile_approval_audit WHERE kind='irrigation' AND entity_id=program)<>1 THEN RAISE EXCEPTION 'Decision not audited'; END IF;
 IF EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=program AND phase='pending' AND NOT cancelled) THEN RAISE EXCEPTION 'Stale pending not cancelled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mobile_notifications WHERE entity_id=program AND phase='approuvee' AND subscription_id=requester_subscription) THEN RAISE EXCEPTION 'Requester result missing'; END IF;
 BEGIN PERFORM mobile_review('irrigation',program,1,true,NULL); RAISE EXCEPTION 'Stale decision accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme déjà traité%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM save_irrigation_program(rejected,payload);PERFORM irrigation_program_action(rejected,'submit');
 PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
 PERFORM mobile_review('irrigation',rejected,1,false,'Planning à revoir');
 IF (SELECT status FROM irrigation_programs WHERE id=rejected)<>'rejetee' THEN RAISE EXCEPTION 'Refusal not applied'; END IF;
 -- Non-irrigation authorization path remains identical to the previous implementation.
 IF mobile_can_review('treatment',gen_random_uuid(),reviewer) OR mobile_can_review('stock_exit',gen_random_uuid(),reviewer) THEN RAISE EXCEPTION 'Legacy guard broken'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM mobile_approval_items(); RAISE EXCEPTION 'Anonymous mobile access accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Connexion requise%' THEN RAISE; END IF; END;
END $$;
SELECT 'PASS irrigation mobile: context, scope, self/revoked/stale denied, approval/refusal audit, opt-in, recipients, reminders, deduplication and cancellation. No notification dispatched; ROLLBACK.' AS verification;
