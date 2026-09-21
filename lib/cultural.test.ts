import {describe,it,expect} from 'vitest'
import {culturalQuantity,culturalAlerts} from './cultural'
describe('Interventions culturales',()=>{
 it('calcule les besoins par quantité, surface, eau et recette',()=>{
  expect(culturalQuantity({stock_item_id:'x',mode:'fixed',dose:'1 200,25'},2000,0,'kg')).toBe(1200.25)
  expect(culturalQuantity({stock_item_id:'x',mode:'ha',dose:5},2000,0,'kg')).toBe(1)
  expect(culturalQuantity({stock_item_id:'x',mode:'m3',dose:2},2000,2500,'l')).toBe(5)
  expect(culturalQuantity({stock_item_id:'x',mode:'recipe',dose:250,dose_unit:'g_m3'},2000,10000,'kg')).toBe(2.5)
 })
 it('rejette zéro, eau manquante, conversion incompatible et petites quantités non stockables',()=>{
  expect(()=>culturalQuantity({stock_item_id:'x',mode:'m3',dose:1},100,0,'l')).toThrow()
  expect(()=>culturalQuantity({stock_item_id:'x',mode:'ha',dose:0.001},1,0,'kg')).toThrow()
  expect(()=>culturalQuantity({stock_item_id:'x',mode:'recipe',dose:1,dose_unit:'kg_m3'},100,1000,'l')).toThrow()
 })
 it('alerte seulement sur les occurrences ouvertes et dans leur horizon',()=>{
  const data={families:[{code:'travaux',alert_days:15}],farms:[],programs:[{id:'p',family:'travaux',status:'approuvee',title:'QA',occurrences:[{id:'past',planned_at:'2026-09-01'},{id:'soon',planned_at:'2026-09-20'},{id:'later',planned_at:'2026-12-01'},{id:'done',planned_at:'2026-09-01',confirmed_at:'2026-09-01'}]}],forecast:[{occurrence_id:'soon',missing:3,product:'QA',unit:'kg'},{occurrence_id:'later',missing:3}]}
  expect(culturalAlerts(data,new Date('2026-09-18')).map(r=>r.type)).toEqual(['cultural_late','cultural_stock'])
  data.programs[0].status='annulee';expect(culturalAlerts(data)).toEqual([])
 })
 it('ne signale pas une occurrence non réalisée',()=>{
  const data={families:[],farms:[],programs:[{id:'p',status:'approuvee',occurrences:[{id:'o',planned_at:'2020-01-01',cancelled_at:'2020-01-02'}]}],forecast:[{occurrence_id:'o',missing:3}]}
  expect(culturalAlerts(data)).toEqual([])
 })
})
