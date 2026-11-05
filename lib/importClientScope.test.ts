import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({calls:[] as any[],writes:[] as any[],missing:'',template:vi.fn(async()=>new Blob())}))
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
 const call:any={table,filters:[],selection:''};state.calls.push(call)
 const result=()=>({data:table==='campaign_plantings'?[{id:'planting',greenhouse_id:'gh',variety_id:'var'}]:[],error:null})
 const q:any={select:(s:string)=>{call.selection=s;return q},eq:(key:string,value:any)=>{call.filters.push([key,value]);return q},order:()=>q,limit:()=>q,
 maybeSingle:async()=>({data:state.missing===table?null:table==='campaign_plantings'?{id:'planting',greenhouse_id:'gh',variety_id:'var'}:{id:'owned'},error:null}),
 insert:(payload:any)=>{state.writes.push({table,payload});return q},update:(payload:any)=>{state.writes.push({table,payload});return q},
 single:async()=>({data:{id:table==='harvests'?'harvest':'lot'},error:null}),then:(resolve:any)=>Promise.resolve(result()).then(resolve)}
 return q
}}}))
vi.mock('./imports/templateBuilder',()=>({buildTemplate:state.template}))
vi.mock('./costEntries',()=>({createCostEntry:vi.fn(async(payload:any)=>{state.writes.push({table:'cost_entries',payload});return {id:'cost'}})}))
import {createHarvestsTarget} from './imports/targets/harvests'
import {createCostsTarget} from './imports/targets/costs'
const domain='11111111-1111-4111-8111-111111111111'
const row=()=>({domain_id:domain,campaign_planting_id:'planting',planting_greenhouse_id:'gh',planting_variety_id:'var',harvest_date:'2026-10-20',qty_recolte_kg:10,has_dispatch:true,market_id:'market',qty_dispatch_kg:10,has_price:false})
beforeEach(()=>{state.calls=[];state.writes=[];state.missing='';state.template.mockClear()})
it('filtre tous les résolveurs métier des récoltes par le client explicite',async()=>{
 for(const resolver of createHarvestsTarget(domain).resolvers)await resolver.load()
 for(const call of state.calls)expect(call.filters).toContainEqual([call.table==='greenhouses'?'farms.domain_id':'domain_id',domain])
})
it('génère le modèle seulement avec les référentiels du client',async()=>{
 await createHarvestsTarget(domain).buildTemplate()
 expect(state.template).toHaveBeenCalledOnce()
 for(const call of state.calls)expect(call.filters).toContainEqual([call.table==='greenhouses'?'farms.domain_id':'domain_id',domain])
})
it('refuse un lot validé pour un autre client avant toute écriture, même après un groupe valide',async()=>{
 await expect(createHarvestsTarget(domain).commit([[row()],[{...row(),domain_id:'other'}]])).rejects.toThrow('autre client')
 expect(state.writes).toHaveLength(0)
})
for(const table of ['campaign_plantings','markets'])it(`refuse une référence ${table} hors client`,async()=>{
 state.missing=table
 await expect(createHarvestsTarget(domain).commit([[row()]])).rejects.toThrow()
 expect(state.writes).toHaveLength(0)
})
it('importe une récolte et son envoi légitimes avec domain_id explicite',async()=>{
 const result=await createHarvestsTarget(domain).commit([[row()]])
 expect(result.inserted).toBe(1)
 expect(state.writes.map(w=>w.table)).toEqual(['harvests','harvest_lots'])
 for(const write of state.writes)expect(write.payload.domain_id).toBe(domain)
})
it('refuse les opérations sans client et les anciennes instances après changement de client',async()=>{
 await expect(createHarvestsTarget('').resolvers[0].load()).rejects.toThrow()
 await expect(createHarvestsTarget(domain,()=>false).commit([[row()]])).rejects.toThrow('changé')
 expect(state.writes).toHaveLength(0)
})
it('borne aussi les résolveurs et modèles des coûts sans filtrer le plan comptable générique',async()=>{
 const target=createCostsTarget(domain)
 for(const resolver of target.resolvers)await resolver.load()
 await target.buildTemplate()
 for(const call of state.calls.filter(c=>c.table!=='account_categories'))expect(call.filters).toContainEqual([call.table==='greenhouses'?'farms.domain_id':'domain_id',domain])
})
it('refuse un coût préparé pour un autre client sans écriture',async()=>{
 await expect(createCostsTarget(domain).commit([{domain_id:'other'}])).rejects.toThrow('autre client')
 expect(state.writes).toHaveLength(0)
})
it('conserve le propriétaire pour un coût légitime',async()=>{
 const result=await createCostsTarget(domain).commit([{domain_id:domain,campaign_id:'campaign',farm_id:'farm',account_category_id:'category',cost_category:'engrais',amount:25,entry_date:'2026-10-20'}])
 expect(result.inserted).toBe(1)
 expect(state.writes).toEqual([expect.objectContaining({table:'cost_entries',payload:expect.objectContaining({domain_id:domain,amount:25})})])
})
