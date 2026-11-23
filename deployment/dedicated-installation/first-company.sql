BEGIN;

CREATE OR REPLACE FUNCTION public.dedicated_installation_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active)
     OR NOT coalesce(public.is_platform_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Administration plateforme requise' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('category', category, 'code', code, 'name', item->>'name')
                     ORDER BY category, code)
    FROM itrix_installation.seed_candidates
    WHERE seed_kind = 'catalog' AND category IN ('varieties', 'stock_items', 'markets')
      AND (item->>'active')::boolean IS DISTINCT FROM false
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_dedicated_company(p_input jsonb, p_selection jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  company jsonb;
  company_id uuid;
  selection_item record;
  selected_data jsonb;
  crop_id uuid;
BEGIN
  PERFORM public.dedicated_installation_catalog();
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection) > 1000 THEN
    RAISE EXCEPTION 'Sélection du catalogue invalide';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('itrix-dedicated-company-installation', 0));
  IF NOT EXISTS (SELECT 1 FROM public.domains) THEN
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
  END IF;

  company := public.create_client_with_defaults(p_input);
  company_id := (company->>'id')::uuid;

  INSERT INTO public.crops (
    domain_id, code, name, family, icon, color, default_unit, cycle_days_first_harvest,
    harvest_duration_days, brix_relevant, variety_segments, is_active, order_idx
  )
  SELECT company_id, s.code, r.name, r.family, r.icon, r.color, r.default_unit,
    r.cycle_days_first_harvest, r.harvest_duration_days, r.brix_relevant,
    coalesce(r.variety_segments, '[]'), coalesce(r.is_active, true), coalesce(r.order_idx, 0)
  FROM itrix_installation.seed_candidates s
  CROSS JOIN LATERAL jsonb_to_record(s.item) AS r(
    name text, family text, icon text, color text, default_unit text, cycle_days_first_harvest integer,
    harvest_duration_days integer, brix_relevant boolean, variety_segments jsonb, is_active boolean, order_idx integer
  )
  WHERE s.seed_kind = 'reference' AND s.category = 'crops'
    AND NOT EXISTS (SELECT FROM public.crops c WHERE c.domain_id = company_id AND upper(trim(c.code)) = upper(trim(s.code)));

  FOR selection_item IN SELECT DISTINCT category, code FROM jsonb_to_recordset(p_selection) AS x(category text, code text)
  LOOP
    WITH entry AS (
      SELECT item FROM itrix_installation.seed_candidates
      WHERE seed_kind = 'catalog' AND category = selection_item.category AND code = selection_item.code
        AND (item->>'active')::boolean IS DISTINCT FROM false
    )
    SELECT entry.item INTO selected_data FROM entry;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fiche de catalogue introuvable'; END IF;

    CASE selection_item.category
      WHEN 'varieties' THEN
        SELECT c.id INTO STRICT crop_id FROM public.crops c
        WHERE c.domain_id = company_id AND upper(trim(c.code)) = upper(trim(selected_data->>'crop_code'));
        INSERT INTO public.varieties (domain_id, code, commercial_name, type, crop_id, destination)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          (selected_data->>'type')::public.tomato_type, crop_id, selected_data->>'destination');
      WHEN 'stock_items' THEN
        INSERT INTO public.stock_items (domain_id, code, name, category, unit, packaging, current_qty)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          selected_data->>'category', selected_data->>'unit', selected_data->>'packaging', 0);
      WHEN 'markets' THEN
        INSERT INTO public.markets (domain_id, code, name, type, country, currency)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          selected_data->>'type', selected_data->>'country', selected_data->>'currency');
      ELSE RAISE EXCEPTION 'Catégorie de catalogue invalide';
    END CASE;
  END LOOP;
  RETURN company;
END;
$$;

REVOKE ALL ON FUNCTION public.dedicated_installation_catalog(), public.create_dedicated_company(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_installation_catalog(), public.create_dedicated_company(jsonb,jsonb)
  TO authenticated;

COMMIT;
