'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { defaultAgroCampaign } from '@/lib/agronomy360'
import { harvestPerformance, harvestGroups, harvestTarget, type HarvestWork } from '@/lib/harvestProductivity'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { HarvestPeopleReport } from '@/components/harvest/HarvestPeopleReport'
import { Input, Select } from '@/components/ui/Input'

const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})
const today = () => new Date().toLocaleDateString('en-CA')
async function all(table: string, select: string, domain: string, field='domain_id'): Promise<any[]> {
  const rows: any[]=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await supabase.from(table).select(select).eq(field,domain).order('id').range(offset,offset+499)
    if(error) throw new Error(`${table} : ${error.message}`)
    rows.push(...(data||[])); if(!data||data.length<500)return rows
  }
}
type Allocation = HarvestWork & {harvest_id:string;greenhouse_id:string;campaign_id:string;worker_count:number;hours_per_person:number}
export default function HarvestLaborPage(){
 const [teams,setTeams]=useState(false)
 return <div className="space-y-5"><Button onClick={()=>setTeams(v=>!v)}>{teams?'Revenir à la saisie par personne':'Historique / mode avancé par équipe'}</Button>{teams?<HarvestTeamPage/>:<HarvestPeopleReport/>}</div>
}
function HarvestTeamPage(){
  const {activeDomain,loading:authLoading,hasPermission}=useAuth()
  const domain=activeDomain?.domain_id
  const allowed=hasPermission('pointage','view')
  const canCreate=hasPermission('pointage','create'), canEdit=hasPermission('pointage','edit')
  const [data,setData]=useState<{farms:any[];campaigns:any[];greenhouses:any[];plantings:any[];harvests:any[];teams:any[];targets:any[];rows:Allocation[]}|null>(null)
  const [campaign,setCampaign]=useState(''),[farm,setFarm]=useState(''),[teamFilter,setTeamFilter]=useState('')
  const [from,setFrom]=useState(''),[to,setTo]=useState('')
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const [form,setForm]=useState({id:'',harvest:'',team:'',count:'',hours:'',kg:'',notes:''})
  const [target,setTarget]=useState({farm:'',from:today(),rate:''})
  useEffect(()=>{
    if(authLoading||!domain||!allowed)return
    let stale=false
    setLoading(true);setError('');setData(null)
    Promise.all([
      all('farms','id,name',domain),all('campaigns','id,name,status,preparation_start,planting_start,campaign_end',domain),
      all('greenhouses','id,code,farm_id,farms!inner(domain_id)',domain,'farms.domain_id'),all('campaign_plantings','id,campaign_id,greenhouse_id',domain),
      all('harvests','id,lot_number,harvest_date,total_qty,campaign_planting_id',domain),
      all('teams','id,name,farm_id,farms!inner(domain_id)',domain,'farms.domain_id'),
      all('harvest_labor_targets','*',domain),all('harvest_labor_allocations','*',domain)
    ]).then(([farms,campaigns,greenhouses,plantings,harvests,teams,targets,rows])=>{
      if(stale)return
      setData({farms,campaigns,greenhouses,plantings,harvests,teams,targets,rows})
      setCampaign(prev=>campaigns.some(c=>c.id===prev)?prev:defaultAgroCampaign(campaigns,today()).id)
    }).catch(e=>{if(!stale)setError(e.message)})
      .finally(()=>{if(!stale)setLoading(false)})
    return()=>{stale=true}
  },[domain,authLoading,allowed,revision])
  useEffect(()=>{setCampaign('');setFarm('');setTeamFilter('');setForm({id:'',harvest:'',team:'',count:'',hours:'',kg:'',notes:''});setTarget({farm:'',from:today(),rate:''})},[domain])
  const harvests=useMemo(()=> (data?.harvests||[]).map(h=>{
    const p=data?.plantings.find(p=>p.id===h.campaign_planting_id),g=data?.greenhouses.find(g=>g.id===p?.greenhouse_id)
    const allocated=(data?.rows||[]).filter(r=>r.harvest_id===h.id&&!r.cancelled_at).reduce((s,r)=>s+Number(r.quantity_kg),0)
    return {...h,campaign:p?.campaign_id,farm:g?.farm_id,greenhouse:g?.code,remaining:Math.max(0,Number(h.total_qty)-allocated)}
  }).filter(h=>h.campaign===campaign&&(!farm||h.farm===farm)&&(!from||h.harvest_date>=from)&&(!to||h.harvest_date<=to)),[data,campaign,farm,from,to])
  const rows=(data?.rows||[]).filter(r=>!r.cancelled_at&&r.campaign_id===campaign&&(!farm||r.farm_id===farm)&&(!teamFilter||r.team_id===teamFilter)&&(!from||r.work_date>=from)&&(!to||r.work_date<=to))
  const totals=harvestPerformance(rows), groups=harvestGroups(rows,'team_id')
  const h=harvests.find(h=>h.id===form.harvest)
  const rate=h?harvestTarget(data?.targets||[],h.farm,h.harvest_date):null
  const hours=Number(form.count)*Number(form.hours)
  const selectedTeams=(data?.teams||[]).filter(t=>t.farm_id===h?.farm)
  const change=(key:string,value:string)=>setForm(f=>({...f,[key]:value,id:crypto.randomUUID()}))
  const run=async(task:()=>PromiseLike<{error:any}>,success:string)=>{
    setBusy(true);setError('');setMessage('')
    try{const {error}=await task();if(error)throw error;setMessage(success);setRevision(r=>r+1);return true}
    catch(e:any){setError(e.message||'Enregistrement impossible');return false}finally{setBusy(false)}
  }
  const save=async()=>{
    if(!h||!selectedTeams.some(t=>t.id===form.team)||!Number.isInteger(Number(form.count))||Number(form.count)<1||Number(form.count)>10000||!(Number(form.hours)>0&&Number(form.hours)<=24)||!(Number(form.kg)>0&&Number(form.kg)<=h.remaining)){
      setError('Choisissez la récolte et son équipe, un effectif entier, des heures entre 0 et 24, et des kilos dans le solde disponible.');return
    }
    const id=form.id||crypto.randomUUID();setForm(f=>({...f,id}))
    if(await run(()=>supabase.rpc('record_harvest_labor',{p_id:id,p_harvest:h.id,p_team:form.team,p_count:Number(form.count),p_hours:Number(form.hours),p_kg:Number(form.kg),p_notes:form.notes||null}),'Pointage récolte enregistré.'))setForm({id:'',harvest:'',team:'',count:'',hours:'',kg:'',notes:''})
  }
  if(authLoading)return <p>Chargement des habilitations…</p>
  if(!allowed)return <p role="alert">Accès au pointage requis.</p>
  if(!domain)return <p role="alert">Sélectionnez un client pour consulter le pointage récolte.</p>
  return <div className="space-y-5 [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap">
    <Link href="/pointage" className="text-brand underline">Retour au pointage</Link>
    <PageHeader title="Productivité récolte" subtitle="Production" icon={Users} description="Des kilos attribués, des heures réellement pointées, des objectifs historisés." />
    {error&&<p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4">{error}</p>}
    {from&&to&&from>to&&<p role="alert" className="text-danger">La date de début doit précéder la date de fin.</p>}
    {message&&<p role="status" className="rounded-xl bg-success/10 p-4">{message}</p>}
    <section className="rounded-xl border border-border bg-surface-raised p-4 grid gap-3 sm:grid-cols-3">
      <label>Campagne<Select value={campaign} onChange={e=>{setCampaign(e.target.value);change('harvest','')}}>{data?.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}{c.status==='en_cours'?' · En cours':''}</option>)}</Select></label>
      <label>Ferme<Select value={farm} onChange={e=>{setFarm(e.target.value);setTeamFilter('');change('harvest','')}}><option value="">Toutes les fermes</option>{data?.farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
      <label>Équipe (analyse)<Select value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">Toutes les équipes</option>{data?.teams.filter(t=>!farm||t.farm_id===farm).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
      <label>Du<Input type="date" value={from} onChange={e=>{setFrom(e.target.value);change('harvest','')}}/></label>
      <label>Au<Input type="date" value={to} onChange={e=>{setTo(e.target.value);change('harvest','')}}/></label>
      <Button disabled={loading||busy} onClick={()=>setRevision(r=>r+1)}>Actualiser</Button>
    </section>
    {loading?<p role="status">Chargement des récoltes et du pointage…</p>:data&&<>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Kilos attribués',fmt(totals.kg)+' kg'],['Heures-personnes',fmt(totals.hours)+' h'],['Productivité',fmt(totals.rate)+' kg/h-personne'],['Objectif atteint',totals.attainment==null?'Objectif non renseigné':fmt(totals.attainment)+' %']].map(([label,value])=><div key={label} className="rounded-xl border border-border bg-surface-raised p-5"><p className="text-fg-secondary text-sm">{label}</p><strong className="text-xl text-brand">{value}</strong></div>)}</div>
      <p className="text-sm text-fg-secondary">Analyse limitée aux récoltes explicitement rapprochées ci-dessous. Les anciens pointages ne sont pas attribués automatiquement. Les kilos sont ceux enregistrés dans Récoltes, avant tri station ; ils peuvent être estimés. {totals.missingTargets>0&&`${totals.missingTargets} pointage(s) sans objectif exclus du pourcentage d’atteinte.`}</p>
      <p className="text-sm">Kilos restant à attribuer sur la période et la ferme, toutes équipes : <b>{fmt(harvests.reduce((s,h)=>s+h.remaining,0))} kg</b>.</p>
      {canCreate&&<section className="rounded-xl border border-border bg-surface-raised p-5 space-y-3">
        <h2 className="font-bold">Pointer une équipe sur une récolte</h2>
        <p className="text-sm text-fg-secondary">Crée également le pointage général : ne ressaisissez pas les mêmes heures dans « Pointer ». Si une équipe travaille sur plusieurs récoltes, répartissez ses heures entre elles.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Récolte *<Select value={form.harvest} onChange={e=>setForm(f=>({...f,id:crypto.randomUUID(),harvest:e.target.value,team:'',kg:''}))}><option value="">Sélectionner une récolte</option>{harvests.filter(h=>h.remaining>0).map(h=><option key={h.id} value={h.id}>{h.harvest_date} · {h.greenhouse} · {h.lot_number} · reste {fmt(h.remaining)} kg</option>)}</Select></label>
          <label>Équipe *<Select value={form.team} onChange={e=>change('team',e.target.value)}><option value="">Sélectionner l’équipe de cette ferme</option>{selectedTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
          <label>Effectif présent *<Input type="number" min="1" max="10000" step="1" value={form.count} onChange={e=>change('count',e.target.value)}/></label>
          <label>Heures travaillées par personne, hors pauses *<Input type="number" min="0.01" max="24" step="0.01" value={form.hours} onChange={e=>change('hours',e.target.value)}/></label>
          <label>Kilos de cette récolte attribués à l’équipe *<Input type="number" min="0.01" max={h?.remaining} step="0.01" value={form.kg} onChange={e=>change('kg',e.target.value)}/></label>
          <label>Observations<Input value={form.notes} onChange={e=>change('notes',e.target.value)}/></label>
        </div>
        {!h&&<p className="text-sm text-fg-secondary">Choisissez d’abord une récolte pour afficher les équipes de sa ferme.</p>}
        {h&&selectedTeams.length===0&&<p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3">Aucune équipe accessible pour cette ferme. Une équipe doit être déclarée et rattachée à cette ferme avant le pointage collectif ; des employés seuls ne constituent pas une équipe.</p>}
        {h&&<p className="rounded-lg bg-brand/5 p-3">{fmt(hours)} heures-personnes · Objectif : {rate==null?'non renseigné':fmt(Number(rate))+' kg/h-personne'} · Attendu : {rate==null?'—':fmt(hours*Number(rate))+' kg'}</p>}
        <Button disabled={busy||!h||!selectedTeams.length} onClick={save}>{busy?'Enregistrement…':'Enregistrer le pointage récolte'}</Button>
      </section>}
      {canEdit&&<details className="rounded-xl border border-border bg-surface-raised p-5"><summary className="cursor-pointer font-bold">Objectifs de récolte par ferme</summary>
        <p className="my-3 text-sm">Un objectif s’applique aux nouvelles saisies dont la date de récolte est à partir de sa date d’effet. Les objectifs des pointages déjà enregistrés sont conservés. Une seule version par ferme et date d’effet.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Ferme de l’objectif<Select value={target.farm} onChange={e=>setTarget({...target,farm:e.target.value})}><option value="">Sélectionner</option>{data.farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
          <label>Date d’effet<Input type="date" value={target.from} onChange={e=>setTarget({...target,from:e.target.value})}/></label>
          <label>Objectif kg/h-personne<Input type="number" min="0.01" step="0.01" value={target.rate} onChange={e=>setTarget({...target,rate:e.target.value})}/></label>
        </div><Button className="mt-3" disabled={busy||!target.farm||!target.from||!(Number(target.rate)>0)} onClick={()=>run(()=>supabase.rpc('set_harvest_labor_target',{p_farm:target.farm,p_from:target.from,p_rate:Number(target.rate)}),'Nouvelle version de l’objectif enregistrée.')}>Enregistrer l’objectif</Button>
        <ul className="mt-3 text-sm space-y-1">{data.targets.filter(t=>!farm||t.farm_id===farm).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)).map(t=><li key={t.id}>{data.farms.find(f=>f.id===t.farm_id)?.name} · Depuis le {t.effective_from} : {fmt(Number(t.kg_per_person_hour))} kg/h-personne</li>)}</ul>
      </details>}
      <section className="rounded-xl border border-border bg-surface-raised p-5 space-y-3"><h2 className="font-bold">Comparaison des équipes</h2>
        {!groups.length?<p>Aucun pointage récolte rapproché sur ce périmètre.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Équipe','Ferme','Kg','Heures-personnes','Kg/h-personne','Atteinte objectif'].map(x=><th key={x} className="text-left p-2">{x}</th>)}</tr></thead><tbody>{groups.map(g=><tr key={g.id} className="border-t border-border"><td className="p-2">{data.teams.find(t=>t.id===g.id)?.name||'Équipe inconnue'}</td><td>{data.farms.find(f=>f.id===data.teams.find(t=>t.id===g.id)?.farm_id)?.name}</td><td>{fmt(g.kg)}</td><td>{fmt(g.hours)}</td><td>{fmt(g.rate)}</td><td>{g.attainment==null?'Non renseigné':fmt(g.attainment)+' %'}{g.missingTargets>0&&' · partiel'}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="rounded-xl border border-border bg-surface-raised p-5 space-y-3"><h2 className="font-bold">Détail des pointages récolte</h2>{rows.map(r=><div key={r.id} className="flex flex-wrap justify-between gap-3 border-t border-border py-3"><div>{r.work_date} · {data.teams.find(t=>t.id===r.team_id)?.name} · {data.harvests.find(h=>h.id===r.harvest_id)?.lot_number}<p className="text-sm text-fg-secondary">{r.worker_count} personnes × {fmt(Number(r.hours_per_person))} h · {fmt(Number(r.quantity_kg))} kg · Objectif conservé : {r.target_rate==null?'non renseigné':fmt(Number(r.target_rate))+' kg/h-personne'}</p></div>{canEdit&&<Button disabled={busy} onClick={()=>{if(confirm('Annuler cette attribution et son pointage ? Les kilos redeviendront disponibles.'))void run(()=>supabase.rpc('cancel_harvest_labor',{p_id:r.id}),'Attribution annulée ; historique conservé.')}}>Annuler</Button>}</div>)}</section>
    </>}
  </div>
}
