-- À exécuter avec 115/116 dans une transaction ROLLBACK.
DO $$
DECLARE d UUID; wh UUID; wh2 UUID; uid UUID; si UUID; mov UUID; gh UUID; camp UUID; v NUMERIC; q NUMERIC; tr UUID; other_domain UUID; supplier UUID; po UUID; pol UUID; rid UUID; receipt JSONB; response JSONB;
BEGIN
 SELECT w.domain_id,w.id INTO d,wh FROM warehouses w WHERE w.is_active AND w.farm_id IS NOT NULL LIMIT 1;
 SELECT p.id INTO uid FROM profiles p WHERE p.is_active AND (is_platform_admin(p.id) OR is_domain_admin(d,p.id)) LIMIT 1;
 IF d IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Préconditions de test manquantes'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 INSERT INTO stock_items(code,name,category,unit,domain_id,is_active) VALUES('QA-CUMP-'||left(gen_random_uuid()::text,8),'QA test transaction annulée','autre','l',d,true) RETURNING id INTO si;
 INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,unit_cost,movement_date,domain_id) VALUES(si,wh,'entree',100,200,current_date,d);
 SELECT inventory_value,current_qty INTO v,q FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=si;
 IF v<>20000 OR q<>100 THEN RAISE EXCEPTION 'Échec réception valorisée'; END IF;
 SELECT cp.greenhouse_id,cp.campaign_id INTO gh,camp FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id JOIN warehouses w ON w.farm_id=g.farm_id WHERE w.id=wh LIMIT 1;
 PERFORM set_config('app.approved_stock_exit','true',true);
 INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,movement_date,domain_id,campaign_id,greenhouse_id) VALUES(si,wh,'sortie',20,current_date,d,camp,gh) RETURNING id INTO mov;
 SELECT total_cost INTO v FROM stock_movements WHERE id=mov;
 IF v<>4000 THEN RAISE EXCEPTION 'Échec coût sortie'; END IF;
 IF gh IS NOT NULL AND (SELECT sum(amount) FROM cost_entries WHERE source_stock_movement_id=mov) IS DISTINCT FROM 4000::numeric THEN RAISE EXCEPTION 'Échec imputation coût'; END IF;
 INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,unit_cost,movement_date,domain_id) VALUES(si,wh,'entree',100,300,current_date,d);
 SELECT inventory_value/current_qty INTO v FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=si;
 IF abs(v-255.55555556)>0.000001 THEN RAISE EXCEPTION 'Échec CUMP'; END IF;
 IF (SELECT total_cost FROM stock_movements WHERE id=mov)<>4000 THEN RAISE EXCEPTION 'Historique réécrit'; END IF;
 -- Transfert : conserve exactement la valeur, même si le prix mémorisé du transfert est faux.
 INSERT INTO warehouses(domain_id,farm_id,code,name,warehouse_type) SELECT d,farm_id,'QA-'||left(gen_random_uuid()::text,8),'QA entrepôt temporaire','ferme' FROM warehouses WHERE id=wh RETURNING id INTO wh2;
 INSERT INTO stock_transfers(domain_id,source_id,destination_id,stock_item_id,quantity,planned_date,reason,requested_by,status,unit_cost) VALUES(d,wh,wh2,si,10,current_date,'QA test',uid,'en_transit',999) RETURNING id INTO tr;
 PERFORM set_config('app.transfer_id',tr::text,true);
 INSERT INTO stock_movements(stock_item_id,warehouse_id,transfer_id,movement_type,quantity,movement_date,domain_id) VALUES(si,wh,tr,'sortie',10,current_date,d);
 INSERT INTO stock_movements(stock_item_id,warehouse_id,transfer_id,movement_type,quantity,movement_date,domain_id) VALUES(si,wh2,tr,'entree',10,current_date,d);
 IF (SELECT max(total_cost)-min(total_cost) FROM stock_movements WHERE transfer_id=tr)<>0 THEN RAISE EXCEPTION 'Transfert déséquilibré'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries c JOIN stock_movements m ON m.id=c.source_stock_movement_id WHERE m.transfer_id=tr) THEN RAISE EXCEPTION 'Transfert compté en charge'; END IF;
 IF (SELECT sum(inventory_value) FROM warehouse_stocks WHERE stock_item_id=si)<>46000 THEN RAISE EXCEPTION 'Valeur totale non conservée'; END IF;
 SELECT id INTO supplier FROM suppliers WHERE domain_id=d AND is_active LIMIT 1;
 IF supplier IS NULL THEN RAISE EXCEPTION 'Fournisseur de test indisponible'; END IF;
 INSERT INTO purchase_orders(domain_id,po_number,supplier_id,campaign_id,status,order_date,currency,cost_category,total_amount) VALUES(d,'QA-'||left(gen_random_uuid()::text,8),supplier,camp,'envoye',current_date,'MAD','phytosanitaires',400) RETURNING id INTO po;
 INSERT INTO purchase_order_lines(domain_id,po_id,item_description,unit,quantity,unit_price,line_total,received_qty,stock_item_id) VALUES(d,po,'QA unité millilitres','ml',2000,0.2,400,0,si) RETURNING id INTO pol;
 INSERT INTO approval_requests(domain_id,process_code,entity_id,entity_reference,amount,status,required_levels,requested_by) VALUES(d,'purchase_order',po,'QA',400,'approuvee',1,uid);
 rid:=gen_random_uuid(); receipt:=jsonb_build_object('id',rid,'warehouse_id',wh,'date',current_date,'lines',jsonb_build_array(jsonb_build_object('lineId',pol,'qtyReceived',1000)));
 SELECT current_qty INTO q FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=si;
 response:=receive_costed_purchase(po,receipt);
 IF (SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=si)<>q+1 THEN RAISE EXCEPTION 'Échec conversion ml vers l'; END IF;
 PERFORM receive_costed_purchase(po,receipt);
 IF (SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=wh AND stock_item_id=si)<>q+1 THEN RAISE EXCEPTION 'Réception rejouée deux fois'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE source_po_id=po) THEN RAISE EXCEPTION 'Achat stocké compté en charge'; END IF;
 BEGIN
  PERFORM receive_costed_purchase(po,jsonb_build_object('id',gen_random_uuid(),'warehouse_id',wh,'date',current_date,'lines',jsonb_build_array(jsonb_build_object('lineId',pol,'qtyReceived',2000))));
  RAISE EXCEPTION 'OVER_RECEIPT_TEST_FAILED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='OVER_RECEIPT_TEST_FAILED' THEN RAISE; END IF; END;
 IF (SELECT received_qty FROM purchase_order_lines WHERE id=pol)<>1000 THEN RAISE EXCEPTION 'Réception invalide non atomique'; END IF;
 -- Refus sans droits, même en appelant directement la RPC.
 IF gh IS NOT NULL THEN
  INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,movement_date,domain_id) VALUES(si,wh,'sortie',1,current_date,d) RETURNING id INTO mov;
  PERFORM review_inventory_consumption(mov,(SELECT id FROM campaign_plantings WHERE greenhouse_id=gh AND campaign_id=camp LIMIT 1),250,'Prix historique confirmé pour test');
  IF (SELECT sum(amount) FROM cost_entries WHERE source_stock_movement_id=mov) IS DISTINCT FROM 250::numeric THEN RAISE EXCEPTION 'Rapprochement non imputé'; END IF;
 END IF;
 rid:=gen_random_uuid();
 receipt:=jsonb_build_object('requestId',rid,'supplierId',supplier,'campaignId',camp,'costCategory','phytosanitaires','currency','MAD','lines',jsonb_build_array(jsonb_build_object('stockItemId',si,'itemDescription','QA direct','unit','l','quantity',2,'unitPrice',10)));
 response:=create_costed_direct_order(receipt);
 IF (create_costed_direct_order(receipt)->>'po_id') IS DISTINCT FROM (response->>'po_id') THEN RAISE EXCEPTION 'Achat direct rejoué'; END IF;
 IF EXISTS(SELECT 1 FROM stock_movements WHERE po_id=(response->>'po_id')::uuid) THEN RAISE EXCEPTION 'Achat direct sans réception a modifié le stock'; END IF;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM get_production_cost_data(d); RAISE EXCEPTION 'SECURITY_TEST_FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='SECURITY_TEST_FAILED' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM get_production_cost_data(d);
 RAISE NOTICE 'CUMP, consommation, historique, transfert, conservation et droits : OK';
END $$;
SELECT 'Tests transactionnels réussis ; toutes les modifications seront annulées' AS test_result;
