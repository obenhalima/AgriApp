import { allocateProductionCosts, costRatio, type CostData, type ProductionAllocation } from './productionCosting'
export type PerformanceData=CostData&{revenue_available:boolean;consumptions?:{movement_id:string;product:string;quantity:number;unit:string;date:string}[];metadata:{id:string;variety_name:string;status:string;start:string|null;end:string|null;price_export:number|null;price_local:number|null;export_share:number|null}[];
 harvest_details:{id:string;planting_id:string;date:string;kg:number;cat1:number;local_kg:number}[];
 station_lots:{id:string;planting_id:string;date:string;amount:number|null;priced_kg:number|null;accepted_kg:number|null}[]}
export type PerformanceRow={id:string;name:string;plantingIds:string[];area:number;kg:number;target:number;targetMissing:boolean;direct:number;shared:number;budget:number;budgetMissing:boolean;estimatedRevenue:number;estimateMissing:boolean;stationRevenue:number;stationMissing:boolean;open:boolean;costMissing:boolean;provisional:boolean;categories:Record<string,number>;allocations:ProductionAllocation[]}
export type PerformanceMetric='yield'|'costKg'|'marginKg'|'marginArea'|'margin'|'revenue'
export type RevenueBasis='estimate'|'station'
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
export function performanceValue(r:PerformanceRow,metric:PerformanceMetric,basis:RevenueBasis):number|null{
 const cost=r.direct+r.shared
 const revenue=basis==='estimate'?(r.estimateMissing?null:r.estimatedRevenue):(r.stationMissing?null:r.stationRevenue)
 if(metric==='yield')return costRatio(r.kg,r.area)
 if(metric==='costKg')return r.costMissing?null:costRatio(cost,r.kg)
 if(metric==='revenue')return revenue
 if(revenue==null||r.costMissing)return null
 if(metric==='marginKg')return costRatio(revenue-cost,r.kg)
 if(metric==='marginArea')return costRatio(revenue-cost,r.area)
 return revenue-cost
}
export function buildFarmPerformance(data:PerformanceData,filter:{farm?:string;variety?:string;level:'variety'|'greenhouse'|'farm'}){
 const allocation=allocateProductionCosts(data)
 const rows=new Map<string,PerformanceRow>()
 for(const p of data.plantings){
  if(filter.farm&&p.farm_id!==filter.farm||filter.variety&&p.variety_id!==filter.variety)continue
  const meta=data.metadata.find(m=>m.id===p.id)
  const id=filter.level==='variety'?p.variety_id:filter.level==='farm'?p.farm_id:p.greenhouse_id
  if(!rows.has(id))rows.set(id,{id,name:filter.level==='variety'?meta?.variety_name||'Variété inconnue':filter.level==='farm'?p.farm_name:`${p.farm_name} — ${p.greenhouse_name}`,plantingIds:[],area:0,kg:0,target:0,targetMissing:false,direct:0,shared:0,budget:0,budgetMissing:false,estimatedRevenue:0,estimateMissing:false,stationRevenue:0,stationMissing:false,open:false,costMissing:false,provisional:false,categories:{},allocations:[]})
  const r=rows.get(id)!,hs=data.harvest_details.filter(h=>h.planting_id===p.id),lots=data.station_lots.filter(l=>l.planting_id===p.id),cs=allocation.allocations.filter(c=>c.plantingId===p.id)
  r.plantingIds.push(p.id);r.area+=Number(p.area);r.kg+=hs.reduce((s,h)=>s+Number(h.kg||0),0)
  r.target+=Number(p.target_kg||0);r.targetMissing ||= p.target_kg==null||Number(p.target_kg)<=0
  r.open ||= !meta||!['termine','terminee','cloture','cloturee'].includes(meta.status)
  r.costMissing ||= !cs.some(c=>!c.planned);r.budgetMissing ||= !cs.some(c=>c.planned)
  r.provisional ||= cs.some(c=>!c.planned&&c.provisional)
  for(const c of cs){
   if(c.planned)r.budget=round(r.budget+c.amount)
   else{if(c.shared)r.shared=round(r.shared+c.amount);else r.direct=round(r.direct+c.amount);r.categories[c.category]=round((r.categories[c.category]||0)+c.amount)}
  }
  r.allocations.push(...cs)
  r.estimateMissing ||= !data.revenue_available||!hs.length
  for(const h of hs){
   if(Number(h.cat1)>0&&meta?.price_export==null||Number(h.local_kg)>0&&meta?.price_local==null)r.estimateMissing=true
   r.estimatedRevenue+=Number(h.cat1||0)*Number(meta?.price_export||0)+Number(h.local_kg||0)*Number(meta?.price_local||0)
  }
  r.stationMissing ||= !data.revenue_available||!lots.length||lots.some(l=>l.amount==null||l.accepted_kg==null||l.priced_kg==null||Number(l.priced_kg)<Number(l.accepted_kg))
  r.stationRevenue+=lots.reduce((s,l)=>s+Number(l.amount||0),0)
 }
 return {...allocation,rows:Array.from(rows.values()),pendingCount:data.pending_movements.length}
}
export function rankedPerformance(rows:PerformanceRow[],metric:PerformanceMetric,basis:RevenueBasis,includeOpen:boolean,unresolved:boolean){
 return rows.filter(r=>r.kg>0&&r.area>0&&(includeOpen||!r.open)&&performanceValue(r,metric,basis)!=null&&(metric==='yield'||!unresolved&&!r.costMissing&&!r.provisional))
 .sort((a,b)=>{const diff=performanceValue(a,metric,basis)!-performanceValue(b,metric,basis)!;return (metric==='costKg'?diff:-diff)||a.name.localeCompare(b.name)})
}
