// Requires the disposable database created by test-sent-harvest-guard.sql.
// Fixed loopback endpoint: deliberately never reads application credentials.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const sql = text => new Promise(resolve => {
 const p=spawn('psql',['-X','-h','127.0.0.1','-p','55432','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-f','-'],{windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}})
 p.stdin.end(text)
 let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d)
 p.on('error',e=>resolve({code:-1,out:e.message}));p.on('exit',code=>resolve({code,out}))
})
async function ok(text){const r=await sql(text);assert.equal(r.code,0,r.out);return r.out}
async function waitForSleep(name) {
 for(let i=0;i<50;i++) {
  if((await ok(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND wait_event='PgSleep'`)).trim()==='1')return
  await new Promise(r=>setTimeout(r,50))
 }
 throw Error('Concurrent test session did not reach synchronization point')
}
// Execute the real repository RPC, not a reimplementation of its arithmetic.
await ok('CREATE OR REPLACE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$')
await ok('ALTER TABLE harvest_lots ADD COLUMN IF NOT EXISTS quantity_kg numeric, ADD COLUMN IF NOT EXISTS weighed_at timestamptz, ADD COLUMN IF NOT EXISTS estimated_kg numeric')
const source=readFileSync('supabase/migrations/059_security_hardening.sql','utf8')
const start=source.indexOf('CREATE OR REPLACE FUNCTION admin_weigh_station_dispatch(')
await ok(source.slice(start,source.indexOf('$$;',start)+3))
await ok(`INSERT INTO harvest_lot_sources VALUES('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',42) ON CONFLICT DO NOTHING`)
await ok(`SELECT admin_weigh_station_dispatch('10000000-0000-0000-0000-000000000002',50)`)
assert.equal(Number((await ok(`SELECT actual_kg FROM harvests WHERE id='00000000-0000-0000-0000-000000000002'`)).trim()),50)
const sending=sql(`BEGIN; SET application_name='qa142_send'; INSERT INTO harvest_lot_sources VALUES('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002',10); SELECT pg_sleep(3); COMMIT;`)
await waitForSleep('qa142_send')
const edit=await sql(`UPDATE harvests SET notes='concurrent forbidden' WHERE id='00000000-0000-0000-0000-000000000005'`)
assert.equal((await sending).code,0);assert.notEqual(edit.code,0);assert.match(edit.out,/modification interdite/)
const deleting=sql(`BEGIN; SET application_name='qa142_delete'; DELETE FROM harvests WHERE id='00000000-0000-0000-0000-000000000006'; SELECT pg_sleep(3); COMMIT;`)
await waitForSleep('qa142_delete')
const send=await sql(`INSERT INTO harvest_lot_sources VALUES('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000002',10)`)
assert.equal((await deleting).code,0);assert.notEqual(send.code,0);assert.match(send.out,/introuvable/)
console.log('PASS real Station weighing RPC, send-before-edit and delete-before-send concurrency')
