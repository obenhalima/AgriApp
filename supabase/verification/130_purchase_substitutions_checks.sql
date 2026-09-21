DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.purchase_phyto_substitutions'::regclass) THEN RAISE EXCEPTION 'Missing RLS'; END IF;
 IF has_table_privilege('authenticated','public.purchase_phyto_substitutions','INSERT') OR has_table_privilege('authenticated','public.purchase_phyto_substitutions','UPDATE') THEN RAISE EXCEPTION 'Direct mutation allowed'; END IF;
 IF has_function_privilege('anon','public.request_purchase_substitution(jsonb)','execute') OR has_function_privilege('anon','public.review_purchase_substitution(uuid,text,text)','execute') THEN RAISE EXCEPTION 'Anonymous execution allowed'; END IF;
 IF purchase_substitution_snapshot(gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Unexpected snapshot'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM request_purchase_substitution(jsonb_build_object('id',gen_random_uuid(),'line_id',gen_random_uuid()));
  RAISE EXCEPTION 'Anonymous request accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Demande de remplacement non autorisée%' THEN RAISE; END IF; END;
 BEGIN PERFORM review_purchase_substitution(gen_random_uuid(),'approuver','Recette SQL');
  RAISE EXCEPTION 'Anonymous decision accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Demande inaccessible%' THEN RAISE; END IF; END;
END $$;
DO $$
DECLARE d uuid; buyer uuid; reviewer uuid; wh uuid; farm uuid; original uuid; replacement uuid; entry uuid; supplier uuid;
 po uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); original_unit text;
 payload jsonb; reception jsonb; result_data jsonb; before_qty numeric; old_qty numeric; before_costs bigint; before_treatments bigint;
