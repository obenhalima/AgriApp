-- Test data + assertions ONLY against the disposable database created by test-audit-postgres.ps1.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
UPDATE farms SET status='approved',validated_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',notes='another secret' WHERE name='Seed';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE action='validate' AND actor_id=auth.uid()) THEN RAISE EXCEPTION 'Missing trusted validator'; END IF;
 IF EXISTS(SELECT 1 FROM audit_events WHERE after_values ? 'password' OR after_values ? 'notes') THEN RAISE EXCEPTION 'Secret stored'; END IF;
END$$;
BEGIN;
INSERT INTO farms VALUES('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','Rollback','draft',NULL,NULL,NULL);
ROLLBACK;
DO $$BEGIN IF EXISTS(SELECT 1 FROM audit_events WHERE entity_id='55555555-5555-4555-8555-555555555555') THEN RAISE EXCEPTION 'Rollback leaked event'; END IF; END$$;
-- Ownership transfer must not disclose new values to the departing client.
UPDATE farms SET domain_id='22222222-2222-4222-8222-222222222222',name='Private B' WHERE name='Seed';
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM audit_events WHERE action='scope_exit' AND after_values IS NOT NULL) THEN RAISE EXCEPTION 'Transfer leak'; END IF;
END$$;
DELETE FROM farms WHERE name='Private B';
DO $$BEGIN
 IF (SELECT count(*) FROM audit_events WHERE action='delete' AND domain_id='22222222-2222-4222-8222-222222222222')<>3 THEN RAISE EXCEPTION 'Cascade attribution incorrect'; END IF;
END$$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$DECLARE r jsonb; BEGIN
 r:=public.audit_report('22222222-2222-4222-8222-222222222222',now()-interval '1 day',now()+interval '1 day');
 IF (r->'summary'->>'transactions')::int<>2 OR (r->'summary'->>'total')::int<>4 THEN RAISE EXCEPTION 'Row events incorrectly counted as SQL transactions'; END IF;
END$$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO auth.audit_log_entries VALUES
 ('10000000-0000-4000-8000-000000000001',now(),'{"actor_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","action":"login","secret":"never expose"}'),
 ('10000000-0000-4000-8000-000000000002',now(),'{"actor_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","action":"login"}'),
 ('10000000-0000-4000-8000-000000000003',now(),'{"actor_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","action":"token_refreshed"}');
SET ROLE authenticated;
DO $$DECLARE r jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
 IF (r->'summary'->>'logins')::int<>1 THEN RAISE EXCEPTION 'Refresh counted as login / cross-tenant auth leak'; END IF;
 IF r::text LIKE '%Private B%' OR r::text LIKE '%never expose%' THEN RAISE EXCEPTION 'Leaked values'; END IF;
 BEGIN PERFORM public.audit_report('22222222-2222-4222-8222-222222222222',now()-interval '1 day',now()+interval '1 day'); RAISE EXCEPTION 'Cross tenant allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.audit_events; RAISE EXCEPTION 'Direct read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.audit_events SELECT * FROM public.audit_events; RAISE EXCEPTION 'Forged event allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM itrix_audit_private.capture(); RAISE EXCEPTION 'Private function exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
DO $$BEGIN
 BEGIN DELETE FROM public.audit_events; RAISE EXCEPTION 'Deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE public.audit_events; RAISE EXCEPTION 'Truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
-- Same-time events use a stable keyset; no duplicate / omitted cursor rows.
DO $$DECLARE r jsonb; n jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day',p_limit=>1);
 n:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day',p_before=>(r->'events'->0->>'occurred_at')::timestamptz,p_before_id=>r->'events'->0->>'event_id',p_limit=>1);
 IF jsonb_array_length(n->'events')<>1 OR r->'events'->0->>'event_id'=n->'events'->0->>'event_id' THEN RAISE EXCEPTION 'Cursor omitted or duplicated'; END IF;
END$$;
-- Absence of native Auth storage is explicit, not a fabricated login history.
DROP TABLE auth.audit_log_entries;
DO $$DECLARE r jsonb; BEGIN
 r:=public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
 IF (r->>'auth_source_present')::boolean OR (r->'summary'->>'logins')::int<>0 THEN RAISE EXCEPTION 'Missing source hidden'; END IF;
 BEGIN PERFORM public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '100 days',now()); RAISE EXCEPTION 'Unbounded period'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$BEGIN
 BEGIN PERFORM public.audit_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()); RAISE EXCEPTION 'Anonymous report allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT 'PASS tenant isolation, trusted actor, validation, safe fields, transfer, cascades, rollback, auth refresh, RPC and immutability' result;
