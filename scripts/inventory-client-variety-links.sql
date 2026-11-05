-- READ ONLY. Names and linked reference IDs only; no contact details or secrets.
-- Client IDs come from the supplied usage inventory, not from inferred defaults.
WITH client_ids(id) AS (VALUES
 ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81'::uuid),
 ('8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'::uuid),
 ('f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217'::uuid)
), expected_varieties(id) AS (VALUES
 ('806f845e-9e81-489a-9341-7ace21dcccda'::uuid),
 ('8d67b5d6-a0c9-4939-94a1-ed090d3899ba'::uuid),
 ('37caf3ef-fbab-4a25-94a3-9fe35402432b'::uuid),
 ('ec26adb4-a819-4750-afe9-6b3594eb0796'::uuid)
), links AS (
 SELECT e.id AS expected_variety_id, v.id IS NOT NULL AS variety_present,
  v.code, v.commercial_name, v.is_active AS current_global_active,
  to_jsonb(v)->>'domain_id' AS current_domain_id,
  v.crop_id, c.code AS crop_code, c.name AS crop_name,
  c.is_active AS crop_active, to_jsonb(c)->>'domain_id' AS crop_domain_id,
  (v.crop_id IS NOT NULL AND c.id IS NULL) AS crop_link_missing,
  v.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
  to_jsonb(s)->>'domain_id' AS supplier_domain_id,
  (v.supplier_id IS NOT NULL AND s.id IS NULL) AS supplier_link_missing
 FROM expected_varieties e LEFT JOIN public.varieties v ON v.id=e.id
 LEFT JOIN public.crops c ON c.id=v.crop_id
 LEFT JOIN public.seed_suppliers s ON s.id=v.supplier_id
)
SELECT jsonb_build_object(
 'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'present',d.id IS NOT NULL,'code',d.code,'name',d.name,'is_active',d.is_active) ORDER BY x.id)
  FROM client_ids x LEFT JOIN public.domains d ON d.id=x.id),'[]'::jsonb),
 'variety_links',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.code,l.expected_variety_id) FROM links l),'[]'::jsonb),
 'status_note','Existing global archive flags cannot establish the intended active status for each client. Human confirmation required.'
) AS inventory;
