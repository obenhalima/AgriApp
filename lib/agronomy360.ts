export type AgroPlanting={id:string;greenhouse_id:string;variety_id:string;planted_area:number;planting_date:string|null;harvest_start_date:string|null;harvest_end_date:string|null;first_harvest_date:string|null;last_harvest_date:string|null;status:string;target_total_production:number|null;target_yield_per_m2:number|null}
export type AgroHarvest={id:string;campaign_planting_id:string;harvest_date:string;total_qty:number}
export type AgroGreenhouse={id:string;farm_id:string;code:string;name:string;total_area:number}
export type AgroActivity={id:string;family:string;name:string;farms:string[];planned:string;actual:string|null;status:string;done:boolean;closed:boolean;water:number|null;href:string}
export type DashboardCampaign={id:string;status?:string;preparation_start?:string|null;planting_start?:string|null;campaign_end?:string|null}
export function defaultAgroCampaign(campaigns:DashboardCampaign[],date:string){
 const sorted=[...campaigns].sort((a,b)=>(b.preparation_start||b.planting_start||'').localeCompare(a.preparation_start||a.planting_start||'')||a.id.localeCompare(b.id))
 const active=sorted.filter(c=>c.status==='en_cours')
 if(active.length)return {id:active[0].id,reason:active.length>1?'Plusieurs campagnes en cours : la plus récente est affichée.':'Campagne en cours sélectionnée automatiquement.'}
 const within=sorted.find(c=>!['terminee','cloturee','annulee','termine','cloture','annule'].includes(c.status||'')&&(c.preparation_start||c.planting_start||'9999')<=date&&!!c.campaign_end&&c.campaign_end>=date)
 if(within)return {id:within.id,reason:'Campagne sélectionnée selon ses dates ; statut « en cours » non renseigné.'}
 return {id:sorted[0]?.id||'',reason:sorted.length?'Aucune campagne en cours identifiée : dernière campagne disponible affichée.':'Aucune campagne disponible.'}
}
export function production360(plantings:AgroPlanting[],harvests:AgroHarvest[],greenhouses:AgroGreenhouse[],farm:string,now:string,absenceDays:number){
 const gs=greenhouses.filter(g=>!farm||g.farm_id===farm),gids=new Set(gs.map(g=>g.id))
 const ps=plantings.filter(p=>gids.has(p.greenhouse_id)),ids=new Set(ps.map(p=>p.id)),hs=harvests.filter(h=>ids.has(h.campaign_planting_id))
 const area=ps.reduce((s,p)=>s+Number(p.planted_area),0),kg=hs.reduce((s,h)=>s+Number(h.total_qty||0),0)
 const targets=ps.map(p=>p.target_total_production!=null?Number(p.target_total_production):p.target_yield_per_m2!=null?Number(p.target_yield_per_m2)*Number(p.planted_area):null)
 const target=targets.length&&targets.every(x=>x!=null)?targets.reduce<number>((s,x)=>s+(x||0),0):null
 const months=new Map<string,number>();for(const h of hs){const m=h.harvest_date.slice(0,7);months.set(m,(months.get(m)||0)+Number(h.total_qty||0))}
 const timeline=Array.from(months).sort(([a],[b])=>a.localeCompare(b)).map(([month,quantity])=>({month,quantity}))
 const comparison=gs.map(g=>{const gp=ps.filter(p=>p.greenhouse_id===g.id),pi=new Set(gp.map(p=>p.id)),a=gp.reduce((s,p)=>s+Number(p.planted_area),0),q=hs.filter(h=>pi.has(h.campaign_planting_id)).reduce((s,h)=>s+Number(h.total_qty||0),0);return {id:g.id,name:g.code,area:a,kg:q,yield:a>0?q/a:null}}).filter(g=>g.area>0).sort((a,b)=>(b.yield||0)-(a.yield||0))
 const missingHarvest=ps.filter(p=>{
  if(['termine','terminee','cloture','cloturee','annule','annulee'].includes(p.status))return false
  const start=p.harvest_start_date||p.first_harvest_date,end=p.harvest_end_date||p.last_harvest_date
  if(!start||start>now||end&&end<now)return false
  const dates=hs.filter(h=>h.campaign_planting_id===p.id).map(h=>h.harvest_date).sort()
  const last=dates[dates.length-1]||start
  return (Date.parse(now+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000>=absenceDays
 })
 return {gs,ps,hs,area,kg,target,yield:area>0?kg/area:null,progress:target!=null&&target>0?kg/target*100:null,timeline,comparison,missingHarvest}
}
export function activity360(rows:AgroActivity[],farm:string,now:number,days:number){
 const scoped=rows.filter(r=>!farm||r.farms.includes(farm))
 const late=scoped.filter(r=>!r.closed&&r.status==='approuvee'&&Date.parse(r.planned)<now)
 const upcoming=scoped.filter(r=>!r.closed&&['soumise','approuvee'].includes(r.status)&&Date.parse(r.planned)>=now&&Date.parse(r.planned)<=now+days*86400000).sort((a,b)=>a.planned.localeCompare(b.planned))
 const done=scoped.filter(r=>r.done),water=done.filter(r=>r.water!=null)
 return {scoped,late,upcoming,done,pending:scoped.filter(r=>!r.closed&&r.status==='soumise'),water:water.length?water.reduce((s,r)=>s+Number(r.water),0):null}
}
