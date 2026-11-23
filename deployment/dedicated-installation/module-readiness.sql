BEGIN;

CREATE OR REPLACE FUNCTION public.dedicated_module_readiness(p_domain uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active)
     OR NOT (coalesce(public.is_platform_admin(auth.uid()), false)
             OR coalesce(public.is_domain_member(p_domain, auth.uid()), false))
     OR NOT EXISTS (SELECT 1 FROM public.domains WHERE id = p_domain AND is_active) THEN
    RAISE EXCEPTION 'Société active inaccessible' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'farms', EXISTS (SELECT FROM public.farms WHERE domain_id = p_domain AND is_active),
    'crops', EXISTS (SELECT FROM public.crops WHERE domain_id = p_domain AND is_active),
    'varieties', EXISTS (SELECT FROM public.varieties WHERE domain_id = p_domain AND is_active),
    'stock_items', EXISTS (SELECT FROM public.stock_items WHERE domain_id = p_domain AND is_active),
    'warehouses', EXISTS (SELECT FROM public.warehouses WHERE domain_id = p_domain AND is_active),
    'campaigns', EXISTS (SELECT FROM public.campaigns WHERE domain_id = p_domain),
    'plantings', EXISTS (SELECT FROM public.campaign_plantings WHERE domain_id = p_domain),
    'suppliers', EXISTS (SELECT FROM public.suppliers WHERE domain_id = p_domain AND is_active),
    'commercial_clients', EXISTS (SELECT FROM public.clients WHERE domain_id = p_domain AND is_active),
    'workers', EXISTS (SELECT FROM public.workers w JOIN public.farms f ON f.id = w.farm_id
                       WHERE f.domain_id = p_domain AND f.is_active AND w.is_active),
    'phyto', EXISTS (SELECT FROM public.plant_protection_products WHERE domain_id = p_domain
                     AND is_active AND authorization_status = 'autorise'),
    'account_categories', EXISTS (SELECT FROM public.account_categories WHERE is_active)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dedicated_module_readiness(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_module_readiness(uuid) TO authenticated;

COMMIT;
