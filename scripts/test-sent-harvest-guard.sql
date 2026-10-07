-- Run ONLY in a disposable empty local database. No production data.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.is_admin_caller() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE TABLE harvests(id uuid PRIMARY KEY,domain_id uuid,notes text,actual_kg numeric,harvest_person_target numeric,qty numeric DEFAULT 100,total_qty numeric GENERATED ALWAYS AS(qty) STORED);
CREATE TABLE harvest_lots(id uuid PRIMARY KEY,harvest_id uuid REFERENCES harvests,domain_id uuid,category text,weighed_kg numeric);
CREATE TABLE harvest_lot_sources(id uuid PRIMARY KEY,harvest_id uuid REFERENCES harvests ON DELETE CASCADE,harvest_lot_id uuid REFERENCES harvest_lots ON DELETE CASCADE,qty_contributed_kg numeric);
INSERT INTO harvests(id,domain_id) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001' FROM generate_series(1,6)n;
INSERT INTO harvest_lots VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','station_dispatch',null);
\ir ../supabase/migrations/142_sent_harvest_guard.sql
CREATE FUNCTION pg_temp.must_fail(q text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',q;
END $$;
SELECT pg_temp.must_fail($q$UPDATE harvests SET notes='forbidden' WHERE id='00000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.must_fail($q$DELETE FROM harvests WHERE id='00000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.must_fail($q$SELECT admin_bulk_delete_harvests(ARRAY['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']::uuid[])$q$);
UPDATE harvests SET notes='allowed' WHERE id='00000000-0000-0000-0000-000000000002';
INSERT INTO harvest_lots VALUES('10000000-0000-0000-0000-000000000002',null,'00000000-0000-0000-0000-000000000001','station_dispatch',null);
INSERT INTO harvest_lot_sources VALUES('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',40);
SELECT pg_temp.must_fail($q$UPDATE harvests SET qty=999 WHERE id='00000000-0000-0000-0000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE harvests SET actual_kg=999 WHERE id='00000000-0000-0000-0000-000000000002'$q$);
-- Same update pattern as station weighing: source weights, lot weight, harvest aggregate.
UPDATE harvest_lot_sources SET qty_contributed_kg=42;
UPDATE harvest_lots SET weighed_kg=42 WHERE id='10000000-0000-0000-0000-000000000002';
UPDATE harvests SET actual_kg=42 WHERE id='00000000-0000-0000-0000-000000000002';
DELETE FROM harvest_lot_sources;
SELECT pg_temp.must_fail($q$DELETE FROM harvests WHERE id='00000000-0000-0000-0000-000000000002'$q$);
UPDATE harvests SET domain_id='00000000-0000-0000-0000-000000000099' WHERE id='00000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT admin_bulk_delete_harvests(ARRAY['00000000-0000-0000-0000-000000000003']::uuid[])$q$);
SELECT pg_temp.must_fail($q$INSERT INTO harvest_lot_sources VALUES('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',40)$q$);
SELECT admin_bulk_delete_harvests(ARRAY['00000000-0000-0000-0000-000000000004']::uuid[]);
DO $$ BEGIN
 IF (SELECT count(*) FROM harvests)<>5 OR (SELECT count(*) FROM harvest_lots)<>2 THEN RAISE EXCEPTION 'Unexpected deletion'; END IF;
 IF (SELECT actual_kg FROM harvests WHERE id='00000000-0000-0000-0000-000000000002')<>42 THEN RAISE EXCEPTION 'Weighing failed'; END IF;
END $$;
SELECT 'PASS sent harvest guard, weighing, durable lock, bulk atomic rejection and domain checks' AS result;
