-- Execute this whole file in the Supabase SQL Editor as the database administrator.
-- Scope: anonymous DIRECT TABLE access to these exact 12 tables only.
-- Does NOT enable RLS, change rows, or fix authenticated cross-tenant access.
-- Views, SECURITY DEFINER functions and Storage need separate review.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $protection$
DECLARE
  table_name text;
  table_oid oid;
  columns_sql text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'alerts','clients','cultural_operations','delivery_notes','documents',
    'farm_zones','invoices','markets','payments_received',
    'production_forecasts','sales_orders','teams'
  ] LOOP
    SELECT c.oid INTO table_oid
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=table_name AND c.relkind IN ('r','p');
    IF table_oid IS NULL THEN
      RAISE EXCEPTION 'Table public.% absente : aucune modification conservée.',table_name;
    END IF;

    -- Preserve existing authenticated CRUD even if it was inherited from PUBLIC.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon',table_name);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',table_name);

    -- Table revokes alone do not remove column-level grants.
    SELECT string_agg(quote_ident(a.attname),', ' ORDER BY a.attnum)
      INTO columns_sql FROM pg_attribute a
      WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped;
    IF columns_sql IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon',columns_sql,table_name);
      EXECUTE format('REVOKE REFERENCES (%s) ON TABLE public.%I FROM authenticated',columns_sql,table_name);
    END IF;

    -- Effective privilege checks include PUBLIC and role inheritance.
    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p(privilege)
      WHERE has_table_privilege('anon',table_oid,p.privilege)
    ) OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS p(privilege)
      WHERE has_any_column_privilege('anon',table_oid,p.privilege)
    ) THEN
      RAISE EXCEPTION 'Droits anonymes hérités encore présents sur public.% : transaction annulée, transmettre cette erreur.',table_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER']) AS p(privilege)
      WHERE has_table_privilege('authenticated',table_oid,p.privilege)
    ) OR has_any_column_privilege('authenticated',table_oid,'REFERENCES') THEN
      RAISE EXCEPTION 'Droits techniques hérités encore présents sur public.% : transaction annulée, transmettre cette erreur.',table_name;
    END IF;
  END LOOP;
END;
$protection$;

COMMIT;

-- Expected: exactly 12 rows, all four access flags false.
-- rls_active remains false until the separate tenant-isolation migration.
SELECT c.relname AS table_name,c.relrowsecurity AS rls_active,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  has_any_column_privilege('anon',c.oid,'SELECT') AS anon_column_select,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') AS anon_write,
  has_table_privilege('authenticated',c.oid,'TRUNCATE') AS authenticated_truncate
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN (
  'alerts','clients','cultural_operations','delivery_notes','documents','farm_zones',
  'invoices','markets','payments_received','production_forecasts','sales_orders','teams'
)
ORDER BY c.relname;
