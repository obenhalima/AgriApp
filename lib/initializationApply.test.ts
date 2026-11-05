import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import type {InitRow} from './initialization'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),ready:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('./clientReferenceReadiness',()=>({assertClientReferenceIsolation:mocks.ready}))
import {applyInitializationModule1,rollbackInitializationModule1,getInitializationModule1State,parseInitializationOperation,canonicalizeModule1Links} from './initializationApply'
const domain='22222222-2222-4222-8222-222222222222'
const id='11111111-1111-4111-8111-111111111111'
const draft={schema:1 as const,rows:{farms:[],greenhouses:[],varieties:[]},reviewed:[],skipped:[]}
const report={operation_id:id,status:'applied',revision:2,created:3,reused:1,payload:draft}
beforeEach(()=>{vi.clearAllMocks();mocks.ready.mockResolvedValue(undefined);mocks.rpc.mockResolvedValue({data:report,error:null})})
it('uses transactional server apply, with tenant, revision and retry identifier',async()=>{
 expect(await applyInitializationModule1(domain,1,draft,id)).toEqual(report)
 expect(mocks.ready).toHaveBeenCalledWith(domain,expect.anything())
 expect(mocks.rpc).toHaveBeenCalledWith('apply_initialization_module1',{p_domain:domain,p_revision:1,p_payload:draft,p_request:id})
})
it('blocks all operations when tenant isolation is not confirmed',async()=>{
 mocks.ready.mockRejectedValue(new Error('Isolation indisponible'))
 await expect(applyInitializationModule1(domain,1,draft,id)).rejects.toThrow('Isolation')
 await expect(rollbackInitializationModule1(domain,id)).rejects.toThrow('Isolation')
 expect(mocks.rpc).not.toHaveBeenCalled()
})
it('rolls back only through the server operation identifier',async()=>{
 await rollbackInitializationModule1(domain,id)
 expect(mocks.rpc).toHaveBeenCalledWith('rollback_initialization_module1',{p_domain:domain,p_operation:id})
})
it('requires explicit server readiness and reports the missing migration',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{enabled:false},error:null})
 await expect(getInitializationModule1State(domain)).rejects.toThrow('indisponible')
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}})
 await expect(getInitializationModule1State(domain)).rejects.toThrow('SQL 155')
})
it('recovers the existing operation and rejects malformed server reports',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{enabled:true,operation:report},error:null})
 expect(await getInitializationModule1State(domain)).toEqual(report)
 for(const invalid of [{...report,created:-1},{...report,operation_id:'------------------------------------'},{...report,payload:null}])expect(()=>parseInitializationOperation(invalid)).toThrow()
})
it('normalizes linked display values without changing prepared new rows or other modules',()=>{
 const rows:Record<string,InitRow[]>={...draft.rows,farms:[{existing_id:id,code:'F1',total_area:'1.00'},{code:'F2'}],plantings:[{code:'P1'}]}
 const result=canonicalizeModule1Links({...draft,rows},{crops:[],varieties:[],farms:[{existing_id:id,code:'F1',total_area:'1'}]})
 expect(result.rows.farms[0].total_area).toBe('1')
 expect(result.rows.farms[1]).toBe(rows.farms[1])
 expect(result.rows.plantings).toBe(rows.plantings)
 expect(rows.farms[0].total_area).toBe('1.00')
})
it('keeps rollback guarded and tenant authorization server-side (source contract)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/155_initialization_module1_apply_rollback.sql',import.meta.url),'utf8')
 expect(sql.trim()).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;$/)
 expect(sql).toContain('public.is_domain_admin(p_domain,auth.uid())')
 expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(p_domain::text,141))')
 expect(sql).toContain('d.payload=op.after_payload AND d.revision=op.after_revision')
 expect(sql).toContain('current_row IS DISTINCT FROM item.after_row')
 expect(sql).toContain("operation_id=op.id AND created")
 expect(sql).toContain("WHERE contype='f'")
 expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
 expect(sql).toContain('FROM PUBLIC,anon,authenticated')
})
it('avoids record-column collisions in the installed apply function',()=>{
 const base=readFileSync(new URL('../supabase/migrations/155_initialization_module1_apply_rollback.sql',import.meta.url),'utf8')
 const fix=readFileSync(new URL('../supabase/migrations/157_fix_initialization_module1_code.sql',import.meta.url),'utf8')
 const fn=base.match(/CREATE FUNCTION public\.apply_initialization_module1\([\s\S]*?\n\$\$;/)?.[0]
 expect(fn).toBeTruthy()
 expect(fix).toContain(fn!.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'))
 expect(fix).toContain('v_code text;')
 expect(fix).not.toMatch(/(?<!v_)\bcode text;|SELECT entity,parent,code|SELECT entity,p_domain,crop,code/)
 expect(fix).not.toContain('CREATE TABLE')
})
