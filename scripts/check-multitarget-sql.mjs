// Migration et recette annulées dans une seule transaction. Aucun secret dans les arguments.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const migration=fs.readFileSync('supabase/migrations/125_treatment_multiple_targets.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const tests=fs.readFileSync('supabase/verification/125_multitarget_tests.sql','utf8')
const query='BEGIN;\n'+(process.argv.includes('--after')?'':migration)+'\n'+tests+'\nROLLBACK;'
const result=spawnSync('supabase',['db','query','--linked',query],{encoding:'utf8',shell:false,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
