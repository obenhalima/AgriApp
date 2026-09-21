import { describe,it,expect } from 'vitest'
import { productionExplorer } from './productionExplorer'
import type { PerformanceData } from './farmPerformance'
const fixture=():PerformanceData=>({basis:'surface',inventory:[],transit:0,pending_movements:[],revenue_available:false,metadata:[],station_lots:[],
 plantings:[{id:'p1',campaign_id:'c',greenhouse_id:'s1',variety_id:'v1',farm_id:'f1',farm_name:'F1',greenhouse_name:'S1',area:100,target_kg:1000},{id:'p2',campaign_id:'c',greenhouse_id:'s2',variety_id:'v2',farm_id:'f2',farm_name:'F2',greenhouse_name:'S2',area:300,target_kg:1000}],
 costs:[{id:'cost',campaign_id:'c',greenhouse_id:null,variety_id:null,amount:1000,planned:false,category:'Main d’œuvre'}],harvests:[],
 harvest_details:[{id:'h1',planting_id:'p1',date:'2026-09-01',kg:1000,cat1:1000,local_kg:0},{id:'h2',planting_id:'p2',date:'2026-09-01',kg:1000,cat1:1000,local_kg:0}]})
describe('production explorer',()=>{
 it('reconciles client, farms and greenhouse drill levels without reallocating shared charges',()=>{
  const d=fixture(),all=productionExplorer(d),f1=productionExplorer(d,'f1'),f2=productionExplorer(d,'f2'),s=productionExplorer(d,'f1','s1')
  expect(all.costs).toBe(f1.costs+f2.costs);expect(s.costs).toBe(250);expect(f2.costs).toBe(750)
  expect(all.costKg).toBe(.5);expect(s.costKg).toBe(.25)
  expect(s.categories.reduce((n,c)=>n+c.amount,0)).toBe(s.costs)
  expect(s.allocations.reduce((n,a)=>n+a.amount,0)).toBe(s.costs)
  expect(s.harvests.map(h=>h.id)).toEqual(['h1'])
 })
 it('keeps variety filtering transversal and rejects a greenhouse outside its farm',()=>{
  expect(productionExplorer(fixture(),'','','v2').costs).toBe(750)
  expect(productionExplorer(fixture(),'f1','s2').rows).toHaveLength(0)
 })
 it('never invents a ratio with missing costs or absent harvests',()=>{
  const d=fixture();d.costs=[];expect(productionExplorer(d).costKg).toBeNull();expect(productionExplorer(d).incomplete).toBe(true)
  d.harvest_details=[];expect(productionExplorer(d).costKg).toBeNull()
 })
 it('excludes budget from actual amounts and flags provisional costs',()=>{
  const d=fixture();d.costs[0].quality='provisional';d.costs.push({...d.costs[0],id:'budget',planned:true,amount:5000})
  const v=productionExplorer(d);expect(v.costs).toBe(1000);expect(v.incomplete).toBe(true);expect(v.allocations).toHaveLength(2)
 })
})