BEGIN
 SELECT w.domain_id,w.id,w.farm_id INTO d,wh,farm FROM warehouses w WHERE w.is_active AND w.farm_id IS NOT NULL AND EXISTS(SELECT 1 FROM phyto_positive_lists WHERE domain_id=w.domain_id AND status='active') ORDER BY w.id LIMIT 1;
 SELECT p.id INTO buyer FROM profiles p JOIN domain_memberships m ON m.user_id=p.id AND m.domain_id=d AND m.is_active WHERE p.is_active AND NOT coalesce(p.must_change_password,false) AND has_domain_permission(d,p.id,'achats','edit') AND has_business_capability(d,p.id,'treatment.validate',farm) ORDER BY p.id LIMIT 1;
 SELECT p.id INTO reviewer FROM profiles p JOIN domain_memberships m ON m.user_id=p.id AND m.domain_id=d AND m.is_active WHERE p.id<>buyer AND p.is_active AND NOT coalesce(p.must_change_password,false) AND has_business_capability(d,p.id,'treatment.validate',farm) AND EXISTS(SELECT 1 FROM user_function_assignments a JOIN operational_functions f ON f.id=a.function_id WHERE a.domain_id=d AND a.user_id=p.id AND a.is_active AND f.is_active AND f.code='responsable_phytosanitaire' AND (a.farm_id IS NULL OR a.farm_id=farm) AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE)) ORDER BY p.id LIMIT 1;
 SELECT s.id,e.id INTO replacement,entry FROM stock_items s JOIN plant_protection_products p ON p.id=s.plant_protection_product_id AND p.domain_id=d AND p.is_active
 JOIN phyto_positive_list_entries e ON e.product_id=p.id AND e.domain_id=d AND e.review_status='valide' AND e.station_approved
 JOIN phyto_positive_lists pl ON pl.id=e.list_id AND pl.domain_id=d AND pl.status='active'
 JOIN phyto_targets t ON t.id=e.target_id AND t.is_active
 JOIN product_authorized_uses u ON u.id=e.authorized_use_id AND u.domain_id=d AND u.product_id=p.id
 LEFT JOIN warehouse_stocks ws ON ws.stock_item_id=s.id AND ws.warehouse_id=wh
 WHERE s.domain_id=d AND s.is_active AND s.category='phytosanitaires' AND phyto_stock_unit_compatible(s.unit,u.dose_unit)
 AND (e.station_restriction_until IS NULL OR e.station_restriction_until>=CURRENT_DATE) AND (coalesce(ws.current_qty,0)=0 OR ws.valuation_verified) ORDER BY s.id,e.id LIMIT 1;
 SELECT id,unit INTO original,original_unit FROM stock_items WHERE domain_id=d AND is_active AND category='phytosanitaires' AND id<>replacement ORDER BY id LIMIT 1;
 SELECT id INTO supplier FROM suppliers WHERE domain_id=d ORDER BY id LIMIT 1;
 IF buyer IS NULL OR reviewer IS NULL OR replacement IS NULL OR original IS NULL OR supplier IS NULL THEN RAISE EXCEPTION 'Missing safe connected test fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',buyer::text,true);
 SELECT count(*) INTO before_costs FROM cost_entries;
 SELECT count(*) INTO before_treatments FROM treatment_requests;
 INSERT INTO purchase_orders(id,domain_id,po_number,supplier_id,status,order_date,currency,subtotal,total_amount,created_by,cost_category)
 VALUES(po,d,'QA130-'||left(po::text,8),supplier,'brouillon',CURRENT_DATE,'MAD',1000,1000,buyer,'phytosanitaires');
 INSERT INTO purchase_order_lines(id,domain_id,po_id,item_description,stock_item_id,unit,quantity,received_qty,unit_price,line_total)
 VALUES(line,d,po,'Recette transactionnelle annulée',original,original_unit,10,0,100,1000);
 INSERT INTO approval_requests(domain_id,process_code,entity_id,status,requested_by,completed_at) VALUES(d,'purchase_order',po,'approuvee',buyer,now()) ON CONFLICT(process_code,entity_id) DO UPDATE SET status='approuvee';
 UPDATE purchase_orders SET status='envoye' WHERE id=po;
 payload:=jsonb_build_object('id',request,'line_id',line,'warehouse_id',wh,'replacement_stock_item_id',replacement,'positive_entry_id',entry,'ordered_qty',5,'delivered_qty',2.5,'unit_price',1,'reason','Recette sans persistance');
 BEGIN PERFORM request_purchase_substitution(payload||jsonb_build_object('unit_price',1000)); RAISE EXCEPTION 'Surcost accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Surcoût fournisseur%' THEN RAISE; END IF; END;
 BEGIN PERFORM request_purchase_substitution(payload||jsonb_build_object('warehouse_id',gen_random_uuid())); RAISE EXCEPTION 'Foreign warehouse accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Entrepôt actif%' THEN RAISE; END IF; END;
 IF request_purchase_substitution(payload)<>request OR request_purchase_substitution(payload)<>request THEN RAISE EXCEPTION 'Request idempotency failure'; END IF;
 BEGIN PERFORM request_purchase_substitution(payload||jsonb_build_object('delivered_qty',3)); RAISE EXCEPTION 'Changed retry accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Identifiant de demande déjà utilisé%' THEN RAISE; END IF; END;
 BEGIN PERFORM review_purchase_substitution(request,'approuver','Recette de validation'); RAISE EXCEPTION 'Self-review accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Responsable phyto habilité distinct%' THEN RAISE; END IF; END;
 reception:=jsonb_build_object('id',receipt,'warehouse_id',wh,'date',CURRENT_DATE,'lines',jsonb_build_array(jsonb_build_object('lineId',line,'qtyReceived',5,'substitutionId',request)));
 BEGIN PERFORM receive_costed_purchase(po,reception); RAISE EXCEPTION 'Unapproved receipt accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Remplacement approuvé%' THEN RAISE; END IF; END;
 BEGIN PERFORM receive_costed_purchase(po,reception||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('lineId',line,'qtyReceived',5)))); RAISE EXCEPTION 'Standard bypass accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Remplacement en cours%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF can_read_purchase_substitution(d,wh) THEN RAISE EXCEPTION 'Foreign read accepted'; END IF;
 BEGIN PERFORM review_purchase_substitution(request,'approuver','Recette de validation'); RAISE EXCEPTION 'Foreign review accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Demande inaccessible%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
 PERFORM review_purchase_substitution(request,'approuver','Recette de validation');
 PERFORM set_config('request.jwt.claim.sub',buyer::text,true);
 BEGIN PERFORM receive_costed_purchase(po,reception||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('lineId',line,'qtyReceived',4,'substitutionId',request)))); RAISE EXCEPTION 'Wrong amount accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Remplacement approuvé%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE stock_items SET name=name||' QA130' WHERE id=replacement;
  PERFORM receive_costed_purchase(po,reception); RAISE EXCEPTION 'Changed source accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Sources du remplacement modifiées%' THEN RAISE; END IF; END;
 SELECT coalesce((SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=replacement),0) INTO before_qty;
 SELECT coalesce((SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=original),0) INTO old_qty;
 result_data:=receive_costed_purchase(po,reception);
 IF receive_costed_purchase(po,reception)<>result_data THEN RAISE EXCEPTION 'Receipt idempotency failure'; END IF;
 IF (SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=replacement)<>before_qty+2.5 THEN RAISE EXCEPTION 'Wrong replacement stock quantity'; END IF;
 IF coalesce((SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=original),0)<>old_qty THEN RAISE EXCEPTION 'Original stock changed'; END IF;
 IF (SELECT count(*) FROM stock_movements WHERE po_id=po)<>1 OR NOT EXISTS(SELECT 1 FROM stock_movements WHERE po_id=po AND stock_item_id=replacement AND quantity=2.5 AND unit_cost=1) THEN RAISE EXCEPTION 'Wrong costed movement'; END IF;
 IF (SELECT received_qty FROM purchase_order_lines WHERE id=line)<>5 OR (SELECT status FROM purchase_phyto_substitutions WHERE id=request)<>'receptionne' THEN RAISE EXCEPTION 'Wrong receipt tracking'; END IF;
 IF (SELECT count(*) FROM cost_entries)<>before_costs OR (SELECT count(*) FROM treatment_requests)<>before_treatments THEN RAISE EXCEPTION 'Receipt changed treatment or charged expenses'; END IF;
END $$;
SELECT 'PASS: schema, access, request/retry, self/foreign-review rejection, overrun, source change, approved receipt, exact stock and price, no duplicate, no treatment/expense writes; transaction rolled back' AS verification;
