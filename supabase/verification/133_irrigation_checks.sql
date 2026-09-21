-- À exécuter uniquement dans la transaction de test terminée par ROLLBACK.
DO $$
#variable_conflict use_variable
DECLARE d uuid; f uuid; c uuid; g uuid; actor uuid; reviewer uuid; id uuid:=gen_random_uuid(); id2 uuid:=gen_random_uuid();
 payload jsonb; actual jsonb; occurrence uuid; n bigint;
BEGIN
 SELECT ca.domain_id,ca.farm_id,ca.id,gh.id INTO d,f,c,g FROM campaigns ca JOIN farms fa ON fa.id=ca.farm_id AND fa.is_active
 JOIN greenhouses gh ON gh.farm_id=ca.farm_id AND fa.domain_id=ca.domain_id AND gh.status='active'
 WHERE (SELECT count(*) FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=ca.domain_id AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(ca.domain_id,p.id,'agronomie','view'))>=2 LIMIT 1;
 SELECT p.id INTO actor FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=d AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(d,p.id,'agronomie','view') ORDER BY p.id LIMIT 1;
 SELECT p.id INTO reviewer FROM domain_memberships m JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=d AND m.is_active AND p.is_active AND NOT p.must_change_password AND has_domain_permission(d,p.id,'agronomie','view') AND p.id<>actor ORDER BY p.id LIMIT 1;
 IF reviewer IS NULL OR g IS NULL THEN RAISE EXCEPTION 'Fixture impossible : une ferme et deux membres actifs agronomie sont requis'; END IF;
 -- Test-only grants, never committed. Only the new capabilities are touched.
 DELETE FROM user_capability_overrides WHERE domain_id=d AND user_id IN(actor,reviewer) AND capability_id IN(SELECT bc.id FROM business_capabilities bc WHERE process_code='irrigation');
 INSERT INTO user_capability_overrides(domain_id,farm_id,user_id,capability_id,granted,reason)
 SELECT d,f,u.id,bc.id,true,'Recette transaction annulée' FROM (VALUES(actor),(reviewer)) u(id) CROSS JOIN business_capabilities bc WHERE bc.process_code='irrigation';
 IF has_table_privilege('authenticated','irrigation_programs','INSERT') OR has_table_privilege('authenticated','irrigation_occurrences','UPDATE') OR has_function_privilege('anon','save_irrigation_program(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Privilèges non sûrs'; END IF;
 IF irrigation_water('{"mode":"duration","minutes":30,"flow":1200}')<>600 OR irrigation_water('{"mode":"meter","before":100,"after":102.25}',true)<>2250 THEN RAISE EXCEPTION 'Calcul eau incorrect'; END IF;
 BEGIN PERFORM irrigation_water('{"mode":"volume","volume":"NaN"}'); RAISE EXCEPTION 'NaN accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Volume positif%' THEN RAISE; END IF; END;
 BEGIN PERFORM irrigation_water('{"mode":"meter","before":20,"after":10}',true); RAISE EXCEPTION 'Reversed meter accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Index compteur%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM irrigation_workspace(d); RAISE EXCEPTION 'Anonymous accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 BEGIN PERFORM irrigation_workspace(gen_random_uuid()); RAISE EXCEPTION 'Foreign domain accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE; END IF; END;
 payload:=jsonb_build_object('domain_id',d,'farm_id',f,'campaign_id',c,'greenhouse_ids',jsonb_build_array(g),'title','Recette irrigation annulée','water_source','Bassin QA','water',jsonb_build_object('mode','duration','minutes',30,'flow',1200),'dates',jsonb_build_array(now()+interval '1 day',now()+interval '2 days'));
 BEGIN PERFORM save_irrigation_program(id,payload||jsonb_build_object('greenhouse_ids',jsonb_build_array(gen_random_uuid()))); RAISE EXCEPTION 'Foreign greenhouse accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Sélectionnez des serres%' THEN RAISE; END IF; END;
 BEGIN PERFORM save_irrigation_program(id,payload||'{"products":[]}'); RAISE EXCEPTION 'Products accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Irrigation simple%' THEN RAISE; END IF; END;
 PERFORM save_irrigation_program(id,payload); PERFORM save_irrigation_program(id,payload);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(irrigation_workspace(d)->'programs') value WHERE value->>'id'=id::text) THEN RAISE EXCEPTION 'Programme absent du workspace'; END IF;
 IF (SELECT count(*) FROM irrigation_occurrences WHERE program_id=id)<>2 THEN RAISE EXCEPTION 'Duplicate occurrences'; END IF;
 INSERT INTO irrigation_settings VALUES(d,true) ON CONFLICT(domain_id) DO UPDATE SET validation_enabled=true;
 PERFORM irrigation_program_action(id,'submit');
 UPDATE irrigation_settings SET validation_enabled=false WHERE domain_id=d;
 IF (SELECT status FROM irrigation_programs WHERE irrigation_programs.id=id)<>'soumise' THEN RAISE EXCEPTION 'Policy snapshot changed'; END IF;
 BEGIN PERFORM irrigation_program_action(id,'approve'); RAISE EXCEPTION 'Self approval accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Validation par une autre%' THEN RAISE; END IF; END;
 SELECT io.id INTO occurrence FROM irrigation_occurrences io WHERE program_id=id ORDER BY planned_at LIMIT 1;
 actual:=jsonb_build_object('water',jsonb_build_object('mode','meter','before',100,'after',102.25),'performed_at',now(),'notes','Mesure relevée QA');
 BEGIN PERFORM confirm_irrigation_occurrence(occurrence,actual); RAISE EXCEPTION 'Execution without approval accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme non approuvé%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
 UPDATE user_capability_overrides SET granted=false WHERE domain_id=d AND user_id=reviewer AND capability_id=(SELECT bc.id FROM business_capabilities bc WHERE code='irrigation.validate');
 BEGIN PERFORM irrigation_program_action(id,'approve'); RAISE EXCEPTION 'Approval without capability accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Validation par une autre%' THEN RAISE; END IF; END;
 UPDATE user_capability_overrides SET granted=true WHERE domain_id=d AND user_id=reviewer AND capability_id=(SELECT bc.id FROM business_capabilities bc WHERE code='irrigation.validate');
 PERFORM irrigation_program_action(id,'approve');
 PERFORM irrigation_program_action(id,'approve');
 SELECT count(*) INTO n FROM stock_movements;
 PERFORM confirm_irrigation_occurrence(occurrence,actual); PERFORM confirm_irrigation_occurrence(occurrence,actual);
 IF (SELECT actual_liters FROM irrigation_occurrences WHERE irrigation_occurrences.id=occurrence)<>2250 THEN RAISE EXCEPTION 'Real water wrong'; END IF;
 IF (SELECT status FROM irrigation_programs WHERE irrigation_programs.id=id)<>'approuvee' THEN RAISE EXCEPTION 'Premature completion'; END IF;
 BEGIN PERFORM confirm_irrigation_occurrence(occurrence,actual||'{"notes":"Modification interdite"}'); RAISE EXCEPTION 'Overwrite accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Occurrence déjà confirmée%' THEN RAISE; END IF; END;
 PERFORM irrigation_program_action(id,'cancel','Annulation de la suite QA');
 IF (SELECT count(*) FROM irrigation_occurrences WHERE program_id=id AND confirmed_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'History lost'; END IF;
 SELECT io.id INTO occurrence FROM irrigation_occurrences io WHERE program_id=id AND confirmed_at IS NULL LIMIT 1;
 BEGIN PERFORM confirm_irrigation_occurrence(occurrence,actual); RAISE EXCEPTION 'Cancelled execution accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Programme non approuvé%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM save_irrigation_program(id2,payload||jsonb_build_object('dates',jsonb_build_array(now()+interval '1 day')));
 PERFORM irrigation_program_action(id2,'submit');
 IF (SELECT status FROM irrigation_programs WHERE irrigation_programs.id=id2)<>'approuvee' OR (SELECT reviewed_by FROM irrigation_programs WHERE irrigation_programs.id=id2) IS NOT NULL THEN RAISE EXCEPTION 'Disabled validation misrepresented'; END IF;
 SELECT io.id INTO occurrence FROM irrigation_occurrences io WHERE program_id=id2;
 PERFORM confirm_irrigation_occurrence(occurrence,actual);
 IF (SELECT status FROM irrigation_programs WHERE irrigation_programs.id=id2)<>'terminee' THEN RAISE EXCEPTION 'Completion missing'; END IF;
 IF (SELECT count(*) FROM stock_movements)<>n THEN RAISE EXCEPTION 'Water consumed stock'; END IF;
END $$;
SELECT 'PASS irrigation : accès, périmètre, calculs, idempotence, validation séparée, réalisé, annulation et absence de mouvement stock. ROLLBACK requis.' AS verification;
