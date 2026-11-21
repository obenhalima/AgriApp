UPDATE workers SET is_declared=false WHERE id='55555555-5555-4555-8555-555555555555';
-- Standard payroll validates the period without changing the slips' draft flag.
INSERT INTO payroll_periods(id,code,period_year,period_month,start_date,end_date,status)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','LEGACY-CNSS',2026,12,'2026-12-01','2026-12-31','brouillon'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','OTHER-CNSS',2026,9,'2026-09-01','2026-09-30','brouillon');
INSERT INTO payslips(period_id,worker_id,gross_salary,cnss_employee,cnss_employer,net_salary,status)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',100,2,3,98,'brouillon'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','66666666-6666-4666-8666-666666666666',99999,999,9999,99000,'brouillon');
UPDATE payroll_periods SET status='valide' WHERE id IN('dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111';f uuid:='33333333-3333-4333-8333-333333333333';
 w uuid:='77777777-7777-4777-8777-777777777777';campaign uuid:='88888888-8888-4888-8888-888888888888';
 rows jsonb;ctx jsonb;prep jsonb;source jsonb;month jsonb;payment jsonb;again jsonb;declaration jsonb;costs jsonb;
 req uuid;paid numeric;due numeric;failed boolean;fingerprint text;revision integer;undeclared jsonb;
BEGIN
 rows:=jsonb_build_array(jsonb_build_object('worker_id',w,'source','manual','normal_hours',80,'overtime_hours',0,'normal_rate',10,'overtime_rate',0,'bonuses',0,'advance',0,'other_deductions',0,'deductions_confirmed',true));
 SELECT x INTO ctx FROM jsonb_array_elements(payroll_net_context(d,f,'2026-09-01')) x WHERE x->>'worker_id'=w::text;
 rows:=jsonb_set(rows,'{0,tax_context}',ctx);
 prep:=save_payroll_preparation(d,f,'2026-09-01','2026-09-15',campaign,'2026-09-15',NULL,0,rows,'validate',gen_random_uuid());
 undeclared:=jsonb_set(rows,'{0,worker_id}','"55555555-5555-4555-8555-555555555555"');
 SELECT x INTO ctx FROM jsonb_array_elements(payroll_net_context(d,f,'2026-09-16')) x WHERE x->>'worker_id'='55555555-5555-4555-8555-555555555555';
 undeclared:=jsonb_set(undeclared,'{0,tax_context}',ctx);
 PERFORM save_payroll_preparation(d,f,'2026-09-16','2026-09-30',campaign,'2026-09-30',NULL,0,undeclared,'validate',gen_random_uuid());
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=12;
 IF (month->'source'->>'total_due')::numeric<>5 THEN RAISE EXCEPTION 'Standard validated period was omitted'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') INTO costs FROM cost_entries c;
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=9;
 source:=month->'source';due:=(source->>'total_due')::numeric;
 IF (source->>'nb_workers')::int<>1 OR due<=0 OR due<>(source->>'total_employee')::numeric+(source->>'total_employer')::numeric
 OR (source->>'total_employer')::numeric<>(prep->'rows'->0->>'total_employer_cost')::numeric-(prep->'rows'->0->>'gross_salary')::numeric
 THEN RAISE EXCEPTION 'CNSS due does not match published employee/employer contributions'; END IF;
 fingerprint:=source->>'fingerprint';
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,0,fingerprint,0,'2026-10-10','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalide%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Zero payment accepted'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,0,fingerprint,'NaN','2026-10-10','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalide%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'NaN payment accepted'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,0,'stale',10,'2026-10-10','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%cotisations ont changé%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale source accepted'; END IF;
 PERFORM set_config('test.allowed','no',true);failed:=false;
 BEGIN PERFORM list_social_contributions(d,2026);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthorized read allowed'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,0,fingerprint,10,'2026-10-10','virement','',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthorized payment allowed'; END IF;
 PERFORM set_config('test.allowed','yes',true);failed:=false;
 BEGIN PERFORM list_social_contributions('22222222-2222-4222-8222-222222222222',2026);
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-client read allowed'; END IF;
 paid:=round(due/3,2);req:=gen_random_uuid();
 payment:=record_social_contribution_payment(d,2026,9,0,fingerprint,paid,'2026-10-10','virement','VIR-CNSS-1',req);
 again:=record_social_contribution_payment(d,2026,9,0,fingerprint,paid,'2026-10-10','virement','VIR-CNSS-1',req);
 IF payment->>'id'<>again->>'id' THEN RAISE EXCEPTION 'Retry inserted duplicate payment'; END IF;
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=9;
 IF (month->>'paid')::numeric<>paid OR (month->>'remaining')::numeric<>due-paid OR month->>'last_payment_date'<>'2026-10-10'
 OR jsonb_array_length(month->'payments')<>1 THEN RAISE EXCEPTION 'Partial payment/date/remaining mismatch'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,0,fingerprint,1,'2026-10-11','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%suivi des cotisations a changé%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale concurrent payment accepted'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,(month->>'revision')::int,fingerprint,due,'2026-10-11','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%dépasse%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Overpayment accepted'; END IF;
 PERFORM record_social_contribution_payment(d,2026,9,(month->>'revision')::int,fingerprint,due-paid,'2026-10-12','cheque','CH-CNSS-2',gen_random_uuid());
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=9;
 IF (month->>'remaining')::numeric<>0 OR (month->>'paid')::numeric<>due OR jsonb_array_length(month->'payments')<>2 THEN RAISE EXCEPTION 'Full payment mismatch'; END IF;
 declaration:=save_social_contribution_declaration(d,2026,9,(month->>'revision')::int,fingerprint,'DAMANCOM-9',true);
 IF declaration->>'declared_at' IS NULL OR declaration->>'declaration_number'<>'DAMANCOM-9' THEN RAISE EXCEPTION 'Declaration not saved'; END IF;
 IF costs IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM cost_entries c) THEN RAISE EXCEPTION 'Settlement/declaration modified costs'; END IF;
 IF EXISTS(SELECT 1 FROM payroll_preparation_payments) THEN RAISE EXCEPTION 'CNSS settlement modified salary payments'; END IF;
 -- Reopening keeps published contributions visible and blocks new settlements.
 prep:=begin_payroll_correction(d,(prep->>'id')::uuid,(prep->>'revision')::int,'Baisse du taux',gen_random_uuid());
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=9;
 IF NOT (month->'source'->>'open_correction')::boolean OR (month->'source'->>'total_due')::numeric<>due THEN RAISE EXCEPTION 'Open correction changed published due'; END IF;
 failed:=false;
 BEGIN PERFORM record_social_contribution_payment(d,2026,9,(month->>'revision')::int,fingerprint,1,'2026-10-13','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%terminez les corrections%' THEN RAISE; END IF;failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Settlement allowed during correction'; END IF;
 rows:=jsonb_set(rows,'{0,normal_rate}','5');
 prep:=save_payroll_preparation(d,f,'2026-09-01','2026-09-15',campaign,'2026-09-15',NULL,(prep->>'revision')::int,rows,'validate',gen_random_uuid());
 SELECT x INTO month FROM jsonb_array_elements(list_social_contributions(d,2026)) x WHERE (x->>'period_month')::int=9;
 IF NOT (month->>'stale')::boolean OR (month->>'overpaid')::numeric<=0 OR (month->>'paid')::numeric<>due THEN RAISE EXCEPTION 'Revised due lost payments/overpayment alert'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') INTO costs FROM cost_entries c;
 declaration:=save_social_contribution_declaration(d,2026,9,(month->>'revision')::int,month->'source'->>'fingerprint','',false);
 IF declaration->>'declared_at' IS NOT NULL OR jsonb_array_length(declaration->'history')=0 THEN RAISE EXCEPTION 'Old declaration not invalidated/audited'; END IF;
 IF costs IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM cost_entries c) THEN RAISE EXCEPTION 'Recalculation changed costs'; END IF;
 PERFORM set_config('test.member','no',true);
 IF EXISTS(SELECT 1 FROM social_contribution_declarations) OR EXISTS(SELECT 1 FROM social_contribution_payments) THEN RAISE EXCEPTION 'RLS leaked another client'; END IF;
 PERFORM set_config('test.member','yes',true);
 IF has_table_privilege('authenticated','public.social_contribution_payments','INSERT')
 OR has_function_privilege('authenticated','public.social_contribution_source(uuid,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Private payment/source access exposed'; END IF;
END $$;
RESET ROLE;
