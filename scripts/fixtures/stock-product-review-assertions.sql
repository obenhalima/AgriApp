-- Disposable database only, using the real posting and reconciliation functions.
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
UPDATE inventory_cost_settings SET method='cump';
DO $test$
DECLARE d uuid:='20000000-0000-0000-0000-000000000001'; item uuid; first_exit uuid; second_exit uuid;
 context jsonb; rows jsonb; result jsonb; request uuid:=gen_random_uuid(); targets uuid[];
BEGIN
 SELECT id INTO item FROM stock_items WHERE code='ENG02';
 INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date)
 VALUES(d,item,'40000000-0000-0000-0000-000000000001','entree',100,'2020-02-01');
 INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date)
 VALUES(d,item,'40000000-0000-0000-0000-000000000001','sortie',10,'2020-02-02') RETURNING id INTO first_exit;
 INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date)
 VALUES(d,item,'40000000-0000-0000-0000-000000000001','sortie',20,'2020-02-03') RETURNING id INTO second_exit;
 SELECT array_agg(id ORDER BY id) INTO targets FROM campaign_plantings;
 INSERT INTO stock_consumption_allocations(movement_id,domain_id,farm_id,targets,origin)
 VALUES(first_exit,d,'30000000-0000-0000-0000-000000000001',stock_allocation_targets(d,'30000000-0000-0000-0000-000000000001',targets),'request');
 context:=stock_product_review_context(d,ARRAY[first_exit,second_exit]);
 rows:=jsonb_build_array(jsonb_build_object('id',first_exit,'price','8.5','reason','Facture test','plantings','[]'::jsonb),
  jsonb_build_object('id',second_exit,'price','8.5','reason','Facture test','plantings',to_jsonb(targets)));
 result:=review_stock_products(d,request,rows,context->>'version');
 PERFORM test_assert((result->>'amount')::numeric=255,'preview common product price');
 PERFORM test_assert(NOT EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=first_exit),'preview does not create costs');
 PERFORM test_reject(format('select review_stock_products(%L,%L,%L::jsonb,%L,true)',d,request,jsonb_set(rows,'{1,price}','"9"'),context->>'version'),'seul CUMP');
 PERFORM test_assert(NOT EXISTS(SELECT 1 FROM inventory_consumption_reviews WHERE movement_id=first_exit),'failure rolls back entire batch');
 PERFORM test_reject(format('select review_stock_products(%L,%L,%L::jsonb,''stale'',true)',d,request,rows),'ont changé');
 result:=review_stock_products(d,request,rows,context->>'version',true);
 PERFORM test_assert((SELECT sum(amount)=255 FROM cost_entries WHERE source_stock_movement_id=ANY(ARRAY[first_exit,second_exit])),'all costs posted');
 PERFORM test_assert(review_stock_products(d,request,rows,context->>'version',true)=result,'idempotent batch retry');
 PERFORM test_assert((SELECT count(*)=4 FROM cost_entries WHERE source_stock_movement_id=ANY(ARRAY[first_exit,second_exit])),'multiple greenhouse allocations preserved');
 PERFORM test_assert((SELECT current_qty=70 AND inventory_value IS NULL FROM warehouse_stocks WHERE stock_item_id=item),'reconciliation preserves physical stock and unknown remaining value');
 PERFORM test_reject(format('select stock_product_review_context(%L,ARRAY[%L::uuid])','20000000-0000-0000-0000-000000000002',first_exit),'Accès');
 PERFORM test_assert(NOT has_function_privilege('anon','review_stock_products(uuid,uuid,jsonb,text,boolean)','execute'),'anonymous batch denied');
END $test$;
SELECT 'PASS common product CUMP, atomic costs, allocations, stock preservation, authorization and idempotence' AS result;
UPDATE inventory_cost_settings SET method='fifo';
DO $test$
DECLARE d uuid:='20000000-0000-0000-0000-000000000001'; item uuid; movement uuid; price numeric; context jsonb; rows jsonb; targets uuid[];
BEGIN
 SELECT id INTO item FROM stock_items WHERE code='ENG01';
 INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date)
 VALUES(d,item,'40000000-0000-0000-0000-000000000001','sortie',5,'2020-03-01') RETURNING id,total_cost/quantity INTO movement,price;
 context:=stock_product_review_context(d,ARRAY[movement]);
 SELECT array_agg(id ORDER BY id) INTO targets FROM campaign_plantings;
 rows:=jsonb_build_array(jsonb_build_object('id',movement,'price',price+1,'reason','FIFO test','plantings',to_jsonb(targets)));
 PERFORM test_reject(format('select review_stock_products(%L,gen_random_uuid(),%L::jsonb,%L,true)',d,rows,context->>'version'),'prix FIFO');
 PERFORM test_reject(format('select review_inventory_consumption_multi(%L,%L::uuid[],%L,''FIFO test'')',movement,targets,price+1),'prix FIFO');
 rows:=jsonb_set(rows,'{0,price}',to_jsonb(price));
 PERFORM review_stock_products(d,gen_random_uuid(),rows,context->>'version',true);
 PERFORM test_assert((SELECT sum(amount)=round(price*5,2) FROM cost_entries WHERE source_stock_movement_id=movement),'FIFO costs use receipt-derived price');
END $test$;
SELECT 'PASS FIFO price protected through bulk and individual entry points' AS result;
