SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('test.member','no',false);
SET ROLE authenticated;
DO $$
DECLARE rows jsonb; denied boolean:=false;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('worker_id','55555555-5555-4555-8555-555555555555','work_date',day::date,'normal_hours',0,'overtime_hours',0,'entry_source','manual')) INTO rows
 FROM generate_series('2026-12-01'::date,'2026-12-15'::date,interval '1 day') day;
 BEGIN PERFORM save_employee_attendance('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2026-12-01','2026-12-15',0,rows,'save',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Ordinary nonmember gained access'; END IF;
 IF EXISTS(SELECT 1 FROM employee_attendance_periods) THEN RAISE EXCEPTION 'Nonmember can read attendance'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_platform_admin=true WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111';f uuid:='33333333-3333-4333-8333-333333333333';w uuid:='55555555-5555-4555-8555-555555555555';rows jsonb;period jsonb;payrows jsonb;prep jsonb;denied boolean:=false;ctx jsonb;
BEGIN
 IF is_domain_member(d,auth.uid()) OR NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Fixture must be platform admin without membership'; END IF;
 SELECT jsonb_agg(jsonb_build_object('worker_id',w,'work_date',day::date,'normal_hours',CASE WHEN day::date='2026-12-01' THEN 32 ELSE 0 END,'overtime_hours',0,'entry_source','excel','source_filename','source.xlsx')) INTO rows
 FROM generate_series('2026-12-01'::date,'2026-12-15'::date,interval '1 day') day;
 period:=save_employee_attendance(d,f,'2026-12-01','2026-12-15',0,rows,'save',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM employee_attendance_periods WHERE id=(period->>'id')::uuid) OR (SELECT count(*) FROM employee_attendance_records WHERE period_id=(period->>'id')::uuid)<>15 THEN RAISE EXCEPTION 'Admin cannot reread imported attendance'; END IF;
 period:=review_employee_attendance(d,(period->>'id')::uuid,(period->>'revision')::int,w,'2026-12-01','other','Valeur vérifiée','confirm',gen_random_uuid());
 period:=save_employee_attendance(d,f,'2026-12-01','2026-12-15',(period->>'revision')::int,rows,'validate',gen_random_uuid());
 SELECT x INTO ctx FROM jsonb_array_elements(payroll_net_context(d,f,'2026-12-01')) x WHERE x->>'worker_id'=w::text;
 payrows:=jsonb_build_array(jsonb_build_object('worker_id',w,'source','attendance','normal_hours',32,'overtime_hours',0,'normal_rate',10,'overtime_rate',0,'bonuses',0,'advance',0,'other_deductions',0,'deductions_confirmed',true,'tax_context',ctx));
 prep:=save_payroll_preparation(d,f,'2026-12-01','2026-12-15','88888888-8888-4888-8888-888888888888','2026-12-15',(period->>'revision')::int,0,payrows,'validate',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM payroll_preparations WHERE id=(prep->>'id')::uuid) THEN RAISE EXCEPTION 'Admin cannot reread payroll'; END IF;
 PERFORM record_payroll_preparation_payment((prep->>'id')::uuid,w,1,'2026-12-15','cash','test-local',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM payroll_preparation_payments WHERE preparation_id=(prep->>'id')::uuid) THEN RAISE EXCEPTION 'Admin cannot reread payment'; END IF;
 BEGIN PERFORM save_employee_attendance('22222222-2222-4222-8222-222222222222',f,'2027-01-01','2027-01-15',0,rows,'save',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Ferme inaccessible%' THEN RAISE; END IF;denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Mismatched client and farm accepted'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM save_employee_attendance('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2027-01-01','2027-01-15',0,'[]','save',gen_random_uuid());EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied OR EXISTS(SELECT 1 FROM employee_attendance_periods) THEN RAISE EXCEPTION 'Inactive admin gained access'; END IF;
END $$;
RESET ROLE;
