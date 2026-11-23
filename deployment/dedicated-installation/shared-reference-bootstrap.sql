BEGIN;

-- Load instance-wide lists before opening the company setup to users.
DO $seed$
DECLARE selection_item record;
BEGIN
  INSERT INTO public.reference_lists (key, label, is_system)
  SELECT s.code, s.item->>'label', coalesce((s.item->>'is_system')::boolean, false)
  FROM itrix_installation.seed_candidates s
  WHERE s.seed_kind = 'reference' AND s.category = 'reference_lists'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.reference_values (list_key, code, label, color, icon, order_idx, is_active, is_default)
  SELECT r.list_key, r.code, r.label, r.color, r.icon, r.order_idx, r.is_active, r.is_default
  FROM itrix_installation.seed_candidates s
  CROSS JOIN LATERAL jsonb_to_record(s.item) AS r(
    list_key text, code text, label text, color text, icon text, order_idx integer, is_active boolean, is_default boolean
  )
  WHERE s.seed_kind = 'reference' AND s.category = 'reference_values'
  ON CONFLICT DO NOTHING;

  FOR selection_item IN
    SELECT code, item FROM itrix_installation.seed_candidates
    WHERE seed_kind = 'reference' AND category = 'account_categories'
    ORDER BY (item->>'level')::integer, code
  LOOP
    INSERT INTO public.account_categories (code, label, type, level, display_order, default_depreciation_years, is_active, parent_id)
    VALUES (selection_item.code, selection_item.item->>'label', selection_item.item->>'type',
      (selection_item.item->>'level')::integer, (selection_item.item->>'display_order')::integer,
      (selection_item.item->>'default_depreciation_years')::integer, (selection_item.item->>'is_active')::boolean,
      (SELECT a.id FROM public.account_categories a WHERE a.code = selection_item.item->>'parent_code'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$seed$;

COMMIT;
