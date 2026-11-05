// Only synthetic marker writes in an explicitly named disposable PostgreSQL database.
// Does not load .env or call Supabase. No real DELETE/TRUNCATE routine is executed.
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const [port,database]=process.argv.slice(2)
if(!/^55\d{3}$/.test(port||'')||!/^itrix_rls_test_[a-z0-9]+$/.test(database||''))throw Error('Disposable local PostgreSQL port and test database required')
const migration=readFileSync(new URL('./ITRIX_RLS_04_SECURISER_RESETS.sql',import.meta.url),'utf8')
const fixture=`
 DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
 END $$;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
 CREATE FUNCTION is_admin_caller() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT NULL::boolean $$;
 CREATE TABLE marker(note text);
 CREATE FUNCTION admin_nuclear_wipe() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NOT is_admin_caller() THEN RAISE EXCEPTION 'denied';END IF; INSERT INTO marker VALUES('synthetic');RETURN '{}'::jsonb; END $$;
 CREATE FUNCTION admin_operational_reset() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NOT is_admin_caller() THEN RAISE EXCEPTION 'denied';END IF; INSERT INTO marker VALUES('synthetic');RETURN '{}'::jsonb; END $$;
 CREATE FUNCTION admin_delete_campaign(p_campaign_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NOT is_admin_caller() THEN RAISE EXCEPTION 'denied';END IF; INSERT INTO marker VALUES('synthetic');RETURN '{}'::jsonb; END $$;
 CREATE FUNCTION _admin_truncate_table(p_table text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO marker VALUES('synthetic');RETURN '{}'::jsonb;END $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
 -- Reproduce the NULL-prone guard with a harmless synthetic marker, rolled back.
 BEGIN;SET LOCAL ROLE anon;SELECT admin_nuclear_wipe();RESET ROLE;
 DO $$ BEGIN IF (SELECT count(*) FROM marker)<>1 THEN RAISE EXCEPTION 'Reproducer failed'; END IF;END $$;ROLLBACK;
`
const checks=`
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM marker) THEN RAISE EXCEPTION 'Migration executed a body';END IF;END $$;
 SET ROLE anon;
 DO $$ BEGIN BEGIN PERFORM public.admin_nuclear_wipe();RAISE EXCEPTION 'Anon allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
 RESET ROLE;SET ROLE authenticated;
 SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 DO $$ BEGIN BEGIN PERFORM public.admin_delete_campaign('cccccccc-cccc-4ccc-8ccc-cccccccccccc');RAISE EXCEPTION 'Authenticated allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
 RESET ROLE;
 -- Owner-context indirect calls must also reject missing/ordinary identities.
 SET request.jwt.claim.sub='';
 DO $$ BEGIN BEGIN PERFORM public.admin_operational_reset();RAISE EXCEPTION 'NULL uid bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
 SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 DO $$ BEGIN BEGIN PERFORM public._admin_truncate_table('marker');RAISE EXCEPTION 'Ordinary helper bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM marker) THEN RAISE EXCEPTION 'Denied path caused side effects';END IF;END $$;
 -- Explicit platform maintenance retains its existing implementation (synthetic only).
 BEGIN;SET LOCAL request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';SELECT admin_nuclear_wipe();
 DO $$ BEGIN IF (SELECT count(*) FROM marker)<>1 THEN RAISE EXCEPTION 'Owner platform maintenance changed';END IF;END $$;ROLLBACK;
 SELECT 'PASS: reproduced NULL guard flaw safely; no migration side effects; API ACLs removed; NULL/ordinary indirect calls denied; explicit platform maintenance control preserved' AS result;
`
const result=spawnSync('psql',['-X','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:fixture+'\n'+migration+'\n'+migration+'\n'+checks,encoding:'utf8',maxBuffer:4*1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;process.exitCode=result.status??1
