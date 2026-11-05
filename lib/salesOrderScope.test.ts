import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({calls:[] as any[],missing:'',onRead:()=>{}}))
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 const filters:any[]=[]
 const q:any={select:()=>q,eq:(key:string,value:any)=>{filters.push([key,value]);return q},
 maybeSingle:async()=>{state.calls.push({table,filters});state.onRead();return {data:state.missing===table?null:{id:'owned'},error:null}},
 insert:(payload:any)=>{state.calls.push({table,payload});return q},single:async()=>({data:{id:'order'},error:null})}
 return q
}}}))
import {createClientSalesOrder} from './salesOrderScope'
const domain='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{state.calls=[];state.missing='';state.onRead=()=>{}})
for(const missing of ['clients','markets','campaigns'])it(`refuse ${missing} hors client sans insertion`,async()=>{
 state.missing=missing
 await expect(createClientSalesOrder(domain,{client_id:'buyer',market_id:'market',campaign_id:'campaign'},()=>true)).rejects.toThrow('client sélectionné')
 expect(state.calls.some(c=>c.payload)).toBe(false)
 for(const call of state.calls)expect(call.filters).toContainEqual(['domain_id',domain])
})
it('crée une commande légitime avec le propriétaire imposé',async()=>{
 expect(await createClientSalesOrder(domain,{client_id:'buyer',domain_id:'forged'},()=>true)).toEqual({id:'order'})
 expect(state.calls.find(c=>c.payload).payload.domain_id).toBe(domain)
})
it('refuse sans client et après un changement de contexte en cours de vérification',async()=>{
 await expect(createClientSalesOrder('',{client_id:'buyer'},()=>true)).rejects.toThrow()
 expect(state.calls).toHaveLength(0)
 let current=true;state.onRead=()=>{current=false}
 await expect(createClientSalesOrder(domain,{client_id:'buyer'},()=>current)).rejects.toThrow('changé')
 expect(state.calls.some(c=>c.payload)).toBe(false)
})
