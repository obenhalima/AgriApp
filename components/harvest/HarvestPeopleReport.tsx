'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {defaultAgroCampaign} from '@/lib/agronomy360'
import {harvestPeopleMetrics,resolveHarvestPersonTarget} from '@/lib/harvestPeople'
import {Input,Select} from '@/components/ui/Input'
import {Button} from '@/components/ui/Button'
import {HarvestPeopleSummary} from './HarvestPeopleSummary'
const fmt=(n:number|null)=>n==null?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})
async function read(table:string,select:string,domain:string){
 const rows:any[]=[]
 for(let i=0;;i+=500){const r=await supabase.from(table).select(select).eq('domain_id',domain).order('id').range(i,i+499);if(r.error)throw r.error;rows.push(...r.data||[]);if(!r.data||r.data.length<500)return rows}
}
export function HarvestPeopleReport(){
 const {activeDomain,loading:authLoading,hasPermission}=useAuth(),domain=activeDomain?.domain_id
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
 const [campaign,setCampaign]=useState(''),[farm,setFarm]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('')
 const [target,setTarget]=useState({farm:'',date:'',rate:''})
 const allowed=hasPermission('pointage','view')||hasPermission('productivite','view')
 useEffect(()=>{setFarm('');setCampaign('');setTarget({farm:'',date:'',rate:''})},[domain])
 useEffect(()=>{
  if(authLoading||!domain||!allowed)return
  let stale=false;setData(null);setError('')
  Promise.all([read('farms','id,name',domain),read('campaigns','*',domain),read('harvests','*,campaign_plantings(campaign_id,greenhouses(code,farm_id))',domain),read('harvest_person_targets','*',domain)])
   .then(([farms,campaigns,harvests,targets])=>{if(stale)return;setData({farms,campaigns,harvests,targets});setCampaign(c=>campaigns.some(x=>x.id===c)?c:defaultAgroCampaign(campaigns,new Date().toISOString().slice(0,10)).id)})
   .catch(e=>{if(!stale)setError(e.message)});return()=>{stale=true}
 },[domain,authLoading,allowed,refresh])
 if(authLoading)return <p>Chargement…</p>
 if(!allowed)return <p>Accès productivité ou pointage requis.</p>
 if(!domain)return <p>Sélectionnez un client.</p>
 const rows=(data?.harvests||[]).filter((h:any)=>h.campaign_plantings?.campaign_id===campaign&&(!farm||h.campaign_plantings?.greenhouses?.farm_id===farm)&&(!from||h.harvest_date>=from)&&(!to||h.harvest_date<=to)).map((h:any)=>{
  const resolved=resolveHarvestPersonTarget(h.harvest_person_target,h.campaign_plantings?.greenhouses?.farm_id,h.harvest_date,data?.targets||[])
  return {...h,harvest_person_target:resolved.rate,target_derived:resolved.derived}
 })
 const missing=rows.filter((h:any)=>!h.harvest_people).length
 const save=async()=>{setBusy(true);setError('');try{const r=await supabase.rpc('set_harvest_person_target',{p_farm:target.farm,p_from:target.date,p_rate:Number(target.rate)});if(r.error)throw r.error;setRefresh(n=>n+1)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <div className="space-y-4">
  <h1 className="text-2xl font-bold">Récolte · Productivité par personne</h1>
  <p>Saisissez l’effectif directement dans Récoltes. Aucune équipe n’est requise.</p>
  <Link href="/recoltes" className="inline-block rounded-lg bg-brand px-4 py-3 text-white">Saisir ou compléter une récolte →</Link>
  {error&&<p role="alert" className="rounded-lg bg-danger/10 p-3">{error} — Si harvest_person_targets ou les nouveaux champs sont absents, appliquer la migration 138.</p>}
  <Button onClick={()=>setRefresh(n=>n+1)}>Actualiser</Button>
  {!data&&!error&&<p>Chargement des récoltes…</p>}
  {data&&<>
   <div className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
    <label>Campagne<Select value={campaign} onChange={e=>setCampaign(e.target.value)}>{data.campaigns.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
    <label>Ferme<Select value={farm} onChange={e=>setFarm(e.target.value)}><option value="">Toutes les fermes</option>{data.farms.map((f:any)=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
    <label>Du<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Au<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <HarvestPeopleSummary rows={rows}/>
   {rows.some((h:any)=>h.target_derived)&&<p className="text-sm text-fg-secondary">Objectifs complétés à l’affichage selon la ferme et la date d’effet lorsqu’aucun objectif n’était conservé à la saisie. Les objectifs historiques déjà renseignés restent inchangés ; aucune récolte n’est modifiée.</p>}
   <h2 className="text-lg font-bold">Détail des récoltes</h2>
   <p>{rows.length} récolte(s) · {missing} sans effectif. Les ratios portent sur chaque récolte, pas sur un effectif unique consolidé. Les kilos enregistrés peuvent être estimés, avant tri station.</p>
   <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised p-4"><table className="w-full text-sm [&_td]:p-3 [&_th]:p-3 [&_td]:whitespace-nowrap"><thead><tr>{['Date / lot','Serre','Kg','Personnes','Kg/personne','Kg/h-personne','Objectif kg/personne/jour','Atteinte'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{rows.map((h:any)=>{
    const m=harvestPeopleMetrics(Number(h.total_qty),h.harvest_people,Number(h.harvest_hours)||null,h.harvest_full_day,Number(h.harvest_person_target)||null)
    return <tr key={h.id} className="border-t border-border"><td>{h.harvest_date}<br/>{h.lot_number}</td><td>{h.campaign_plantings?.greenhouses?.code}</td><td>{fmt(Number(h.total_qty))}</td><td>{h.harvest_people??'Non renseigné'}</td><td>{fmt(m.perPerson)}</td><td>{fmt(m.perHour)}</td><td>{fmt(h.harvest_person_target==null?null:Number(h.harvest_person_target))}</td><td>{m.attainment==null?(h.harvest_full_day?'Objectif ou effectif absent':'Journée complète non déclarée'):fmt(m.attainment)+' %'}</td></tr>
   })}</tbody></table>{!rows.length&&<p>Aucune récolte sur ce périmètre.</p>}</div>
   {hasPermission('pointage','edit')&&<details className="rounded-xl border border-border bg-surface-raised p-4"><summary className="font-bold cursor-pointer">Objectif journalier par personne</summary>
    <p className="my-3 text-sm">Objectif par ferme, sans distinction d’équipe. Les objectifs déjà conservés restent inchangés. Si l’objectif était absent à la saisie, celui applicable à la date de récolte est utilisé à l’affichage. La comparaison nécessite de déclarer que la saisie couvre toute la journée de ces personnes.</p>
    <div className="grid gap-3 sm:grid-cols-3"><label>Ferme de l’objectif<Select value={target.farm} onChange={e=>setTarget({...target,farm:e.target.value})}><option value="">Choisir</option>{data.farms.map((f:any)=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label><label>Date d’effet<Input type="date" value={target.date} onChange={e=>setTarget({...target,date:e.target.value})}/></label><label>Kg par personne / jour<Input type="number" min="0.01" step="0.01" value={target.rate} onChange={e=>setTarget({...target,rate:e.target.value})}/></label></div>
    <Button className="mt-3" disabled={busy||!target.farm||!target.date||!(Number(target.rate)>0)} onClick={save}>Enregistrer l’objectif</Button>
    <ul className="mt-3">{data.targets.map((t:any)=><li key={t.id}>{data.farms.find((f:any)=>f.id===t.farm_id)?.name} · {t.effective_from} · {fmt(Number(t.kg_per_person_day))} kg/personne/jour</li>)}</ul>
   </details>}
  </>}
 </div>
}
