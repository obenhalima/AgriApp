-- Prepared for the shared Supabase database: explicit approval required before application.
-- Acceptance of delivered goods does NOT authorize changing an approved treatment.
BEGIN;
CREATE TABLE public.purchase_phyto_substitutions (
 id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
 po_id uuid NOT NULL REFERENCES public.purchase_orders(id), line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 original_stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
 replacement_stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
 positive_entry_id uuid NOT NULL REFERENCES public.phyto_positive_list_entries(id),
 ordered_qty numeric NOT NULL CHECK(ordered_qty>0 AND ordered_qty<'Infinity'::numeric AND round(ordered_qty,2)=ordered_qty),
 delivered_qty numeric NOT NULL CHECK(delivered_qty>0 AND delivered_qty<'Infinity'::numeric AND round(delivered_qty,2)=delivered_qty),
 unit_price numeric NOT NULL CHECK(unit_price>=0 AND unit_price<'Infinity'::numeric),
 reason text NOT NULL CHECK(length(btrim(reason))>=5), snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','approuve','rejete','receptionne','annule')),
 requested_by uuid NOT NULL REFERENCES public.profiles(id), requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, review_reason text,
 receipt_id uuid REFERENCES public.costed_purchase_receipts(id),cancelled_at timestamptz,
 CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by), CHECK(original_stock_item_id<>replacement_stock_item_id)
);
CREATE UNIQUE INDEX one_open_purchase_substitution ON public.purchase_phyto_substitutions(line_id) WHERE status IN ('en_attente','approuve');
ALTER TABLE public.purchase_phyto_substitutions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.can_read_purchase_substitution(p_domain uuid,p_warehouse uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(is_domain_member(p_domain,auth.uid()) AND
 (has_domain_permission(p_domain,auth.uid(),'achats','view') OR EXISTS(SELECT 1 FROM warehouses w WHERE w.id=p_warehouse AND w.domain_id=p_domain AND has_business_capability(p_domain,auth.uid(),'treatment.validate',w.farm_id))),false)
$$;
REVOKE ALL ON FUNCTION public.can_read_purchase_substitution(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_purchase_substitution(uuid,uuid) TO authenticated;
CREATE POLICY purchase_substitution_read ON public.purchase_phyto_substitutions FOR SELECT TO authenticated
 USING(can_read_purchase_substitution(domain_id,warehouse_id));
REVOKE ALL ON public.purchase_phyto_substitutions FROM anon,authenticated;
GRANT SELECT ON public.purchase_phyto_substitutions TO authenticated;

-- The fingerprint includes the actual catalogue / station use and original commercial terms.
CREATE FUNCTION public.purchase_substitution_snapshot(p_line uuid,p_stock uuid,p_entry uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('ordered',jsonb_build_object('item',l.stock_item_id,'unit',l.unit,'quantity',l.quantity,'unit_price',l.unit_price,'currency',o.currency,'supplier',o.supplier_id),
 'replacement',jsonb_build_object('id',s.id,'name',s.name,'unit',s.unit,'product',to_jsonb(p)),
 'entry',to_jsonb(e),'list',jsonb_build_object('id',pl.id,'version',pl.version,'status',pl.status),
 'use',to_jsonb(u),'target',t.canonical_name)
 FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.po_id AND o.domain_id=l.domain_id
 JOIN stock_items s ON s.id=p_stock AND s.domain_id=o.domain_id AND s.is_active AND s.category='phytosanitaires'
 JOIN plant_protection_products p ON p.id=s.plant_protection_product_id AND p.domain_id=o.domain_id AND p.is_active
 JOIN phyto_positive_list_entries e ON e.id=p_entry AND e.domain_id=o.domain_id AND e.product_id=p.id AND e.review_status='valide' AND e.station_approved
 JOIN phyto_positive_lists pl ON pl.id=e.list_id AND pl.domain_id=o.domain_id AND pl.status='active'
 JOIN phyto_targets t ON t.id=e.target_id AND t.is_active
 JOIN product_authorized_uses u ON u.id=e.authorized_use_id AND u.product_id=p.id AND u.domain_id=o.domain_id
 WHERE l.id=p_line AND phyto_stock_unit_compatible(s.unit,u.dose_unit)
 AND (e.station_restriction_until IS NULL OR e.station_restriction_until>=CURRENT_DATE)
$$;
REVOKE ALL ON FUNCTION public.purchase_substitution_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.request_purchase_substitution(p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l purchase_order_lines%ROWTYPE; o purchase_orders%ROWTYPE; snap jsonb; existing purchase_phyto_substitutions%ROWTYPE;
 rid uuid:=(p_input->>'id')::uuid; wh uuid:=(p_input->>'warehouse_id')::uuid; replacement uuid:=(p_input->>'replacement_stock_item_id')::uuid;
BEGIN
 SELECT * INTO l FROM purchase_order_lines WHERE id=(p_input->>'line_id')::uuid;
 SELECT * INTO o FROM purchase_orders WHERE id=l.po_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT coalesce(has_domain_permission(o.domain_id,auth.uid(),'achats','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Demande de remplacement non autorisée'; END IF;
 SELECT * INTO l FROM purchase_order_lines WHERE id=l.id FOR UPDATE;
 SELECT * INTO existing FROM purchase_phyto_substitutions WHERE id=rid;
 IF FOUND THEN
  IF existing.domain_id=o.domain_id AND existing.requested_by=auth.uid() AND existing.line_id=l.id
   AND existing.warehouse_id=wh AND existing.replacement_stock_item_id=replacement
   AND existing.positive_entry_id=(p_input->>'positive_entry_id')::uuid
   AND existing.ordered_qty=(p_input->>'ordered_qty')::numeric AND existing.delivered_qty=(p_input->>'delivered_qty')::numeric
   AND existing.unit_price=(p_input->>'unit_price')::numeric AND existing.reason=btrim(p_input->>'reason') THEN RETURN rid; END IF;
  RAISE EXCEPTION 'Identifiant de demande déjà utilisé';
 END IF;
 IF o.status NOT IN ('envoye','partiellement_recu') OR l.domain_id<>o.domain_id OR l.stock_item_id IS NULL THEN RAISE EXCEPTION 'Ligne de stock d’un bon envoyé requise'; END IF;
 IF NOT EXISTS(SELECT 1 FROM stock_items WHERE id=l.stock_item_id AND domain_id=o.domain_id AND category='phytosanitaires') THEN RAISE EXCEPTION 'Ce parcours concerne les produits phytosanitaires'; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=wh AND domain_id=o.domain_id AND is_active AND farm_id IS NOT NULL) THEN RAISE EXCEPTION 'Entrepôt actif de la ferme requis'; END IF;
 IF (p_input->>'ordered_qty')::numeric>l.quantity-coalesce(l.received_qty,0) THEN RAISE EXCEPTION 'Quantité remplacée supérieure au restant du bon'; END IF;
 -- A technical acceptance must not silently increase an already approved purchase budget.
 IF (p_input->>'delivered_qty')::numeric*(p_input->>'unit_price')::numeric>(p_input->>'ordered_qty')::numeric*l.unit_price THEN
  RAISE EXCEPTION 'Surcoût fournisseur : créer un nouveau bon soumis au circuit de validation achat avant réception';
 END IF;
 snap:=purchase_substitution_snapshot(l.id,replacement,(p_input->>'positive_entry_id')::uuid);
 IF snap IS NULL THEN RAISE EXCEPTION 'Produit, cible, usage, unité ou liste Station non éligibles'; END IF;
 INSERT INTO purchase_phyto_substitutions(id,domain_id,po_id,line_id,warehouse_id,original_stock_item_id,replacement_stock_item_id,positive_entry_id,ordered_qty,delivered_qty,unit_price,reason,snapshot,requested_by)
 VALUES(rid,o.domain_id,o.id,l.id,wh,l.stock_item_id,replacement,(p_input->>'positive_entry_id')::uuid,(p_input->>'ordered_qty')::numeric,(p_input->>'delivered_qty')::numeric,(p_input->>'unit_price')::numeric,btrim(p_input->>'reason'),snap,auth.uid());
 RETURN rid;
END $$;

CREATE FUNCTION public.review_purchase_substitution(p_id uuid,p_action text,p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r purchase_phyto_substitutions%ROWTYPE; farm uuid; snap jsonb;
BEGIN
 SELECT * INTO r FROM purchase_phyto_substitutions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(is_domain_member(r.domain_id,auth.uid()),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Demande inaccessible'; END IF;
 IF p_action='annuler' THEN
  IF r.requested_by<>auth.uid() OR r.status NOT IN ('en_attente','approuve') THEN RAISE EXCEPTION 'Annulation non autorisée'; END IF;
  UPDATE purchase_phyto_substitutions SET status='annule',cancelled_at=now() WHERE id=r.id; RETURN;
 END IF;
 SELECT farm_id INTO farm FROM warehouses WHERE id=r.warehouse_id AND domain_id=r.domain_id AND is_active;
 IF farm IS NULL OR r.requested_by=auth.uid() OR NOT coalesce(has_business_capability(r.domain_id,auth.uid(),'treatment.validate',farm),false)
 OR NOT EXISTS(SELECT 1 FROM user_function_assignments a JOIN operational_functions f ON f.id=a.function_id WHERE a.domain_id=r.domain_id AND a.user_id=auth.uid() AND a.is_active AND f.is_active AND f.code='responsable_phytosanitaire' AND (a.farm_id IS NULL OR a.farm_id=farm) AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE))
 THEN RAISE EXCEPTION 'Responsable phyto habilité distinct du demandeur requis'; END IF;
 IF r.status<>'en_attente' OR p_action NOT IN ('approuver','rejeter') OR p_action IS NULL THEN RAISE EXCEPTION 'Décision impossible dans cet état'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Justification de décision requise (5 caractères)'; END IF;
 IF p_action='approuver' THEN
  snap:=purchase_substitution_snapshot(r.line_id,r.replacement_stock_item_id,r.positive_entry_id);
  IF snap IS NULL OR snap<>r.snapshot THEN RAISE EXCEPTION 'Sources modifiées : annuler puis créer une nouvelle demande'; END IF;
 END IF;
 UPDATE purchase_phyto_substitutions SET status=CASE WHEN p_action='approuver' THEN 'approuve' ELSE 'rejete' END,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason) WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.request_purchase_substitution(jsonb),public.review_purchase_substitution(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_purchase_substitution(jsonb),public.review_purchase_substitution(uuid,text,text) TO authenticated;

-- Receipt replacement implementation appended below; original order terms remain intact.
CREATE OR REPLACE FUNCTION public.receive_costed_purchase(p_po UUID,p_receipt JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p purchase_orders%ROWTYPE; l purchase_order_lines%ROWTYPE; wh UUID; rid UUID; item JSONB; qty NUMERIC; factor NUMERIC; stock_unit TEXT;
 fx NUMERIC; dt DATE; v_result JSONB; moves INTEGER:=0; seen UUID[]:='{}'; price NUMERIC; status_new TEXT; policy approval_policies%ROWTYPE; sub purchase_phyto_substitutions%ROWTYPE; target_stock uuid; actual_qty numeric; used_subs uuid[]:='{}';
BEGIN
 SELECT * INTO p FROM purchase_orders WHERE id=p_po FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(has_domain_permission(p.domain_id,auth.uid(),'achats','edit'),false) THEN RAISE EXCEPTION 'Réception non autorisée'; END IF;
 rid:=(p_receipt->>'id')::uuid; wh:=(p_receipt->>'warehouse_id')::uuid; dt:=(p_receipt->>'date')::date;
 SELECT r.result INTO v_result FROM costed_purchase_receipts r WHERE r.id=rid AND r.po_id=p.id AND r.domain_id=p.domain_id;
 IF FOUND THEN RETURN v_result; END IF;
 IF rid IS NULL OR dt IS NULL OR p.status NOT IN ('envoye','partiellement_recu') THEN RAISE EXCEPTION 'Bon envoyé ou partiellement reçu requis'; END IF;
 SELECT * INTO policy FROM resolve_approval_policy(p.domain_id,'purchase_order',coalesce(p.purchase_type,'standard'),p.total_amount);
 IF policy.validation_enabled AND NOT EXISTS(SELECT 1 FROM approval_requests WHERE entity_id=p.id AND process_code='purchase_order' AND status='approuvee') THEN RAISE EXCEPTION 'Validation responsable requise'; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=wh AND domain_id=p.domain_id AND is_active AND farm_id IS NOT NULL) THEN RAISE EXCEPTION 'Entrepôt de ferme actif requis'; END IF;
 fx:=CASE WHEN upper(coalesce(p.currency,'MAD'))='MAD' THEN 1 ELSE (p_receipt->>'exchange_rate')::numeric END;
 IF fx IS NULL OR fx<=0 OR fx>='Infinity'::numeric THEN RAISE EXCEPTION 'Taux de conversion vers MAD obligatoire'; END IF;
 IF jsonb_typeof(p_receipt->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipt->'lines')=0 THEN RAISE EXCEPTION 'Lignes de réception requises'; END IF;
 INSERT INTO costed_purchase_receipts(id,domain_id,po_id,warehouse_id,receipt_date,exchange_rate) VALUES(rid,p.domain_id,p.id,wh,dt,fx);
 FOR item IN SELECT value FROM jsonb_array_elements(p_receipt->'lines') ORDER BY value->>'lineId' LOOP
  SELECT * INTO l FROM purchase_order_lines WHERE id=(item->>'lineId')::uuid AND po_id=p.id FOR UPDATE;
  qty:=(item->>'qtyReceived')::numeric;
  IF NOT FOUND OR l.id=ANY(seen) OR qty IS NULL OR qty<=0 OR qty='NaN'::numeric OR qty+coalesce(l.received_qty,0)>l.quantity THEN RAISE EXCEPTION 'Ligne dupliquée, étrangère ou quantité supérieure au restant'; END IF;
  seen:=array_append(seen,l.id);
  target_stock:=l.stock_item_id; actual_qty:=NULL; sub:=NULL;
  IF nullif(item->>'substitutionId','') IS NOT NULL THEN
   SELECT * INTO sub FROM purchase_phyto_substitutions WHERE id=(item->>'substitutionId')::uuid FOR UPDATE;
   IF NOT FOUND OR sub.domain_id<>p.domain_id OR sub.po_id<>p.id OR sub.line_id<>l.id OR sub.warehouse_id<>wh OR sub.status<>'approuve' OR qty<>sub.ordered_qty
    THEN RAISE EXCEPTION 'Remplacement approuvé, entrepôt et quantité correspondants requis'; END IF;
   IF purchase_substitution_snapshot(l.id,sub.replacement_stock_item_id,sub.positive_entry_id) IS DISTINCT FROM sub.snapshot THEN
    RAISE EXCEPTION 'Sources du remplacement modifiées : renouveler la demande'; END IF;
   target_stock:=sub.replacement_stock_item_id; actual_qty:=sub.delivered_qty;
   used_subs:=array_append(used_subs,sub.id);
  ELSIF EXISTS(SELECT 1 FROM purchase_phyto_substitutions WHERE line_id=l.id AND status IN ('en_attente','approuve')) THEN
   RAISE EXCEPTION 'Remplacement en cours : utiliser la demande approuvée ou annuler cette demande avant réception standard';
  END IF;
  IF target_stock IS NOT NULL THEN
   SELECT unit INTO stock_unit FROM stock_items WHERE id=target_stock AND domain_id=p.domain_id AND is_active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Article inactif ou hors société'; END IF;
   IF sub.id IS NOT NULL THEN
    IF stock_unit IS DISTINCT FROM (sub.snapshot->'replacement'->>'unit') THEN RAISE EXCEPTION 'Unité de stock modifiée : renouveler la demande'; END IF;
    factor:=1; price:=sub.unit_price*fx;
   ELSE
   factor:=CASE WHEN lower(btrim(l.unit))=lower(btrim(stock_unit)) THEN 1 ELSE convert_treatment_quantity(1,lower(btrim(l.unit)),lower(btrim(stock_unit))) END;
   IF factor IS NULL OR factor<=0 OR l.unit_price IS NULL OR l.unit_price<0 THEN RAISE EXCEPTION 'Unité ou prix de réception invalide'; END IF;
   price:=l.unit_price*fx/factor;
   END IF;
   actual_qty:=coalesce(actual_qty,qty*factor);
   IF round(actual_qty,2)<>actual_qty THEN RAISE EXCEPTION 'Quantité convertie trop précise pour le stock (2 décimales) : vérifier unité et quantité'; END IF;
   INSERT INTO stock_movements(domain_id,warehouse_id,stock_item_id,movement_type,quantity,unit_cost,movement_date,po_id,reference,notes)
   VALUES(p.domain_id,wh,target_stock,'entree',actual_qty,price,dt,p.id,coalesce(p_receipt->>'reference',p.po_number),'Réception valorisée '||rid::text||CASE WHEN sub.id IS NULL THEN '' ELSE ' ; remplacement '||sub.id::text END);
   moves:=moves+1;
  ELSIF lower(coalesce(p.cost_category,'')) NOT IN ('services','transport','energie') THEN RAISE EXCEPTION 'Lier les intrants à un article de stock avant réception';
  ELSIF fx<>1 THEN RAISE EXCEPTION 'Service en devise : convertir le bon en MAD avant réception';
  END IF;
  UPDATE purchase_order_lines SET received_qty=coalesce(received_qty,0)+qty WHERE id=l.id;
 END LOOP;
 status_new:=CASE WHEN EXISTS(SELECT 1 FROM purchase_order_lines WHERE po_id=p.id AND coalesce(received_qty,0)<quantity) THEN 'partiellement_recu' ELSE 'recu' END;
 UPDATE purchase_orders SET status=status_new,updated_at=now() WHERE id=p.id;
 v_result:=jsonb_build_object('new_status',status_new,'lines_updated',cardinality(seen),'movements_created',moves,'warnings','[]'::jsonb);
 IF cardinality(used_subs)>0 THEN
  v_result:=v_result||jsonb_build_object('warnings',jsonb_build_array('Produit de remplacement reçu : prescriptions inchangées, à revoir et soumettre à validation ; rapprocher la facture fournisseur avec les quantités/prix réellement reçus.'));
 END IF;
 UPDATE costed_purchase_receipts SET result=v_result WHERE id=rid;
 UPDATE purchase_phyto_substitutions SET status='receptionne',receipt_id=rid WHERE id=ANY(used_subs);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.receive_costed_purchase(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_costed_purchase(UUID,JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
