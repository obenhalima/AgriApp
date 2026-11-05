-- Additional schema shapes used only in the disposable test database.
CREATE TABLE teams(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,farm_id uuid REFERENCES farms,name text);
CREATE TABLE workers(id uuid PRIMARY KEY,farm_id uuid REFERENCES farms,team_id uuid REFERENCES teams,first_name text,last_name text,cin text);
CREATE TABLE labor_entries(id uuid PRIMARY KEY,worker_id uuid REFERENCES workers,campaign_id uuid,greenhouse_id uuid REFERENCES greenhouses,hours_worked numeric,work_date date);
CREATE TABLE leave_requests(id uuid PRIMARY KEY,worker_id uuid REFERENCES workers,status text,days integer,reason text);
CREATE TABLE warehouses(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,name text);
CREATE TABLE stock_items(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,name text);
CREATE TABLE warehouse_stocks(warehouse_id uuid REFERENCES warehouses,stock_item_id uuid REFERENCES stock_items,domain_id uuid REFERENCES domains,current_qty numeric,PRIMARY KEY(warehouse_id,stock_item_id));
CREATE TABLE reference_lists(key text PRIMARY KEY,label text);
CREATE TABLE reference_values(id uuid PRIMARY KEY,list_key text REFERENCES reference_lists,code text,label text,metadata jsonb);
