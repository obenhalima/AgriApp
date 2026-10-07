-- Disposable local database ONLY. Roles anon/authenticated must exist.
\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE TABLE farms(id uuid PRIMARY KEY,domain_id uuid);
CREATE TABLE greenhouses(id uuid PRIMARY KEY,farm_id uuid);
CREATE TABLE station_settlements(id uuid PRIMARY KEY,code text,status text DEFAULT 'brouillon',invoice_id uuid,validated_at timestamptz,validated_by uuid,updated_at timestamptz);
CREATE TABLE station_settlement_lines(id uuid PRIMARY KEY,settlement_id uuid,farm_id uuid,market_id uuid,variety_id uuid,qty_kg numeric,price_per_kg numeric,created_at timestamptz DEFAULT now());
CREATE TABLE harvest_lots(id uuid PRIMARY KEY,domain_id uuid,greenhouse_id uuid,market_id uuid,variety_id uuid,qty_acceptee_kg numeric,qty_priced_kg numeric DEFAULT 0,ca_amount numeric,price_per_kg numeric,settlement_id uuid,invoice_id uuid,tri_status text DEFAULT 'tried',category text DEFAULT 'station_dispatch',harvest_date date DEFAULT current_date,created_at timestamptz DEFAULT now());
CREATE TABLE station_settlement_allocations(id uuid DEFAULT gen_random_uuid(),settlement_line_id uuid,harvest_lot_id uuid,qty_allocated_kg numeric,price_per_kg numeric,UNIQUE(settlement_line_id,harvest_lot_id));
\ir ../supabase/migrations/143_settlement_correction_guards.sql
INSERT INTO farms VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
INSERT INTO greenhouses VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
INSERT INTO harvest_lots(id,domain_id,greenhouse_id,market_id,variety_id,qty_acceptee_kg) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',100);
INSERT INTO station_settlements(id,code) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'QA-'||n FROM generate_series(1,3)n;
INSERT INTO station_settlement_lines(id,settlement_id,farm_id,market_id,variety_id,qty_kg,price_per_kg)
 SELECT id,id,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',CASE code WHEN 'QA-1' THEN 40 ELSE 60 END,CASE code WHEN 'QA-1' THEN 2 ELSE 4 END FROM station_settlements;
CREATE FUNCTION pg_temp.assert_lot(q numeric,ca numeric,p numeric) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM harvest_lots WHERE qty_priced_kg=q AND ca_amount=ca AND price_per_kg=p) THEN RAISE EXCEPTION 'Bad quantities or amounts'; END IF;
END $$;
SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_lot(40,80,2);
SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_lot(100,320,3.2);
SELECT admin_unvalidate_station_settlement('00000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_lot(40,80,2);
SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_lot(100,320,3.2);
CREATE FUNCTION pg_temp.must_fail(q text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RETURN; END; RAISE EXCEPTION 'Expected rejection: %',q;
END $$;
SELECT pg_temp.must_fail($q$SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.must_fail($q$SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000003')$q$);
UPDATE station_settlements SET invoice_id=id WHERE code='QA-2';
SELECT pg_temp.must_fail($q$SELECT admin_unvalidate_station_settlement('00000000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.assert_lot(100,320,3.2);
UPDATE station_settlement_lines SET farm_id=null WHERE settlement_id='00000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT admin_validate_station_settlement('00000000-0000-0000-0000-000000000003')$q$);
DO $$ BEGIN
 IF (SELECT count(*) FROM station_settlement_allocations)<>2 THEN RAISE EXCEPTION 'Duplicate or lost allocations'; END IF;
 IF (SELECT status FROM station_settlements WHERE code='QA-3')<>'brouillon' THEN RAISE EXCEPTION 'Failed validation not rolled back'; END IF;
END $$;
SELECT 'PASS split pricing, weighted price, cancellation, revalidation, invoiced lock, missing farm, insufficient stock' AS result;
