DO $$
DECLARE u UUID; items JSONB; code TEXT; d UUID; requester UUID; role UUID; policy UUID; request UUID; po UUID;
BEGIN
 SELECT id INTO u FROM profiles WHERE is_active LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 items:=mobile_approval_items();
 IF jsonb_typeof(items)<>'array' THEN RAISE EXCEPTION 'Inbox invalide'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE (x->>'requested_by')::uuid=u) THEN RAISE EXCEPTION 'Auto-validation visible'; END IF;
 code:=mobile_telegram_invite();
 IF NOT mobile_telegram_enroll(code,'99999999999999999') THEN RAISE EXCEPTION 'Association Telegram échouée'; END IF;
 IF mobile_telegram_enroll(code,'99999999999999999') THEN RAISE EXCEPTION 'Code réutilisable'; END IF;
 PERFORM mobile_telegram_disconnect();
 PERFORM mobile_refresh_notifications();
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF mobile_approval_items()<>'[]'::jsonb THEN RAISE EXCEPTION 'Accès étranger'; END IF;
 BEGIN
  PERFORM mobile_review('approval',gen_random_uuid(),1,true,NULL);
  RAISE EXCEPTION 'DENIAL_TEST_FAILED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='DENIAL_TEST_FAILED' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','public.mobile_claim_notifications()','EXECUTE') OR has_function_privilege('authenticated','public.mobile_claim_notifications()','EXECUTE') THEN RAISE EXCEPTION 'File accessible sans privilège serveur'; END IF;
 SELECT dm.user_id,dm.domain_id,dm.role_id INTO u,d,role FROM domain_memberships dm JOIN profiles p ON p.id=dm.user_id WHERE dm.is_active AND p.is_active AND dm.role_id IS NOT NULL LIMIT 1;
 SELECT id INTO requester FROM profiles WHERE is_active AND id<>u LIMIT 1;
 IF requester IS NULL OR u IS NULL THEN RAISE EXCEPTION 'Deux profils de test requis'; END IF;
 INSERT INTO approval_policies(domain_id,process_code,operation_type,name,approval_levels,responsible_role_id) VALUES(d,'purchase_order','qa-mobile-'||gen_random_uuid(),'QA mobile',2,role) RETURNING id INTO policy;
 INSERT INTO approval_policy_levels(policy_id,level_number,responsible_role_id) VALUES(policy,1,role),(policy,2,role);
 INSERT INTO purchase_orders(domain_id,po_number,supplier_id,status,order_date,currency) VALUES(d,'QA-MOBILE-'||left(gen_random_uuid()::text,8),(SELECT id FROM suppliers WHERE domain_id=d AND is_active LIMIT 1),'brouillon',current_date,'MAD') RETURNING id INTO po;
 INSERT INTO approval_requests(domain_id,policy_id,process_code,entity_id,requested_by,required_levels) VALUES(d,policy,'purchase_order',po,requester,2) RETURNING id INTO request;
 PERFORM set_config('request.jwt.claim.sub',requester::text,true);
 IF mobile_can_review('approval',request,requester) THEN RAISE EXCEPTION 'Auto-validation autorisée'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 UPDATE profiles SET must_change_password=false WHERE id=u;
 IF NOT mobile_can_review('approval',request,u) THEN RAISE EXCEPTION 'Responsable habilité refusé'; END IF;
 UPDATE profiles SET must_change_password=true WHERE id=u;
 IF mobile_can_review('approval',request,u) THEN RAISE EXCEPTION 'Session à mot de passe temporaire autorisée'; END IF;
 UPDATE profiles SET must_change_password=false WHERE id=u;
 PERFORM mobile_review('approval',request,1,true,'QA premier niveau');
 IF (SELECT current_level FROM approval_requests WHERE id=request)<>2 THEN RAISE EXCEPTION 'Niveau suivant non atteint'; END IF;
 BEGIN
  PERFORM mobile_review('approval',request,1,true,'QA répétition');
  RAISE EXCEPTION 'REPLAY_TEST_FAILED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='REPLAY_TEST_FAILED' THEN RAISE; END IF; END;
 IF mobile_can_review('approval',request,u) THEN RAISE EXCEPTION 'Même responsable aux deux niveaux'; END IF;
 IF (SELECT count(*) FROM approval_decisions WHERE request_id=request)<>1 THEN RAISE EXCEPTION 'Décision dupliquée'; END IF;
 INSERT INTO mobile_push_subscriptions(user_id,endpoint,keys) VALUES(u,'https://fcm.googleapis.com/qa-'||gen_random_uuid(),jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)));
 PERFORM mobile_queue(u,d,'approval',request,'pending','qa-outbox-'||request);
 IF NOT EXISTS(SELECT 1 FROM mobile_claim_notifications() WHERE entity_id=request) THEN RAISE EXCEPTION 'File non réclamée'; END IF;
 IF EXISTS(SELECT 1 FROM mobile_claim_notifications() WHERE entity_id=request) THEN RAISE EXCEPTION 'Envoi réclamé deux fois simultanément'; END IF;
END $$;
SELECT 'Tests mobile réussis ; transaction annulée' AS result;
