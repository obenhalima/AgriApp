-- À exécuter dans une transaction annulée. Aucune donnée de recette n'est conservée.
DO $$
#variable_conflict use_variable
DECLARE source treatment_requests%ROWTYPE; p treatment_request_products%ROWTYPE; actor UUID; request_id UUID; line_id UUID; s JSONB; fp TEXT; checks JSONB; fn UUID; denied BOOLEAN;
BEGIN
 IF station_risk('V')<>'green' OR station_risk('O')<>'yellow' OR station_risk('R*')<>'red' OR station_risk(NULL)<>'unknown' THEN RAISE EXCEPTION 'Mapping des couleurs incorrect'; END IF;
 IF has_function_privilege('authenticated','public.treatment_station_snapshot(uuid)','EXECUTE') OR has_table_privilege('authenticated','public.treatment_station_attestations','INSERT') THEN RAISE EXCEPTION 'Privilèges trop larges'; END IF;
 SELECT r.* INTO source FROM treatment_requests r WHERE EXISTS(SELECT 1 FROM treatment_request_products pp JOIN phyto_positive_list_entries e ON e.product_id=pp.catalog_product_id JOIN phyto_positive_lists l ON l.id=e.list_id AND l.status='active' WHERE pp.treatment_request_id=r.id AND e.domain_id=r.domain_id AND e.review_status='valide') LIMIT 1;
 IF source.id IS NULL THEN RAISE EXCEPTION 'Prescription de recette avec liste active requise'; END IF;
 SELECT dm.user_id INTO actor FROM domain_memberships dm JOIN profiles u ON u.id=dm.user_id WHERE dm.domain_id=source.domain_id AND dm.is_active AND u.is_active AND u.id<>source.requested_by AND is_domain_admin(dm.domain_id,u.id) LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Administrateur distinct du demandeur requis pour la recette'; END IF;
 UPDATE profiles SET must_change_password=false WHERE id=actor;
 SELECT id INTO fn FROM operational_functions WHERE code='responsable_exploitation';
 INSERT INTO user_function_assignments(domain_id,user_id,function_id,valid_from) VALUES(source.domain_id,actor,fn,current_date) ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO treatment_requests(domain_id,campaign_planting_id,warehouse_id,planned_at,target_name,diagnosis,justification,treated_area_m2,water_volume_liters,requested_by)
 VALUES(source.domain_id,source.campaign_planting_id,source.warehouse_id,now()+interval '1 day',source.target_name,'Recette Station','Recette transaction annulée',source.treated_area_m2,source.water_volume_liters,source.requested_by) RETURNING id INTO request_id;
 SELECT * INTO p FROM treatment_request_products WHERE treatment_request_id=source.id AND catalog_product_id IS NOT NULL LIMIT 1;
 line_id:=gen_random_uuid();
 INSERT INTO treatment_request_products SELECT (jsonb_populate_record(NULL::treatment_request_products,to_jsonb(p)||jsonb_build_object('id',line_id,'treatment_request_id',request_id,'actual_quantity',NULL,'label_confirmed',true))).*;
 IF can_attest_treatment_station(request_id,source.requested_by) OR can_attest_treatment_station(request_id,gen_random_uuid()) THEN RAISE EXCEPTION 'Auto-validation ou accès étranger autorisé'; END IF;
 IF NOT can_attest_treatment_station(request_id,actor) THEN RAISE EXCEPTION 'Responsable de recette refusé'; END IF;
 UPDATE phyto_positive_list_entries SET risk_class='O',station_restriction_until=NULL WHERE domain_id=source.domain_id AND product_id=p.catalog_product_id;
 s:=treatment_station_snapshot(request_id); fp:=md5(s::text);
 IF s->'lines'->0->>'risk' IS DISTINCT FROM 'yellow' THEN RAISE EXCEPTION 'Produit de recette non associé à la cible Station : %',s; END IF;
 BEGIN PERFORM review_treatment_request(request_id,true,NULL); RAISE EXCEPTION 'BYPASS_1'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_1' THEN RAISE; END IF; END;
 BEGIN UPDATE treatment_requests SET status='approuvee' WHERE id=request_id; RAISE EXCEPTION 'BYPASS_2'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_2' THEN RAISE; END IF; END;
 BEGIN PERFORM review_treatment_station(request_id,true,NULL,fp,'[]'); RAISE EXCEPTION 'BYPASS_3'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_3' THEN RAISE; END IF; END;
 checks:=jsonb_build_array(jsonb_build_object('line_id',line_id,'station_agreed',true));
 UPDATE phyto_positive_list_entries SET risk_class='R' WHERE domain_id=source.domain_id AND product_id=p.catalog_product_id;
 BEGIN PERFORM review_treatment_station(request_id,true,NULL,fp,checks); RAISE EXCEPTION 'BYPASS_4'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_4' THEN RAISE; END IF; END;
 fp:=md5(treatment_station_snapshot(request_id)::text);
 BEGIN PERFORM review_treatment_station(request_id,true,NULL,fp,checks); RAISE EXCEPTION 'BYPASS_5'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_5' THEN RAISE; END IF; END;
 checks:=jsonb_build_array(jsonb_build_object('line_id',line_id,'station_agreed',true,'restrictions_checked',true));
 UPDATE phyto_positive_list_entries SET station_restriction_until=current_date-1 WHERE domain_id=source.domain_id AND product_id=p.catalog_product_id;
 fp:=md5(treatment_station_snapshot(request_id)::text);
 BEGIN PERFORM review_treatment_station(request_id,true,NULL,fp,checks); RAISE EXCEPTION 'BYPASS_6'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_6' THEN RAISE; END IF; END;
 UPDATE phyto_positive_list_entries SET station_restriction_until=NULL WHERE domain_id=source.domain_id AND product_id=p.catalog_product_id;
 fp:=md5(treatment_station_snapshot(request_id)::text);
 PERFORM review_treatment_station(request_id,true,NULL,fp,checks);
 IF (SELECT status FROM treatment_requests WHERE id=request_id)<>'approuvee' OR (SELECT count(*) FROM treatment_station_attestations a WHERE a.request_id=request_id)<>1 THEN RAISE EXCEPTION 'Validation ou trace absente'; END IF;
 BEGIN PERFORM review_treatment_station(request_id,true,NULL,fp,checks); RAISE EXCEPTION 'BYPASS_7'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_7' THEN RAISE; END IF; END;
 BEGIN UPDATE treatment_request_products SET product_name='Modification interdite' WHERE id=line_id; RAISE EXCEPTION 'BYPASS_8'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='BYPASS_8' THEN RAISE; END IF; END;
 IF (get_treatment_station_review(request_id)->'history'->0->'snapshot'->'lines'->0->>'risk')<>'red' THEN RAISE EXCEPTION 'Couleur historique perdue'; END IF;
END $$;
SELECT 'Recette Station : contrôles serveur, double clic, source modifiée et historique OK ; transaction annulée' AS result;
