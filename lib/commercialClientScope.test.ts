import {beforeEach,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const mock=vi.hoisted(()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-public-key'
 return {filters:[] as [string,unknown][],insert:vi.fn(),update:vi.fn(),order:vi.fn(),single:vi.fn()}
})
vi.mock('@supabase/supabase-js',async importOriginal=>({...(await importOriginal<typeof import('@supabase/supabase-js')>()),createClient:()=>({from:()=>{
 const query:any={select:()=>query,eq:(key:string,value:unknown)=>{mock.filters.push([key,value]);return query},insert:(value:unknown)=>{mock.insert(value);return query},update:(value:unknown)=>{mock.update(value);return query},order:mock.order,single:mock.single};return query
}})}))
import {getClients,getMarches,createClient_,createMarche,deleteClient} from './supabase'
const domain='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{vi.clearAllMocks();mock.filters=[];mock.order.mockResolvedValue({data:[],error:null});mock.single.mockResolvedValue({data:{id:'created'},error:null})})
it('scopes commercial lists to the explicitly selected tenant',async()=>{
 await getClients(domain);expect(mock.filters).toContainEqual(['domain_id',domain])
 mock.filters=[];await getMarches(domain);expect(mock.filters).toContainEqual(['domain_id',domain])
})
it('sends owner and ecart flag together in client creation',async()=>{
 await createClient_({domain_id:domain,code:'CL',name:'Buyer',type:'grossiste',is_ecart_buyer:true})
 expect(mock.insert).toHaveBeenCalledOnce()
 expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({domain_id:domain,is_ecart_buyer:true,is_active:true}))
 expect(mock.update).not.toHaveBeenCalled()
})
it('requires explicit ownership for both creation helpers',async()=>{
 await expect(createClient_({code:'CL',name:'Buyer',type:'grossiste'} as any)).rejects.toThrow('client valide')
 await expect(createMarche({code:'MKT',name:'Market',type:'local',currency:'MAD'} as any)).rejects.toThrow('client valide')
 expect(mock.insert).not.toHaveBeenCalled()
 await createMarche({domain_id:domain,code:'MKT',name:'Market',type:'local',currency:'MAD'})
 expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({domain_id:domain}))
})
it('does not report a successful deactivation without a matching owned row',async()=>{
 mock.single.mockResolvedValue({data:null,error:{message:'No owned row'}})
 await expect(deleteClient('buyer',domain)).rejects.toEqual({message:'No owned row'})
 expect(mock.filters).toContainEqual(['domain_id',domain]);expect(mock.filters).toContainEqual(['id','buyer'])
})
it('keeps tenant context through market fallbacks and discards stale responses',()=>{
 for(const file of ['clients','marches']){
  const source=readFileSync(new URL(`../app/${file}/page.tsx`,import.meta.url),'utf8')
  expect(source).toContain('domain_id:activeDomain.domain_id')
  expect(source).toContain('if(scopeRef.current!==scope)return')
  expect(source).toContain('[activeDomain?.domain_id]')
  expect(source).not.toContain('setTimeout(')
 }
 const market=readFileSync(new URL('../app/marches/page.tsx',import.meta.url),'utf8')
 expect(market).toContain("delete fallbackPayload[col]")
 expect(market).toContain(".eq('domain_id',scope.domain!).eq('id', editId)")
 expect(market).toContain('clients.some(c=>c.id===form.client_id)')
})
