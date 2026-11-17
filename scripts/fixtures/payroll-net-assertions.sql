UPDATE workers SET is_declared=true WHERE id='55555555-5555-4555-8555-555555555555';
UPDATE workers SET is_declared=false WHERE id='77777777-7777-4777-8777-777777777777';
DO $$
DECLARE n numeric; result jsonb; prior jsonb;
BEGIN
 FOREACH n IN ARRAY ARRAY[0,.01,.03,100,230,1000,2800,3000,3100,3200,4000,5000,8000,18000,99999]::numeric[] LOOP
   result:=payroll_net_amounts(n,true,'2026-11-01',2,'{}');
   IF (result->>'gross_salary')::numeric-(result->>'cnss_employee')::numeric-(result->>'amo_employee')::numeric-(result->>'ir_amount')::numeric<>n THEN RAISE EXCEPTION 'net not preserved: % / %',n,result; END IF;
 END LOOP;
 result:=payroll_net_amounts(230,true,'2026-11-01',0,'{}');
 IF (result->>'gross_salary')::numeric<>246.62 OR (result->>'total_employer_cost')::numeric<>298.64 THEN RAISE EXCEPTION 'JS/SQL amount mismatch: %',result; END IF;
 prior:=result||jsonb_build_object('prior_gross',(result->>'gross_salary')::numeric);
 result:=payroll_net_amounts(8000,true,'2026-11-16',0,prior);
 IF (result->>'cnss_employee')::numeric+11.05<>268.80 OR (result->>'ir_amount')::numeric<=0 THEN RAISE EXCEPTION 'monthly cap or IR missing: %',result; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111';f uuid:='33333333-3333-4333-8333-333333333333';c uuid:='88888888-8888-4888-8888-888888888888';r jsonb;ctx jsonb;result jsonb;request uuid:=gen_random_uuid();p jsonb;
BEGIN
 ctx:=payroll_net_context(d,f,'2026-11-01');
 r:='[{"worker_id":"55555555-5555-4555-8555-555555555555","source":"manual","normal_hours":16,"overtime_hours":2,"normal_rate":12.5,"overtime_rate":15,"bonuses":0,"advance":10,"other_deductions":0,"cnss_employee":999,"amo_employee":999,"ir_amount":999,"cnss_employer":999,"amo_employer":999,"family_allowance_employer":999,"prof_training_employer":999,"deductions_confirmed":true,"is_declared":false},{"worker_id":"77777777-7777-4777-8777-777777777777","source":"manual","normal_hours":8,"overtime_hours":0,"normal_rate":10,"overtime_rate":null,"bonuses":0,"advance":0,"other_deductions":0,"cnss_employee":999,"amo_employee":999,"ir_amount":999,"cnss_employer":999,"amo_employer":999,"family_allowance_employer":999,"prof_training_employer":999,"deductions_confirmed":true,"is_declared":true}]';
 SELECT jsonb_agg(line||jsonb_build_object('tax_context',(SELECT x FROM jsonb_array_elements(ctx) x WHERE x->>'worker_id'=line->>'worker_id'))) INTO r FROM jsonb_array_elements(r) line;
 UPDATE workers SET is_declared=false WHERE id='55555555-5555-4555-8555-555555555555';
 BEGIN
   PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',NULL,0,r,'validate',gen_random_uuid());
   RAISE EXCEPTION 'stale employee status accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 UPDATE workers SET is_declared=true WHERE id='55555555-5555-4555-8555-555555555555';
 result:=save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',NULL,0,r,'validate',request);
 IF (result#>>'{rows,0,gross_salary}')::numeric<>246.62 OR (result#>>'{rows,0,net_salary}')::numeric<>220 OR result#>>'{rows,0,is_declared}'<>'true' THEN RAISE EXCEPTION 'net basis not applied or status spoofed: %',result; END IF;
 IF (result#>>'{rows,1,gross_salary}')::numeric<>80 OR (result#>>'{rows,1,cnss_employer}')::numeric<>0 OR result#>>'{rows,1,is_declared}'<>'false' THEN RAISE EXCEPTION 'undeclared status ignored'; END IF;
 IF (SELECT sum(amount) FROM cost_entries)<>378.64 OR (SELECT sum(net_salary) FROM payslips)<>300 OR EXISTS(SELECT 1 FROM payslips WHERE gross_salary<>base_amount+overtime_amount+bonuses) THEN RAISE EXCEPTION 'gross/net/costs not reconciled'; END IF;
 IF save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',NULL,0,r,'validate',request)<>result THEN RAISE EXCEPTION 'retry changed payroll'; END IF;
 p:=record_payroll_preparation_payment((result->>'id')::uuid,'55555555-5555-4555-8555-555555555555',220,'2026-11-16','cash',NULL,gen_random_uuid());
 IF (p->>'amount')::numeric<>220 THEN RAISE EXCEPTION 'payment deducted social contributions twice'; END IF;
END $$;
