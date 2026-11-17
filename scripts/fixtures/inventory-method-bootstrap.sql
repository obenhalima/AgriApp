-- Executed only inside the disposable PostgreSQL test instance.
TRUNCATE stock_history_lines,stock_history_batches,stock_consumption_allocations,
 inventory_consumption_reviews,cost_entries,stock_movements,warehouse_stocks,inventory_value_events;
ALTER TABLE domains ADD code text;
UPDATE domains SET code=CASE WHEN id='20000000-0000-0000-0000-000000000001' THEN 'QA501' ELSE 'OTHER' END;
ALTER TABLE stock_movements ADD created_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE stock_transfers ADD domain_id uuid,ADD unit_cost numeric;
ALTER TABLE inventory_value_events ADD domain_id uuid,ADD quantity_after numeric,ADD value_after numeric,ADD verified boolean,ADD reason text;
CREATE FUNCTION is_domain_member(d uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT has_domain_permission(d,u,'stocks','view') $$;
CREATE TABLE historical_cost_confirmations(id uuid,domain_id uuid,movement_id uuid,actor_id uuid,transaction_id bigint,applied_at timestamptz,input jsonb,created_at timestamptz DEFAULT now());
CREATE FUNCTION immutable_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Mouvement enregistré'; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION immutable_stock_movement();
