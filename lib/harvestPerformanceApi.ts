import {supabase} from './supabase'
import {readHarvestRevenue} from './harvestRevenueApi'
import {allocateHarvestRevenue} from './harvestRevenue'
import type {PerformanceData} from './farmPerformance'

// Preserve the RPC's authorization and cost perimeter. Replace only revenue
// with the same source-harvest allocation used by the operating statement.
export async function readHarvestPerformance(domain:string,campaign:string|null,start:string|null,end:string|null,signal:AbortSignal):Promise<PerformanceData>{
 const response=await supabase.rpc('get_farm_performance_data',{p_domain:domain,p_campaign:campaign,p_start:start,p_end:end}).abortSignal(signal)
 if(response.error)throw response.error
 const data=response.data as PerformanceData
 if(!data.revenue_available)return data
 const revenue=await readHarvestRevenue(domain,{signal})
 const known=new Set(data.plantings.map(p=>p.id))
 const station:PerformanceData['station_lots']=[]
 let issues=0
 for(const lot of revenue.lots){
  const priced=revenue.entries.filter(entry=>entry.dispatch_id===lot.id)
  // Unpriced lots remain incomplete; no estimated tariff is promoted to real CA.
  const entries=priced.length?priced:allocateHarvestRevenue({...lot,tri_status:'priced',qty_priced_kg:lot.qty_acceptee_kg,ca_amount:0},revenue.sources,[])
  for(const entry of entries){
   if(campaign&&entry.planting&&entry.planting.campaign_id!==campaign)continue
   if(!entry.planting||!known.has(entry.planting.id)){if(entry.issue)issues++;continue}
   if(!entry.recognition_date){issues++;continue}
   if(start&&entry.recognition_date<start||end&&entry.recognition_date>end)continue
   station.push({id:entry.id,planting_id:entry.planting.id,date:entry.recognition_date,
    amount:priced.length?entry.amount:null,priced_kg:priced.length?entry.qty:null,
    accepted_kg:Number(lot.qty_acceptee_kg||0)*entry.share})
  }
 }
 return {...data,station_lots:station,revenue_date_issues:issues}
}
