// Isolated transaction on the linked Supabase database; no fixtures persist.
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const migration=process.argv.includes('--after')?'':fs.readFileSync('supabase/migrations/132_received_substitution_prescriptions.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const tests=fs.readFileSync('supabase/verification/132_prescription_revision_checks.sql','utf8')
const r=spawnSync('supabase',['db','query','--linked','BEGIN;\n'+migration+'\n'+tests+'\nROLLBACK;'],{encoding:'utf8',shell:false,maxBuffer:1024*1024})
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;process.exit(r.status??1)
