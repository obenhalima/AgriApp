import {beforeEach,expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({rows:[] as any[],pages:0}))
vi.mock('./supabase',()=>({supabase:{from:()=>{
 const filters:[string,unknown][]=[]
 let start=0,end=Infinity
 const query:any={select:()=>query,order:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query},range:(from:number,to:number)=>{fixture.pages++;start=from;end=to;return query},then:(resolve:any)=>Promise.resolve({data:fixture.rows.filter(row=>filters.every(([key,value])=>row[key]===value)).slice(start,end+1),error:null}).then(resolve)}
 return query
}}}))
import {listCostEntries} from './costEntries'
beforeEach(()=>{fixture.pages=0;fixture.rows=Array.from({length:1201},(_,index)=>({id:String(index),domain_id:'client',is_planned:false}));fixture.rows.push({id:'foreign',domain_id:'other',is_planned:false})})
it('loads every client cost across pages instead of truncating the ledger',async()=>{
 expect(await listCostEntries({domainId:'client'})).toHaveLength(1201)
 expect(fixture.pages).toBe(3)
})
it('preserves an explicit caller limit',async()=>{
 expect(await listCostEntries({domainId:'client',limit:300})).toHaveLength(300)
 expect(fixture.pages).toBe(1)
})
