-- Prepared only: explicit approval required before applying to shared Supabase.
-- Snapshot is checked on request, review and receipt; no historical data rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.purchase_substitution_snapshot(p_line uuid,p_stock uuid,p_entry uuid) RETURNS jsonb
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
 AND EXISTS(
  SELECT 1 FROM stock_items original
  JOIN plant_protection_products original_product ON original_product.id=original.plant_protection_product_id AND original_product.domain_id=o.domain_id AND original_product.is_active
  JOIN phyto_positive_list_entries original_entry ON original_entry.product_id=original_product.id AND original_entry.domain_id=o.domain_id
  JOIN phyto_positive_lists original_list ON original_list.id=original_entry.list_id AND original_list.domain_id=o.domain_id AND original_list.status='active'
  WHERE original.id=l.stock_item_id AND original.domain_id=o.domain_id AND original.is_active
   AND original_entry.target_id=e.target_id AND original_entry.review_status='valide' AND original_entry.station_approved
   AND original_entry.authorized_use_id IS NOT NULL
 )
$$;
REVOKE ALL ON FUNCTION public.purchase_substitution_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
