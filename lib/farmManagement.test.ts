import {it,expect,vi,beforeEach} from 'vitest'
import {readFileSync} from 'node:fs'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),filters:[] as [string,string][],update:vi.fn(),single:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc,from:()=>{
 const query:any={update:(v:unknown)=>{mocks.update(v);return query},eq:(k:string,v:string)=>{mocks.filters.push([k,v]);return query},select:()=>query,single:mocks.single};return query
}}}))
import {farmEditPayload,updateClientFarm,deleteEmptyFarm,type FarmEdit} from './farmManagement'
const domain='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
const input:FarmEdit={code:' f1 ',name:' Ferme ',address:'',city:'',region:'',country:'',total_area:'1,5',notes:''}
beforeEach(()=>{vi.clearAllMocks();mocks.filters=[];mocks.single.mockResolvedValue({data:{id},error:null})})
it('normalizes business fields and rejects invalid areas',()=>{
 expect(farmEditPayload(input)).toMatchObject({code:'F1',name:'Ferme',country:'Maroc',total_area:1.5})
 expect(()=>farmEditPayload({...input,total_area:'-1'})).toThrow('superficie')
 expect(()=>farmEditPayload({...input,total_area:'abc'})).toThrow('superficie')
 expect(()=>farmEditPayload({...input,name:''})).toThrow('obligatoires')
 expect(farmEditPayload({...input,total_area:''}).total_area).toBeNull()
})
it('scopes updates to both farm and client and cannot patch ownership',async()=>{
 await updateClientFarm(domain,id,{...input,domain_id:'other'} as FarmEdit)
 expect(mocks.filters).toEqual([['domain_id',domain],['id',id]])
 expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('domain_id')
 expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('id')
})
it('deletes only via the protected server API',async()=>{
 mocks.rpc.mockResolvedValue({data:id,error:null})
 await deleteEmptyFarm(domain,id)
 expect(mocks.rpc).toHaveBeenCalledWith('delete_empty_farm',{p_domain:domain,p_farm:id})
})
it('does not fall back to unsafe deletion when the SQL is missing or dependencies block it',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}})
 await expect(deleteEmptyFarm(domain,id)).rejects.toThrow('administrateur')
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'23503',message:'Suppression impossible : cette ferme possède des données liées (serres).'}})
 await expect(deleteEmptyFarm(domain,id)).rejects.toThrow('serres')
 expect(mocks.update).not.toHaveBeenCalled()
})
it('explains unknown FK conflicts without exposing database internals',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'23503',message:'foreign key constraint secret_internal_table'}})
 await expect(deleteEmptyFarm(domain,id)).rejects.toThrow('possède des données liées')
 await expect(deleteEmptyFarm(domain,id)).rejects.not.toThrow('secret_internal_table')
 const page=readFileSync(new URL('../app/fermes/page.tsx',import.meta.url),'utf8')
 expect(page).toContain('role="alert"')
 expect(page).toContain('deleteError.farm')
 expect(page).toContain('setDeleteError(null)')
})
it('checks every incoming FK before any cascade, with server-side tenant permissions (source contract)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/161_guard_farm_deletion.sql',import.meta.url),'utf8')
 expect(sql).toContain("contype='f' AND confrelid='public.farms'::regclass")
 expect(sql).toContain('BEFORE DELETE ON public.farms')
 expect(sql).toContain("'fermes','delete'")
 expect(sql).toContain('id=p_farm AND domain_id=p_domain')
 expect(sql).not.toContain('CASCADE;')
 expect(sql).toContain("ERRCODE='23503'")
})
