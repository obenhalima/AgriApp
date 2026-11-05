import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({selects:[] as string[],filters:[] as string[]}))
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 const query:any={select:(s:string)=>{mocks.selects.push(s);return query},eq:(k:string,v:string)=>{mocks.filters.push(`${table}:${k}:${v}`);return query},in:()=>query,order:()=>query,range:()=>query,
 then:(resolve:any)=>Promise.resolve({error:null,data:table==='campaign_plantings'?[{id:'p',greenhouses:{code:'S1',farms:{code:'F1',name:'Ferme'}},campaigns:{code:'C1',name:'Campagne'},varieties:{code:'V1',commercial_name:'Variété'}}]:[]}).then(resolve)}
 return query
}}}))
import {loadHarvestMigrationCatalog} from './harvestMigrationCatalog'
it('disambiguates the variety relation while preserving client filters',async()=>{
 const result=await loadHarvestMigrationCatalog('client-test','Test')
 expect(result.plantings).toHaveLength(1)
 expect(mocks.selects.some(s=>s.includes('varieties!campaign_plantings_variety_id_fkey(code,commercial_name)'))).toBe(true)
 for(const filter of ['domain_id','greenhouses.farms.domain_id','campaigns.domain_id'])expect(mocks.filters).toContain(`campaign_plantings:${filter}:client-test`)
 expect(mocks.filters).toContain('markets:domain_id:client-test')
})
