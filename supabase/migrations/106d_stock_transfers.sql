-- 106D, après 106B. Expédition puis réception intégrale, même client.
BEGIN;
ALTER TABLE public.approval_policies DROP CONSTRAINT IF EXISTS approval_policies_process_code_check;
ALTER TABLE public.approval_policies ADD CONSTRAINT approval_policies_process_code_check
CHECK(process_code IN ('purchase_order','direct_purchase','stock_exit','stock_adjustment','treatment','phyto_receipt','stock_transfer'));
INSERT INTO public.business_capabilities(code,name,process_code,is_sensitive,is_system)
VALUES('stock_transfer.validate','Valider un transfert de stock','stock_transfer',TRUE,TRUE) ON CONFLICT(code) DO NOTHING;
INSERT INTO public.approval_policies(domain_id,process_code,name,validation_enabled,responsible_role_id)
SELECT d.id,'stock_transfer','Transfert entre entrepôts',TRUE,(SELECT id FROM roles WHERE code='chef_exploitation' LIMIT 1)
FROM domains d ON CONFLICT(domain_id,process_code,operation_type) DO NOTHING;
INSERT INTO public.approval_policy_levels(policy_id,level_number,required_capability_id,responsible_role_id,name)
SELECT p.id,1,c.id,p.responsible_role_id,'Validation du transfert'
FROM approval_policies p CROSS JOIN business_capabilities c
WHERE p.process_code='stock_transfer' AND c.code='stock_transfer.validate'
ON CONFLICT(policy_id,level_number) DO NOTHING;

CREATE TABLE public.stock_transfers(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 domain_id UUID NOT NULL REFERENCES public.domains(id),
 source_id UUID NOT NULL REFERENCES public.warehouses(id),
 destination_id UUID NOT NULL REFERENCES public.warehouses(id),
 stock_item_id UUID NOT NULL REFERENCES public.stock_items(id),
 quantity NUMERIC(10,2) NOT NULL CHECK(quantity>0),
 planned_date DATE NOT NULL,
 reason TEXT NOT NULL CHECK(length(btrim(reason))>0),
 status TEXT NOT NULL DEFAULT 'soumise' CHECK(status IN ('soumise','en_transit','receptionnee','annulee')),
 requested_by UUID NOT NULL REFERENCES public.profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 dispatched_by UUID REFERENCES public.profiles(id),
 dispatched_at TIMESTAMPTZ,
 received_by UUID REFERENCES public.profiles(id),
 received_at TIMESTAMPTZ,
 cancelled_by UUID REFERENCES public.profiles(id),
 cancelled_at TIMESTAMPTZ,
 unit_cost NUMERIC,
 CHECK(source_id<>destination_id)
);
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_transfers_read ON public.stock_transfers FOR SELECT TO authenticated
USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view'));
GRANT SELECT ON public.stock_transfers TO authenticated;
ALTER TABLE public.stock_movements ADD COLUMN transfer_id UUID REFERENCES public.stock_transfers(id);
CREATE UNIQUE INDEX uq_transfer_movement_direction ON public.stock_movements(transfer_id,movement_type) WHERE transfer_id IS NOT NULL;
CREATE FUNCTION public.guard_transfer_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.transfer_id IS NOT NULL AND COALESCE(current_setting('app.transfer_id',TRUE),'')<>NEW.transfer_id::TEXT
 THEN RAISE EXCEPTION 'Utiliser les actions expédier / réceptionner du transfert'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_transfer_movement BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_transfer_movement();

