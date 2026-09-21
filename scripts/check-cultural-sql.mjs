// All changes rolled back on the shared Supabase DB. No dispatcher invoked.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const migrations=process.argv.includes('--after')?'':process.argv.includes('--bundle')?fs.readFileSync('outputs/sql/135_interventions_culturales_complet.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''):['135b_cultural_interventions.sql','135c_cultural_mobile.sql'].map(f=>fs.readFileSync(`supabase/migrations/${f}`,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')).join('\n')
const sql=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='55s';\n${migrations}\n${fs.readFileSync('supabase/verification/135b_cultural_checks.sql','utf8')}\nROLLBACK;`
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'farmpilot-cultural-check-')),file=path.join(dir,'rollback.sql')
fs.writeFileSync(file,sql)
let code=1
try{const r=spawnSync('supabase',['db','query','--linked','--file',file],{encoding:'utf8',timeout:90000,maxBuffer:2**20});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;code=r.status??1}
finally{fs.unlinkSync(file);fs.rmdirSync(dir)}
process.exit(code)
