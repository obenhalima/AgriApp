import {decimal} from './irrigation'
import {fertigationQuantity} from './fertigation'
export type CulturalProduct={stock_item_id:string;mode:'fixed'|'ha'|'m3'|'recipe';dose:string|number;dose_unit?:string;unit?:string;name?:string;quantity?:number}
export function culturalQuantity(line:CulturalProduct,area:number,water:number,unit:string){
  const d=decimal(line.dose)
  if(!Number.isFinite(area)||area<=0||!Number.isFinite(water)||water<0||d<=0)throw Error('Surface, eau ou quantité invalide.')
  let q:number
  if(line.mode==='recipe')q=fertigationQuantity(water,d,line.dose_unit||'',unit)
  else if(line.mode==='ha')q=d*area/10000
  else if(line.mode==='m3'){if(water<=0)throw Error('Volume d’eau requis.');q=d*water/1000}
  else if(line.mode==='fixed')q=d
  else throw Error('Mode inconnu.')
  q=Math.round(q*100)/100
  if(!Number.isFinite(q)||q<.01||q>99999999.99)throw Error('Quantité hors précision du stock (minimum 0,01).')
  return q
}
export function culturalAlerts(data:any,now=new Date()){
  const rows:any[]=[]
  for(const p of data.programs||[]){
    if(!['soumise','approuvee'].includes(p.status))continue
    const settings=data.families.find((f:any)=>f.code===p.family),days=settings?.alert_days??15
    for(const o of p.occurrences||[]){
      if(o.confirmed_at||o.cancelled_at)continue
      const date=new Date(o.planned_at).getTime(),href=`/interventions/programmes?programme=${p.id}`,location=data.farms.find((f:any)=>f.id===p.farm_id)?.name||''
      if(p.status==='approuvee'&&date<now.getTime())rows.push({id:`cultural-late:${o.id}`,type:'cultural_late',urgent:true,title:`Intervention en retard : ${p.title}`,detail:new Date(o.planned_at).toLocaleString('fr-FR'),farmId:p.farm_id,warehouseId:p.warehouse_id,location,href})
      const missing=(data.forecast||[]).filter((r:any)=>r.occurrence_id===o.id&&Number(r.missing)>0)
      if(missing.length&&date<=now.getTime()+days*86400000)rows.push({id:`cultural-stock:${o.id}`,type:'cultural_stock',urgent:date<=now.getTime(),title:`Intervention : stock manquant — ${p.title}`,detail:missing.map((r:any)=>`${r.product} : ${Number(r.missing).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${r.unit}`).join(' · '),farmId:p.farm_id,warehouseId:p.warehouse_id,location,href})
    }
  }
  return rows
}
