import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const migration=fs.readFileSync('supabase/migrations/129_performance_reporting.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const tests=`DO $$ DECLARE d uuid; u uuid; result_data jsonb; rejected boolean:=false; BEGIN
SELECT dm.domain_id,p.id INTO d,u FROM domain_memberships dm JOIN profiles p ON p.id=dm.user_id WHERE dm.is_active AND p.is_active AND has_domain_permission(dm.domain_id,p.id,'couts','view') LIMIT 1;
IF u IS NULL THEN RAISE EXCEPTION 'No test actor'; END IF;
PERFORM set_config('request.jwt.claim.sub',u::text,true);
result_data:=get_farm_performance_data(d,NULL,NULL,NULL);
IF jsonb_typeof(result_data->'metadata')<>'array' OR result_data ? 'inventory' THEN RAISE EXCEPTION 'Wrong payload'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(result_data->'plantings') x JOIN campaign_plantings p ON p.id=(x->>'id')::uuid WHERE p.domain_id<>d) THEN RAISE EXCEPTION 'Domain leak'; END IF;
BEGIN PERFORM get_farm_performance_data(d,gen_random_uuid(),NULL,NULL); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Campagne étrangère%' THEN RAISE; END IF; rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'Foreign campaign accepted'; END IF;
rejected:=false;
BEGIN PERFORM get_farm_performance_data(d,NULL,'2026-09-02','2026-09-01'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Période invalide%' THEN RAISE; END IF; rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'Invalid period accepted'; END IF;
PERFORM set_config('request.jwt.claim.sub','',true);rejected:=false;
BEGIN PERFORM get_farm_performance_data(d,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Consultation des coûts non autorisée%' THEN RAISE; END IF; rejected:=true; END;
IF NOT rejected OR has_function_privilege('anon','get_farm_performance_data(uuid,uuid,date,date)','execute') THEN RAISE EXCEPTION 'Anonymous access'; END IF;
END $$; SELECT 'PASS: reporting payload, scope, dates and anonymous rejection; transaction rolled back' AS verification;`
const result=spawnSync('supabase',['db','query','--linked','BEGIN;\n'+migration+'\n'+tests+'\nROLLBACK;'],{encoding:'utf8',shell:false,maxBuffer:1024*1024})
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
if(result.error)throw result.error
process.exit(result.status??1)
