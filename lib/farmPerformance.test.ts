import { describe,it,expect } from 'vitest'
import { buildFarmPerformance,performanceValue,rankedPerformance,type PerformanceData } from './farmPerformance'
import { buildProductionCosts } from './productionCosting'
const fixture=():PerformanceData=>({basis:'surface',inventory:[],transit:0,pending_movements:[],revenue_available:true,
 plantings:[{id:'p1',campaign_id:'c1',greenhouse_id:'s1',variety_id:'v1',farm_id:'f1',farm_name:'F1',greenhouse_name:'S1',area:100,target_kg:1000},{id:'p2',campaign_id:'c1',greenhouse_id:'s2',variety_id:'v2',farm_id:'f2',farm_name:'F2',greenhouse_name:'S2',area:300,target_kg:2000}],
 metadata:[{id:'p1',variety_name:'V1',status:'termine',start:null,end:null,price_export:10,price_local:5,export_share:70},{id:'p2',variety_name:'V2',status:'en_cours',start:null,end:null,price_export:10,price_local:5,export_share:70}],
 costs:[{id:'c',campaign_id:'c1',greenhouse_id:null,variety_id:null,amount:1000,planned:false,category:'charges'}],
 harvests:[{planting_id:'p1',gross_kg:1000,sorted_kg:1000},{planting_id:'p2',gross_kg:2000,sorted_kg:2000}],
 harvest_details:[{id:'h1',planting_id:'p1',date:'2026-09-01',kg:1000,cat1:1000,local_kg:0},{id:'h2',planting_id:'p2',date:'2026-09-01',kg:2000,cat1:2000,local_kg:0}],
 station_lots:[{id:'l',planting_id:'p1',date:'2026-09-01',amount:9000,priced_kg:1000,accepted_kg:1000}]})
describe('Performance comparative',()=>{
 it('allocates before a variety or farm filter',()=>{
  const d=fixture(),r=buildFarmPerformance(d,{level:'variety',variety:'v1'}).rows[0]
  expect(r.shared).toBe(250);expect(buildFarmPerformance(d,{level:'farm',farm:'f2'}).rows[0].shared).toBe(750)
 })
 it('keeps new reports consistent with existing cost consolidation',()=>{
  const d=fixture(),a=buildFarmPerformance(d,{level:'greenhouse'}).rows,b=buildProductionCosts(d).greenhouses
  expect(a.map(r=>r.direct+r.shared)).toEqual(b.map(r=>r.direct+r.shared))
 })
 it('aggregates a variety across farms with weighted ratios',()=>{
  const d=fixture();d.plantings[1].variety_id='v1'
  const r=buildFarmPerformance(d,{level:'variety'}).rows[0]
  expect(performanceValue(r,'costKg','estimate')).toBeCloseTo(1/3)
  expect(performanceValue(r,'yield','estimate')).toBe(7.5)
 })
 it('does not create ratios without harvests, surfaces or known costs',()=>{
  const d=fixture();d.harvest_details=[];d.costs=[]
  const r=buildFarmPerformance(d,{level:'variety'}).rows[0]
  expect(performanceValue(r,'costKg','estimate')).toBeNull();expect(performanceValue(r,'margin','estimate')).toBeNull()
 })
 it('separates estimated revenue from station amounts',()=>{
  const r=buildFarmPerformance(fixture(),{level:'variety'}).rows[0]
  expect(performanceValue(r,'revenue','estimate')).toBe(10000)
  expect(performanceValue(r,'revenue','station')).toBe(9000)
 })
 it('rejects financial rankings with missing costs or pending allocations',()=>{
  const rows=buildFarmPerformance(fixture(),{level:'variety'}).rows
  expect(rankedPerformance(rows,'costKg','estimate',true,true)).toHaveLength(0)
  expect(rankedPerformance(rows,'yield','estimate',true,true)).toHaveLength(2)
 })
 it('excludes unfinished cycles only when requested and orders low cost first',()=>{
  const rows=buildFarmPerformance(fixture(),{level:'variety'}).rows
  expect(rankedPerformance(rows,'yield','estimate',false,false)).toHaveLength(1)
  expect(rankedPerformance(rows,'costKg','estimate',true,false)[0].id).toBe('v1')
  expect(rankedPerformance(rows,'costKg','estimate',true,false)).toHaveLength(2)
  expect(performanceValue(rows.find(r=>r.id==='v2')!,'costKg','estimate')).toBe(750/2000)
 })
 it('does not invent revenue when price or permission is absent',()=>{
  const d=fixture();d.metadata[0].price_export=null
  expect(performanceValue(buildFarmPerformance(d,{level:'variety'}).rows[0],'margin','estimate')).toBeNull()
  d.revenue_available=false
  expect(performanceValue(buildFarmPerformance(d,{level:'variety'}).rows[0],'revenue','station')).toBeNull()
 })
 it('excludes incompletely priced station lots',()=>{
  const d=fixture();d.station_lots[0].priced_kg=500
  expect(performanceValue(buildFarmPerformance(d,{level:'variety'}).rows[0],'margin','station')).toBeNull()
 })
 it('does not mix budgets into actual costs or other campaigns',()=>{
  const d=fixture();d.costs.push({...d.costs[0],id:'b',amount:9000,planned:true},{...d.costs[0],id:'x',campaign_id:'other',amount:500})
  const result=buildFarmPerformance(d,{level:'variety'})
  expect(result.unallocated).toBe(500);expect(result.rows[0].shared).toBe(250);expect(result.rows[0].budget).toBe(2250)
 })
})
