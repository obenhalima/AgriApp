import {allocateHarvestRevenue,type HarvestRevenueEntry} from './harvestRevenue'

export type HarvestForecastLine={id:string;date:string|null;planting:any;harvest_id:string|null;harvest_label:string;dispatch_id:string|null;destination:'local'|'export';qty:number;amount:number|null;price:number|null;kind:'actual'|'estimate';issue:string|null}
const numeric=(value:any)=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null
const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100

// Forecast only harvested quantities. Actual pricing replaces the corresponding
// estimated quantity; it is never added on top of the full harvest estimate.
export function buildHarvestForecast(lots:any[],sources:any[],actual:HarvestRevenueEntry[],harvests:any[],trayLines:any[]=[]):HarvestForecastLine[]{
 const out:HarvestForecastLine[]=actual.map(entry=>({id:entry.id,date:entry.recognition_date,planting:entry.planting,harvest_id:entry.harvest_id,
  harvest_label:entry.harvest?.lot_number||'',dispatch_id:entry.dispatch_id,destination:entry.lot.markets?.type==='local'?'local':'export',
  qty:entry.qty,amount:entry.amount,price:entry.price,kind:'actual',issue:entry.issue}))
 const used=new Map<string,number>()
 const mix=(id:string|null)=>{
  const result={export:0,local:0,unknown:0}
  for(const line of trayLines.filter(line=>line.harvest_id===id)){
   const weight=numeric(line.poids_unitaire_kg),count=numeric(line.nb_trays)
   const kg=numeric(line.line_kg)??(weight!=null&&count!=null?weight*count:0)
   if(!(kg>0))continue
   if(weight===10)result.export+=kg
   else if(weight===25)result.local+=kg
   else result.unknown+=kg
  }
  return result
 }
 const splitEstimate=(id:string,harvest:any,planting:any,date:string|null,dispatch:string|null,qty:number,issue:string|null)=>{
  const parts=mix(harvest?.id),total=parts.export+parts.local+parts.unknown
  if(!(total>0)){estimate(id,harvest,planting,date,dispatch,'export',qty,issue||'missing_tray_assumption');return}
  estimate(id+':export',harvest,planting,date,dispatch,'export',qty*parts.export/total,issue)
  estimate(id+':local',harvest,planting,date,dispatch,'local',qty*parts.local/total,issue)
  estimate(id+':unknown',harvest,planting,date,dispatch,'export',qty*parts.unknown/total,issue||'missing_tray_assumption')
 }
 const estimate=(id:string,harvest:any,planting:any,date:string|null,dispatch:string|null,destination:'local'|'export',qty:number,issue:string|null)=>{
  if(!(qty>0))return
  const variety=planting?.varieties
  const price=numeric(destination==='local'?variety?.avg_price_local:variety?.avg_price_export)
  const valid=price!=null&&price>0
  out.push({id,date,planting,harvest_id:harvest?.id||null,harvest_label:harvest?.lot_number||'',dispatch_id:dispatch,destination,qty,
   price:valid?price:null,amount:valid&&date&&!issue?round(qty*price):null,kind:'estimate',issue:issue||(!date?'missing_date':!valid?'missing_price':null)})
 }
 for(const lot of lots){
  const gross=numeric(lot.weighed_kg)??numeric(lot.estimated_kg)??numeric(lot.quantity_kg)??numeric(lot.qty_acceptee_kg)??0
  const accepted=lot.tri_status==='pending'||lot.tri_status==='created'?gross:numeric(lot.qty_acceptee_kg)??gross
  const weights=allocateHarvestRevenue({...lot,tri_status:'priced',qty_priced_kg:1,qty_acceptee_kg:1,ca_amount:0},sources,[])
  const priced=actual.filter(entry=>entry.dispatch_id===lot.id).reduce((sum,entry)=>sum+entry.qty,0)
  for(const entry of weights){
   if(entry.harvest_id){
    const consumed=entry.source_kg??gross*entry.share
    used.set(entry.harvest_id,(used.get(entry.harvest_id)||0)+consumed)
   }
   splitEstimate(`${entry.id}:estimate`,entry.harvest,entry.planting,entry.recognition_date,lot.id,Math.max(0,accepted-priced)*entry.share,entry.issue)
  }
 }
 for(const harvest of harvests){
  const total=numeric(harvest.total_qty)??numeric(harvest.estimated_kg)??0
  const remaining=Math.max(0,total-(used.get(harvest.id)||0))
  if(!remaining)continue
  const parts=mix(harvest.id),packed=parts.export+parts.local+parts.unknown
  const available=packed>0?Math.min(remaining,Math.max(0,packed-(used.get(harvest.id)||0))):remaining
  splitEstimate(`${harvest.id}:stock`,harvest,harvest.campaign_plantings,harvest.harvest_date,null,available,null)
 }
 return out
}
