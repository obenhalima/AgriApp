-- À exécuter dans BEGIN / ROLLBACK, après 125.
DO $$
#variable_conflict use_variable
DECLARE source treatment_requests%ROWTYPE; first_entry RECORD; second_entry RECORD;
 products JSONB; request JSONB; plan JSONB; schedule UUID; rid UUID; review_user UUID;
 snapshot JSONB; line JSONB; confirmations JSONB; rejected BOOLEAN; expected NUMERIC;
 original_count BIGINT; target_name TEXT; dar JSONB; wrong_target UUID;
BEGIN
 SELECT * INTO source FROM treatment_requests r WHERE warehouse_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=r.requested_by AND p.is_active)
 AND has_domain_permission(r.domain_id,r.requested_by,'agronomie','create') LIMIT 1;
 IF source.id IS NULL THEN RAISE EXCEPTION 'Recette : ferme, entrepôt et prescripteur requis'; END IF;
 SELECT e.*,u.dose_min,u.dose_max,u.dose_unit,u.phi_days,u.rei_hours INTO first_entry
 FROM v_active_station_phyto_products e JOIN phyto_targets t ON t.id=e.target_id
 JOIN LATERAL treatment_planning_use(e.product_id,e.domain_id,t.canonical_name) u ON true
 WHERE e.domain_id=source.domain_id AND t.is_active AND t.is_verified AND t.merged_into_id IS NULL
 AND u.dose_max>0 AND normalize_phyto_dose_unit(u.dose_unit) IN ('ml_100l','g_100l','kg_ha','l_ha') LIMIT 1;
 SELECT e.*,u.dose_min,u.dose_max,u.dose_unit,u.phi_days,u.rei_hours INTO second_entry
 FROM v_active_station_phyto_products e JOIN phyto_targets t ON t.id=e.target_id
 JOIN LATERAL treatment_planning_use(e.product_id,e.domain_id,t.canonical_name) u ON true
 WHERE e.domain_id=source.domain_id AND t.is_active AND t.is_verified AND t.merged_into_id IS NULL
 AND e.product_id<>first_entry.product_id AND e.target_id<>first_entry.target_id
 AND u.dose_max>0 AND normalize_phyto_dose_unit(u.dose_unit) IN ('ml_100l','g_100l','kg_ha','l_ha') LIMIT 1;
 IF first_entry.product_id IS NULL OR second_entry.product_id IS NULL THEN RAISE EXCEPTION 'Recette : deux produits pour deux cibles vérifiées requis'; END IF;
 PERFORM set_config('request.jwt.claim.sub',source.requested_by::text,true);
 products:=jsonb_build_array(
 jsonb_build_object('catalog_product_id',first_entry.product_id,'biological_target_id',first_entry.target_id,'target_name','nom forgé ignoré','dose',coalesce(nullif(first_entry.dose_min,0),first_entry.dose_max),'dose_unit',first_entry.dose_unit,'planned_quantity',1,'phi_days',coalesce(first_entry.phi_days,0),'rei_hours',coalesce(first_entry.rei_hours,0),'label_confirmed',true),
 jsonb_build_object('catalog_product_id',second_entry.product_id,'biological_target_id',second_entry.target_id,'target_name','autre nom forgé','dose',coalesce(nullif(second_entry.dose_min,0),second_entry.dose_max),'dose_unit',second_entry.dose_unit,'planned_quantity',1,'phi_days',coalesce(second_entry.phi_days,0),'rei_hours',coalesce(second_entry.rei_hours,0),'label_confirmed',true));
 request:=jsonb_build_object('domain_id',source.domain_id,'warehouse_id',source.warehouse_id,
 'target_planting_ids',jsonb_build_array(source.campaign_planting_id),'target_name','faux résumé',
 'diagnosis','QA multicible','justification','Transaction annulée','treated_area_m2',source.treated_area_m2,'water_volume_liters',1000);
 plan:=jsonb_build_object('schedule_mode','exact_dates','exact_dates',jsonb_build_array(now()+interval '1 day',now()+interval '8 days'));
 SELECT count(*) INTO original_count FROM treatment_requests;
 schedule:=submit_treatment_schedule_multitarget(plan,request,products);
 IF (SELECT count(*) FROM treatment_requests WHERE schedule_id=schedule)<>2 THEN RAISE EXCEPTION 'Occurrences manquantes'; END IF;
 FOR rid IN SELECT id FROM treatment_requests WHERE schedule_id=schedule LOOP
  IF (SELECT count(DISTINCT biological_target_id) FROM treatment_request_products WHERE treatment_request_id=rid)<>2 THEN RAISE EXCEPTION 'Cibles des lignes perdues'; END IF;
  IF EXISTS(SELECT 1 FROM treatment_request_products p JOIN phyto_targets t ON t.id=p.biological_target_id WHERE p.treatment_request_id=rid AND p.target_name<>t.canonical_name) THEN RAISE EXCEPTION 'Nom non canonique'; END IF;
  FOR line IN SELECT to_jsonb(p) FROM treatment_request_products p WHERE treatment_request_id=rid LOOP
   expected:=round((line->>'dose')::numeric*CASE WHEN line->>'dose_unit' IN ('ml_100l','g_100l') THEN 10 ELSE source.treated_area_m2/10000 END,4);
   IF (line->>'planned_quantity')::numeric<>expected THEN RAISE EXCEPTION 'Calcul par usage incorrect : %',line; END IF;
  END LOOP;
  IF (SELECT stock_status FROM v_treatment_stock_forecast WHERE request_id=rid) IS DISTINCT FROM 'non_disponible' THEN RAISE EXCEPTION 'Sans stock annoncé disponible'; END IF;
 END LOOP;
 -- Le second produit invalide annule toute la planification, pas seulement sa ligne.
 rejected:=false;
 BEGIN
  PERFORM submit_treatment_schedule_multitarget(plan,request,jsonb_set(products,'{1,biological_target_id}',to_jsonb(gen_random_uuid()::text)));
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Cible biologique%' THEN RAISE; END IF; rejected:=true;
 END;
 IF NOT rejected OR (SELECT count(*) FROM treatment_requests)<>original_count+2 THEN RAISE EXCEPTION 'Plan partiel conservé'; END IF;
 rejected:=false;
 BEGIN PERFORM submit_treatment_schedule_multitarget(plan,request,jsonb_build_array(products->0,products->0));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Un produit ne doit%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Doublon accepté'; END IF;
 rejected:=false;
 BEGIN PERFORM submit_treatment_schedule_multitarget(plan,request,jsonb_set(products,'{0,dose}',to_jsonb(first_entry.dose_max+1)));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Dose hors intervalle%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Surdosage accepté'; END IF;
 SELECT t.id INTO wrong_target FROM phyto_targets t WHERE t.is_active AND t.is_verified AND t.merged_into_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM v_active_station_phyto_products e WHERE e.domain_id=source.domain_id AND e.product_id=first_entry.product_id AND e.target_id=t.id) LIMIT 1;
 IF wrong_target IS NULL THEN RAISE EXCEPTION 'Recette : cible sans lien nécessaire'; END IF;
 rejected:=false;
 BEGIN PERFORM submit_treatment_schedule_multitarget(plan,request,jsonb_set(products,'{0,biological_target_id}',to_jsonb(wrong_target::text)));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Produit non lié à la cible%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Produit lié à une autre cible accepté'; END IF;
 rejected:=false;
 BEGIN PERFORM submit_treatment_schedule_multitarget(plan,request,jsonb_set(products,'{0,catalog_product_id}',to_jsonb(gen_random_uuid()::text)));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Produit du référentiel absent%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Produit étranger accepté'; END IF;
 IF has_function_privilege('anon','public.submit_treatment_schedule_multitarget(jsonb,jsonb,jsonb)','execute') THEN RAISE EXCEPTION 'Accès anonyme autorisé'; END IF;
 -- Couleurs distinctes par cible : un résumé multicible ne doit pas casser les sources.
 UPDATE phyto_positive_list_entries SET risk_class=CASE WHEN product_id=first_entry.product_id THEN 'O' ELSE 'R' END,station_restriction_until=NULL
 WHERE domain_id=source.domain_id AND product_id IN (first_entry.product_id,second_entry.product_id);
 snapshot:=treatment_station_snapshot(rid);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'lines') l WHERE l->>'risk'='yellow')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'lines') l WHERE l->>'risk'='red')
 THEN RAISE EXCEPTION 'Sources Station multicibles incorrectes : %',snapshot; END IF;
 IF can_attest_treatment_station(rid,source.requested_by) THEN RAISE EXCEPTION 'Auto-validation autorisée'; END IF;
 SELECT dm.user_id INTO review_user FROM domain_memberships dm JOIN profiles p ON p.id=dm.user_id
 WHERE dm.domain_id=source.domain_id AND dm.is_active AND p.is_active AND dm.user_id<>source.requested_by
 AND is_domain_admin(dm.domain_id,dm.user_id) LIMIT 1;
 IF review_user IS NULL THEN RAISE EXCEPTION 'Recette : valideur distinct requis'; END IF;
 UPDATE profiles SET must_change_password=false WHERE id=review_user;
 INSERT INTO user_function_assignments(domain_id,user_id,function_id,valid_from)
 SELECT source.domain_id,review_user,id,current_date FROM operational_functions WHERE code='responsable_exploitation' ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',review_user::text,true);
 rejected:=false;
 BEGIN PERFORM review_treatment_station(rid,true,NULL,md5(snapshot::text),'[]');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%accord Station à confirmer%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Accords non cochés acceptés'; END IF;
 SELECT jsonb_agg(jsonb_build_object('line_id',l->>'line_id','station_agreed',true,'restrictions_checked',true)) INTO confirmations FROM jsonb_array_elements(snapshot->'lines') l;
 PERFORM review_treatment_station(rid,true,NULL,md5(snapshot::text),confirmations);
 rejected:=false;
 BEGIN UPDATE treatment_request_products SET biological_target_id=second_entry.target_id WHERE treatment_request_id=rid AND catalog_product_id=first_entry.product_id;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Prescription attestée%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Changement de cible après accord accepté'; END IF;
 -- L'instantané DAR reste produit/ligne/serre, sans toucher aux anciennes applications.
 dar:=build_treatment_dar_snapshot(rid,'[]');
 IF jsonb_array_length(dar)<>2 THEN RAISE EXCEPTION 'Instantané DAR incomplet'; END IF;
END $$;
SELECT '125 : multicibles, calculs, occurrences, stock manquant, atomicité, Station, auto-validation et DAR contrôlés ; ROLLBACK requis' AS result;
