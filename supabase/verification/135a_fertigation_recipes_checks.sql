-- Only run inside the ROLLBACK wrapper in scripts/check-fertigation-recipes-sql.mjs.
DO $$
DECLARE d uuid; f uuid; actor uuid; wh uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); liquid uuid:=gen_random_uuid(); recipe uuid:=gen_random_uuid();
 payload jsonb; lines jsonb; result jsonb; before_moves bigint; before_costs bigint;
BEGIN
 SELECT fa.domain_id,fa.id,p.id INTO d,f,actor FROM farms fa JOIN domain_memberships m ON m.domain_id=fa.domain_id
 JOIN profiles p ON p.id=m.user_id WHERE fa.is_active AND m.is_active AND p.is_active AND NOT coalesce(p.must_change_password,false)
 AND has_domain_permission(fa.domain_id,p.id,'agronomie','view') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Fixture : membre actif agronomie et ferme requis'; END IF;
 DELETE FROM user_capability_overrides WHERE domain_id=d AND user_id=actor AND capability_id=(SELECT id FROM business_capabilities WHERE code='fertigation.recipe');
 INSERT INTO user_capability_overrides(domain_id,farm_id,user_id,capability_id,granted,reason)
 SELECT d,f,actor,id,true,'QA transaction annulée' FROM business_capabilities WHERE code='fertigation.recipe';
 INSERT INTO warehouses(id,domain_id,farm_id,code,name,warehouse_type) VALUES(wh,d,f,'QA-'||left(wh::text,20),'QA engrais transaction annulée','intrants');
 INSERT INTO stock_items(id,domain_id,code,name,category,unit) VALUES
 (item,d,'QA-'||left(item::text,20),'Engrais solide QA','engrais','kg'),(liquid,d,'QA-'||left(liquid::text,20),'Engrais liquide QA','engrais','l');
 SELECT count(*) INTO before_moves FROM stock_movements;
 SELECT count(*) INTO before_costs FROM cost_entries;
 IF has_table_privilege('authenticated','fertigation_recipes','INSERT') OR has_table_privilege('authenticated','fertigation_recipes','SELECT') OR has_function_privilege('anon','save_fertigation_recipe(uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','fertigation_lines(uuid,numeric,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 lines:=jsonb_build_array(jsonb_build_object('stock_item_id',item,'dose',1250,'dose_unit','g_m3'),jsonb_build_object('stock_item_id',liquid,'dose',250,'dose_unit','ml_m3'));
 payload:=jsonb_build_object('domain_id',d,'farm_id',f,'name','Recette QA annulée','basis','final_solution','lines',lines);
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM fertigation_workspace(d); RAISE EXCEPTION 'Anonymous accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 BEGIN PERFORM save_fertigation_recipe(recipe,payload||jsonb_build_object('farm_id',gen_random_uuid())); RAISE EXCEPTION 'Foreign farm accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Habilitation recette%' THEN RAISE; END IF; END;
 BEGIN PERFORM save_fertigation_recipe(recipe,payload||'{"basis":"mother_tank"}'); RAISE EXCEPTION 'Mother tank accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recette exprimée%' THEN RAISE; END IF; END;
 BEGIN PERFORM preview_fertigation_recipe(d,f,gen_random_uuid(),10000,lines); RAISE EXCEPTION 'Foreign warehouse accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Entrepôt actif%' THEN RAISE; END IF; END;
 BEGIN PERFORM fertigation_lines(d,1000,jsonb_build_array(jsonb_build_object('stock_item_id',item,'dose',1,'dose_unit','l_m3'))); RAISE EXCEPTION 'Dimension mismatch accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Unité incompatible%' THEN RAISE; END IF; END;
 BEGIN PERFORM fertigation_lines(d,1000,lines||lines); RAISE EXCEPTION 'Duplicate accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Engrais en double%' THEN RAISE; END IF; END;
 BEGIN PERFORM fertigation_lines(d,'NaN',lines); RAISE EXCEPTION 'NaN accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Volume final%' THEN RAISE; END IF; END;
 PERFORM save_fertigation_recipe(recipe,payload); PERFORM save_fertigation_recipe(recipe,payload);
 IF (SELECT count(*) FROM fertigation_recipes WHERE id=recipe)<>1 THEN RAISE EXCEPTION 'Retry duplicated recipe'; END IF;
 BEGIN PERFORM save_fertigation_recipe(recipe,payload||'{"name":"Changed"}'); RAISE EXCEPTION 'Overwrite accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recette déjà enregistrée%' THEN RAISE; END IF; END;
 result:=preview_fertigation_recipe(d,f,wh,10000,lines);
 IF (result#>>'{lines,0,quantity}')::numeric<>12.5 OR (result#>>'{lines,1,quantity}')::numeric<>2.5 OR (result#>>'{lines,0,missing}')::numeric<>12.5 THEN RAISE EXCEPTION 'Wrong quantities/missing stock %',result; END IF;
 -- New warehouse has zero stock even when another warehouse holds the same product.
 INSERT INTO warehouse_stocks(warehouse_id,stock_item_id,domain_id,current_qty) VALUES(wh,item,d,20) ON CONFLICT(warehouse_id,stock_item_id) DO UPDATE SET current_qty=20;
 result:=preview_fertigation_recipe(d,f,wh,10000,lines);
 IF (result#>>'{lines,0,missing}')::numeric<>0 OR (result#>>'{lines,0,available}')::numeric<>20 THEN RAISE EXCEPTION 'Wrong warehouse balance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fertigation_workspace(d)->'recipes') r WHERE r->>'id'=recipe::text) THEN RAISE EXCEPTION 'Recipe missing'; END IF;
 UPDATE user_capability_overrides SET granted=false WHERE domain_id=d AND user_id=actor AND capability_id=(SELECT id FROM business_capabilities WHERE code='fertigation.recipe');
 BEGIN PERFORM save_fertigation_recipe(gen_random_uuid(),payload); RAISE EXCEPTION 'Unauthorized save'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Habilitation recette%' THEN RAISE; END IF; END;
 BEGIN PERFORM fertigation_workspace(gen_random_uuid()); RAISE EXCEPTION 'Cross-domain read'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Accès agronomie%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM stock_movements)<>before_moves OR (SELECT count(*) FROM cost_entries)<>before_costs THEN RAISE EXCEPTION 'Unexpected stock/cost writes'; END IF;
 RAISE NOTICE 'PASS 135A: units, calculations, stock warning, scope, capability, immutable retry, no movements or costs. All rolled back.';
END $$;
