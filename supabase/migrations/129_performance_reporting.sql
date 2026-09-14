BEGIN;
-- Read-only reporting. Existing costing sources/allocation basis remain unchanged.
CREATE OR REPLACE FUNCTION public.get_farm_performance_data(p_domain uuid,p_campaign uuid DEFAULT NULL,p_start date DEFAULT NULL,p_end date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; can_margin boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'couts','view'),false) THEN RAISE EXCEPTION 'Consultation des coûts non autorisée'; END IF;
 IF p_start>p_end THEN RAISE EXCEPTION 'Période invalide'; END IF;
 IF p_campaign IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND domain_id=p_domain) THEN RAISE EXCEPTION 'Campagne étrangère au client'; END IF;
 can_margin:=coalesce(has_domain_permission(p_domain,auth.uid(),'marges','view'),false);
 result:=public.get_production_cost_data(p_domain,p_campaign,p_start,p_end)-'inventory'-'transit';
 RETURN result||jsonb_build_object(
 'revenue_available',can_margin,
 'consumptions',coalesce((SELECT jsonb_agg(jsonb_build_object('movement_id',m.id,'product',s.name,'quantity',m.quantity,'unit',s.unit,'date',m.movement_date))
  FROM stock_movements m JOIN stock_items s ON s.id=m.stock_item_id
  WHERE m.domain_id=p_domain AND EXISTS(SELECT 1 FROM cost_entries c WHERE c.source_stock_movement_id=m.id AND c.domain_id=p_domain
   AND (p_campaign IS NULL OR c.campaign_id=p_campaign) AND (p_start IS NULL OR c.entry_date>=p_start) AND (p_end IS NULL OR c.entry_date<=p_end))),'[]'::jsonb),
 'metadata',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'variety_name',v.commercial_name,'status',p.status,'start',p.planting_date,'end',coalesce(p.last_harvest_date,p.harvest_end_date),
  'price_export',CASE WHEN can_margin THEN coalesce(p.price_per_kg_export,v.avg_price_export) END,
  'price_local',CASE WHEN can_margin THEN coalesce(p.price_per_kg_local,v.avg_price_local) END,
  'export_share',p.export_share_pct)) FROM campaign_plantings p JOIN varieties v ON v.id=p.variety_id
  WHERE p.domain_id=p_domain AND (p_campaign IS NULL OR p.campaign_id=p_campaign)),'[]'::jsonb),
 'harvest_details',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'planting_id',p.id,'date',h.harvest_date,'kg',h.total_qty,'cat1',h.qty_category_1,'local_kg',coalesce(h.qty_category_2,0)+coalesce(h.qty_category_3,0)))
  FROM harvests h JOIN campaign_plantings p ON p.id=h.campaign_planting_id
  WHERE h.domain_id=p_domain AND p.domain_id=p_domain AND (p_campaign IS NULL OR p.campaign_id=p_campaign)
  AND (p_start IS NULL OR h.harvest_date>=p_start) AND (p_end IS NULL OR h.harvest_date<=p_end)),'[]'::jsonb),
 'station_lots',CASE WHEN can_margin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'planting_id',p.id,'date',l.harvest_date,'amount',l.ca_amount,'priced_kg',l.qty_priced_kg,'accepted_kg',l.qty_acceptee_kg))
  FROM harvest_lots l JOIN campaign_plantings p ON p.id=l.campaign_planting_id
  WHERE l.domain_id=p_domain AND p.domain_id=p_domain AND l.category='station_dispatch' AND (p_campaign IS NULL OR p.campaign_id=p_campaign)
  AND (p_start IS NULL OR l.harvest_date>=p_start) AND (p_end IS NULL OR l.harvest_date<=p_end)),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION public.get_farm_performance_data(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_farm_performance_data(uuid,uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
