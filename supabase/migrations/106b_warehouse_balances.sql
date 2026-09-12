-- 106B. Prérequis : 106_warehouse_registry.sql. Exécuter en une seule transaction.
BEGIN;
LOCK TABLE public.stock_items,public.stock_movements IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.stock_items WHERE current_qty<0) THEN
 RAISE EXCEPTION 'Corriger les stocks négatifs avant la ventilation par entrepôt'; END IF;
 IF EXISTS(SELECT 1 FROM public.stock_items s WHERE NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.domain_id=s.domain_id AND w.is_default AND w.is_active)) THEN
 RAISE EXCEPTION 'Désigner un entrepôt principal actif pour chaque client avec du stock'; END IF;
END $$;
CREATE TABLE public.warehouse_stocks (
 warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
 stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
 domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
 current_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK(current_qty>=0),
 min_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK(min_qty>=0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(warehouse_id,stock_item_id)
);
INSERT INTO public.warehouse_stocks
SELECT w.id,s.id,s.domain_id,COALESCE(s.current_qty,0),COALESCE(s.min_qty,0),NOW()
FROM public.stock_items s JOIN public.warehouses w ON w.domain_id=s.domain_id AND w.is_default AND w.is_active;
ALTER TABLE public.stock_movements ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_exit_requests ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT;
UPDATE public.stock_movements m SET warehouse_id=w.id FROM public.warehouses w WHERE w.domain_id=m.domain_id AND w.is_default AND w.is_active;
UPDATE public.stock_exit_requests m SET warehouse_id=w.id FROM public.warehouses w WHERE w.domain_id=m.domain_id AND w.is_default AND w.is_active;
ALTER TABLE public.warehouse_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouse_balances_read ON public.warehouse_stocks FOR SELECT TO authenticated
USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view'));
GRANT SELECT ON public.warehouse_stocks TO authenticated;

-- Le total devient une projection des soldes, y compris pour les anciennes RPC
-- qui tentent encore de le décrémenter après l'insertion d'un mouvement.
CREATE FUNCTION public.warehouse_stock_total() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 SELECT COALESCE(sum(current_qty),0) INTO NEW.current_qty FROM warehouse_stocks WHERE stock_item_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_warehouse_stock_total BEFORE INSERT OR UPDATE OF current_qty ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_total();

CREATE FUNCTION public.post_warehouse_movement() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; delta NUMERIC;
BEGIN
 SELECT domain_id INTO d FROM stock_items WHERE id=NEW.stock_item_id FOR UPDATE;
 IF NEW.warehouse_id IS NULL THEN
  SELECT id INTO NEW.warehouse_id FROM warehouses WHERE domain_id=d AND is_default AND is_active;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=NEW.warehouse_id AND domain_id=d AND is_active) THEN
  RAISE EXCEPTION 'Entrepôt actif du même client obligatoire';
 END IF;
 IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.movement_type NOT IN ('entree','sortie','ajustement') THEN
  RAISE EXCEPTION 'Quantité positive obligatoire ; utiliser le processus dédié pour les transferts';
 END IF;
 NEW.domain_id:=d;
 NEW.created_by:=auth.uid();
 delta:=CASE WHEN NEW.movement_type='sortie' THEN -NEW.quantity ELSE NEW.quantity END;
 INSERT INTO warehouse_stocks(warehouse_id,stock_item_id,domain_id) VALUES(NEW.warehouse_id,NEW.stock_item_id,d)
 ON CONFLICT DO NOTHING;
 UPDATE warehouse_stocks SET current_qty=current_qty+delta,updated_at=NOW()
 WHERE warehouse_id=NEW.warehouse_id AND stock_item_id=NEW.stock_item_id AND current_qty+delta>=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock insuffisant dans l’entrepôt sélectionné'; END IF;
 UPDATE stock_items SET current_qty=current_qty,updated_at=NOW() WHERE id=NEW.stock_item_id;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_zz_post_warehouse_movement BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.post_warehouse_movement();
-- Les corrections se font par mouvement compensatoire, jamais en réécrivant un solde historique.
CREATE FUNCTION public.immutable_stock_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Mouvement enregistré : créer un mouvement correctif'; END $$;
CREATE TRIGGER trg_immutable_stock_movement BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.immutable_stock_movement();

CREATE FUNCTION public.set_warehouse_stock_threshold(p_warehouse UUID,p_item UUID,p_min NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID;
BEGIN
 SELECT domain_id INTO d FROM stock_items WHERE id=p_item;
 IF NOT COALESCE(has_domain_permission(d,auth.uid(),'stocks','edit'),FALSE) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p_warehouse AND domain_id=d AND is_active) THEN RAISE EXCEPTION 'Entrepôt incompatible'; END IF;
 IF p_min IS NULL OR p_min<0 THEN RAISE EXCEPTION 'Seuil invalide'; END IF;
 INSERT INTO warehouse_stocks(warehouse_id,stock_item_id,domain_id,min_qty) VALUES(p_warehouse,p_item,d,p_min)
 ON CONFLICT(warehouse_id,stock_item_id) DO UPDATE SET min_qty=p_min,updated_at=NOW();
END $$;
CREATE FUNCTION public.submit_warehouse_stock_exit(p_warehouse UUID,p_item UUID,p_quantity NUMERIC,p_date DATE,p_reason TEXT,p_reference TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; result UUID;
BEGIN
 SELECT domain_id INTO d FROM stock_items WHERE id=p_item;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p_warehouse AND domain_id=d AND is_active) THEN RAISE EXCEPTION 'Entrepôt incompatible'; END IF;
 result:=submit_stock_exit_request(p_item,p_quantity,p_date,p_reason,p_reference);
 UPDATE stock_exit_requests SET warehouse_id=p_warehouse WHERE id=result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.execute_stock_exit_request(p_request_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v stock_exit_requests%ROWTYPE; cost NUMERIC; movement UUID;
BEGIN
 SELECT * INTO v FROM stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'approuvee' THEN RAISE EXCEPTION 'La sortie doit être approuvée avant exécution'; END IF;
 IF NOT COALESCE(has_domain_permission(v.domain_id,auth.uid(),'stocks','edit'),FALSE) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 SELECT unit_cost INTO cost FROM stock_items WHERE id=v.stock_item_id FOR UPDATE;
 PERFORM set_config('app.approved_stock_exit','true',TRUE);
 INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,movement_date,campaign_id,greenhouse_id,reference,notes,created_by,domain_id)
 VALUES(v.stock_item_id,v.warehouse_id,'sortie',v.quantity,cost,v.quantity*cost,v.requested_for,v.campaign_id,v.greenhouse_id,v.reference,'Sortie approuvée',auth.uid(),v.domain_id)
 RETURNING id INTO movement;
 UPDATE stock_exit_requests SET status='executee',executed_by=auth.uid(),executed_at=NOW(),stock_movement_id=movement,updated_at=NOW() WHERE id=v.id;
 RETURN movement;
END $$;
REVOKE ALL ON FUNCTION public.set_warehouse_stock_threshold(UUID,UUID,NUMERIC),public.submit_warehouse_stock_exit(UUID,UUID,NUMERIC,DATE,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_warehouse_stock_threshold(UUID,UUID,NUMERIC),public.submit_warehouse_stock_exit(UUID,UUID,NUMERIC,DATE,TEXT,TEXT) TO authenticated;
COMMIT;
