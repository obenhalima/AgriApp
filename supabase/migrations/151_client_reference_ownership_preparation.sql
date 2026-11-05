-- EXPANSION ONLY. Does not assign, duplicate, delete or remap existing data.
-- Not a completed isolation migration: keep reference writes frozen until the
-- reviewed ownership map, relational remapping and RLS cutover are validated.
BEGIN;

DO $prepare$
DECLARE reference_table text;
BEGIN
  FOREACH reference_table IN ARRAY ARRAY['varieties','crops','seed_suppliers','crop_variety_catalog'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('public.%I', reference_table)::regclass
      AND tgname=reference_table || '_shared_write_guard' AND NOT tgisinternal AND tgenabled <> 'D') THEN
      RAISE EXCEPTION 'Écritures partagées non verrouillées sur % : valider le confinement avant préparation.', reference_table;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT', reference_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(domain_id)', reference_table || '_client_ownership_idx', reference_table);
  END LOOP;
END
$prepare$;

-- Private plan: one explicitly reviewed destination per source/client.
-- No authenticated user can read or write the plan, including a tenant admin.
CREATE TABLE public.client_reference_migration_plan (
  reference_table text NOT NULL CHECK (reference_table IN ('varieties','crops','seed_suppliers','crop_variety_catalog')),
  source_id uuid NOT NULL,
  domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  evidence text NOT NULL CHECK (length(trim(evidence)) > 0),
  PRIMARY KEY(reference_table,source_id,domain_id),
  UNIQUE(reference_table,destination_id)
);
ALTER TABLE public.client_reference_migration_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_reference_migration_plan FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_reference_migration_plan TO service_role;

COMMIT;
