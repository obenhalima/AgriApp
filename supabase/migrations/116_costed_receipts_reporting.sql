BEGIN;
CREATE TABLE public.costed_purchase_receipts(
 id UUID PRIMARY KEY,domain_id UUID NOT NULL REFERENCES public.domains(id),po_id UUID NOT NULL REFERENCES public.purchase_orders(id),
 warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),receipt_date DATE NOT NULL,exchange_rate NUMERIC NOT NULL,
 result JSONB,created_by UUID NOT NULL DEFAULT auth.uid(),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.costed_purchase_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY costed_receipts_read ON public.costed_purchase_receipts FOR SELECT TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'achats','view'));
GRANT SELECT ON public.costed_purchase_receipts TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.costed_purchase_receipts FROM authenticated;
CREATE FUNCTION public.receive_costed_purchase(p_po UUID,p_receipt JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p purchase_orders%ROWTYPE; l purchase_order_lines%ROWTYPE; wh UUID; rid UUID; item JSONB; qty NUMERIC; factor NUMERIC; stock_unit TEXT;
 fx NUMERIC; dt DATE; v_result JSONB; moves INTEGER:=0; seen UUID[]:='{}'; price NUMERIC; status_new TEXT; policy approval_policies%ROWTYPE;
BEGIN
 SELECT * INTO p FROM purchase_orders WHERE id=p_po FOR UPDATE;
 IF NOT FOUND OR NOT has_domain_permission(p.domain_id,auth.uid(),'achats','edit') THEN RAISE EXCEPTION 'Réception non autorisée'; END IF;
 rid:=(p_receipt->>'id')::uuid; wh:=(p_receipt->>'warehouse_id')::uuid; dt:=(p_receipt->>'date')::date;
 SELECT r.result INTO v_result FROM costed_purchase_receipts r WHERE r.id=rid AND r.po_id=p.id AND r.domain_id=p.domain_id;
 IF FOUND THEN RETURN v_result; END IF;
 IF rid IS NULL OR dt IS NULL OR p.status NOT IN ('envoye','partiellement_recu') THEN RAISE EXCEPTION 'Bon envoyé ou partiellement reçu requis'; END IF;
 SELECT * INTO policy FROM resolve_approval_policy(p.domain_id,'purchase_order',coalesce(p.purchase_type,'standard'),p.total_amount);
 IF policy.validation_enabled AND NOT EXISTS(SELECT 1 FROM approval_requests WHERE entity_id=p.id AND process_code='purchase_order' AND status='approuvee') THEN RAISE EXCEPTION 'Validation responsable requise'; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=wh AND domain_id=p.domain_id AND is_active AND farm_id IS NOT NULL) THEN RAISE EXCEPTION 'Entrepôt de ferme actif requis'; END IF;
 fx:=CASE WHEN upper(coalesce(p.currency,'MAD'))='MAD' THEN 1 ELSE (p_receipt->>'exchange_rate')::numeric END;
 IF fx IS NULL OR fx<=0 OR fx='NaN'::numeric THEN RAISE EXCEPTION 'Taux de conversion vers MAD obligatoire'; END IF;
 IF jsonb_typeof(p_receipt->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipt->'lines')=0 THEN RAISE EXCEPTION 'Lignes de réception requises'; END IF;
 INSERT INTO costed_purchase_receipts(id,domain_id,po_id,warehouse_id,receipt_date,exchange_rate) VALUES(rid,p.domain_id,p.id,wh,dt,fx);
 FOR item IN SELECT value FROM jsonb_array_elements(p_receipt->'lines') ORDER BY value->>'lineId' LOOP
  SELECT * INTO l FROM purchase_order_lines WHERE id=(item->>'lineId')::uuid AND po_id=p.id FOR UPDATE;
  qty:=(item->>'qtyReceived')::numeric;
  IF NOT FOUND OR l.id=ANY(seen) OR qty IS NULL OR qty<=0 OR qty='NaN'::numeric OR qty+coalesce(l.received_qty,0)>l.quantity THEN RAISE EXCEPTION 'Ligne dupliquée, étrangère ou quantité supérieure au restant'; END IF;
  seen:=array_append(seen,l.id);
  IF l.stock_item_id IS NOT NULL THEN
   SELECT unit INTO stock_unit FROM stock_items WHERE id=l.stock_item_id AND domain_id=p.domain_id AND is_active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Article inactif ou hors société'; END IF;
   factor:=CASE WHEN lower(btrim(l.unit))=lower(btrim(stock_unit)) THEN 1 ELSE convert_treatment_quantity(1,lower(btrim(l.unit)),lower(btrim(stock_unit))) END;
   IF factor IS NULL OR factor<=0 OR l.unit_price IS NULL OR l.unit_price<0 THEN RAISE EXCEPTION 'Unité ou prix de réception invalide'; END IF;
   price:=l.unit_price*fx/factor;
   IF round(qty*factor,2)<>qty*factor THEN RAISE EXCEPTION 'Quantité convertie trop précise pour le stock (2 décimales) : vérifier unité et quantité'; END IF;
   INSERT INTO stock_movements(domain_id,warehouse_id,stock_item_id,movement_type,quantity,unit_cost,movement_date,po_id,reference,notes)
   VALUES(p.domain_id,wh,l.stock_item_id,'entree',qty*factor,price,dt,p.id,coalesce(p_receipt->>'reference',p.po_number),'Réception valorisée '||rid::text);
   moves:=moves+1;
  ELSIF lower(coalesce(p.cost_category,'')) NOT IN ('services','transport','energie') THEN RAISE EXCEPTION 'Lier les intrants à un article de stock avant réception';
  ELSIF fx<>1 THEN RAISE EXCEPTION 'Service en devise : convertir le bon en MAD avant réception';
  END IF;
  UPDATE purchase_order_lines SET received_qty=coalesce(received_qty,0)+qty WHERE id=l.id;
 END LOOP;
 status_new:=CASE WHEN EXISTS(SELECT 1 FROM purchase_order_lines WHERE po_id=p.id AND coalesce(received_qty,0)<quantity) THEN 'partiellement_recu' ELSE 'recu' END;
 UPDATE purchase_orders SET status=status_new,updated_at=now() WHERE id=p.id;
 v_result:=jsonb_build_object('new_status',status_new,'lines_updated',cardinality(seen),'movements_created',moves,'warnings','[]'::jsonb);
 UPDATE costed_purchase_receipts SET result=v_result WHERE id=rid;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.receive_costed_purchase(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_costed_purchase(UUID,JSONB) TO authenticated;

CREATE TABLE public.cost_reporting_settings(domain_id UUID PRIMARY KEY REFERENCES public.domains(id),allocation_basis TEXT NOT NULL DEFAULT 'surface' CHECK(allocation_basis IN ('surface','production')));
ALTER TABLE public.cost_reporting_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_settings_read ON public.cost_reporting_settings FOR SELECT TO authenticated USING(has_domain_permission(domain_id,auth.uid(),'couts','view'));
CREATE POLICY cost_settings_write ON public.cost_reporting_settings FOR ALL TO authenticated USING(has_domain_permission(domain_id,auth.uid(),'couts','edit')) WITH CHECK(has_domain_permission(domain_id,auth.uid(),'couts','edit'));
GRANT SELECT,INSERT,UPDATE ON public.cost_reporting_settings TO authenticated;

CREATE FUNCTION public.get_production_cost_data(p_domain UUID,p_campaign UUID DEFAULT NULL,p_start DATE DEFAULT NULL,p_end DATE DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result JSONB;
BEGIN
 IF NOT coalesce(has_domain_permission(p_domain,auth.uid(),'couts','view'),false) THEN RAISE EXCEPTION 'Consultation des coûts non autorisée'; END IF;
 IF p_start>p_end THEN RAISE EXCEPTION 'Période invalide'; END IF;
 SELECT jsonb_build_object(
 'basis',coalesce((SELECT allocation_basis FROM cost_reporting_settings WHERE domain_id=p_domain),'surface'),
 'plantings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',cp.id,'campaign_id',cp.campaign_id,'greenhouse_id',cp.greenhouse_id,'variety_id',cp.variety_id,'area',cp.planted_area,'farm_id',g.farm_id,'farm_name',f.name,'greenhouse_name',g.code,'target_kg',coalesce(cp.target_total_production,cp.target_yield_per_m2*cp.planted_area))) FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id JOIN farms f ON f.id=g.farm_id WHERE cp.domain_id=p_domain AND f.domain_id=p_domain AND (p_campaign IS NULL OR cp.campaign_id=p_campaign)),'[]'::jsonb),
 'costs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'campaign_id',c.campaign_id,'greenhouse_id',c.greenhouse_id,'variety_id',c.variety_id,'amount',c.amount,'planned',c.is_planned,'quality',c.cost_quality,'source',c.source_stock_movement_id,'category',c.cost_category)) FROM cost_entries c WHERE c.domain_id=p_domain AND (p_campaign IS NULL OR c.campaign_id=p_campaign) AND (p_start IS NULL OR c.entry_date>=p_start) AND (p_end IS NULL OR c.entry_date<=p_end)),'[]'::jsonb),
 'harvests',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT cp.id AS planting_id,sum(coalesce(h.total_qty,0)) AS gross_kg,sum(coalesce(h.qty_category_1,0)+coalesce(h.qty_category_2,0)+coalesce(h.qty_category_3,0)) AS sorted_kg FROM campaign_plantings cp JOIN harvests h ON h.campaign_planting_id=cp.id AND h.domain_id=p_domain WHERE cp.domain_id=p_domain AND (p_campaign IS NULL OR cp.campaign_id=p_campaign) AND (p_start IS NULL OR h.harvest_date>=p_start) AND (p_end IS NULL OR h.harvest_date<=p_end) GROUP BY cp.id) h),'[]'::jsonb),
 'pending_movements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'reference',m.reference,'quantity',m.quantity,'amount',m.total_cost,'date',m.movement_date,'reason',CASE WHEN m.total_cost IS NULL OR m.total_cost=0 THEN 'Valorisation à vérifier' ELSE 'Imputation serre/campagne à compléter' END)) FROM stock_movements m WHERE m.domain_id=p_domain AND m.movement_type='sortie' AND m.transfer_id IS NULL AND NOT EXISTS(SELECT 1 FROM cost_entries c WHERE c.source_stock_movement_id=m.id) AND (p_campaign IS NULL OR m.campaign_id=p_campaign OR m.campaign_id IS NULL) AND (p_start IS NULL OR m.movement_date>=p_start) AND (p_end IS NULL OR m.movement_date<=p_end)),'[]'::jsonb),
 'inventory',coalesce((SELECT jsonb_agg(jsonb_build_object('warehouse_id',w.warehouse_id,'stock_item_id',w.stock_item_id,'farm_id',wh.farm_id,'warehouse_name',wh.name,'item_name',s.name,'unit',s.unit,'qty',w.current_qty,'value',w.inventory_value,'verified',w.valuation_verified)) FROM warehouse_stocks w JOIN warehouses wh ON wh.id=w.warehouse_id JOIN stock_items s ON s.id=w.stock_item_id WHERE w.domain_id=p_domain),'[]'::jsonb),
 'transit',coalesce((SELECT sum(m.total_cost) FROM stock_transfers t JOIN stock_movements m ON m.transfer_id=t.id AND m.movement_type='sortie' WHERE t.domain_id=p_domain AND t.status='en_transit'),0)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_production_cost_data(UUID,UUID,DATE,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_production_cost_data(UUID,UUID,DATE,DATE) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
