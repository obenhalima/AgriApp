BEGIN;
CREATE OR REPLACE FUNCTION public.mobile_can_review(p_kind TEXT,p_id UUID,p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND is_active AND NOT coalesce(must_change_password,false))
 AND public.mobile_can_review_before_session_guard(p_kind,p_id,p_user)
 AND (p_kind<>'approval' OR EXISTS(
  SELECT 1 FROM approval_requests a JOIN approval_policies p ON p.id=a.policy_id AND p.domain_id=a.domain_id AND p.process_code=a.process_code AND p.is_active
  WHERE a.id=p_id AND (
   (a.process_code='purchase_order' AND EXISTS(SELECT 1 FROM purchase_orders po WHERE po.id=a.entity_id AND po.domain_id=a.domain_id))
   OR (a.process_code='stock_transfer' AND EXISTS(SELECT 1 FROM stock_transfers t WHERE t.id=a.entity_id AND t.domain_id=a.domain_id))
  )
 ));
$$;
CREATE OR REPLACE FUNCTION public.mobile_approval_items() RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 RETURN coalesce((SELECT jsonb_agg(item || jsonb_build_object(
 'requester',(SELECT coalesce(full_name,'Utilisateur') FROM profiles WHERE id=(item->>'requested_by')::uuid AND is_domain_member((item->>'domain_id')::uuid,id)),
 'supplier',(SELECT name FROM suppliers WHERE id=(item->'entity'->>'supplier_id')::uuid AND domain_id=(item->>'domain_id')::uuid),
 'source_warehouse',(SELECT name FROM warehouses WHERE id=(item->'entity'->>'source_id')::uuid AND domain_id=(item->>'domain_id')::uuid),
 'destination_warehouse',(SELECT name FROM warehouses WHERE id=(item->'entity'->>'destination_id')::uuid AND domain_id=(item->>'domain_id')::uuid),
 'farm',(SELECT f.name FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id JOIN farms f ON f.id=g.farm_id WHERE cp.id=(item->'entity'->>'campaign_planting_id')::uuid AND cp.domain_id=(item->>'domain_id')::uuid AND f.domain_id=cp.domain_id)
 ) ORDER BY created_at) FROM (
 SELECT a.created_at,jsonb_build_object('kind','approval','id',a.id,'domain_id',a.domain_id,'company',d.name,'process',a.process_code,'reference',a.entity_reference,'level',a.current_level,'levels',a.required_levels,'requested_by',a.requested_by,'created_at',a.created_at,'details',to_jsonb(a),
 'entity',CASE WHEN a.process_code='purchase_order' THEN (SELECT to_jsonb(p) FROM purchase_orders p WHERE p.id=a.entity_id AND p.domain_id=a.domain_id) WHEN a.process_code='stock_transfer' THEN (SELECT to_jsonb(t) FROM stock_transfers t WHERE t.id=a.entity_id AND t.domain_id=a.domain_id) ELSE '{}'::jsonb END,
 'lines',CASE WHEN a.process_code='purchase_order' THEN (SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM purchase_order_lines l WHERE l.po_id=a.entity_id AND l.domain_id=a.domain_id) ELSE '[]'::jsonb END,
 'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.decided_at),'[]') FROM approval_decisions h WHERE h.request_id=a.id AND h.domain_id=a.domain_id),
 'href',CASE WHEN a.process_code='purchase_order' THEN '/achats/'||a.entity_id ELSE '/stocks/transferts' END) item
 FROM approval_requests a JOIN domains d ON d.id=a.domain_id WHERE mobile_can_review('approval',a.id,auth.uid())
 UNION ALL
 SELECT t.created_at,jsonb_build_object('kind','treatment','id',t.id,'domain_id',t.domain_id,'company',d.name,'process','treatment','reference',t.target_name,'level',1,'levels',1,'requested_by',t.requested_by,'created_at',t.created_at,'details',to_jsonb(t),'entity',to_jsonb(t),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('product_name',s.name)),'[]') FROM treatment_request_products p LEFT JOIN stock_items s ON s.id=p.stock_item_id AND s.domain_id=t.domain_id WHERE p.domain_id=t.domain_id AND p.treatment_request_id=t.id),'href','/agronomie/traitements')
 FROM treatment_requests t JOIN domains d ON d.id=t.domain_id WHERE mobile_can_review('treatment',t.id,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='treatment' AND a.entity_id=t.id)
 UNION ALL
 SELECT s.created_at,jsonb_build_object('kind','stock_exit','id',s.id,'domain_id',s.domain_id,'company',d.name,'process','stock_exit','reference',coalesce(s.reference,i.name),'level',1,'levels',1,'requested_by',s.requested_by,'created_at',s.created_at,'details',to_jsonb(s),'entity',to_jsonb(s)||jsonb_build_object('product_name',i.name,'unit',i.unit),'lines','[]'::jsonb,'href','/stocks')
 FROM stock_exit_requests s JOIN domains d ON d.id=s.domain_id JOIN stock_items i ON i.id=s.stock_item_id AND i.domain_id=s.domain_id WHERE mobile_can_review('stock_exit',s.id,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='stock_exit' AND a.entity_id=s.id)
 ) q),'[]');
END $$;
REVOKE ALL ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) TO service_role;
REVOKE ALL ON FUNCTION public.mobile_approval_items() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_approval_items() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
