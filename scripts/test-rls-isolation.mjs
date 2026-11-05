// Runs ONLY against a fresh disposable cluster explicitly passed by its local port.
// Never reads .env, Supabase URLs, passwords or application data.
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const port=process.argv[2]
if(!/^55\d{3}$/.test(port||''))throw Error('Pass a disposable test PostgreSQL port (55xxx).')
const database=process.argv[3]||'postgres'
if(database!=='postgres'&&!/^itrix_rls_test_[a-z0-9]+$/.test(database))throw Error('Disposable database name required')
const fixture=readFileSync(new URL('./fixtures/rls-isolation.sql',import.meta.url),'utf8')
const migration=readFileSync(new URL('./ITRIX_RLS_03_ISOLATION_CLIENTS.sql',import.meta.url),'utf8')
const approved=migration.match(/INSERT INTO itrix162_approved VALUES[\s\S]*?;/)?.[0]
if(!approved)throw Error('Missing approved IDs')
const seed=`CREATE TEMP TABLE seed_ids(table_name text,id uuid);${approved.replace('itrix162_approved','seed_ids')}
 INSERT INTO clients(id,code) SELECT id,id::text FROM seed_ids WHERE table_name='clients';
 INSERT INTO markets(id,code,client_id) SELECT id,id::text,'5bc18f32-e34d-495d-93da-9528f585d8c0' FROM seed_ids WHERE table_name='markets';
 INSERT INTO campaigns VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79');
 INSERT INTO sales_orders(id,client_id,market_id,campaign_id,status) SELECT id,'5bc18f32-e34d-495d-93da-9528f585d8c0','d008772d-2455-450e-b187-470921bef768','cccccccc-cccc-4ccc-8ccc-cccccccccccc','draft' FROM seed_ids WHERE table_name='sales_orders';
 INSERT INTO invoices SELECT id,'5bc18f32-e34d-495d-93da-9528f585d8c0',NULL FROM seed_ids WHERE table_name='invoices';
 INSERT INTO payments_received SELECT id,'206fc9d4-3e98-448e-ae3a-ecfb0bee5600' FROM seed_ids WHERE table_name='payments_received';
 INSERT INTO varieties VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222');
 INSERT INTO harvest_lots VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','d008772d-2455-450e-b187-470921bef768','206fc9d4-3e98-448e-ae3a-ecfb0bee5600');`
const checks=`
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM clients WHERE updated_at<>'2020-01-01'::timestamptz) THEN RAISE EXCEPTION 'Business timestamp changed during migration'; END IF; END $$;
 SET ROLE authenticated;SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 DO $$ BEGIN IF (SELECT count(*) FROM clients)<>3 OR (SELECT count(*) FROM v_client_balances)<>3 THEN RAISE EXCEPTION 'Tenant A lost read access'; END IF; END $$;
 SELECT admin_generate_dispatch_invoice('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 DO $$ BEGIN
  BEGIN UPDATE clients SET domain_id='22222222-2222-4222-8222-222222222222';RAISE EXCEPTION 'Owner change accepted';EXCEPTION WHEN check_violation THEN NULL;END;
  BEGIN INSERT INTO clients(id,code) VALUES('11111111-1111-4111-8111-111111111111','missing');RAISE EXCEPTION 'Missing tenant accepted';EXCEPTION WHEN check_violation THEN NULL;END;
  BEGIN UPDATE clients SET preferred_variety_ids=ARRAY['dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid];RAISE EXCEPTION 'Cross-tenant array accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 END $$;
 SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 DO $$ BEGIN
  IF (SELECT count(*) FROM clients)<>0 OR (SELECT count(*) FROM v_client_balances)<>0 THEN RAISE EXCEPTION 'Cross-tenant read'; END IF;
  BEGIN PERFORM admin_generate_dispatch_invoice('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');RAISE EXCEPTION 'Cached invoice ID leaked';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END $$;
 INSERT INTO clients(id,code,domain_id) VALUES('11111111-1111-4111-8111-111111111111','B','22222222-2222-4222-8222-222222222222');
 INSERT INTO markets(id,code,client_id,is_ecart_market) VALUES('99999999-9999-4999-8999-999999999999','B','11111111-1111-4111-8111-111111111111',true);
 DO $$ BEGIN
  BEGIN INSERT INTO invoices VALUES('77777777-7777-4777-8777-777777777777','5bc18f32-e34d-495d-93da-9528f585d8c0',NULL,'22222222-2222-4222-8222-222222222222');RAISE EXCEPTION 'Cross-tenant client accepted';EXCEPTION WHEN check_violation THEN NULL;END;
  BEGIN INSERT INTO sales_orders(id,client_id,campaign_id,domain_id) VALUES('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222');RAISE EXCEPTION 'Cross-tenant campaign accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 END $$;
 RESET ROLE;SET request.jwt.claim.sub='';
 UPDATE markets SET is_ecart_market=true WHERE id='d008772d-2455-450e-b187-470921bef768';
 DO $$ BEGIN IF NOT (SELECT is_ecart_market FROM markets WHERE id='99999999-9999-4999-8999-999999999999') THEN RAISE EXCEPTION 'Ecart flag changed across tenants';END IF;END $$;
 SET ROLE anon;
 DO $$ BEGIN BEGIN PERFORM * FROM clients;RAISE EXCEPTION 'Anonymous read accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
 RESET ROLE;
 SELECT 'PASS: tenant reads, view, RPC cached-return denial, explicit owner, same-tenant derivation, relational and array guards, owner immutability, timestamps, ecart scoping, anonymous denial' AS result;
`
const result=spawnSync('psql',['-X','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:fixture+seed+'\n'+migration+'\n'+checks,encoding:'utf8',maxBuffer:8*1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exitCode=result.status??1
