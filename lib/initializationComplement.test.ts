import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),ready:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('./clientReferenceReadiness',()=>({assertClientReferenceIsolation:mocks.ready}))
import {startInitializationComplement} from './initializationApply'
const domain='11111111-1111-4111-8111-111111111111'
const payload={schema:1,rows:{farms:[],greenhouses:[],varieties:[]},reviewed:[],skipped:[]}
beforeEach(()=>{vi.clearAllMocks();mocks.ready.mockResolvedValue(undefined)})
it('opens a new preparation through an authorized revision-checked RPC',async()=>{
 mocks.rpc.mockResolvedValue({data:{payload,revision:8},error:null})
 expect(await startInitializationComplement(domain,'exploitation',7)).toEqual({payload,revision:8})
 expect(mocks.rpc).toHaveBeenCalledWith('start_initialization_complement',{p_domain:domain,p_module:'exploitation',p_revision:7})
})
it('fails closed when isolation or the new API is unavailable',async()=>{
 mocks.ready.mockRejectedValueOnce(new Error('Isolation indisponible'))
 await expect(startInitializationComplement(domain,'plantations',7)).rejects.toThrow('Isolation')
 expect(mocks.rpc).not.toHaveBeenCalled()
 mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
 await expect(startInitializationComplement(domain,'plantations',7)).rejects.toThrow('SQL 159')
})
it('rejects stale or malformed preparation reports',async()=>{
 mocks.rpc.mockResolvedValue({data:{payload,revision:7},error:null})
 await expect(startInitializationComplement(domain,'exploitation',7)).rejects.toThrow('non confirmée')
})
it('preserves past integrations and updates only the current preparation (source contract)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/159_initialization_complements.sql',import.meta.url),'utf8')
 expect(sql).toContain('SET is_current=false WHERE id=v_op.id')
 expect(sql).not.toMatch(/DELETE FROM|UPDATE public\.(farms|greenhouses|varieties|campaigns|campaign_plantings)/)
 expect(sql).toContain('revision=p_revision FOR UPDATE')
 expect(sql).toContain('public.is_domain_admin(p_domain,auth.uid())')
 expect(sql).toContain('public.save_initialization_draft(p_domain,p_revision,v_payload)')
 expect(sql).toContain('IF v_after=v_before')
 const page=readFileSync(new URL('../app/admin/initialisation/page.tsx',import.meta.url),'utf8')
 expect(page).toContain("_ui('Compléter ce module')")
 expect(page).toContain('setOperation(null);setDirty(false);requestId.current=null')
})
