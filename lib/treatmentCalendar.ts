export const treatmentDay = (value: string) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};
export const calendarDays = (month: string) => {
  const first = new Date(`${month}-01T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (first.getUTCDay()+6)%7);
  return Array.from({length:42},(_,i)=>{
    const d=new Date(first); d.setUTCDate(d.getUTCDate()+i); return d.toISOString().slice(0,10);
  });
};
export const treatmentLines = (r:any) => Array.isArray(r.treatment_request_products)?r.treatment_request_products:[];
export const treatmentPlaces = (r:any,plantings:any[]) => {
  const ids=[r.campaign_planting_id,...(r.treatment_request_targets||[]).map((t:any)=>t.campaign_planting_id)];
  return plantings.filter(p=>ids.includes(p.id)).map(p=>p.greenhouses).filter(Boolean);
};
export const treatmentStock = (r:any) => r.stock_forecast?.stock_status==='disponible'?'disponible':r.stock_forecast?'manquant':'inconnu';
export function filterTreatments(rows:any[],plantings:any[],f:Record<string,string>,today:string) {
  return rows.filter(r=>{
    const places=treatmentPlaces(r,plantings),lines=treatmentLines(r),day=treatmentDay(r.planned_at);
    return (!f.farm||places.some(p=>p.farm_id===f.farm)) && (!f.greenhouse||places.some(p=>p.id===f.greenhouse))
      && (!f.target||lines.some((p:any)=>p.target_name===f.target)||r.target_name===f.target)
      && (!f.product||lines.some((p:any)=>(p.stock_items?.name||p.product_name)===f.product))
      && (!f.status||(f.status==='actifs'?['soumise','approuvee'].includes(r.status):f.status==='retard'?['soumise','approuvee'].includes(r.status)&&!!day&&day<today:r.status===f.status))
      && (!f.stock||treatmentStock(r)===f.stock) && (!f.from||!!day&&day>=f.from) && (!f.to||!!day&&day<=f.to);
  }).sort((a,b)=>{
    if(f.sort?.includes('_')){
      const [field,direction]=f.sort.split('_');
      const label=(r:any)=>field==='greenhouse'?treatmentPlaces(r,plantings).map(p=>p.name).sort().join(', '):field==='target'?r.target_name||'':({soumise:'À valider',approuvee:'À confirmer',executee:'Réalisée',rejetee:'Rejetée',annulee:'Non réalisée'} as Record<string,string>)[r.status]||r.status||'';
      const comparison=label(a).localeCompare(label(b),'fr',{numeric:true});
      if(comparison)return comparison*(direction==='desc'?-1:1);
    }
    const x=treatmentDay(a.planned_at),y=treatmentDay(b.planned_at);
    if(!x||!y)return x?-1:y?1:0;
    return (new Date(a.planned_at).getTime()-new Date(b.planned_at).getTime())*(f.sort==='asc'?1:-1);
  });
}
