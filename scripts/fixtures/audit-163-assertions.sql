SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO farms(id,domain_id,name,status) VALUES('60000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ferme A','active'),('60000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Ferme B','active');
INSERT INTO teams VALUES('60000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','60000000-0000-4000-8000-000000000001','Équipe A');
INSERT INTO workers VALUES('60000000-0000-4000-8000-000000000004',NULL,'60000000-0000-4000-8000-000000000003','Ahmed','Test','CIN SECRET');
INSERT INTO workers VALUES('60000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003','Conflicting','Worker','SECRET');
INSERT INTO labor_entries VALUES('60000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000004',NULL,NULL,8,current_date);
INSERT INTO leave_requests VALUES('60000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000004','demande',2,'MEDICAL SECRET');
INSERT INTO warehouses VALUES('60000000-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','Entrepôt A');
INSERT INTO stock_items VALUES('60000000-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','Article A');
INSERT INTO warehouse_stocks VALUES('60000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111',10);
UPDATE warehouse_stocks SET current_qty=12;
INSERT INTO reference_lists VALUES('generic','Référentiel partagé');
INSERT INTO reference_values VALUES('60000000-0000-4000-8000-000000000010','generic','C1','Choix A','{"password":"SECRET"}');
DO $$DECLARE r jsonb; h jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
 IF r::text LIKE '%SECRET%' OR r::text LIKE '%Conflicting%' OR r::text LIKE '%Référentiel partagé%' THEN RAISE EXCEPTION 'Sensitive or cross-scope values leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE table_name='labor_entries' AND domain_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'Missing worker-chain ownership'; END IF;
 IF EXISTS(SELECT 1 FROM audit_events WHERE table_name='workers' AND entity_id='60000000-0000-4000-8000-000000000005' AND domain_id IS NOT NULL) THEN RAISE EXCEPTION 'Ambiguous ownership guessed'; END IF;
 IF (SELECT count(DISTINCT entity_id) FROM audit_events WHERE table_name='warehouse_stocks')<>1 THEN RAISE EXCEPTION 'Composite entity identity unstable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE table_name='warehouse_stocks' AND after_values->'_labels'->>'60000000-0000-4000-8000-000000000008'='Entrepôt A') THEN RAISE EXCEPTION 'Missing trusted relation label'; END IF;
 h:=public.audit_entity_history('11111111-1111-4111-8111-111111111111','labor_entries','60000000-0000-4000-8000-000000000006');
 IF (h->>'total')::int<>1 OR h::text NOT LIKE '%Ahmed%' THEN RAISE EXCEPTION 'Context history or human label missing'; END IF;
 BEGIN PERFORM public.audit_entity_history('22222222-2222-4222-8222-222222222222','workers'); RAISE EXCEPTION 'Cross client history allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.audit_report(NULL,now()-interval '1 day',now()); RAISE EXCEPTION 'Shared scope allowed for tenant admin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
CREATE TABLE auth.audit_log_entries(id uuid PRIMARY KEY,created_at timestamptz,payload jsonb);
INSERT INTO auth.audit_log_entries VALUES
 ('70000000-0000-4000-8000-000000000001',now(),'{"actor_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","action":"login"}'),
 ('70000000-0000-4000-8000-000000000002',now(),'{"actor_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","action":"token_refreshed"}');
DO $$DECLARE r jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
 IF (r->'summary'->>'logins')::int<>0 OR (r->'connection_diagnostics'->>'own_refreshes')::int<>1 THEN RAISE EXCEPTION 'Refresh misclassified or platform login leaked'; END IF;
END$$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
DO $$DECLARE r jsonb; shared jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
 IF (r->'summary'->>'logins')::int<>1 OR r::text NOT LIKE '%platform_account%' THEN RAISE EXCEPTION 'Platform login without membership missing'; END IF;
 shared:=public.audit_report(NULL,now()-interval '1 day',now()+interval '1 day');
 IF shared::text NOT LIKE '%Référentiel partagé%' THEN RAISE EXCEPTION 'Global configuration audit missing'; END IF;
END$$;
SELECT 'PASS audit163: composite keys, multiple owner paths, conflict quarantine, safe fields, contextual history, labels, global scope and native connection diagnosis' result;
