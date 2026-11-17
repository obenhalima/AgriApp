SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE
 d uuid:='11111111-1111-4111-8111-111111111111';f uuid:='33333333-3333-4333-8333-333333333333';c uuid:='88888888-8888-4888-8888-888888888888';
 time_rows jsonb;att jsonb; r jsonb;result jsonb;again jsonb;request uuid:=gen_random_uuid();pay_request uuid:=gen_random_uuid();payment jsonb;old_cost_ids uuid[];
BEGIN
 SELECT jsonb_agg(jsonb_build_object('worker_id','55555555-5555-4555-8555-555555555555','work_date',day::date,'normal_hours',CASE WHEN day::date='2026-11-01' THEN 16 ELSE 0 END,'overtime_hours',CASE WHEN day::date='2026-11-01' THEN 2 ELSE 0 END,'entry_source','manual','source_filename',NULL)) INTO time_rows FROM generate_series('2026-11-01'::date,'2026-11-15'::date,'1 day') day;
 att:=save_employee_attendance(d,f,'2026-11-01','2026-11-15',0,time_rows,'validate',gen_random_uuid());
 r:='[{"worker_id":"55555555-5555-4555-8555-555555555555","source":"attendance","normal_hours":16,"overtime_hours":2,"normal_rate":12.5,"overtime_rate":15,"bonuses":0,"advance":10,"other_deductions":0,"cnss_employee":5,"amo_employee":0,"ir_amount":0,"cnss_employer":2,"amo_employer":0,"family_allowance_employer":0,"prof_training_employer":0,"deductions_confirmed":false},{"worker_id":"77777777-7777-4777-8777-777777777777","source":"manual","normal_hours":8,"overtime_hours":0,"normal_rate":10,"overtime_rate":null,"bonuses":0,"advance":0,"other_deductions":0,"cnss_employee":0,"amo_employee":0,"ir_amount":0,"cnss_employer":0,"amo_employer":0,"family_allowance_employer":0,"prof_training_employer":0,"deductions_confirmed":true}]';
 result:=save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,0,r,'save',request);
 IF result->>'revision'<>'1' OR result#>>'{rows,0,gross_salary}'<>'230.00' OR (result#>>'{rows,0,net_salary}')::numeric<>215 OR EXISTS(SELECT 1 FROM payslips) THEN RAISE EXCEPTION 'draft amounts or unexpected writes: %',result; END IF;
 again:=save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,0,r,'save',request);
 IF result<>again THEN RAISE EXCEPTION 'draft retry not idempotent'; END IF;
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,r,'validate',gen_random_uuid());
  RAISE EXCEPTION 'unconfirmed deductions accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 r:=jsonb_set(r,'{0,deductions_confirmed}','true');
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,0,r,'save',gen_random_uuid());
  RAISE EXCEPTION 'stale revision accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,jsonb_set(r,'{0,normal_hours}','17'),'validate',gen_random_uuid());
  RAISE EXCEPTION 'modified attendance accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,jsonb_set(r,'{0,source}','"manual"'),'validate',gen_random_uuid());
  RAISE EXCEPTION 'attendance manually overridden' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15','99999999-9999-4999-8999-999999999999','2026-11-15',1,1,r,'validate',gen_random_uuid());
  RAISE EXCEPTION 'foreign campaign accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,jsonb_set(r,'{1,worker_id}','"66666666-6666-4666-8666-666666666666"'),'save',gen_random_uuid());
  RAISE EXCEPTION 'foreign worker accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 UPDATE workers SET normal_hourly_rate=20 WHERE id='55555555-5555-4555-8555-555555555555';
 request:=gen_random_uuid();
 r:=jsonb_set(r,'{0,gross_salary}','999999');
 result:=save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,r,'validate',request);
 IF result->>'status'<>'validated' OR result->>'revision'<>'2' OR (result#>>'{rows,0,original_normal_rate}')::numeric<>11.9345625 OR (result#>>'{rows,0,gross_salary}')::numeric<>230 THEN RAISE EXCEPTION 'validation snapshot or server calculation failed'; END IF;
 IF (SELECT count(*) FROM payslips)<>2 OR (SELECT sum(amount) FROM cost_entries)<>312 OR EXISTS(SELECT 1 FROM cost_entries WHERE campaign_id<>c) THEN RAISE EXCEPTION 'payslips or costs incorrect'; END IF;
 SELECT array_agg(id ORDER BY id) INTO old_cost_ids FROM cost_entries;
 again:=save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',1,1,r,'validate',request);
 IF again<>result OR (SELECT count(*) FROM payslips)<>2 THEN RAISE EXCEPTION 'validation retry duplicated payroll'; END IF;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,time_rows,'reopen',gen_random_uuid());
  RAISE EXCEPTION 'paid attendance reopened' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  UPDATE payslips SET gross_salary=1 WHERE period_id=(result->>'payroll_period_id')::uuid;
  RAISE EXCEPTION 'direct managed slip mutation accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 payment:=record_payroll_preparation_payment((result->>'id')::uuid,'55555555-5555-4555-8555-555555555555',25,'2026-11-16','cash',NULL,pay_request);
 again:=record_payroll_preparation_payment((result->>'id')::uuid,'55555555-5555-4555-8555-555555555555',25,'2026-11-16','cash',NULL,pay_request);
 IF again<>payment OR (SELECT count(*) FROM payroll_preparation_payments)<>1 THEN RAISE EXCEPTION 'payment retry duplicated payment'; END IF;
 BEGIN
  PERFORM record_payroll_preparation_payment((result->>'id')::uuid,'55555555-5555-4555-8555-555555555555',216,'2026-11-16','cash',NULL,gen_random_uuid());
  RAISE EXCEPTION 'overpayment accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM record_payroll_preparation_payment((result->>'id')::uuid,'55555555-5555-4555-8555-555555555555',190,'2026-11-16','cash','SOLDE',gen_random_uuid());
 IF (SELECT status FROM payroll_periods WHERE id=(result->>'payroll_period_id')::uuid)<>'valide' THEN RAISE EXCEPTION 'period paid too early'; END IF;
 PERFORM record_payroll_preparation_payment((result->>'id')::uuid,'77777777-7777-4777-8777-777777777777',80,'2026-11-16','virement',NULL,gen_random_uuid());
 IF (SELECT status FROM payroll_periods WHERE id=(result->>'payroll_period_id')::uuid)<>'paye' OR (SELECT sum(amount) FROM payroll_preparation_payments)<>295 OR (SELECT array_agg(id ORDER BY id) FROM cost_entries)<>old_cost_ids THEN RAISE EXCEPTION 'payment totals/status or costs regenerated'; END IF;
 PERFORM set_config('test.allowed','no',false);
 IF EXISTS(SELECT 1 FROM payroll_preparations) OR EXISTS(SELECT 1 FROM payroll_preparation_payments) OR EXISTS(SELECT 1 FROM payslips) OR EXISTS(SELECT 1 FROM payroll_periods) THEN RAISE EXCEPTION 'preparation tenant/read scope bypassed'; END IF;
 BEGIN
  PERFORM record_payroll_preparation_payment((result->>'id')::uuid,'77777777-7777-4777-8777-777777777777',1,'2026-11-16','cash',NULL,gen_random_uuid());
  RAISE EXCEPTION 'payment without permission accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$
