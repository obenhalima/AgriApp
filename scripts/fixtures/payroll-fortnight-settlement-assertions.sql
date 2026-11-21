INSERT INTO workers(id,farm_id,first_name,last_name,matricule,normal_hourly_rate,overtime_hourly_rate,category,is_declared,dependents)
VALUES('88888888-8888-4888-8888-888888888889','33333333-3333-4333-8333-333333333333','','ALREADY PAID','EMP03',10,0,'fermier',true,0),
('99999999-9999-4999-8999-999999999998','33333333-3333-4333-8333-333333333333','','ZERO NET','EMP04',10,0,'fermier',true,0);
CREATE FUNCTION test_fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('test.fail_worker',true)=NEW.worker_id::text THEN RAISE EXCEPTION 'Simulated second employee failure'; END IF;RETURN NEW; END $$;
CREATE TRIGGER test_fail_payment BEFORE INSERT ON payroll_preparation_payments FOR EACH ROW EXECUTE FUNCTION test_fail_payment();
SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111';f uuid:='33333333-3333-4333-8333-333333333333';c uuid:='88888888-8888-4888-8888-888888888888';
 w1 uuid:='55555555-5555-4555-8555-555555555555';w2 uuid:='77777777-7777-4777-8777-777777777777';w3 uuid:='88888888-8888-4888-8888-888888888889';w4 uuid:='99999999-9999-4999-8999-999999999998';
 rows jsonb;contexts jsonb;prep jsonb;draft jsonb;result jsonb;again jsonb;partial jsonb;full_payment jsonb;costs jsonb;req uuid;failed boolean;
