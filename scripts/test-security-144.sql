-- Disposable local PostgreSQL only. Minimal schema contract, real migration under test.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('role',coalesce(nullif(current_setting('test.jwt_role',true),''),'authenticated')) $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean DEFAULT true,is_platform_admin boolean DEFAULT false,full_name text);
CREATE TABLE domains(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
CREATE TABLE roles(id uuid PRIMARY KEY,is_active boolean DEFAULT true,is_admin boolean DEFAULT false);
CREATE TABLE domain_memberships(id uuid DEFAULT gen_random_uuid(),domain_id uuid,user_id uuid,role_id uuid,is_active boolean DEFAULT true);
CREATE TABLE farms(id uuid PRIMARY KEY,domain_id uuid);
CREATE TABLE teams(id uuid PRIMARY KEY,farm_id uuid);
CREATE TABLE workers(id uuid PRIMARY KEY,farm_id uuid,team_id uuid,bank_iban text);
CREATE TABLE campaigns(id uuid PRIMARY KEY,domain_id uuid);
CREATE TABLE purchase_orders(id uuid PRIMARY KEY,domain_id uuid,purchase_type text DEFAULT 'standard',total_amount numeric DEFAULT 0,tax_amount numeric DEFAULT 0,po_number text,status text DEFAULT 'brouillon',updated_at timestamptz);
CREATE TABLE purchase_order_lines(id uuid DEFAULT gen_random_uuid(),po_id uuid,quantity numeric,unit_price numeric,received_qty numeric DEFAULT 0);
CREATE TABLE costed_purchase_receipts(id uuid DEFAULT gen_random_uuid(),po_id uuid);
CREATE TABLE sales_orders(id uuid PRIMARY KEY,campaign_id uuid,status text DEFAULT 'brouillon',updated_at timestamptz);
CREATE TABLE treatment_requests(id uuid,domain_id uuid);
CREATE TABLE stock_exit_requests(id uuid,domain_id uuid);
CREATE TABLE approval_policies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid,process_code text,operation_type text,validation_enabled boolean,approval_levels int DEFAULT 1,amount_threshold numeric,priority int DEFAULT 100,is_active boolean DEFAULT true);
CREATE TABLE approval_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid,policy_id uuid,process_code text,operation_type text,entity_id uuid,entity_reference text,amount numeric,status text,current_level int,required_levels int,requested_by uuid,completed_at timestamptz,comment text,UNIQUE(process_code,entity_id));
CREATE TABLE approval_decisions(request_id uuid,domain_id uuid,level_number int,decision text,comment text);
CREATE TABLE workflow_definitions(id uuid PRIMARY KEY,entity_type text,is_active boolean DEFAULT true);
CREATE TABLE workflow_states(id uuid PRIMARY KEY,definition_id uuid,code text);
CREATE TABLE workflow_transitions(id uuid PRIMARY KEY,definition_id uuid,from_state_id uuid,to_state_id uuid,is_active boolean DEFAULT true,requires_approval boolean DEFAULT false);
CREATE TABLE workflow_history(entity_type text,entity_id uuid,definition_id uuid,transition_id uuid,from_state_code text,to_state_code text,performed_by uuid,comment text);
CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT is_platform_admin AND is_active FROM profiles WHERE id=$1),false) $$;
CREATE FUNCTION is_domain_member(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM domain_memberships m JOIN domains d ON d.id=m.domain_id JOIN profiles p ON p.id=m.user_id WHERE m.domain_id=$1 AND m.user_id=$2 AND m.is_active AND d.is_active AND p.is_active) $$;
-- Fixture grants only create/edit/view to ordinary active members, admin to admin roles.
CREATE FUNCTION has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT is_platform_admin($2) OR (is_domain_member($1,$2) AND EXISTS(SELECT 1 FROM domain_memberships m JOIN roles r ON r.id=m.role_id WHERE m.domain_id=$1 AND m.user_id=$2 AND m.is_active AND r.is_active AND ($4 IN ('view','create','edit') OR r.is_admin))) $$;
CREATE FUNCTION can_manage_profile(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION resolve_approval_policy(p_domain uuid,p_process text,p_type text DEFAULT '*',p_amount numeric DEFAULT NULL)
RETURNS approval_policies LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT ap.* FROM approval_policies ap WHERE ap.domain_id=p_domain AND ap.process_code=p_process AND ap.is_active
 AND ap.operation_type IN(coalesce(nullif(p_type,''),'*'),'*') AND(ap.amount_threshold IS NULL OR coalesce(p_amount,0)>=ap.amount_threshold)
 ORDER BY(ap.operation_type=coalesce(nullif(p_type,''),'*')) DESC,ap.amount_threshold DESC NULLS LAST,ap.priority LIMIT 1 $$;
CREATE POLICY auth_read_workers ON workers FOR SELECT TO authenticated USING(true);
CREATE POLICY admin_write_workers ON workers FOR ALL TO authenticated USING(true);
\ir ../supabase/migrations/144_security_boundaries.sql
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; END $$;
CREATE FUNCTION pg_temp.must_fail(q text,label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS refusal %: %',label,SQLERRM; RETURN; END; RAISE EXCEPTION 'FAIL accepted %',label; END $$;
INSERT INTO profiles(id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
INSERT INTO domains(id) VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO roles(id,is_admin) VALUES('20000000-0000-0000-0000-000000000001',false),('20000000-0000-0000-0000-000000000002',true);
INSERT INTO domain_memberships(domain_id,user_id,role_id) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002');
INSERT INTO farms VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO teams VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
INSERT INTO workers VALUES
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',null,'A'),
 ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','B'),
 ('50000000-0000-0000-0000-000000000003',null,'40000000-0000-0000-0000-000000000001','team A'),
 ('50000000-0000-0000-0000-000000000004',null,null,'unassigned');
SET test.uid='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM workers),'workers own direct/team only');
SELECT pg_temp.must_fail($q$INSERT INTO workers VALUES(gen_random_uuid(),'30000000-0000-0000-0000-000000000002',null,'x')$q$,'cross-tenant worker insert');
RESET ROLE;
SET test.jwt_role='service_role';
UPDATE profiles SET is_active=false WHERE id=auth.uid();
SET test.jwt_role='authenticated';
SET ROLE authenticated;
SELECT pg_temp.must_fail($q$UPDATE profiles SET is_active=true WHERE id=auth.uid()$q$,'self reactivation');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM workers),'inactive worker read');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
UPDATE profiles SET is_active=true WHERE id='00000000-0000-0000-0000-000000000001';
UPDATE profiles SET full_name='legitimate personal update' WHERE id=auth.uid();
RESET ROLE;
SET test.jwt_role='service_role';
UPDATE profiles SET is_active=false WHERE id=auth.uid();
SET test.jwt_role='authenticated';
SET ROLE authenticated;
SELECT pg_temp.must_fail($q$UPDATE profiles SET is_active=true WHERE id=auth.uid()$q$,'inactive admin self reactivation');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000002';
INSERT INTO approval_policies(domain_id,process_code,operation_type,validation_enabled,amount_threshold)
 VALUES('10000000-0000-0000-0000-000000000002','purchase_order','standard',true,100);
INSERT INTO purchase_orders(id,domain_id,total_amount,po_number) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',200,'TEST'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',50,'ALLOWED');
INSERT INTO purchase_order_lines(po_id,quantity,unit_price) VALUES
 ('60000000-0000-0000-0000-000000000001',2,100),('60000000-0000-0000-0000-000000000002',1,50);