DECLARE old_period uuid;
BEGIN
 INSERT INTO payroll_periods(code,period_year,period_month,period_half,start_date,end_date,pay_date,status)
 VALUES('LEGACY-DEC',2026,12,'first','2026-12-01','2026-12-15','2026-12-15','brouillon') RETURNING id INTO old_period;
 INSERT INTO payslips(period_id,worker_id,gross_salary,net_salary,total_employer_cost,status)
 VALUES(old_period,'55555555-5555-4555-8555-555555555555',100,100,100,'brouillon');
 UPDATE payroll_periods SET status='valide' WHERE id=old_period;
 IF (SELECT sum(amount) FROM cost_entries WHERE payroll_period_id=old_period)<>99.99 THEN RAISE EXCEPTION 'legacy cost allocation changed'; END IF;
 -- The legacy calculation retains its historical rounding. Prepared payroll uses exact cents.
 INSERT INTO payroll_periods(code,period_year,period_month,period_half,start_date,end_date,pay_date,status)
 VALUES('LEGACY-DUPLICATE',2026,11,'first','2026-11-01','2026-11-15','2026-11-15','brouillon') RETURNING id INTO old_period;
 BEGIN
  INSERT INTO payslips(period_id,worker_id,gross_salary,net_salary,total_employer_cost,status)
  VALUES(old_period,'55555555-5555-4555-8555-555555555555',100,100,100,'brouillon');
  RAISE EXCEPTION 'legacy generation duplicates prepared payroll' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
