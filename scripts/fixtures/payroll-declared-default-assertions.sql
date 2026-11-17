DO $$
DECLARE result jsonb;
BEGIN
 IF payroll_net_amounts(230,NULL,'2026-11-01',0,'{}')<>payroll_net_amounts(230,true,'2026-11-01',0,'{}') THEN RAISE EXCEPTION 'NULL is not declared by default'; END IF;
 INSERT INTO workers(id,farm_id,first_name,last_name,matricule,is_declared) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','','DEFAULT','DEFAULT',NULL);
 IF (SELECT is_declared FROM workers WHERE matricule='DEFAULT') IS DISTINCT FROM true THEN RAISE EXCEPTION 'NULL insert default failed'; END IF;
 UPDATE workers SET is_declared=false WHERE matricule='DEFAULT';
 IF (SELECT is_declared FROM workers WHERE matricule='DEFAULT') IS DISTINCT FROM false THEN RAISE EXCEPTION 'explicit false lost'; END IF;
 UPDATE workers SET is_declared=NULL WHERE matricule='DEFAULT';
 IF (SELECT is_declared FROM workers WHERE matricule='DEFAULT') IS DISTINCT FROM true THEN RAISE EXCEPTION 'NULL update default failed'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE ctx jsonb;
BEGIN
 SELECT x INTO ctx FROM jsonb_array_elements(payroll_net_context('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2026-11-01')) x WHERE x->>'worker_id'='55555555-5555-4555-8555-555555555555';
 IF ctx->>'is_declared'<>'true' THEN RAISE EXCEPTION 'existing NULL worker not treated as declared'; END IF;
END $$;
RESET ROLE;
