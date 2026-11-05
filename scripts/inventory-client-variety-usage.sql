-- READ ONLY. Run after the schema inventory confirms all named tables exist.
-- Includes archived rows and historical records. No quantities, prices or personal data.
-- A missing or conflicting owner is reported, never silently assigned.
WITH raw_usage(variety_id,source,record_id,candidates) AS (
 SELECT p.variety_id::text,'plantations',p.id::text,
  ARRAY[to_jsonb(p)->>'domain_id',to_jsonb(c)->>'domain_id',to_jsonb(f)->>'domain_id']
 FROM public.campaign_plantings p LEFT JOIN public.campaigns c ON c.id=p.campaign_id
 LEFT JOIN public.greenhouses g ON g.id=p.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT h.variety_id::text,'lots',h.id::text,
  ARRAY[to_jsonb(h)->>'domain_id',to_jsonb(p)->>'domain_id',to_jsonb(f)->>'domain_id']
 FROM public.harvest_lots h LEFT JOIN public.campaign_plantings p ON p.id::text=to_jsonb(h)->>'campaign_planting_id'
 LEFT JOIN public.greenhouses g ON g.id=h.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT e.variety_id::text,'couts',e.id::text,
  ARRAY[to_jsonb(e)->>'domain_id',to_jsonb(c)->>'domain_id',to_jsonb(f)->>'domain_id']
 FROM public.cost_entries e LEFT JOIN public.campaigns c ON c.id=e.campaign_id
 LEFT JOIN public.greenhouses g ON g.id=e.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT l.variety_id::text,'ventes',l.id::text,
  ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(o)->>'domain_id',to_jsonb(c)->>'domain_id',to_jsonb(b)->>'domain_id']
 FROM public.sales_order_lines l LEFT JOIN public.sales_orders o ON o.id=l.order_id
 LEFT JOIN public.campaigns c ON c.id=o.campaign_id LEFT JOIN public.clients b ON b.id=o.client_id
 UNION ALL
 SELECT p.variety_id::text,'prix_marche',p.id::text,
  ARRAY[to_jsonb(p)->>'domain_id',to_jsonb(m)->>'domain_id']
 FROM public.market_prices p LEFT JOIN public.markets m ON m.id=p.market_id
 UNION ALL
 SELECT l.variety_id::text,'reglements_station',l.id::text,
  ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(s)->>'domain_id',to_jsonb(f)->>'domain_id',to_jsonb(m)->>'domain_id']
 FROM public.station_settlement_lines l LEFT JOIN public.station_settlements s ON s.id=l.settlement_id
 LEFT JOIN public.farms f ON f.id=l.farm_id LEFT JOIN public.markets m ON m.id=l.market_id
 UNION ALL
 SELECT x.value,'preferences_commerciales',b.id::text,
  ARRAY[to_jsonb(b)->>'domain_id',to_jsonb(m)->>'domain_id']
 FROM public.clients b LEFT JOIN public.markets m ON m.id=b.market_id
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(b)->'preferred_variety_ids')='array' THEN to_jsonb(b)->'preferred_variety_ids' ELSE '[]'::jsonb END) x
 UNION ALL
 SELECT x.value->>'variety_id','allocations_culturales',k.movement_id::text,
  ARRAY[to_jsonb(k)->>'domain_id',to_jsonb(c)->>'domain_id',to_jsonb(f)->>'domain_id']
 FROM public.cultural_consumptions k
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(k.allocations)='array' THEN k.allocations ELSE '[]'::jsonb END) x
 LEFT JOIN public.campaigns c ON c.id::text=x.value->>'campaign_id'
 LEFT JOIN public.greenhouses g ON g.id::text=x.value->>'greenhouse_id'
 LEFT JOIN public.farms f ON f.id=g.farm_id
), usage AS (
 SELECT variety_id,source,record_id,
  ARRAY(SELECT DISTINCT value FROM unnest(candidates) value WHERE value IS NOT NULL AND value<>'' ORDER BY value) AS owners
 FROM raw_usage WHERE variety_id IS NOT NULL AND variety_id<>''
), summary AS (
 SELECT v.id,v.code,v.commercial_name,v.is_active,to_jsonb(v)->>'domain_id' AS current_domain_id,
  (SELECT count(*) FROM usage u WHERE u.variety_id=v.id::text) AS usages,
  (SELECT count(*) FROM usage u WHERE u.variety_id=v.id::text AND cardinality(u.owners)=0) AS unresolved_usages,
  (SELECT count(*) FROM usage u WHERE u.variety_id=v.id::text AND cardinality(u.owners)>1) AS conflicting_usages,
  ARRAY(SELECT DISTINCT owner FROM usage u CROSS JOIN LATERAL unnest(u.owners) owner WHERE u.variety_id=v.id::text ORDER BY owner) AS client_ids,
  ARRAY(SELECT DISTINCT source FROM usage u WHERE u.variety_id=v.id::text ORDER BY source) AS sources
 FROM public.varieties v
)
SELECT jsonb_build_object(
 'scope','Known relational, preference-array and cultural-allocation paths; not every arbitrary JSON document.',
 'varieties',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.code,s.id) FROM summary s),'[]'::jsonb),
 'orphan_references',COALESCE((SELECT jsonb_agg(jsonb_build_object('source',u.source,'record_id',u.record_id,'variety_id',u.variety_id)) FROM usage u WHERE NOT EXISTS(SELECT 1 FROM public.varieties v WHERE v.id::text=u.variety_id)),'[]'::jsonb),
 'unresolved_sources',COALESCE((SELECT jsonb_agg(to_jsonb(z)) FROM (SELECT source,count(*) AS records FROM usage WHERE cardinality(owners)=0 GROUP BY source ORDER BY source) z),'[]'::jsonb)
) AS inventory;
