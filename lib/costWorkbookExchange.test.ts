import {describe,it,expect,vi,beforeEach} from 'vitest'
const mock=vi.hoisted(()=>({rows:[] as any[],fail:false,inserts:0}))
vi.mock('./supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({like:(_f:string,pattern:string)=>({limit:async()=>({data:mock.rows.filter(r=>r.description.startsWith(pattern.slice(0,-1))),error:null})})})}),insert:async(entries:any[])=>{mock.inserts++;if(mock.fail)return {error:{message:'Denied'}};mock.rows.push(...entries);return {error:null}}})}}))
import {commitCostPlan,costExchangeTemplate,readCostExchange} from './costWorkbookExchange'
import {planCostRows,type CostCatalog} from './costWorkbookPlan'
const catalog:CostCatalog={domainId:'d1',domainName:'Domaine test',campaigns:[{id:'c1',label:'Campagne',farm_id:'f1'}],farms:[{id:'f1',label:'Ferme'}],greenhouses:[{id:'g1',label:'Serre',farm_id:'f1',area:100}],categories:[{id:'cat',label:'Engrais',code:'ENG',type:'charge_variable',parent:'Intrants'}]}
const plan=()=>planCostRows([{ref:'REF-1',campaign:'Campagne',category:'Engrais',mode:'Mensuel',date:'2026-01-01',amount:100,months:3,distribution:'Parts égales'}],catalog,'budget').entries
beforeEach(()=>{mock.rows=[];mock.fail=false;mock.inserts=0})
describe('Cost workbook exchange',()=>{
 it('writes one atomic batch and skips a repeated identical import',async()=>{expect(await commitCostPlan(plan())).toEqual({inserted:3,skipped:0});expect(mock.inserts).toBe(1);expect(await commitCostPlan(plan())).toEqual({inserted:0,skipped:3});expect(mock.inserts).toBe(1);expect(new Set(mock.rows.map(r=>r.id)).size).toBe(3)})
 it('refuses a changed or partially removed previous import',async()=>{await commitCostPlan(plan());const changed=plan();changed[0].amount=99;await expect(commitCostPlan(changed)).rejects.toThrow('contenu différent');mock.rows.pop();await expect(commitCostPlan(plan())).rejects.toThrow('contenu différent');expect(mock.inserts).toBe(1)})
 it('does not report successful import on database failure',async()=>{mock.fail=true;await expect(commitCostPlan(plan())).rejects.toThrow('non confirmé');expect(mock.rows).toHaveLength(0)})
 it('roundtrips blank model and refuses wrong tenant or cost type',async()=>{const blob=await costExchangeTemplate(catalog,'budget'),bytes=await blob.arrayBuffer();expect(await readCostExchange(bytes,'d1','budget')).toEqual([]);await expect(readCostExchange(bytes,'d2','budget')).rejects.toThrow('autre client');await expect(readCostExchange(bytes,'d1','actual')).rejects.toThrow('parcours');},30000)
})
