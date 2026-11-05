// Source generation only: this script never connects to or changes a database.
// Print the mechanically combined SQL; local edits/output use apply_patch.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const names=['150_freeze_shared_business_references.sql','151_client_reference_ownership_preparation.sql',
 '152_approved_client_reference_plan.sql','153_complete_approved_reference_plan.sql','154_client_reference_cutover.sql']
const blocks=names.map(name=>{
 const source=readFileSync(resolve(root,'supabase/migrations',name),'utf8').replace(/\r\n/g,'\n')
 if((source.match(/^BEGIN;$/gm)||[]).length!==1 || (source.match(/^COMMIT;$/gm)||[]).length!==1)throw new Error(`Unexpected transaction wrappers: ${name}`)
 return `-- Source: ${name}\n${source.replace(/^BEGIN;\n/m,'').replace(/^COMMIT;\s*$/m,'').trim()}\n`
})
const checks=readFileSync(resolve(root,'scripts/check-client-reference-isolation.sql'),'utf8').replace(/\r\n/g,'\n')
const ddl=blocks.join('\n')
for(const tag of ['$itrix_install_v3$','$itrix_ddl_v3$','$itrix_checks_v3$']) {
 if(ddl.includes(tag)||checks.includes(tag))throw new Error('Dollar-quote delimiter collision')
}
const sql=`-- ITRIX: CONSOLIDATED INSTALLATION V3. RUN THIS FILE ONLY.
-- 45 crops (24 active / 21 inactive), 69 suggestions across three clients.
-- 12 active varieties: four independent varieties per client with domain_id.
-- Applies the isolation package. FULL DATABASE BACKUP REQUIRED BEFORE RUNNING.
-- Run the WHOLE file in the Supabase SQL Editor and return isolation_check.
-- Supersedes separate execution of 150..154; do not run them afterwards.
-- All installation statements execute inside ONE server-side DO statement.
-- Any installation error aborts that statement with no partial installation.
-- PostgreSQL execution is not verified by local source/unit tests.
-- Not a rollback button for business imports. That requires a separate module
-- application journal and server API. Never revert tenant isolation from the UI.
-- Commercial preferences remain guarded; empty legacy settlements quarantined.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $itrix_install_v3$
DECLARE report jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('itrix_client_reference_install_v3',0));
 EXECUTE $itrix_ddl_v3$
${ddl}
$itrix_ddl_v3$;
 EXECUTE $itrix_checks_v3$
${checks.trim()}
$itrix_checks_v3$ INTO report;
 IF (report->>'unowned_references')::integer<>0
  OR (report->>'foreign_relational_edges')::integer<>0
  OR (report->>'foreign_json_edges')::integer<>0
  OR (report->>'business_rows_changed_outside_reference_ids')::integer<>0
  OR (report->>'settlements_changed')::integer<>0 THEN
  RAISE EXCEPTION 'Contrôle final refusé : %',report;
 END IF;
 RAISE NOTICE 'ITRIX installation contrôlée : %',report;
END;
$itrix_install_v3$;
COMMIT;

-- Display the result after the successful installation.
${checks.trim()}
`
if((sql.match(/^BEGIN;$/gm)||[]).length!==1 || (sql.match(/^COMMIT;$/gm)||[]).length!==1 || /^ROLLBACK;$/m.test(sql))throw new Error('Bundle must retain one installation transaction')
process.stdout.write(sql)
