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

CREATE OR REPLACE FUNCTION public.add_dedicated_company_catalog(company_id uuid, p_selection jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE selection_item record; selected_data jsonb; crop_id uuid;
BEGIN
  PERFORM public.dedicated_installation_catalog();
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection) > 1000 THEN
    RAISE EXCEPTION 'Sélection du catalogue invalide';
  END IF;
  PERFORM 1 FROM public.domains d WHERE d.id = company_id AND d.is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Société active introuvable'; END IF;
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
        IF EXISTS (SELECT 1 FROM public.varieties v WHERE v.domain_id = company_id AND upper(trim(v.code)) = upper(trim(selection_item.code))) THEN CONTINUE; END IF;
        SELECT c.id INTO STRICT crop_id FROM public.crops c
        WHERE c.domain_id = company_id AND upper(trim(c.code)) = upper(trim(selected_data->>'crop_code'));
        INSERT INTO public.varieties (domain_id, code, commercial_name, type, crop_id, destination)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          (selected_data->>'type')::public.tomato_type, crop_id, selected_data->>'destination');
      WHEN 'stock_items' THEN
        IF EXISTS (SELECT 1 FROM public.stock_items s WHERE s.domain_id = company_id AND upper(trim(s.code)) = upper(trim(selection_item.code))) THEN CONTINUE; END IF;
        INSERT INTO public.stock_items (domain_id, code, name, category, unit, packaging, current_qty)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          selected_data->>'category', selected_data->>'unit', selected_data->>'packaging', 0);
      WHEN 'markets' THEN
        IF EXISTS (SELECT 1 FROM public.markets m WHERE m.domain_id = company_id AND upper(trim(m.code)) = upper(trim(selection_item.code))) THEN CONTINUE; END IF;
        INSERT INTO public.markets (domain_id, code, name, type, country, currency)
        VALUES (company_id, selection_item.code, selected_data->>'name',
          selected_data->>'type', selected_data->>'country', selected_data->>'currency');
      ELSE RAISE EXCEPTION 'Catégorie de catalogue invalide';
    END CASE;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_dedicated_company(p_input jsonb, p_selection jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  company jsonb;
  company_id uuid;
BEGIN
  PERFORM public.dedicated_installation_catalog();
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection) > 1000 THEN
    RAISE EXCEPTION 'Sélection du catalogue invalide';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('itrix-dedicated-company-installation', 0));
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

  PERFORM public.add_dedicated_company_catalog(company_id, p_selection);
  RETURN company;
END;
$$;

REVOKE ALL ON FUNCTION public.dedicated_installation_catalog(), public.create_dedicated_company(jsonb,jsonb), public.add_dedicated_company_catalog(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_installation_catalog(), public.create_dedicated_company(jsonb,jsonb), public.add_dedicated_company_catalog(uuid,jsonb)
  TO authenticated;

COMMIT;
