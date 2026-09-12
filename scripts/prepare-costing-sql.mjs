import fs from 'node:fs'
const files = ['115_inventory_costing.sql','116_costed_receipts_reporting.sql','117_treatment_cost_area_snapshot.sql','118_costing_completion.sql']
const body = files.map(f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')).join('\n')
fs.mkdirSync('tmp/costing', {recursive:true})
fs.writeFileSync('tmp/costing/dry-run.sql', 'BEGIN;\n'+body+'\n'+fs.readFileSync('supabase/verification/115_costing_transaction_tests.sql','utf8')+'\nROLLBACK;\n')
fs.writeFileSync('tmp/costing/deploy.sql', 'BEGIN;\n'+body+'\nCOMMIT;\n')
