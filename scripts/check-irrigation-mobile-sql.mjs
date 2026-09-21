// All DDL, notification fixtures and temporary grants are rolled back. No dispatcher is called.
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const migration=process.argv.includes('--after')?'':fs.readFileSync('supabase/migrations/134_irrigation_mobile_approvals.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const checks=fs.readFileSync('supabase/verification/134_irrigation_mobile_checks.sql','utf8')
const result=spawnSync('supabase',['db','query','--linked',`BEGIN; SET LOCAL statement_timeout='45s';\n${migration}\n${checks}\nROLLBACK;`],{encoding:'utf8',shell:false,timeout:90000,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
