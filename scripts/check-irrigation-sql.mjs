// Shared Supabase database: DDL, temporary fixtures and grants are all rolled back.
// Never run this without the ROLLBACK wrapper.
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const migration=process.argv.includes('--after')?'':fs.readFileSync('supabase/migrations/133_irrigation_programs.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const checks=fs.readFileSync('supabase/verification/133_irrigation_checks.sql','utf8')
const result=spawnSync('supabase',['db','query','--linked',`BEGIN; SET LOCAL statement_timeout='45s';\n${migration}\n${checks}\nROLLBACK;`],{encoding:'utf8',shell:false,timeout:90000,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