CREATE FUNCTION public.submit_stock_transfer(p_source UUID,p_destination UUID,p_item UUID,p_quantity NUMERIC,p_date DATE,p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; result UUID; ap approval_policies%ROWTYPE; approval UUID; cost NUMERIC;
BEGIN
 SELECT domain_id,unit_cost INTO d,cost FROM stock_items WHERE id=p_item AND is_active;
 IF NOT COALESCE(has_domain_permission(d,auth.uid(),'stocks','create'),FALSE) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity<>round(p_quantity,2) THEN RAISE EXCEPTION 'Quantité positive, deux décimales maximum'; END IF;
 IF p_source=p_destination OR
 NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p_source AND domain_id=d AND is_active) OR
 NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p_destination AND domain_id=d AND is_active)
 THEN RAISE EXCEPTION 'Deux entrepôts actifs et distincts du même client sont nécessaires'; END IF;
 IF COALESCE((SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=p_source AND stock_item_id=p_item),0)<p_quantity
 THEN RAISE EXCEPTION 'Stock source insuffisant'; END IF;
 SELECT * INTO ap FROM resolve_approval_policy(d,'stock_transfer','*',p_quantity*COALESCE(cost,0));
 IF ap.id IS NULL THEN RAISE EXCEPTION 'Configurer le circuit de validation des transferts pour ce client'; END IF;
 INSERT INTO stock_transfers(domain_id,source_id,destination_id,stock_item_id,quantity,planned_date,reason,requested_by)
 VALUES(d,p_source,p_destination,p_item,p_quantity,p_date,p_reason,auth.uid()) RETURNING id INTO result;
 INSERT INTO approval_requests(domain_id,policy_id,process_code,entity_id,entity_reference,amount,status,required_levels,requested_by,completed_at)
 VALUES(d,ap.id,'stock_transfer',result,'TRF-'||result::TEXT,p_quantity*COALESCE(cost,0),
 CASE WHEN ap.validation_enabled THEN 'soumise' ELSE 'approuvee' END,ap.approval_levels,auth.uid(),
 CASE WHEN ap.validation_enabled THEN NULL ELSE NOW() END) RETURNING id INTO approval;
 IF NOT ap.validation_enabled THEN
 INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,comment)
 VALUES(approval,d,1,'automatique','Validation désactivée dans le circuit transfert');
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.act_stock_transfer(p_id UUID,p_action TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t stock_transfers%ROWTYPE; a approval_requests%ROWTYPE; direction movement_type; wh UUID; cost NUMERIC;
BEGIN
 SELECT * INTO t FROM stock_transfers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT COALESCE(has_domain_permission(t.domain_id,auth.uid(),'stocks','edit'),FALSE) THEN RAISE EXCEPTION 'Transfert inaccessible'; END IF;
 SELECT * INTO a FROM approval_requests WHERE process_code='stock_transfer' AND entity_id=t.id FOR UPDATE;
 IF p_action='annuler' THEN
  IF t.status<>'soumise' THEN RAISE EXCEPTION 'Annulation impossible après expédition'; END IF;
  IF t.requested_by<>auth.uid() AND NOT COALESCE(is_domain_admin(t.domain_id,auth.uid()),FALSE) THEN RAISE EXCEPTION 'Annulation réservée au demandeur ou administrateur'; END IF;
  UPDATE stock_transfers SET status='annulee',cancelled_by=auth.uid(),cancelled_at=NOW() WHERE id=t.id;
  UPDATE approval_requests SET status='annulee',completed_at=NOW() WHERE id=a.id;
  RETURN;
 END IF;
 IF a.id IS NULL OR a.status<>'approuvee' THEN RAISE EXCEPTION 'Tous les niveaux de validation doivent être approuvés'; END IF;
 IF p_action='expedier' AND t.status='soumise' THEN
  IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=t.destination_id AND domain_id=t.domain_id AND is_active) THEN RAISE EXCEPTION 'Destination inactive'; END IF;
  direction:='sortie';wh:=t.source_id;
 ELSIF p_action='recevoir' AND t.status='en_transit' THEN direction:='entree';wh:=t.destination_id;
 ELSE RAISE EXCEPTION 'Action incompatible avec le statut actuel'; END IF;
 SELECT unit_cost INTO cost FROM stock_items WHERE id=t.stock_item_id FOR UPDATE;
 IF p_action='recevoir' THEN cost:=t.unit_cost; END IF;
 PERFORM set_config('app.approved_stock_exit','true',TRUE);
 PERFORM set_config('app.transfer_id',t.id::TEXT,TRUE);
 INSERT INTO stock_movements(stock_item_id,warehouse_id,transfer_id,domain_id,movement_type,quantity,movement_date,reference,notes,unit_cost,total_cost)
 VALUES(t.stock_item_id,wh,t.id,t.domain_id,direction,t.quantity,CURRENT_DATE,'TRF-'||t.id::TEXT,t.reason,cost,cost*t.quantity);
 IF p_action='expedier' THEN
 UPDATE stock_transfers SET status='en_transit',dispatched_by=auth.uid(),dispatched_at=NOW(),unit_cost=cost WHERE id=t.id;
 ELSE
 UPDATE stock_transfers SET status='receptionnee',received_by=auth.uid(),received_at=NOW() WHERE id=t.id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.submit_stock_transfer(UUID,UUID,UUID,NUMERIC,DATE,TEXT),public.act_stock_transfer(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_stock_transfer(UUID,UUID,UUID,NUMERIC,DATE,TEXT),public.act_stock_transfer(UUID,TEXT) TO authenticated;
COMMIT;
