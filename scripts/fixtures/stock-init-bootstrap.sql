CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE domains(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE farms(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,is_active boolean DEFAULT true);
CREATE FUNCTION has_domain_permission(d uuid,u uuid,m text,a text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT u='10000000-0000-0000-0000-000000000001'::uuid AND d='20000000-0000-0000-0000-000000000001'::uuid
 AND (a<>'create' OR current_setting('test.can_create',true) IS DISTINCT FROM 'no') $$;
CREATE TABLE reference_values(id uuid DEFAULT gen_random_uuid(),list_key text,code text,label text,is_active boolean DEFAULT true);
CREATE TYPE stock_category AS ENUM('semences','plants','engrais','phytosanitaires','emballages','consommables','pieces_rechange','autre');
CREATE TYPE movement_type AS ENUM('entree','sortie','ajustement','transfert');
CREATE TABLE stock_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid REFERENCES domains,code text,name text,category stock_category,unit text,current_qty numeric DEFAULT 0,min_qty numeric DEFAULT 0,is_active boolean DEFAULT true,notes text,updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX stock_code ON stock_items(domain_id,upper(code));
CREATE TABLE warehouses(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,farm_id uuid REFERENCES farms,code text,is_active boolean DEFAULT true,is_default boolean DEFAULT false);
CREATE TABLE warehouse_stocks(warehouse_id uuid REFERENCES warehouses,stock_item_id uuid REFERENCES stock_items,domain_id uuid REFERENCES domains,current_qty numeric DEFAULT 0,inventory_value numeric,valuation_verified boolean DEFAULT false,min_qty numeric DEFAULT 0,updated_at timestamptz DEFAULT now(),PRIMARY KEY(warehouse_id,stock_item_id));
CREATE TABLE stock_transfers(id uuid PRIMARY KEY);
CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid REFERENCES domains,stock_item_id uuid REFERENCES stock_items,warehouse_id uuid REFERENCES warehouses,movement_type movement_type,quantity numeric(10,2),unit_cost numeric(20,8),total_cost numeric(20,6),movement_date date,reference text,notes text,created_by uuid,valuation_verified boolean DEFAULT false,transfer_id uuid REFERENCES stock_transfers);
INSERT INTO profiles VALUES('10000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000002',true);
INSERT INTO domains VALUES('20000000-0000-0000-0000-000000000001',true),('20000000-0000-0000-0000-000000000002',true);
INSERT INTO farms VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true);
INSERT INTO warehouses VALUES('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','D1',true,true),('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','OTHER',true,true),('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','D2',true,false);
INSERT INTO reference_values(list_key,code,label) VALUES('stock_category','engrais','Engrais'),('unit','kg','Kilogramme');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
CREATE FUNCTION test_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',msg; END IF; END $$;
CREATE FUNCTION test_reject(sql_text text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql_text; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE EXCEPTION 'Unexpected error: % (wanted %)',SQLERRM,expected; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
