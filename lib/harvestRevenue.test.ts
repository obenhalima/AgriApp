import {expect,it} from 'vitest'
import {allocateHarvestRevenue} from './harvestRevenue'
const lot={id:'dispatch',domain_id:'d',harvest_date:'2026-10-02',tri_status:'priced',qty_acceptee_kg:100,ca_amount:1000}
const source=(id:string,date:string|null,kg:number)=>({id,harvest_id:id,harvest_lot_id:'dispatch',qty_contributed_kg:kg,harvests:{id,domain_id:'d',harvest_date:date,campaign_plantings:{id:'p-'+id}}})
it('splits composite revenue across original dates, preserving logistics date',()=>{
 const rows=allocateHarvestRevenue(lot,[source('a','2026-09-30',25),source('b','2026-10-01',75)],[])
 expect(rows.map(r=>[r.recognition_date,r.amount,r.qty])).toEqual([['2026-09-30',250,25],['2026-10-01',750,75]])
 expect(rows.every(r=>r.dispatch_date==='2026-10-02')).toBe(true)
})
it('never invents revenue without pricing or uses dispatch date for missing harvests',()=>{
 expect(allocateHarvestRevenue({...lot,ca_amount:null},[],[])).toEqual([])
 expect(allocateHarvestRevenue(lot,[],[])[0]).toMatchObject({recognition_date:null,issue:'missing_source',amount:1000})
})
it('retains missing source weights and money instead of reallocating them',()=>{
 const rows=allocateHarvestRevenue(lot,[source('a','2026-09-30',25),{...source('b',null,75),harvests:null}],[])
 expect(rows[0].amount).toBe(250)
 expect(rows[1]).toMatchObject({recognition_date:null,amount:750,issue:'missing_source'})
})
it('uses validated settlement pricing once, regardless of mirrored lot CA',()=>{
 const allocations=[{harvest_lot_id:'dispatch',qty_allocated_kg:20,amount_allocated:200,station_settlement_lines:{station_settlements:{status:'valide'}}}]
 expect(allocateHarvestRevenue(lot,[source('a','2026-09-30',25),source('b','2026-10-01',75)],allocations).map(r=>r.amount)).toEqual([50,150])
})
it('conserves cents deterministically, including small and zero amounts',()=>{
 const sources=[source('a','2026-09-30',1),source('b','2026-10-01',1),source('c','2026-10-02',1)]
 expect(allocateHarvestRevenue({...lot,ca_amount:.02},sources,[]).map(r=>r.amount)).toEqual([.01,.01,0])
 expect(allocateHarvestRevenue({...lot,ca_amount:0},sources,[]).reduce((s,r)=>s+r.amount,0)).toBe(0)
})
it('accepts real direct source dates, rejects invalid dates and foreign sources',()=>{
 const direct={...lot,harvest_id:'a',harvests:source('a','2026-09-30',100).harvests}
 expect(allocateHarvestRevenue(direct,[],[])[0].recognition_date).toBe('2026-09-30')
 expect(allocateHarvestRevenue(lot,[source('a','2026-02-30',100)],[])[0].issue).toBe('missing_date')
 expect(allocateHarvestRevenue({...direct,harvests:{...direct.harvests,domain_id:'other'}},[],[])[0].issue).toBe('missing_source')
 expect(allocateHarvestRevenue(lot,[source('a','2026-09-30',0)],[])[0].issue).toBe('invalid_quantity')
})
