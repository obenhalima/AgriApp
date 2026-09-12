import fs from 'node:fs'
const body=['119_mobile_approvals.sql','120_mobile_notification_outbox.sql','121_mobile_session_security.sql','122_mobile_tenant_context.sql'].map(f=>fs.readFileSync(`supabase/migrations/${f}`,'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')).join('\n')
fs.mkdirSync('tmp/mobile',{recursive:true})
const tests=fs.readFileSync('supabase/verification/119_mobile_tests.sql','utf8')
fs.writeFileSync('tmp/mobile/dry-run.sql','BEGIN;\n'+body+'\n'+tests+'\nROLLBACK;')
fs.writeFileSync('tmp/mobile/deploy.sql','BEGIN;\n'+body+'\nCOMMIT;')
fs.writeFileSync('tmp/mobile/post-deploy-tests.sql','BEGIN;\n'+tests+'\nROLLBACK;')
fs.writeFileSync('tmp/mobile/scope-tests.sql','BEGIN;\n'+fs.readFileSync('supabase/migrations/122_mobile_tenant_context.sql','utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')+'\n'+tests+'\nROLLBACK;')
