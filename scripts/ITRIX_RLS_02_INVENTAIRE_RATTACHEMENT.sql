-- READ ONLY: one SELECT. No reassignment, INSERT, UPDATE, DELETE or DDL.
-- Run as database administrator, No limit in the SQL Editor for the full report.
-- CANDIDATES ARE ASSOCIATIONS, NOT PROVEN OWNERSHIP.
-- A shared buyer/market can connect several tenants, including indirectly.
-- Never assign ownership automatically from this report or creator identity.
-- Scope: actual FK paths inside the tables below, preferred variety arrays,
-- and the explicit entity_type aliases below. Not all arbitrary JSON/RPC paths.
WITH RECURSIVE
source_rows(table_name,payload) AS (
  SELECT 'alerts',to_jsonb(x) FROM public.alerts x UNION ALL
  SELECT 'clients',to_jsonb(x) FROM public.clients x UNION ALL
  SELECT 'cultural_operations',to_jsonb(x) FROM public.cultural_operations x UNION ALL
  SELECT 'delivery_notes',to_jsonb(x) FROM public.delivery_notes x UNION ALL
  SELECT 'documents',to_jsonb(x) FROM public.documents x UNION ALL
  SELECT 'farm_zones',to_jsonb(x) FROM public.farm_zones x UNION ALL
  SELECT 'invoices',to_jsonb(x) FROM public.invoices x UNION ALL
  SELECT 'markets',to_jsonb(x) FROM public.markets x UNION ALL
  SELECT 'payments_received',to_jsonb(x) FROM public.payments_received x UNION ALL
  SELECT 'production_forecasts',to_jsonb(x) FROM public.production_forecasts x UNION ALL
  SELECT 'sales_orders',to_jsonb(x) FROM public.sales_orders x UNION ALL
  SELECT 'teams',to_jsonb(x) FROM public.teams x UNION ALL
  SELECT 'farms',to_jsonb(x) FROM public.farms x UNION ALL
  SELECT 'greenhouses',to_jsonb(x) FROM public.greenhouses x UNION ALL
  SELECT 'campaigns',to_jsonb(x) FROM public.campaigns x UNION ALL
  SELECT 'campaign_plantings',to_jsonb(x) FROM public.campaign_plantings x UNION ALL
  SELECT 'harvests',to_jsonb(x) FROM public.harvests x UNION ALL
  SELECT 'harvest_lots',to_jsonb(x) FROM public.harvest_lots x UNION ALL
  SELECT 'harvest_lot_sources',to_jsonb(x) FROM public.harvest_lot_sources x UNION ALL
  SELECT 'varieties',to_jsonb(x) FROM public.varieties x UNION ALL
  SELECT 'market_prices',to_jsonb(x) FROM public.market_prices x UNION ALL
  SELECT 'station_settlements',to_jsonb(x) FROM public.station_settlements x UNION ALL
  SELECT 'station_settlement_lines',to_jsonb(x) FROM public.station_settlement_lines x UNION ALL
  SELECT 'sales_order_lines',to_jsonb(x) FROM public.sales_order_lines x
),
nodes AS MATERIALIZED (
  SELECT table_name,coalesce(payload->>'id',md5(payload::text)) AS row_id,
    table_name||'/'||coalesce(payload->>'id',md5(payload::text)) AS node_key,payload
  FROM source_rows
),
-- Discover live FK columns instead of assuming the deployed schema matches Git.
fk_columns AS (
  SELECT src.relname AS source_table,dst.relname AS target_table,a.attname AS source_column
  FROM pg_constraint k
  JOIN pg_class src ON src.oid=k.conrelid
  JOIN pg_namespace sn ON sn.oid=src.relnamespace
  JOIN pg_class dst ON dst.oid=k.confrelid
  JOIN pg_namespace dn ON dn.oid=dst.relnamespace
  CROSS JOIN LATERAL unnest(k.conkey,k.confkey) AS pair(source_attnum,target_attnum)
  JOIN pg_attribute a ON a.attrelid=src.oid AND a.attnum=pair.source_attnum
  JOIN pg_attribute b ON b.attrelid=dst.oid AND b.attnum=pair.target_attnum
  WHERE k.contype='f' AND sn.nspname='public' AND dn.nspname='public' AND b.attname='id'
),
entity_aliases(alias,target_table) AS (VALUES
  ('farm','farms'),('ferme','farms'),('greenhouse','greenhouses'),('serre','greenhouses'),
  ('campaign','campaigns'),('campagne','campaigns'),('plantation','campaign_plantings'),
  ('campaign_planting','campaign_plantings'),('harvest','harvests'),('recolte','harvests'),
  ('harvest_lot','harvest_lots'),('sales_order','sales_orders'),('commande','sales_orders'),
  ('invoice','invoices'),('facture','invoices'),('client','clients'),('market','markets'),
  ('station_settlement','station_settlements'),('delivery_note','delivery_notes')
),
directed_edges(source_key,target_key,relation) AS MATERIALIZED (
  SELECT DISTINCT s.node_key,t.node_key,'FK:'||f.source_column
  FROM fk_columns f JOIN nodes s ON s.table_name=f.source_table
  JOIN nodes t ON t.table_name=f.target_table AND t.row_id=s.payload->>f.source_column
  UNION
  SELECT s.node_key,t.node_key,'entity_type:'||(s.payload->>'entity_type')
  FROM nodes s JOIN nodes t ON t.row_id=s.payload->>'entity_id'
  WHERE s.table_name IN ('alerts','documents') AND (
    t.table_name=s.payload->>'entity_type' OR EXISTS (
      SELECT 1 FROM entity_aliases a WHERE a.alias=s.payload->>'entity_type' AND a.target_table=t.table_name
    )
  )
  UNION
  SELECT s.node_key,t.node_key,'preferred_variety_ids'
  FROM nodes s JOIN nodes t ON t.table_name='varieties'
    AND (s.payload->'preferred_variety_ids') ? t.row_id
  WHERE s.table_name='clients'
),
edges(source_key,target_key) AS (
  SELECT source_key,target_key FROM directed_edges
  UNION SELECT target_key,source_key FROM directed_edges
),
-- Valid existing domain_id values are evidence anchors, NOT inferred assignments.
anchors AS (
  SELECT n.node_key,d.id::text AS domain_id
  FROM nodes n JOIN public.domains d ON d.id::text=n.payload->>'domain_id'
),
reach(node_key,domain_id) AS (
  SELECT node_key,domain_id FROM anchors
  UNION
  SELECT e.target_key,r.domain_id FROM reach r JOIN edges e ON e.source_key=r.node_key
),
target_nodes AS (
  SELECT * FROM nodes WHERE table_name IN (
    'alerts','clients','cultural_operations','delivery_notes','documents','farm_zones',
    'invoices','markets','payments_received','production_forecasts','sales_orders','teams'
  )
)
SELECT n.table_name,n.row_id AS id,
  coalesce(n.payload->>'code',n.payload->>'invoice_number',n.payload->>'order_number',n.payload->>'dn_number') AS reference,
  CASE WHEN c.candidate_count=0 THEN 'AUCUN_RATTACHEMENT_IDENTIFIE'
       WHEN c.candidate_count=1 THEN 'UN_CLIENT_CANDIDAT_A_CONFIRMER'
       ELSE 'PLUSIEURS_CLIENTS_ASSOCIES_NE_PAS_ATTRIBUER_AUTOMATIQUEMENT' END AS diagnostic,
  c.candidate_count AS nombre_clients_candidats,c.candidates AS clients_candidats,
  coalesce((SELECT jsonb_agg(jsonb_build_object(
    'relation',e.relation,'cible',e.target_key
  ) ORDER BY e.relation,e.target_key) FROM directed_edges e WHERE e.source_key=n.node_key),'[]'::jsonb) AS liens_sortants,
  n.payload->>'entity_type' AS entity_type,n.payload->>'entity_id' AS entity_id,
  (n.table_name IN ('alerts','documents') AND NOT EXISTS (
    SELECT 1 FROM directed_edges e WHERE e.source_key=n.node_key AND e.relation LIKE 'entity_type:%'
  )) AS reference_polymorphe_non_resolue
FROM target_nodes n
CROSS JOIN LATERAL (
  SELECT count(*) AS candidate_count,
    coalesce(jsonb_agg(jsonb_build_object('domain_id',d.id,'code',d.code,'actif',d.is_active) ORDER BY d.code),'[]'::jsonb) AS candidates
  FROM reach r JOIN public.domains d ON d.id::text=r.domain_id WHERE r.node_key=n.node_key
) c
ORDER BY n.table_name,n.row_id;
