// All migration and fixture writes are enclosed in ROLLBACK, never committed.
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const after=process.argv.includes('--after')
const migration=after?'':fs.readFileSync('supabase/migrations/130_purchase_phyto_substitutions.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const tests=fs.readFileSync('supabase/verification/130_purchase_substitutions_checks.sql','utf8')
const result=spawnSync('supabase',['db','query','--linked','BEGIN;\n'+migration+'\n'+tests+'\nROLLBACK;'],{encoding:'utf8',shell:false,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
