import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
import {createDomain,initializeClientDefaultCrops,type DomainInput} from './domains'
const id='11111111-1111-4111-8111-111111111111'
const input:DomainInput={code:' qa ',name:'QA',legal_name:null,address:null,city:null,region:null,country:'Maroc',currency:'MAD',timezone:'Africa/Casablanca',locale:'fr-MA',logo_url:null,is_active:true}
beforeEach(()=>{vi.clearAllMocks()})
it('creates through the atomic server API, never a separate client/crop write',async()=>{
 mocks.rpc.mockResolvedValue({data:{...input,id},error:null})
 expect((await createDomain(input)).id).toBe(id)
 expect(mocks.rpc).toHaveBeenCalledWith('create_client_with_defaults',{p_input:{...input,code:'QA'}})
})
it('initializes only the selected existing client',async()=>{
 const report={domain_id:id,created:15,total:15,active:8}
 mocks.rpc.mockResolvedValue({data:report,error:null})
 expect(await initializeClientDefaultCrops(id)).toEqual(report)
 expect(mocks.rpc).toHaveBeenCalledWith('initialize_client_default_crops',{p_domain:id})
})
it('rejects invalid client identifiers and unconfirmed results',async()=>{
 await expect(initializeClientDefaultCrops('')).rejects.toThrow('Client requis')
 expect(mocks.rpc).not.toHaveBeenCalled()
 mocks.rpc.mockResolvedValue({data:{domain_id:'another-client',created:15},error:null})
 await expect(initializeClientDefaultCrops(id)).rejects.toThrow('non confirmée')
})
it('reports missing SQL without falling back to unsafe direct insert',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
 await expect(createDomain(input)).rejects.toThrow('SQL 156')
 await expect(initializeClientDefaultCrops(id)).rejects.toThrow('SQL 156')
})
it('keeps the template private, copies fresh IDs and never overwrites client references (source contract)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/156_default_client_crops.sql',import.meta.url),'utf8')
 expect(sql).toContain('gen_random_uuid(),p_domain,t.code')
 expect(sql).toContain('c.domain_id=p_domain AND upper(trim(c.code))=upper(trim(t.code))')
 expect(sql).toContain('ON CONFLICT DO NOTHING')
 expect(sql).not.toMatch(/UPDATE public.crops|INSERT INTO public.varieties/)
 expect(sql).toContain('AFTER INSERT ON public.domains')
 expect(sql).toContain('public.is_domain_admin(p_domain,auth.uid())')
 expect(sql).toContain('public.is_platform_admin(auth.uid())')
 expect(sql).toContain('REVOKE ALL ON public.default_crop_templates FROM PUBLIC,anon,authenticated')
 expect(sql).toContain('AND convalidated')
 expect(sql).toContain('AND relrowsecurity)=4')
 expect(sql.match(/^  \('/gm)).toHaveLength(15)
})
