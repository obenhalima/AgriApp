ALTER TABLE profiles ADD must_change_password boolean DEFAULT false;
ALTER TABLE farms ADD name text DEFAULT 'Ferme test';
ALTER TABLE warehouses ADD name text DEFAULT 'Entrepot test';
ALTER TABLE stock_items ADD unit_cost numeric;
ALTER TABLE stock_movements ADD campaign_id uuid, ADD greenhouse_id uuid;
CREATE TABLE campaigns(id uuid PRIMARY KEY,domain_id uuid,name text);
CREATE TABLE greenhouses(id uuid PRIMARY KEY,farm_id uuid,name text,code text);
CREATE TABLE varieties(id uuid PRIMARY KEY,commercial_name text);
CREATE TABLE campaign_plantings(id uuid PRIMARY KEY,domain_id uuid,campaign_id uuid,greenhouse_id uuid,variety_id uuid,planted_area numeric);
CREATE TABLE stock_exit_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid,stock_item_id uuid,quantity numeric,requested_for date,reason text,reference text,requested_by uuid,warehouse_id uuid,campaign_id uuid,greenhouse_id uuid,status text DEFAULT 'soumise',executed_by uuid,executed_at timestamptz,stock_movement_id uuid,updated_at timestamptz);
CREATE TABLE inventory_consumption_reviews(movement_id uuid PRIMARY KEY,domain_id uuid,campaign_planting_id uuid,unit_cost numeric,reason text);
CREATE TABLE account_categories(id uuid PRIMARY KEY,code text);
CREATE FUNCTION map_purchase_cat_to_account_code(text) RETURNS text LANGUAGE sql AS $$ SELECT 'TEST'::text $$;
CREATE TABLE cost_entries(id uuid DEFAULT gen_random_uuid(),domain_id uuid,campaign_id uuid,greenhouse_id uuid,variety_id uuid,account_category_id uuid,cost_category text,amount numeric,entry_date date,description text,is_planned boolean,source_stock_movement_id uuid,allocation_method text,cost_quality text);
CREATE UNIQUE INDEX cost_source ON cost_entries(source_stock_movement_id,campaign_id,greenhouse_id,variety_id);
CREATE TABLE treatment_applications(id uuid,treatment_request_id uuid,actual_cost_areas jsonb);
CREATE TABLE treatment_application_products(application_id uuid,stock_movement_id uuid);
CREATE TABLE treatment_request_targets(treatment_request_id uuid,campaign_planting_id uuid,treated_area_m2 numeric);
CREATE TABLE cultural_consumptions(movement_id uuid);
-- Spy only for the legacy linked-treatment delegation, outside the new manual path.
CREATE TABLE legacy_review_calls(movement_id uuid);
CREATE FUNCTION review_inventory_consumption(uuid,uuid,numeric,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO legacy_review_calls VALUES($1) $$;
INSERT INTO campaigns VALUES('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026');
INSERT INTO greenhouses VALUES('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','S1','S1'),('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','S2','S2');
INSERT INTO varieties VALUES('70000000-0000-0000-0000-000000000001','Tomate');
INSERT INTO campaign_plantings VALUES('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',100),('80000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001',300);

CREATE TABLE approval_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid,process_code text,entity_id uuid,status text,current_level integer DEFAULT 1,completed_at timestamptz,updated_at timestamptz);

ALTER TABLE stock_exit_requests ADD approved_by uuid, ADD approved_at timestamptz, ADD rejected_by uuid, ADD rejected_at timestamptz, ADD rejection_reason text;
CREATE FUNCTION is_domain_responsible(d uuid,u uuid,m text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT d='20000000-0000-0000-0000-000000000001'::uuid AND u='10000000-0000-0000-0000-000000000002'::uuid $$;
