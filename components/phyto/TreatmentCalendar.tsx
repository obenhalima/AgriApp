'use client'
import {useEffect,useState, type ReactNode} from 'react'
import {Calendar,ChevronLeft,ChevronRight} from 'lucide-react'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {calendarDays,filterTreatments,treatmentDay,treatmentLines,treatmentPlaces} from '@/lib/treatmentCalendar'

const labels:Record<string,string>={soumise:'À valider',approuvee:'À confirmer',executee:'Réalisée',rejetee:'Rejetée',annulee:'Non réalisée',retard:'En retard'}
const colors:Record<string,string>={soumise:'bg-warning',approuvee:'bg-brand',executee:'bg-success',rejetee:'bg-danger',annulee:'bg-fg-tertiary',retard:'bg-danger'}
const blank={farm:'',greenhouse:'',target:'',product:'',status:'',stock:'',from:'',to:'',sort:'desc'}
export function TreatmentCalendar({requests,plantings,children,selection,cultural=false}:{requests:any[];plantings:any[];children:(rows:any[])=>ReactNode;selection?:{status:string;stock:string;sequence:number}|null;cultural?:boolean}){
 const displayLabels:Record<string,string>=cultural?{...labels,brouillon:'Brouillon',approuvee:'Validée — à réaliser'}:labels
 const today=treatmentDay(new Date().toISOString())
 const [month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(''),[filters,setFilters]=useState(blank)
 useEffect(()=>{
  if(!selection)return
  setSelected('')
  setFilters({...blank,status:selection.status,stock:selection.stock})
  const frame=requestAnimationFrame(()=>{const section=document.getElementById('treatment-list');section?.focus({preventScroll:true});section?.scrollIntoView({behavior:'smooth',block:'start'})})
  return ()=>cancelAnimationFrame(frame)
 },[selection])
 const filtered=filterTreatments(requests,plantings,filters,today)
 const visible=selected?filtered.filter(r=>treatmentDay(r.planned_at)===selected):filtered
 const places=Array.from(new Map(requests.flatMap(r=>treatmentPlaces(r,plantings)).map(p=>[p.id,p])).values())
 const farms=Array.from(new Map(places.filter(p=>p.farms).map(p=>[p.farm_id,p.farms])).values())
 const names=(values:string[])=>Array.from(new Set(values.filter(Boolean))).sort((a,b)=>a.localeCompare(b,'fr'))
 const change=(key:string,value:string)=>{setSelected('');setFilters(f=>({...f,[key]:value,...(key==='farm'?{greenhouse:''}:{})}))}
 const shift=(n:number)=>{const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);setMonth(d.toISOString().slice(0,7));setSelected('')}
 const status=(r:any)=>['soumise','approuvee'].includes(r.status)&&treatmentDay(r.planned_at)&&treatmentDay(r.planned_at)<today?'retard':r.status
 const select=(key:keyof typeof blank,label:string,options:{id:string;name:string}[])=> <label className="text-caption" key={key}>{label}<select aria-label={cultural?`Filtre calendrier : ${label}`:label} className="block w-full rounded border border-border bg-surface-raised p-2 mt-1" value={filters[key]} onChange={e=>change(key,e.target.value)}><option value="">Tous</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 const agenda=(selected?visible:filtered.filter(r=>treatmentDay(r.planned_at).startsWith(month))).slice().sort((a,b)=>String(a.planned_at).localeCompare(String(b.planned_at)))
 const filterPanel = <Card><h2 className="font-bold mb-3">{cultural?'Filtrer et trier les interventions':'Filtrer et trier les traitements'}</h2><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
   {select('farm','Ferme',farms)}
   {select('greenhouse','Serre',places.filter(p=>!filters.farm||p.farm_id===filters.farm))}
   {select('target',cultural?'Programme':'Cible',names(requests.flatMap(r=>[r.target_name,...treatmentLines(r).map((p:any)=>p.target_name)])).map(name=>({id:name,name})))}
   {select('product','Produit',names(requests.flatMap(r=>treatmentLines(r).map((p:any)=>p.stock_items?.name||p.product_name))).map(name=>({id:name,name})))}
   {select('status','Statut',[...Object.entries(displayLabels).map(([id,name])=>({id,name})),{id:'actifs',name:'À valider ou à confirmer'}])}
   {select('stock','Disponibilité du stock',[{id:'disponible',name:'Disponible'},{id:'manquant',name:'Manquant / partiel'},{id:'inconnu',name:'Non calculé'}])}
   {(['from','to'] as const).map(key=><label key={key} className="text-caption">{key==='from'?'Du':'Au'}<input aria-label={key==='from'?'Du':'Au'} type="date" className="block w-full rounded border border-border bg-surface-raised p-2 mt-1" value={filters[key]} onChange={e=>change(key,e.target.value)}/></label>)}
  </div><div className="flex flex-wrap items-center gap-3 mt-3"><label className="text-caption">Trier par <select aria-label="Trier les traitements" value={filters.sort} onChange={e=>change('sort',e.target.value)} className="border border-border rounded bg-surface-raised p-2"><option value="desc">Date — plus récente à plus ancienne</option><option value="asc">Date — plus ancienne à plus récente</option><option value="greenhouse_asc">Serre — A à Z</option><option value="greenhouse_desc">Serre — Z à A</option><option value="target_asc">Cible — A à Z</option><option value="target_desc">Cible — Z à A</option><option value="status_asc">Statut — A à Z</option></select></label><Button variant="ghost" onClick={()=>{setFilters(blank);setSelected('')}}>{cultural?'Réinitialiser le calendrier':'Réinitialiser les filtres'}</Button><span className="text-caption">{visible.length} traitement(s) affiché(s)</span></div>
  {filters.from&&filters.to&&filters.from>filters.to&&<p role="alert" className="text-danger">La date de fin doit être postérieure à la date de début.</p>}</Card>
 return <div className="space-y-4">
  <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
   <Card padding="none" className="overflow-hidden"><div className="p-3 border-b border-border"><h2 className="flex items-center gap-2 font-bold"><Calendar size={14} className="text-info"/>{cultural?'Calendrier des interventions':'Calendrier des traitements'}</h2><div className="flex items-center justify-between mt-2"><Button variant="ghost" size="icon-sm" aria-label="Mois précédent" onClick={()=>shift(-1)}><ChevronLeft size={14}/></Button><span className="text-caption capitalize">{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'})}</span><Button variant="ghost" size="icon-sm" aria-label="Mois suivant" onClick={()=>shift(1)}><ChevronRight size={14}/></Button></div></div>
    <div className="p-3"><div className="grid grid-cols-7 gap-1">{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=><span className="text-[10px] text-center text-fg-tertiary" key={d}>{d}</span>)}{calendarDays(month).map(day=>{const events=filtered.filter(r=>treatmentDay(r.planned_at)===day);return <button type="button" key={day} aria-pressed={selected===day} aria-label={`${day} : ${events.length} traitement(s)`} onClick={()=>setSelected(selected===day?'':day)} className={`aspect-square rounded border p-1 text-left text-xs ${selected===day?'border-brand bg-brand/10':day===today?'border-brand':'border-border'} ${day.startsWith(month)?'':'opacity-40'}`}><span>{Number(day.slice(-2))}</span><span className="flex flex-wrap gap-0.5">{events.slice(0,3).map(r=><span key={r.id} className={`w-1.5 h-1.5 rounded-full ${colors[status(r)]||'bg-fg-tertiary'}`}/>)}{events.length>3&&<span className="text-[8px]">+{events.length-3}</span>}</span></button>})}</div>
    <div className="flex flex-wrap gap-2 mt-3 text-[10px]">{Object.entries(displayLabels).map(([key,label])=><span key={key} className="flex items-center gap-1"><i className={`w-1.5 h-1.5 rounded-full ${colors[key]}`}/>{label}</span>)}</div><Button variant="ghost" size="xs" onClick={()=>{setMonth(today.slice(0,7));setSelected('')}}>Aujourd’hui</Button></div>
   </Card>
   <Card><h2 className="font-bold">{selected?`Traitements du ${selected.split('-').reverse().join('/')}`:'Traitements du mois'}</h2><p className="text-caption text-fg-tertiary">Dates prévues · heure de Casablanca · filtres appliqués</p><div className="max-h-80 overflow-auto divide-y divide-border mt-3">{agenda.length===0?<p className="py-4 text-caption">Aucun traitement sur cette période avec ces filtres.</p>:agenda.map(r=><button type="button" key={r.id} className="w-full text-left py-3 hover:bg-brand/5" onClick={()=>{setSelected(treatmentDay(r.planned_at));document.getElementById('treatment-list')?.scrollIntoView({behavior:'smooth',block:'start'})}}><div className="flex flex-wrap justify-between gap-2"><strong>{r.target_name||'Traitement'}</strong><span className="text-caption">{treatmentDay(r.planned_at).split('-').reverse().join('/')} · {displayLabels[status(r)]||r.status}</span></div><p className="text-caption">{treatmentPlaces(r,plantings).map(p=>p.name).join(', ')||'Serre non renseignée'}</p><p className="text-caption text-fg-tertiary">{treatmentLines(r).map((p:any)=>p.stock_items?.name||p.product_name).filter(Boolean).join(', ')}</p></button>)}</div></Card>
  </div>
  <div id="treatment-list" tabIndex={-1} className="space-y-3 scroll-mt-20 focus:outline-none">{filterPanel}{selected&&<div className="flex items-center gap-3 mb-3"><span>Liste du {selected.split('-').reverse().join('/')}</span><Button variant="ghost" onClick={()=>setSelected('')}>Afficher toutes les dates</Button></div>}{children(visible)}</div>
 </div>
}
