// Diagnostic: validate the actual parsed drawing and a full batch of creations,
// using synthetic surfaces, in a transaction that is ALWAYS rolled back.
import fs from 'node:fs'
import ts from 'typescript'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'
const file=process.argv[2]
if(!file)throw Error('Local draw.io file required')
const browser=await chromium.launch({channel:'msedge',headless:true})
let plan
try{
 const page=await browser.newPage()
 const code=ts.transpileModule(fs.readFileSync('lib/drawioFarmPlan.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'')+'\nwindow.readDrawioPlan=readDrawioPlan;'
 await page.addScriptTag({content:code})
 plan=await page.evaluate(text=>window.readDrawioPlan(text),fs.readFileSync(file,'utf8'))
}finally{await browser.close()}
const rows=plan.greenhouses.map(g=>({...g,new_greenhouse:{code:g.code,name:g.code,type:'tunnel',status:'active',total_area:1000,exploitable_area:1000}}))
const literal=data=>"'"+JSON.stringify(data).replaceAll("'","''")+"'::jsonb"
const sql=`BEGIN;
DO $$
DECLARE actor uuid; d uuid; f uuid; result_data jsonb;
BEGIN
SELECT p.id,dm.domain_id INTO actor,d FROM public.profiles p JOIN public.domain_memberships dm ON dm.user_id=p.id
WHERE p.is_active AND dm.is_active AND public.has_domain_permission(dm.domain_id,p.id,'fermes','edit') AND public.has_domain_permission(dm.domain_id,p.id,'serres','create') LIMIT 1;
IF actor IS NULL THEN RAISE EXCEPTION 'No test actor'; END IF;
PERFORM set_config('request.jwt.claim.sub',actor::text,true);
INSERT INTO public.farms(code,name,domain_id) VALUES('QA128-'||left(gen_random_uuid()::text,8),'QA full import rolled back',d) RETURNING id INTO f;
result_data:=public.import_farm_drawio_plan(f,0,${literal(rows)},${literal(plan.elements)},gen_random_uuid());
IF (result_data->>'created_count')::integer<>${rows.length} THEN RAISE EXCEPTION 'Missing greenhouse'; END IF;
END $$;
SELECT 'PASS: full drawing + ${rows.length} creations, rolled back' AS verification;
ROLLBACK;`
fs.mkdirSync('tmp/plan114',{recursive:true})
const path='tmp/plan114/qa-128-full.sql'
fs.writeFileSync(path,sql)
const result=spawnSync('supabase',['db','query','--linked','--file',path],{encoding:'utf8',shell:false,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
