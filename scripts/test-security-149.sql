-- Run only against a disposable, empty PostgreSQL database, never production.
\set ON_ERROR_STOP on
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT $1 = '00000000-0000-0000-0000-000000000010'::uuid
 AND ($4 = 'view' OR current_setting('test.edit',true) = 'yes')
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['phyto_compliance_settings','phyto_market_requirements','phyto_mrl_limits'] LOOP
  EXECUTE format('CREATE TABLE %I (id integer PRIMARY KEY, domain_id uuid NOT NULL)',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),''agronomie'',''view'')) WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),''agronomie'',''edit''))',t || '_domain',t);
  EXECUTE format('INSERT INTO %I VALUES (1,''00000000-0000-0000-0000-000000000010''),(2,''00000000-0000-0000-0000-000000000020'')',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
-- Reproduce the old boundary, then restore the fixtures before applying the fix.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.edit='no';
DO $$ DECLARE t text; affected integer; BEGIN
 FOREACH t IN ARRAY ARRAY['phyto_compliance_settings','phyto_market_requirements','phyto_mrl_limits'] LOOP
  EXECUTE format('DELETE FROM %I',t);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Original vulnerable path not reproduced: %',t; END IF;
 END LOOP;
END $$;
ROLLBACK;
\ir ../supabase/migrations/149_phyto_compliance_write_permissions.sql
SET ROLE authenticated;
SET test.edit='no';
DO $$ DECLARE t text; affected integer; BEGIN
 FOREACH t IN ARRAY ARRAY['phyto_compliance_settings','phyto_market_requirements','phyto_mrl_limits'] LOOP
  EXECUTE format('SELECT count(*) FROM %I',t) INTO affected;
  IF affected <> 1 THEN RAISE EXCEPTION 'Tenant read isolation failed: %',t; END IF;
  EXECUTE format('DELETE FROM %I',t);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer deleted rows: %',t; END IF;
  BEGIN
   EXECUTE format('UPDATE %I SET id=5 WHERE id=1',t);
   RAISE EXCEPTION 'Viewer updated row: %',t;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
   EXECUTE format('INSERT INTO %I VALUES (3,''00000000-0000-0000-0000-000000000010'')',t);
   RAISE EXCEPTION 'Viewer inserted row: %',t;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
END $$;
SET test.edit='yes';
DO $$ DECLARE t text; affected integer; BEGIN
 FOREACH t IN ARRAY ARRAY['phyto_compliance_settings','phyto_market_requirements','phyto_mrl_limits'] LOOP
  EXECUTE format('INSERT INTO %I VALUES (3,''00000000-0000-0000-0000-000000000010'')',t);
  EXECUTE format('UPDATE %I SET id=4 WHERE id=3',t);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Editor update failed: %',t; END IF;
  EXECUTE format('DELETE FROM %I',t);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Editor delete failed: %',t; END IF;
 END LOOP;
END $$;
RESET ROLE;
DO $$ DECLARE t text; remaining integer; BEGIN
 FOREACH t IN ARRAY ARRAY['phyto_compliance_settings','phyto_market_requirements','phyto_mrl_limits'] LOOP
  EXECUTE format('SELECT count(*) FROM %I',t) INTO remaining;
  IF remaining <> 1 THEN RAISE EXCEPTION 'Foreign tenant changed: %',t; END IF;
 END LOOP;
END $$;
SELECT 'PASS security 149 read/write isolation' AS result;