BEGIN
 contexts:=payroll_net_context(d,f,'2026-09-01');
 SELECT jsonb_agg(jsonb_build_object('worker_id',id,'source','manual','normal_hours',hours,'overtime_hours',0,'normal_rate',10,'overtime_rate',0,
 'bonuses',0,'advance',0,'other_deductions',0,'deductions_confirmed',true,'tax_context',(SELECT x FROM jsonb_array_elements(contexts) x WHERE x->>'worker_id'=id::text)) ORDER BY id)
 INTO rows FROM (VALUES(w1,10::numeric),(w2,5),(w3,2.5),(w4,0)) source(id,hours);
 prep:=save_payroll_preparation(d,f,'2026-09-01','2026-09-15',c,'2026-09-15',NULL,0,rows,'validate',gen_random_uuid());
 partial:=record_payroll_preparation_payment((prep->>'id')::uuid,w1,40,'2026-09-16','cash','PARTIAL-ORIGINAL',gen_random_uuid());
 full_payment:=record_payroll_preparation_payment((prep->>'id')::uuid,w3,25,'2026-09-16','cash','FULL-ORIGINAL',gen_random_uuid());
 SELECT jsonb_agg(to_jsonb(ce) ORDER BY ce.id) INTO costs FROM cost_entries ce;
 PERFORM set_config('test.allowed','no',true);failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','VIR-QUINZAINE',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthorized settlement accepted';END IF;
 PERFORM set_config('test.allowed','yes',true);PERFORM set_config('test.member','no',true);failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','VIR-QUINZAINE',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Non-member settlement accepted';END IF;
 PERFORM set_config('test.member','yes',true);failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,0,110,'2026-09-20','virement','VIR-QUINZAINE',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%préparation a changé%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale preparation accepted';END IF;
 failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,150,'2026-09-20','virement','VIR-QUINZAINE',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%paiements ont changé%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale remaining balance accepted';END IF;
 failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','invalid','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalide%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Invalid method accepted';END IF;
 -- Correction suspends settlement and does not consume the partial payments.
 prep:=begin_payroll_correction(d,(prep->>'id')::uuid,(prep->>'revision')::int,'Review before settlement',gen_random_uuid());failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Validez la paie%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Correction draft was settled';END IF;
 prep:=cancel_payroll_correction(d,(prep->>'id')::uuid,(prep->>'revision')::int);
 -- Force the second insertion to fail: the first insertion must roll back.
 PERFORM set_config('test.fail_worker',w2::text,true);failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Simulated second employee failure' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR (SELECT count(*) FROM payroll_preparation_payments)<>2 OR EXISTS(SELECT 1 FROM payroll_fortnight_settlements) THEN RAISE EXCEPTION 'Batch rollback was not atomic';END IF;
 PERFORM set_config('test.fail_worker','',true);
 req:=gen_random_uuid();
 result:=settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','VIR-QUINZAINE',req);
 IF (result->>'amount')::numeric<>110 OR (result->>'worker_count')::int<>2 OR jsonb_array_length(result->'payments')<>2 THEN RAISE EXCEPTION 'Batch balances/count incorrect';END IF;
 IF (SELECT amount FROM payroll_preparation_payments WHERE id=(partial->>'id')::uuid)<>40
 OR (SELECT reference FROM payroll_preparation_payments WHERE id=(partial->>'id')::uuid)<>'PARTIAL-ORIGINAL'
 OR (SELECT count(*) FROM payroll_preparation_payments WHERE worker_id=w3)<>1
 OR EXISTS(SELECT 1 FROM payroll_preparation_payments WHERE worker_id=w4) THEN RAISE EXCEPTION 'Existing payments changed or zero salary paid';END IF;
 IF (SELECT sum(amount) FROM payroll_preparation_payments WHERE worker_id=w1)<>100
 OR (SELECT sum(amount) FROM payroll_preparation_payments WHERE worker_id=w2)<>50
 OR (SELECT status FROM payroll_periods WHERE id=(prep->>'payroll_period_id')::uuid)<>'paye' THEN RAISE EXCEPTION 'Final salary balances/status incorrect';END IF;
 IF costs IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(ce) ORDER BY ce.id) FROM cost_entries ce) THEN RAISE EXCEPTION 'Batch settlement modified costs';END IF;
 again:=settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-20','virement','VIR-QUINZAINE',req);
 IF again->>'id'<>result->>'id' OR (SELECT count(*) FROM payroll_preparation_payments)<>4 THEN RAISE EXCEPTION 'Retry created duplicate payments';END IF;
 failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,110,'2026-09-21','virement','VIR-QUINZAINE',req);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Requête de règlement%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Changed request replay accepted';END IF;
 failed:=false;
 BEGIN PERFORM settle_payroll_fortnight((prep->>'id')::uuid,(prep->>'revision')::int,0,'2026-09-20','cash','',gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Aucun solde%' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Already paid salary settled twice';END IF;
 IF has_table_privilege('authenticated','public.payroll_fortnight_settlements','INSERT') THEN RAISE EXCEPTION 'Direct batch write exposed';END IF;
 PERFORM set_config('test.member','no',true);
 IF EXISTS(SELECT 1 FROM payroll_fortnight_settlements) THEN RAISE EXCEPTION 'Batch audit leaked to non-member';END IF;
 PERFORM set_config('test.member','yes',true);
 -- A separate period will verify that payment never creates missing costs.
 contexts:=payroll_net_context(d,f,'2026-11-01');
 rows:=jsonb_build_array(jsonb_build_object('worker_id',w2,'source','manual','normal_hours',8,'overtime_hours',0,'normal_rate',10,'overtime_rate',0,
 'bonuses',0,'advance',0,'other_deductions',0,'deductions_confirmed',true,'tax_context',(SELECT x FROM jsonb_array_elements(contexts) x WHERE x->>'worker_id'=w2::text)));
 PERFORM save_payroll_preparation(d,f,'2026-11-01','2026-11-15',c,'2026-11-15',NULL,0,rows,'validate',gen_random_uuid());
END $$;
RESET ROLE;
DELETE FROM cost_entries WHERE payroll_period_id IN(SELECT payroll_period_id FROM payroll_preparations WHERE start_date='2026-11-01');
SET ROLE authenticated;
SELECT set_config('test.allowed','yes',false),set_config('test.member','yes',false);
DO $$ DECLARE prep payroll_preparations%ROWTYPE; BEGIN
 SELECT * INTO prep FROM payroll_preparations WHERE start_date='2026-11-01';
 PERFORM settle_payroll_fortnight(prep.id,prep.revision,80,'2026-11-20','cash','MISSING-COST-TEST',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM cost_entries WHERE payroll_period_id=prep.payroll_period_id) THEN RAISE EXCEPTION 'Payment generated missing costs'; END IF;
END $$;
RESET ROLE;
