-- Separate read and write authorization. DELETE does not evaluate WITH CHECK.
-- Additive correction: do not rewrite previously applied migration 097.
BEGIN;

DO $migration$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'phyto_compliance_settings', 'phyto_market_requirements', 'phyto_mrl_limits'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_table || '_domain', target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), ''agronomie'', ''view''))', target_table || '_domain_read', target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), ''agronomie'', ''edit''))', target_table || '_domain_insert', target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), ''agronomie'', ''view'')) WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), ''agronomie'', ''edit''))', target_table || '_domain_update', target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), ''agronomie'', ''edit''))', target_table || '_domain_delete', target_table);
  END LOOP;
END
$migration$;

COMMIT;
