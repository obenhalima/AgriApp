import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),ready:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('./clientReferenceReadiness',()=>({assertClientReferenceIsolation:mocks.ready}))
import {applyInitializationModule2,getInitializationModule2State,rollbackInitializationModule2,canonicalizeModule1Links} from './initializationApply'
import {INIT_SECTIONS,type InitDraft} from './initialization'
const domain='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111'
const draft:InitDraft={schema:1,rows:{campaigns:[],plantings:[]},reviewed:['campaigns','plantings'],skipped:[]}
const report={operation_id:id,status:'applied',revision:3,created:2,reused:0,payload:draft}
beforeEach(()=>{vi.clearAllMocks();mocks.ready.mockResolvedValue(undefined);mocks.rpc.mockResolvedValue({data:report,error:null})})
it('uses the module 2 transaction with revision, payload and retry ID',async()=>{
 expect(await applyInitializationModule2(domain,2,draft,id)).toEqual(report)
 expect(mocks.rpc).toHaveBeenCalledWith('apply_initialization_module2',{p_domain:domain,p_revision:2,p_payload:draft,p_request:id})
})
it('uses a separate module 2 journal and rollback API',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{enabled:true,operation:report},error:null})
 expect(await getInitializationModule2State(domain)).toEqual(report)
 await rollbackInitializationModule2(domain,id)
 expect(mocks.rpc).toHaveBeenLastCalledWith('rollback_initialization_module2',{p_domain:domain,p_operation:id})
})
it('fails closed without confirmed client isolation',async()=>{
 mocks.ready.mockRejectedValue(new Error('Isolation indisponible'))
 await expect(applyInitializationModule2(domain,2,draft,id)).rejects.toThrow('Isolation')
 await expect(rollbackInitializationModule2(domain,id)).rejects.toThrow('Isolation')
 expect(mocks.rpc).not.toHaveBeenCalled()
})
it('requests only the new SQL when module 2 APIs are missing',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
 await expect(getInitializationModule2State(domain)).rejects.toThrow('SQL 158')
})
it('normalizes linked campaigns without discarding existing prepared rows',()=>{
 const result=canonicalizeModule1Links({...draft,rows:{campaigns:[{existing_id:id,code:'C1',budget_total:'1.00'}]}},{crops:[],varieties:[],campaigns:[{existing_id:id,code:'C1',budget_total:'1'}]})
 expect(result.rows.campaigns[0].budget_total).toBe('1')
 expect(INIT_SECTIONS.find(s=>s.key==='campaigns')?.fields.find(f=>f.key==='farm')?.required).toBe(true)
})
it('has tenant, date, cumulative surface and rollback guards (SQL source contracts)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/158_initialization_module2_apply_rollback.sql',import.meta.url),'utf8')
 expect(sql).toContain("module='plantations' AND status='applied'")
 expect(sql).toContain("module='exploitation' AND status='applied'")
 expect(sql).toContain('v_campaign.farm_id<>v_farm OR v_house.farm_id<>v_farm')
 expect(sql).toContain('v_last<v_first')
 expect(sql).toContain('sum(p.planted_area)')
 expect(sql).toContain('current_row IS DISTINCT FROM item.after_row')
 expect(sql).toContain('d.payload=op.after_payload AND d.revision=op.after_revision')
 expect(sql).toContain("WHEN 'campaign_plantings' THEN 1 WHEN 'campaigns' THEN 2")
 expect(sql).toContain("THEN ARRAY['campaigns','plantings']")
 expect(sql).toContain('v_code text;')
 expect(sql).not.toMatch(/\bcode text;/)
 expect(sql).not.toContain('INSERT INTO public.harvests')
 expect(sql).not.toContain('INSERT INTO public.cost_entries')
})
