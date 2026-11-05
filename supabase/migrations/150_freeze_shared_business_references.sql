-- Emergency containment, NOT tenant isolation.
-- Keeps existing reads and foreign keys intact until client-specific copies
-- and all dependent references have been migrated and verified.
-- Apply only after validating the deployed schema and taking a backup.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_shared_business_reference_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- JWT identity survives SECURITY DEFINER: client RPCs cannot bypass this guard.
  IF auth.role() IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Référentiel partagé temporairement en lecture seule : isolation par client requise.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_shared_business_reference_write() FROM PUBLIC;

DO $containment$
DECLARE reference_table text;
BEGIN
  FOREACH reference_table IN ARRAY ARRAY[
    'varieties', 'crops', 'crop_variety_catalog',
    'reference_lists', 'reference_values', 'seed_suppliers',
    'app_settings', 'exchange_rates', 'account_categories',
    'workflow_definitions', 'workflow_states', 'workflow_transitions'
  ] LOOP
    -- Do not freeze an already isolated table without reviewing its policies.
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=reference_table AND column_name='domain_id') THEN
      RAISE EXCEPTION 'Table % déjà rattachée à un client : vérifier la migration avant application.', reference_table;
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)', reference_table || '_shared_insert_frozen', reference_table);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false)', reference_table || '_shared_update_frozen', reference_table);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)', reference_table || '_shared_delete_frozen', reference_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_shared_business_reference_write()', reference_table || '_shared_write_guard', reference_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_shared_business_reference_write()', reference_table || '_shared_truncate_guard', reference_table);
  END LOOP;
END
$containment$;

COMMIT;
