import type {PerformanceData,PerformanceRow} from './farmPerformance'
import {allocateProductionCosts} from './productionCosting'

/** Arithmetic attribution, not a causal agronomic diagnosis. Normalize by planted area. */
export function explainCostVariance(a:PerformanceRow,b:PerformanceRow,data:PerformanceData) {
 const scope=(r:PerformanceRow)=>data.plantings.filter(p=>r.plantingIds.includes(p.id))
 const pa=scope(a),pb=scope(b)
 if(a.id===b.id) return {error:'distinct' as const}
 if(!pa.length||!pb.length||pa.length!==a.plantingIds.length||pb.length!==b.plantingIds.length) return {error:'scope' as const}
 if(new Set([...pa,...pb].map(p=>p.variety_id)).size!==1) return {error:'variety' as const}
 if(new Set([...pa,...pb].map(p=>p.campaign_id)).size!==1) return {error:'campaign' as const}
 if([a,b].some(r=>r.area<=0||r.kg<=0||r.costMissing||![r.area,r.kg,r.direct,r.shared].every(Number.isFinite))) return {error:'data' as const}
 const ca=(a.direct+a.shared)/a.area,cb=(b.direct+b.shared)/b.area
 const ya=a.kg/a.area,yb=b.kg/b.area
 // A is the reference. First change cost intensity at A's yield, then yield at B's intensity.
 const chargeEffect=(cb-ca)/ya,yieldEffect=cb*(1/yb-1/ya)
 const posts=[...new Set([...Object.keys(a.categories),...Object.keys(b.categories)])].map(name=>({name,a:a.categories[name]||0,b:b.categories[name]||0,effect:((b.categories[name]||0)/b.area-(a.categories[name]||0)/a.area)/ya})).sort((x,y)=>Math.abs(y.effect)-Math.abs(x.effect))
 const residual=chargeEffect-posts.reduce((s,p)=>s+p.effect,0)
 const starts=(r:PerformanceRow)=>r.plantingIds.map(id=>data.metadata.find(m=>m.id===id)?.start).filter(Boolean).sort()
 const sa=starts(a),sb=starts(b)
 const warnings:string[]=[]
 if(a.open||b.open)warnings.push('open')
 if(a.provisional||b.provisional||data.pending_movements.length||data.transit!==0||allocateProductionCosts(data).unallocated!==0)warnings.push('provisional')
 if(!sa.length||!sb.length)warnings.push('datesMissing')
 else if(JSON.stringify(sa)!==JSON.stringify(sb))warnings.push('datesDifferent')
 if(new Set([...pa,...pb].map(p=>p.farm_id)).size>1)warnings.push('farms')
 if(pa.length>1||pb.length>1)warnings.push('cycles')
 return {error:null,aCost:ca/ya,bCost:cb/yb,gap:cb/yb-ca/ya,aIntensity:ca,bIntensity:cb,aYield:ya,bYield:yb,chargeEffect,yieldEffect,posts,residual,warnings,startsA:sa,startsB:sb}
}