SET ROLE authenticated;
UPDATE purchase_orders SET total_amount=0 WHERE id='60000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail($q$SELECT submit_approval_request('purchase_order','standard','60000000-0000-0000-0000-000000000001','forged',0)$q$,'persisted understated header');
UPDATE purchase_orders SET total_amount=200 WHERE id='60000000-0000-0000-0000-000000000001';
SELECT submit_approval_request('purchase_order','UNKNOWN','60000000-0000-0000-0000-000000000001','forged',0);
SELECT pg_temp.assert_true((SELECT status='soumise' AND operation_type='standard' AND amount=200 AND entity_reference='TEST' FROM approval_requests),'canonical approval');
SELECT pg_temp.must_fail($q$UPDATE purchase_orders SET status='envoye' WHERE id='60000000-0000-0000-0000-000000000001'$q$,'unapproved send');
SELECT pg_temp.must_fail($q$UPDATE purchase_orders SET purchase_type='unknown' WHERE id='60000000-0000-0000-0000-000000000001'$q$,'unknown stored selector');
RESET ROLE;
UPDATE approval_requests SET status='approuvee';
SET ROLE authenticated;
UPDATE purchase_orders SET status='envoye' WHERE id='60000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail($q$UPDATE purchase_order_lines SET unit_price=999 WHERE po_id='60000000-0000-0000-0000-000000000001'$q$,'line edit after approval');
INSERT INTO costed_purchase_receipts(po_id) VALUES('60000000-0000-0000-0000-000000000001');
UPDATE purchase_order_lines SET received_qty=1 WHERE po_id='60000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail($q$UPDATE purchase_orders SET total_amount=300 WHERE id='60000000-0000-0000-0000-000000000001'$q$,'stale approved amount');
RESET ROLE;
INSERT INTO workflow_definitions VALUES('70000000-0000-0000-0000-000000000001','purchase_order',true);
INSERT INTO workflow_states VALUES
 ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','brouillon'),
 ('80000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','annule');
INSERT INTO workflow_transitions VALUES('90000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002',true,false);
SET ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT apply_authorized_workflow_transition('purchase_order','60000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001')$q$,'cross-tenant workflow');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT submit_approval_request('purchase_order',null,'60000000-0000-0000-0000-000000000002',null,null);
SELECT pg_temp.assert_true((SELECT status='approuvee' FROM approval_requests WHERE entity_id='60000000-0000-0000-0000-000000000002'),'no-policy legitimate auto-approval');
SELECT apply_authorized_workflow_transition('purchase_order','60000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM workflow_history),'atomic history');
SELECT pg_temp.must_fail($q$SELECT apply_authorized_workflow_transition('purchase_order','60000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001')$q$,'stale transition');
SELECT 'PASS security 144 SQL boundaries' AS result;
