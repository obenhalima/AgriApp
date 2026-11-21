import {expect,it} from 'vitest'
import {buildHarvestForecast} from './harvestForecast'
import {allocateHarvestRevenue} from './harvestRevenue'
const build=(lots:any[],sources:any[],actual:any[],harvests:any[])=>buildHarvestForecast(lots,sources,actual,harvests,harvests.flatMap(h=>[
 {harvest_id:h.id,poids_unitaire_kg:10,line_kg:h.qty_category_1||0},
 {harvest_id:h.id,poids_unitaire_kg:25,line_kg:Number(h.qty_category_2||0)+Number(h.qty_category_3||0)}]))
const planting={id:'p',varieties:{avg_price_export:8,avg_price_local:3}}
const harvest={id:'h',lot_number:'H1',harvest_date:'2026-09-30',domain_id:'d',total_qty:100,qty_category_1:100,campaign_plantings:planting}
const lot={id:'l',domain_id:'d',harvest_id:'h',harvests:harvest,harvest_date:'2026-10-02',estimated_kg:100,qty_acceptee_kg:90,tri_status:'tried',ca_amount:null,markets:{type:'export'}}
it('uses variety prices on harvested quantities while keeping real CA separate',()=>{
 const rows=build([lot],[],[],[harvest])
 expect(rows).toHaveLength(1)
 expect(rows[0]).toMatchObject({date:'2026-09-30',qty:90,price:8,amount:720,kind:'estimate'})
})
it('replaces estimates only for priced kilos, not the entire partially priced dispatch',()=>{
 const priced={...lot,qty_priced_kg:30,ca_amount:300}
 const rows=build([priced],[],allocateHarvestRevenue(priced,[],[]),[harvest])
 expect(rows.map(row=>[row.kind,row.qty,row.amount])).toEqual([['actual',30,300],['estimate',60,480]])
 expect(rows.reduce((sum,row)=>sum+(row.amount||0),0)).toBe(780)
 const complete={...priced,qty_priced_kg:90,ca_amount:900}
 expect(build([complete],[],allocateHarvestRevenue(complete,[],[]),[harvest])).toHaveLength(1)
})
it('estimates not-yet-dispatched harvests with export and local prices, excluding waste',()=>{
 const rows=build([],[],[],[{...harvest,qty_category_1:60,qty_category_2:20,qty_category_3:10}])
 expect(rows.map(row=>[row.destination,row.qty,row.amount])).toEqual([['export',60,480],['local',30,90]])
})
it('does not count dispatched harvest quantities again as harvest stock',()=>{
 const source={id:'s',harvest_lot_id:'l',harvest_id:'h',qty_contributed_kg:40,harvests:harvest}
 const rows=build([{...lot,estimated_kg:40,qty_acceptee_kg:35}],[source],[],[harvest])
 expect(rows.map(row=>row.qty)).toEqual([35,60])
 expect(rows.reduce((sum,row)=>sum+(row.amount||0),0)).toBe(760)
})
it('flags missing prices instead of silently presenting unknown amounts as zero',()=>{
 const missing={...harvest,campaign_plantings:{...planting,varieties:{avg_price_export:0}}}
 expect(build([],[],[],[missing])[0]).toMatchObject({amount:null,price:null,issue:'missing_price'})
})
it('uses the estimated quantity before sorting rather than a default zero accepted field',()=>{
 expect(build([{...lot,tri_status:'pending',qty_acceptee_kg:0}],[],[],[harvest])[0].amount).toBe(800)
})

it('applies the packaging hypothesis consistently to dispatched and remaining quantities',()=>{
 const mixed={...harvest,qty_category_1:80,qty_category_2:20}
 const dispatch={...lot,harvests:mixed,estimated_kg:80,qty_acceptee_kg:80}
 const rows=build([dispatch],[],[],[mixed])
 expect(rows.map(row=>[row.destination,row.qty,row.amount])).toEqual([['export',64,512],['local',16,48],['export',16,128],['local',4,12]])
})

it('uses 25kg packaging for local even when the harvest category and dispatch market say export',()=>{
 const trays=[{harvest_id:'h',poids_unitaire_kg:25,nb_trays:4,line_kg:100}]
 const rows=buildHarvestForecast([lot],[],[],[harvest],trays)
 expect(rows).toHaveLength(1)
 expect(rows[0]).toMatchObject({destination:'local',qty:90,price:3,amount:270})
})
it('keeps actual pricing unchanged and flags unknown formats without assigning forecast revenue',()=>{
 const priced={...lot,qty_priced_kg:30,ca_amount:300}
 const rows=buildHarvestForecast([priced],[],allocateHarvestRevenue(priced,[],[]),[harvest],[{harvest_id:'h',poids_unitaire_kg:12,line_kg:100}])
 expect(rows[0]).toMatchObject({kind:'actual',amount:300,destination:'export'})
 expect(rows[1]).toMatchObject({kind:'estimate',amount:null,issue:'missing_tray_assumption'})
})
