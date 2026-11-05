import {it,expect} from 'vitest'
import {explainCostVariance} from './costVariance'
import type {PerformanceData,PerformanceRow} from './farmPerformance'
const row=(id:string,cost:number,kg:number,area=10000)=>({id,name:id,plantingIds:[id],direct:cost,shared:0,kg,area,costMissing:false,open:true,provisional:false,categories:{Main:cost}} as unknown as PerformanceRow)
const data={basis:'surface',costs:[],harvests:[],pending_movements:[],transit:0,metadata:[{id:'a',start:'2026-01-01'},{id:'b',start:'2026-01-01'}],plantings:['a','b'].map(id=>({id,variety_id:'v',campaign_id:'c',farm_id:'f'}))} as unknown as PerformanceData
it('reconciles the example into expense and yield effects',()=>{
 const r=explainCostVariance(row('a',100000,50000),row('b',120000,40000),data)
 expect(r.error).toBeNull();expect(r.gap).toBeCloseTo(1);expect(r.chargeEffect).toBeCloseTo(.4);expect(r.yieldEffect).toBeCloseTo(.6)
 expect(r.posts![0].effect).toBeCloseTo(.4);expect(r.residual).toBeCloseTo(0);expect(r.warnings).toContain('open')
})
it('normalizes unequal areas and retains negative contributions',()=>{
 const r=explainCostVariance(row('a',100000,50000),row('b',200000,100000,20000),data)
 expect(r.gap).toBeCloseTo(0);expect(r.chargeEffect).toBeCloseTo(0);expect(r.yieldEffect).toBeCloseTo(0)
 const less=explainCostVariance(row('a',100000,50000),row('b',80000,50000),data)
 expect(less.gap).toBeCloseTo(-.4);expect(less.posts![0].effect).toBeCloseTo(-.4)
})
it('rejects missing data, different varieties and campaigns',()=>{
 expect(explainCostVariance(row('a',1,0),row('b',1,2),data).error).toBe('data')
 expect(explainCostVariance(row('a',1,2),row('a',1,2),data).error).toBe('distinct')
 for(const [key,error] of [['variety_id','variety'],['campaign_id','campaign']] as const){
  const changed={...data,plantings:data.plantings.map(p=>p.id==='b'?{...p,[key]:'other'}:p)}
  expect(explainCostVariance(row('a',1,2),row('b',1,2),changed).error).toBe(error)
 }
})
it('shows differences in timing and reconciles any category residual',()=>{
 const a=row('a',100,50),b=row('b',200,60);b.categories={Main:150}
 const r=explainCostVariance(a,b,{...data,metadata:data.metadata.map(m=>m.id==='b'?{...m,start:'2026-02-01'}:m)})
 expect(r.chargeEffect!+r.yieldEffect!).toBeCloseTo(r.gap!)
 expect(r.posts!.reduce((s,p)=>s+p.effect,0)+r.residual!).toBeCloseTo(r.chargeEffect!)
 expect(r.warnings).toContain('datesDifferent')
})
