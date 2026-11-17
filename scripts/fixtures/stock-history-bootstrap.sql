ALTER TABLE farms ADD code text DEFAULT 'F01';
ALTER TABLE campaigns ADD code text DEFAULT 'C26';
CREATE TABLE suppliers(id uuid PRIMARY KEY,domain_id uuid,code text,name text,is_active boolean DEFAULT true);
CREATE TABLE inventory_value_events(id uuid DEFAULT gen_random_uuid(),stock_item_id uuid,warehouse_id uuid,event_kind text,created_at timestamptz DEFAULT now());
CREATE FUNCTION is_domain_admin(d uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT has_domain_permission(d,u,'stocks','edit') $$;
INSERT INTO stock_items(domain_id,code,name,category,unit) VALUES('20000000-0000-0000-0000-000000000001','ENG01','Engrais','engrais','kg'),('20000000-0000-0000-0000-000000000001','ENG02','Inconnu','engrais','kg');
CREATE FUNCTION history_row(ref text,kind text,q text,price text DEFAULT '',day text DEFAULT '2020-01-01',seq text DEFAULT '1',article text DEFAULT 'ENG01') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('external_id',ref,'date',day,'order',seq,'type',kind,'item',article,'unit','kg','warehouse','D1','quantity',q,'price',price,'reference','BL TEST','supplier','','farm','F01',
 'campaign',CASE WHEN kind='sortie' THEN 'C26' ELSE '' END,'plantings',CASE WHEN kind='sortie' THEN (SELECT string_agg('P-'||substr(md5(id::text),1,12),';' ORDER BY id) FROM campaign_plantings) ELSE '' END,'notes','') $$;
