// All DDL and confirmations are rolled back; no persistent business changes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const migration=fs.readFileSync(process.argv.includes('--existing')?'supabase/migrations/136b_historical_surface_guard.sql':'supabase/migrations/136_confirm_historical_consumption_costs.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const checks=process.argv.includes('--ddl-only')?'':fs.readFileSync('supabase/verification/136_historical_costs_checks.sql','utf8')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'farmpilot-cost-check-')),file=path.join(dir,'check.sql')
try{
 fs.writeFileSync(file,`BEGIN; SET LOCAL statement_timeout='40s'; SET LOCAL lock_timeout='3s';\n${migration}\n${checks}\nROLLBACK;`)
 const r=spawnSync('supabase',['db','query','--linked','--file',file],{encoding:'utf8',timeout:90000,maxBuffer:1024*1024})
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;process.exitCode=r.status??1
}finally{fs.unlinkSync(file);fs.rmdirSync(dir)}
