BEGIN;
-- resolve_approval_policy peut retourner une ligne composite entièrement NULL.
-- Ne pas utiliser FOUND comme preuve qu'une politique existe.
CREATE OR REPLACE FUNCTION public.submit_approval_request(p_process TEXT,p_type TEXT,p_entity UUID,p_reference TEXT,p_amount NUMERIC,p_comment TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_policy approval_policies%ROWTYPE; v_id UUID; v_enabled BOOLEAN;
BEGIN
 IF p_process='purchase_order' THEN SELECT domain_id INTO v_domain FROM purchase_orders WHERE id=p_entity;
 ELSIF p_process='treatment' THEN SELECT domain_id INTO v_domain FROM treatment_requests WHERE id=p_entity;
 ELSIF p_process='stock_exit' THEN SELECT domain_id INTO v_domain FROM stock_exit_requests WHERE id=p_entity;
 ELSE RAISE EXCEPTION 'Processus non pris en charge pour la soumission'; END IF;
 IF v_domain IS NULL OR NOT coalesce(is_domain_member(v_domain,auth.uid()),false) THEN RAISE EXCEPTION 'Entité inaccessible'; END IF;
 IF p_process='purchase_order' AND NOT coalesce(has_domain_permission(v_domain,auth.uid(),'achats','create'),false) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 SELECT * INTO v_policy FROM resolve_approval_policy(v_domain,p_process,p_type,p_amount);
 v_enabled:=coalesce(v_policy.validation_enabled,false);
 INSERT INTO approval_requests(domain_id,policy_id,process_code,operation_type,entity_id,entity_reference,amount,status,current_level,required_levels,requested_by,completed_at,comment)
 VALUES(v_domain,v_policy.id,p_process,coalesce(nullif(p_type,''),'*'),p_entity,p_reference,p_amount,
 CASE WHEN v_enabled THEN 'soumise' ELSE 'approuvee' END,1,coalesce(v_policy.approval_levels,1),auth.uid(),CASE WHEN v_enabled THEN NULL ELSE now() END,p_comment)
 ON CONFLICT(process_code,entity_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Cette entité possède déjà une demande de validation'; END IF;
 IF NOT v_enabled THEN INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,comment) VALUES(v_id,v_domain,1,'automatique','Validation désactivée ou aucune règle applicable'); END IF;
 RETURN v_id;
END $$;
ALTER TABLE public.purchase_orders ADD COLUMN client_request_id UUID UNIQUE;
CREATE FUNCTION public.create_costed_direct_order(p_input JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; po UUID; request UUID; number TEXT; line JSONB; approval UUID; price NUMERIC; qty NUMERIC;
BEGIN
 SELECT domain_id INTO d FROM suppliers WHERE id=(p_input->>'supplierId')::uuid AND is_active;
 IF d IS NULL OR NOT has_domain_permission(d,auth.uid(),'achats','create') THEN RAISE EXCEPTION 'Fournisseur ou droits invalides'; END IF;
 request:=(p_input->>'requestId')::uuid;
 IF request IS NULL THEN RAISE EXCEPTION 'Identifiant de demande requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(request::text));
 SELECT id,po_number INTO po,number FROM purchase_orders WHERE client_request_id=request AND domain_id=d;
 IF FOUND THEN RETURN jsonb_build_object('po_id',po,'po_number',number,'movements_created',0,'warnings',jsonb_build_array('Bon déjà créé : valider puis réceptionner dans son entrepôt')); END IF;
 number:='AD-'||left(replace(request::text,'-',''),24);
 INSERT INTO purchase_orders(domain_id,po_number,supplier_id,campaign_id,greenhouse_id,cost_category,status,purchase_type,order_date,currency,notes,client_request_id)
 VALUES(d,number,(p_input->>'supplierId')::uuid,nullif(p_input->>'campaignId','')::uuid,nullif(p_input->>'greenhouseId','')::uuid,p_input->>'costCategory','brouillon','direct',coalesce(nullif(p_input->>'orderDate','')::date,current_date),coalesce(p_input->>'currency','MAD'),p_input->>'notes',request) RETURNING id INTO po;
 IF jsonb_typeof(p_input->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'lines')=0 THEN RAISE EXCEPTION 'Lignes requises'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_input->'lines') LOOP
  qty:=(line->>'quantity')::numeric; price:=(line->>'unitPrice')::numeric;
  IF qty IS NULL OR qty<=0 OR qty='NaN'::numeric OR price IS NULL OR price<0 OR price='NaN'::numeric THEN RAISE EXCEPTION 'Quantité ou prix invalide'; END IF;
  IF NOT EXISTS(SELECT 1 FROM stock_items WHERE id=(line->>'stockItemId')::uuid AND domain_id=d AND is_active) THEN RAISE EXCEPTION 'Article actif du même client requis'; END IF;
  INSERT INTO purchase_order_lines(domain_id,po_id,item_description,unit,quantity,unit_price,line_total,received_qty,stock_item_id)
  VALUES(d,po,line->>'itemDescription',line->>'unit',qty,price,qty*price,0,(line->>'stockItemId')::uuid);
 END LOOP;
 UPDATE purchase_orders SET subtotal=(SELECT sum(line_total) FROM purchase_order_lines WHERE po_id=po),total_amount=(SELECT sum(line_total) FROM purchase_order_lines WHERE po_id=po) WHERE id=po;
 approval:=submit_approval_request('purchase_order','direct',po,number,(SELECT total_amount FROM purchase_orders WHERE id=po),'Achat direct : réception séparée et valorisée');
 IF EXISTS(SELECT 1 FROM approval_requests WHERE id=approval AND status='approuvee') THEN UPDATE purchase_orders SET status='envoye' WHERE id=po; END IF;
 RETURN jsonb_build_object('po_id',po,'po_number',number,'movements_created',0,'warnings',jsonb_build_array('Bon créé. Après validation responsable, ouvrir le bon pour réceptionner dans l’entrepôt destinataire.'));
END $$;
REVOKE ALL ON FUNCTION public.create_costed_direct_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_costed_direct_order(JSONB) TO authenticated;
-- Projection de la valeur réelle sur l'ancien écran Stocks. La précision du CUMP reste dans les soldes.
CREATE OR REPLACE FUNCTION public.warehouse_stock_total() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v NUMERIC; n INTEGER;
BEGIN
 SELECT coalesce(sum(current_qty),0),sum(inventory_value),count(*) FILTER(WHERE current_qty>0 AND inventory_value IS NULL)
 INTO NEW.current_qty,v,n FROM warehouse_stocks WHERE stock_item_id=NEW.id;
 NEW.unit_cost:=CASE WHEN NEW.current_qty>0 AND n=0 THEN v/NEW.current_qty ELSE NULL END;
 RETURN NEW;
END $$;
UPDATE public.stock_items SET current_qty=current_qty;
CREATE FUNCTION public.sync_transfer_cost() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IN ('en_transit','receptionnee') THEN SELECT unit_cost INTO NEW.unit_cost FROM stock_movements WHERE transfer_id=NEW.id AND movement_type='sortie'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_sync_transfer_cost BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.sync_transfer_cost();
CREATE FUNCTION public.review_inventory_consumption(p_movement UUID,p_planting UUID,p_unit_cost NUMERIC,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m stock_movements%ROWTYPE; f UUID; tr UUID;
BEGIN
 SELECT * INTO m FROM stock_movements WHERE id=p_movement FOR UPDATE;
 IF NOT FOUND OR NOT has_domain_permission(m.domain_id,auth.uid(),'couts','edit') THEN RAISE EXCEPTION 'Rapprochement non autorisé'; END IF;
 IF m.movement_type<>'sortie' OR m.transfer_id IS NOT NULL OR EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id) THEN RAISE EXCEPTION 'Seule une consommation non encore imputée peut être rapprochée'; END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<0 OR p_unit_cost='NaN'::numeric OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Coût et justificatif requis'; END IF;
 SELECT a.treatment_request_id INTO tr FROM treatment_application_products ap JOIN treatment_applications a ON a.id=ap.application_id WHERE ap.stock_movement_id=m.id;
 IF tr IS NULL THEN
  SELECT g.farm_id INTO f FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id WHERE cp.id=p_planting AND cp.domain_id=m.domain_id;
  IF f IS NULL OR NOT EXISTS(SELECT 1 FROM warehouses WHERE id=m.warehouse_id AND farm_id=f AND domain_id=m.domain_id) THEN RAISE EXCEPTION 'Choisir une plantation de la ferme de l’entrepôt'; END IF;
 END IF;
 INSERT INTO inventory_consumption_reviews(movement_id,domain_id,campaign_planting_id,unit_cost,reason) VALUES(m.id,m.domain_id,CASE WHEN tr IS NULL THEN p_planting ELSE NULL END,p_unit_cost,p_reason);
 IF NOT EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id) THEN RAISE EXCEPTION 'Imputation impossible : contrôler les cibles du traitement'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_inventory_consumption(UUID,UUID,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_inventory_consumption(UUID,UUID,NUMERIC,TEXT) TO authenticated;
COMMIT;
