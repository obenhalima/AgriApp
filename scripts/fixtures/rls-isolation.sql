-- Disposable synthetic PostgreSQL fixture. Never run against Supabase.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('role',true) $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE domains(id uuid PRIMARY KEY,code text,is_active boolean);
CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean,domain_id uuid);
INSERT INTO domains VALUES('8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','DOM-BENHALIMA',true),('22222222-2222-4222-8222-222222222222','OTHER',true);
INSERT INTO profiles VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'22222222-2222-4222-8222-222222222222');
CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION is_domain_member(uuid,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=$2 AND domain_id=$1 AND is_active) $$;
CREATE FUNCTION has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT is_domain_member($1,$2) AND $3 NOT LIKE '__protected%' $$;
CREATE TABLE farms(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE campaigns(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE campaign_plantings(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE greenhouses(id uuid PRIMARY KEY,farm_id uuid REFERENCES farms);
CREATE TABLE varieties(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE harvests(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE station_settlements(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains);
CREATE TABLE clients(id uuid PRIMARY KEY,code text,preferred_variety_ids uuid[],is_ecart_buyer boolean DEFAULT false,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT '2020-01-01');
CREATE TABLE markets(id uuid PRIMARY KEY,code text,client_id uuid REFERENCES clients,is_ecart_market boolean DEFAULT false,is_active boolean DEFAULT true);
ALTER TABLE clients ADD COLUMN market_id uuid REFERENCES markets;
CREATE TABLE sales_orders(id uuid PRIMARY KEY,client_id uuid REFERENCES clients,market_id uuid REFERENCES markets,campaign_id uuid REFERENCES campaigns,status text,updated_at timestamptz);
CREATE TABLE invoices(id uuid PRIMARY KEY,client_id uuid REFERENCES clients,order_id uuid REFERENCES sales_orders);
CREATE TABLE payments_received(id uuid PRIMARY KEY,invoice_id uuid REFERENCES invoices);
CREATE TABLE delivery_notes(id uuid PRIMARY KEY,order_id uuid REFERENCES sales_orders);
CREATE TABLE farm_zones(id uuid PRIMARY KEY,farm_id uuid REFERENCES farms);
CREATE TABLE teams(id uuid PRIMARY KEY,farm_id uuid REFERENCES farms);
CREATE TABLE cultural_operations(id uuid PRIMARY KEY,campaign_planting_id uuid REFERENCES campaign_plantings);
CREATE TABLE production_forecasts(id uuid PRIMARY KEY,campaign_planting_id uuid REFERENCES campaign_plantings);
CREATE TABLE alerts(id uuid PRIMARY KEY,entity_type text,entity_id uuid);
CREATE TABLE documents(id uuid PRIMARY KEY,entity_type text,entity_id uuid);
CREATE TABLE harvest_lots(id uuid PRIMARY KEY,domain_id uuid REFERENCES domains,market_id uuid REFERENCES markets,invoice_id uuid REFERENCES invoices);
CREATE VIEW v_client_balances AS SELECT c.id,count(i.id) FROM clients c LEFT JOIN invoices i ON i.client_id=c.id GROUP BY c.id;
CREATE FUNCTION client_variety_old_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF cardinality(NEW.preferred_variety_ids)>0 THEN RAISE EXCEPTION 'legacy'; END IF; RETURN NEW; END $$;
CREATE TRIGGER client_variety_preferences_guard BEFORE INSERT OR UPDATE OF preferred_variety_ids ON clients FOR EACH ROW EXECUTE FUNCTION client_variety_old_guard();
CREATE FUNCTION fixture_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER fixture_timestamp BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION fixture_timestamp();
CREATE FUNCTION admin_generate_dispatch_invoice(p_lot_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 RETURN (SELECT jsonb_build_object('invoice_id',invoice_id) FROM harvest_lots WHERE id=p_lot_id);
END $$;
CREATE FUNCTION admin_generate_settlement_invoice(p_settlement_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 RETURN jsonb_build_object('settlement_id',p_settlement_id);
END $$;
CREATE FUNCTION create_ecart_dispatch(p_parent_lot_id uuid,p_ecart_qty_kg numeric DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_parent record;v_id uuid;
BEGIN
 SELECT * INTO v_parent FROM harvest_lots WHERE id=p_parent_lot_id;
 SELECT id INTO v_id FROM markets WHERE is_ecart_market = TRUE AND is_active = TRUE LIMIT 1;
 RETURN v_id;
END $$;
CREATE FUNCTION apply_authorized_workflow_transition(p_entity_type text,p_entity_id uuid,p_transition_id uuid,p_comment text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE d uuid;current_status text;
BEGIN
 SELECT c.domain_id,o.status::text INTO d,current_status FROM sales_orders o LEFT JOIN campaigns c ON c.id=o.campaign_id WHERE o.id=p_entity_id;
 IF NOT coalesce(has_domain_permission(d,auth.uid(),'commandes','edit'),false) THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('domain',d);
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;
