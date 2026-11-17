import {beforeEach,expect,it,vi} from 'vitest'

const fixture=vi.hoisted(()=>({tables:{} as Record<string,any[]>,calls:[] as string[]}))
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 fixture.calls.push(table)
 const filters:[string,unknown][]=[]
 let start=0,end=Infinity
 const result=()=>({data:(fixture.tables[table]??[]).filter(row=>filters.every(([path,value])=>path.split('.').reduce((item,key)=>item?.[key],row)===value)).slice(start,end+1),error:null})
 const query:any={select:()=>query,order:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query},is:(key:string,value:unknown)=>{filters.push([key,value]);return query},range:(from:number,to:number)=>{start=from;end=to;return query},single:async()=>({...result(),data:result().data[0]}),then:(resolve:any)=>Promise.resolve(result()).then(resolve)}
 return query
}}}))
import {buildComparison,getActualChargeEntries} from './actuals'

const planting=(farm='farm',greenhouse='serre')=>({campaign_id:'campaign',greenhouse_id:greenhouse,greenhouses:{farm_id:farm}})
const lot=(id:string,amount:number|null,status='priced',market='export')=>({id,domain_id:'domain',category:'station_dispatch',harvest_date:'2026-09-25',tri_status:status,qty_priced_kg:0,qty_acceptee_kg:100,ca_amount:amount,markets:{type:market},campaign_plantings:planting()})
const report=(options={})=>buildComparison({campaignId:'campaign',versionId:'budget',months:[{year:2026,month:9},{year:2026,month:10},{year:2099,month:1}],...options})
beforeEach(()=>{
 fixture.calls=[]
 fixture.tables={
  campaigns:[{id:'campaign',domain_id:'domain'}],
  account_categories:['CA_EXPORT','CA_LOCAL'].map(code=>({id:code,code,type:'produit',is_active:true})),
  budget_lines:[{version_id:'budget',account_category_id:'CA_EXPORT',period_year:2099,period_month:1,amount:9999}],
  cost_entries:[],harvest_lots:[],station_settlement_allocations:[],harvest_lot_sources:[],
 }
})
it('keeps actual revenue at zero without pricing and never substitutes future budget',async()=>{
 fixture.tables.harvest_lots=[lot('unpriced',null,'created'),lot('unconfirmed',999,'tried')]
 const rows=await report()
 expect(rows.every(row=>row.actual===0)).toBe(true)
 expect(rows.find(row=>row.category_code==='CA_EXPORT')?.budget).toBe(9999)
 expect(fixture.calls).not.toContain('harvests')
})
it('reconciles monthly actuals and detail beyond 1000 costs with domain and budget isolation',async()=>{
 fixture.tables.account_categories.push({id:'fertilizer',code:'ENGRAIS',type:'charge_variable',is_active:true})
 fixture.tables.cost_entries=Array.from({length:1201},(_,index)=>({id:`cost-${index}`,domain_id:'domain',campaign_id:'campaign',account_category_id:'fertilizer',is_planned:false,entry_date:'2026-09-23',amount:2}))
 fixture.tables.cost_entries.push({...fixture.tables.cost_entries[0],id:'foreign',domain_id:'other-domain',amount:99999})
 fixture.tables.cost_entries.push({...fixture.tables.cost_entries[0],id:'budget-cost',is_planned:true,amount:99999})
 const details=await getActualChargeEntries({campaignId:'campaign'})
 expect(details).toHaveLength(1201)
 const rows=await report()
 expect(rows.find(row=>row.category_id==='fertilizer')?.byMonth['2026-9'].actual).toBe(2402)
 expect(rows.find(row=>row.category_id==='fertilizer')?.actual).toBe(details.reduce((sum,row)=>sum+row.amount,0))
})
it('counts direct local pricing and valid partial settlements once, excluding cancelled settlements',async()=>{
 fixture.tables.harvest_lots=[lot('local',200,'priced','local'),lot('partial',999,'tried'),lot('cancelled',888,'priced')]
 fixture.tables.station_settlement_allocations=[
  {id:'a',harvest_lot_id:'partial',qty_allocated_kg:20,amount_allocated:150,harvest_lots:{domain_id:'domain'},station_settlement_lines:{station_settlements:{status:'valide'}}},
  {id:'b',harvest_lot_id:'cancelled',qty_allocated_kg:100,amount_allocated:888,harvest_lots:{domain_id:'domain'},station_settlement_lines:{station_settlements:{status:'brouillon'}}},
 ]
 const rows=await report()
 expect(rows.find(row=>row.category_code==='CA_EXPORT')?.actual).toBe(150)
 expect(rows.find(row=>row.category_code==='CA_LOCAL')?.actual).toBe(200)
})
it('allocates a mixed dispatch by contributed quantities and filters farm and greenhouse',async()=>{
 fixture.tables.harvest_lots=[{...lot('mixed',400),campaign_plantings:null}]
 fixture.tables.harvest_lot_sources=[
  {id:'s1',harvest_lot_id:'mixed',qty_contributed_kg:25,harvests:{domain_id:'domain',campaign_plantings:planting()}},
  {id:'s2',harvest_lot_id:'mixed',qty_contributed_kg:75,harvests:{domain_id:'domain',campaign_plantings:planting('other','other-serre')}},
 ]
 expect((await report({farmId:'farm'}))[0].actual).toBe(100)
 expect((await report({greenhouseId:'other-serre'}))[0].actual).toBe(300)
 expect((await report())[0].actual).toBe(400)
})
it('reads every priced dispatch beyond the first page and isolates the campaign domain',async()=>{
 fixture.tables.harvest_lots=Array.from({length:1001},(_,index)=>lot(`lot-${index}`,10))
 fixture.tables.harvest_lots.push({...lot('foreign',5000),domain_id:'other-domain'})
 expect((await report())[0].actual).toBe(10010)
})
