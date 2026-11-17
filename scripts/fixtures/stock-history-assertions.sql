SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
DO $test$
DECLARE d uuid:='20000000-0000-0000-0000-000000000001'; req uuid:=gen_random_uuid(); rows jsonb; result jsonb; repeated jsonb; item uuid; q numeric;
BEGIN
 rows:=jsonb_build_array(history_row('OUT1','sortie','8','','2020-01-02'),history_row('IN2','entree','10','4','2020-01-01','2'),history_row('IN1','entree','10','2'));
 result:=import_stock_history(d,req,rows,false);
 PERFORM test_assert(result->>'cost_total'='24.00','chronological CUMP preview');
 PERFORM test_assert((SELECT count(*)=0 FROM stock_movements),'preview writes no movements');
 PERFORM test_assert((SELECT count(*)=0 FROM stock_history_batches),'preview writes no batch');
 result:=import_stock_history(d,req,rows,true);
 PERFORM test_assert(result->>'status'='applied' AND result->>'cost_lines'='2','applied two cost allocations');
 SELECT id INTO item FROM stock_items WHERE code='ENG01';
 PERFORM test_assert((SELECT current_qty=12 AND inventory_value=36 FROM warehouse_stocks WHERE stock_item_id=item),'final balance and value');
 PERFORM test_assert((SELECT sum(amount)=24 AND min(amount)=6 AND max(amount)=18 FROM cost_entries),'allocation conserved at 25/75 percent');
 repeated:=import_stock_history(d,req,rows,true);
 PERFORM test_assert(repeated=result,'same request returns exact prior result');
 repeated:=import_stock_history(d,gen_random_uuid(),jsonb_build_array(rows->2,rows->1,rows->0),true);
 PERFORM test_assert(repeated=result AND (SELECT count(*)=3 FROM stock_movements),'reordered file cannot duplicate');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('OUT1','sortie','9','','2020-01-02'))),'contenu différent');
 -- Previously imported rows in a larger file are skipped, not counted again.
 result:=import_stock_history(d,gen_random_uuid(),rows||jsonb_build_array(history_row('OUT2','sortie','2','','2020-01-03')),true);
 PERFORM test_assert(result->>'skipped'='3' AND result->>'exits'='1' AND (result->>'cost_total')::numeric=6,'mixed retry skips existing rows');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('OLD','entree','4','2','2020-01-02'))),'historique déjà présent');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('BADUNIT','entree','1','2','2020-01-04')||jsonb_build_object('unit','L'))),'unité incompatible');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('INBAD','entree','1','2','2020-01-04'),history_row('TOOMUCH','sortie','999','','2020-01-05'))),'stock insuffisant');
 PERFORM test_assert(NOT EXISTS(SELECT 1 FROM stock_history_lines WHERE external_id='INBAD'),'late failure rolls back entire file');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('FOREIGN','entree','1','2','2020-01-04')||jsonb_build_object('warehouse','OTHER'))),'entrepôt et ferme');
 result:=import_stock_history(d,gen_random_uuid(),jsonb_build_array(history_row('UNKNOWNIN','entree','10','','2020-01-01','1','ENG02'),history_row('UNKNOWNOUT','sortie','3','','2020-01-02','1','ENG02')),true);
 PERFORM test_assert(result->>'unvalued'='1' AND result->>'cost_lines'='0','unknown entry price remains unknown');
 PERFORM test_assert((SELECT count(*)=1 FROM stock_consumption_allocations a JOIN stock_history_lines l ON l.movement_id=a.movement_id WHERE l.external_id='UNKNOWNOUT'),'unvalued exit keeps allocation for review');
 PERFORM test_assert((SELECT inventory_value IS NULL FROM warehouse_stocks w JOIN stock_items s ON s.id=w.stock_item_id WHERE s.code='ENG02'),'unknown value is not zero');
 PERFORM review_inventory_consumption_multi((SELECT movement_id FROM stock_history_lines WHERE external_id='UNKNOWNOUT'),ARRAY[]::uuid[],3,'Facture historique retrouvée');
 PERFORM test_assert((SELECT sum(c.amount)=9 FROM cost_entries c JOIN stock_history_lines l ON l.movement_id=c.source_stock_movement_id WHERE l.external_id='UNKNOWNOUT'),'deferred valuation reuses saved allocation');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('NAN','entree','NaN','2','2020-01-04'))),'quantité positive');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('FUTURE','entree','1','2','2999-01-01'))),'future');
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('NOTARGET','sortie','1','','2020-01-04')||jsonb_build_object('plantings',''))),'plantations');
 PERFORM test_assert((SELECT jsonb_array_length(get_stock_history_catalog(d)->'items')=2),'catalog exposes active tenant articles');
 PERFORM test_assert(NOT has_function_privilege('anon','public.import_stock_history(uuid,uuid,jsonb,boolean)','execute'),'anonymous import denied');
 PERFORM test_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.stock_history_lines'::regclass),'history rows have RLS');
 INSERT INTO warehouse_stocks(warehouse_id,stock_item_id,domain_id,current_qty,inventory_value,valuation_verified)
 VALUES('40000000-0000-0000-0000-000000000003',item,d,5,10,true);
 PERFORM test_reject(format('select import_stock_history(%L,gen_random_uuid(),%L::jsonb,true)',d,jsonb_build_array(history_row('UNDATED','entree','1','2','2020-01-04')||jsonb_build_object('warehouse','D2'))),'sans historique daté');
 PERFORM set_config('test.uid','10000000-0000-0000-0000-000000000002',true);
 PERFORM test_reject(format('select get_stock_history_catalog(%L)',d),'administrateurs');
 PERFORM set_config('test.uid','10000000-0000-0000-0000-000000000001',true);
 PERFORM test_reject('select get_stock_history_catalog(''20000000-0000-0000-0000-000000000002'')','administrateurs');
END $test$;
SELECT 'PASS stock history, CUMP, allocations, idempotence, rollback and tenant access' AS result;
