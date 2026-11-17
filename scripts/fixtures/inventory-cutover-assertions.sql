-- Runs exclusively in the disposable PostgreSQL harness.
TRUNCATE stock_history_lines,stock_history_batches,stock_consumption_allocations,
 inventory_consumption_reviews,cost_entries,stock_movements,warehouse_stocks,inventory_value_events,
 inventory_method_changes,inventory_cost_settings;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
DO $test$
DECLARE d uuid:='20000000-0000-0000-0000-000000000001'; item uuid; item2 uuid;
 request uuid:=gen_random_uuid(); preview jsonb; result jsonb; before_movements jsonb; before_costs jsonb;
 today text:=(now() AT TIME ZONE 'Africa/Casablanca')::date::text;
BEGIN
 SELECT id INTO item FROM stock_items WHERE code='ENG01';
 SELECT id INTO item2 FROM stock_items WHERE code='ENG02';
 result:=import_stock_history(d,gen_random_uuid(),jsonb_build_array(
  history_row('CUT-IN1','entree','100','10'),
  history_row('CUT-IN2','entree','100','14','2020-01-01','2'),
  history_row('CUT-OUT','sortie','120','','2020-01-02')),true);
 INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date)
 VALUES(d,item2,'40000000-0000-0000-0000-000000000001','entree',10,'2020-01-01');
 preview:=change_inventory_cost_method_cutover(d,'fifo',request);
 PERFORM test_assert(preview->>'status'='blocked','unknown opening value blocks activation');
 PERFORM test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'blockers') b WHERE b->>'code'='opening_unvalued' AND b->>'item_code'='ENG02'),'blocker identifies product');
 PERFORM test_reject(format('select change_inventory_cost_method_cutover(%L,''fifo'',%L,%L,''QA501'',true)',d,request,preview->>'fingerprint'),'Activation impossible');
 UPDATE warehouse_stocks SET inventory_value=50,valuation_verified=true WHERE stock_item_id=item2;
 UPDATE warehouse_stocks SET current_qty=current_qty+1 WHERE stock_item_id=item2;
 preview:=change_inventory_cost_method_cutover(d,'fifo',request);
 PERFORM test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'blockers') b WHERE b->>'code'='balance_mismatch'),'stock quantity mismatch blocks activation');
 UPDATE warehouse_stocks SET current_qty=current_qty-1 WHERE stock_item_id=item2;
 SELECT jsonb_agg(to_jsonb(sm) ORDER BY id) INTO before_movements FROM stock_movements sm WHERE domain_id=d;
 SELECT jsonb_agg(to_jsonb(ce) ORDER BY id) INTO before_costs FROM cost_entries ce WHERE domain_id=d;
 preview:=change_inventory_cost_method_cutover(d,'fifo',request);
 PERFORM test_assert(preview->>'status'='preview','valued opening allows old receipts without price');
 PERFORM test_assert(preview->>'historical_unpriced_receipts'='1','unpriced historical receipt disclosed');
 PERFORM test_assert((preview->>'cost_before')::numeric=1440 AND preview->>'cost_before'=preview->>'cost_after','CUMP costs preserved in preview');
 PERFORM test_assert((preview->>'stock_after')::numeric=1010,'CUMP stock carried at recorded value');
 UPDATE stock_items SET name=name||' changed' WHERE id=item;
 PERFORM test_reject(format('select change_inventory_cost_method_cutover(%L,''fifo'',%L,%L,''QA501'',true)',d,request,preview->>'fingerprint'),'ont changé');
 preview:=change_inventory_cost_method_cutover(d,'fifo',request);
 result:=change_inventory_cost_method_cutover(d,'fifo',request,preview->>'fingerprint','QA501',true);
 PERFORM test_assert(result->>'status'='applied','FIFO cutover applied');
 PERFORM test_assert((SELECT jsonb_agg(to_jsonb(sm) ORDER BY id)=before_movements FROM stock_movements sm WHERE domain_id=d),'ALL historical movement fields preserved');
 PERFORM test_assert((SELECT jsonb_agg(to_jsonb(ce) ORDER BY id)=before_costs FROM cost_entries ce WHERE domain_id=d),'ALL historical campaign costs preserved');
 PERFORM test_assert((SELECT current_qty=80 AND inventory_value=960 AND jsonb_array_length(fifo_layers)=1 FROM warehouse_stocks WHERE stock_item_id=item),'CUMP opening layer');
 PERFORM test_assert(change_inventory_cost_method_cutover(d,'fifo',request,preview->>'fingerprint','QA501',true)=result,'idempotent confirmation');
 PERFORM test_reject(format('insert into stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date,unit_cost) values(%L,%L,''40000000-0000-0000-0000-000000000001'',''entree'',1,''2020-01-03'',2)',d,item),'antérieure');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,false)',d,
  jsonb_build_array(history_row('CUT-BACKDATE','entree','1','2','2020-01-03'))),'antérieure');
 PERFORM test_reject(format('insert into stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,movement_date) values(%L,%L,''40000000-0000-0000-0000-000000000001'',''entree'',1,%L)',d,item,today),'Prix obligatoire');
 result:=import_stock_history(d,gen_random_uuid(),jsonb_build_array(
  history_row('FIFO-NEW-IN','entree','20','20',today,'1'),
  history_row('FIFO-NEW-OUT','sortie','90','',today,'2')),true);
 PERFORM test_assert((result->>'cost_total')::numeric=1160,'FIFO consumes CUMP opening before new purchases');
 PERFORM test_assert((SELECT current_qty=10 AND inventory_value=200 FROM warehouse_stocks WHERE stock_item_id=item),'FIFO remaining layer reconciles');
 PERFORM test_assert((SELECT total_cost=1440 AND costing_method='cump' FROM stock_movements WHERE id=(SELECT movement_id FROM stock_history_lines WHERE external_id='CUT-OUT')),'migration remains CUMP after FIFO output');
 request:=gen_random_uuid(); preview:=change_inventory_cost_method(d,'cump',request);
 result:=change_inventory_cost_method(d,'cump',request,preview->>'fingerprint','QA501',true);
 PERFORM test_assert((SELECT current_qty=10 AND inventory_value=200 AND fifo_layers IS NULL FROM warehouse_stocks WHERE stock_item_id=item),'switch back carries value without historical replay');
 PERFORM test_assert((SELECT total_cost=1160 AND costing_method='fifo' FROM stock_movements WHERE id=(SELECT movement_id FROM stock_history_lines WHERE external_id='FIFO-NEW-OUT')),'FIFO history preserved when switching back');
 PERFORM test_assert(NOT has_function_privilege('anon','change_inventory_cost_method_cutover(uuid,text,uuid,text,text,boolean)','execute'),'anonymous activation denied');
 PERFORM set_config('test.uid','10000000-0000-0000-0000-000000000002',true);
 PERFORM test_reject(format('select change_inventory_cost_method_cutover(%L,''fifo'',gen_random_uuid())',d),'administrateurs');
 PERFORM set_config('test.uid','10000000-0000-0000-0000-000000000001',true);
 PERFORM test_reject('select change_inventory_cost_method_cutover(''20000000-0000-0000-0000-000000000002'',''fifo'',gen_random_uuid())','administrateurs');
END $test$;
SELECT 'PASS FIFO cutover, frozen history, blockers, opening value, mixed FIFO, retries, stale previews and tenant isolation' AS result;
