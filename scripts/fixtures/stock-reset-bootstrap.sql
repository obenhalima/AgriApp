ALTER TABLE domains ADD code text;
UPDATE domains SET code=CASE WHEN id='20000000-0000-0000-0000-000000000001' THEN 'QA501' ELSE 'OTHER' END;
ALTER TABLE stock_movements ADD po_id uuid;
ALTER TABLE stock_transfers ADD domain_id uuid;
ALTER TABLE inventory_value_events ADD domain_id uuid;
CREATE TABLE historical_cost_confirmations(id uuid,domain_id uuid,movement_id uuid,actor_id uuid,transaction_id bigint,applied_at timestamptz);
CREATE FUNCTION immutable_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Mouvement enregistré'; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION immutable_stock_movement();
CREATE FUNCTION test_reset_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('test.fail_reset',true)='yes' THEN RAISE EXCEPTION 'Failure during reset'; END IF; RETURN OLD; END $$;
CREATE TRIGGER zz_reset_failure BEFORE DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION test_reset_failure();
INSERT INTO stock_items(domain_id,code,name,category,unit) VALUES('20000000-0000-0000-0000-000000000002','OTHER','Autre client','engrais','kg');
INSERT INTO stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,unit_cost,movement_date)
 SELECT domain_id,id,'40000000-0000-0000-0000-000000000002','entree',7,3,'2020-01-01' FROM stock_items WHERE code='OTHER';
INSERT INTO cost_entries(domain_id,amount,description,is_planned) VALUES('20000000-0000-0000-0000-000000000001',55,'Coût manuel à conserver',false);
