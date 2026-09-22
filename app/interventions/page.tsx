'use client'

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { Droplets, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { decimal, interventionTypes, irrigationDates, irrigationStatus, waterFormat, waterVolume, type WaterMode } from '@/lib/irrigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import CulturalPage from './programmes/page'

function FormGroup({label,children}:{label:string;children:ReactNode}) {
  const id=useId()
  const field=isValidElement(children)&&[Input,Select,Textarea].includes(children.type as any)
  return <div className="form-group"><label className="form-label" htmlFor={field?id:undefined}>{label}</label>{field?cloneElement(children as ReactElement<any>,{id}):children}</div>
}

type Farm = {id:string;name:string;can_plan:boolean;can_validate:boolean;can_execute:boolean}
type Workspace = {validation_enabled:boolean;can_configure:boolean;farms:Farm[];campaigns:any[];greenhouses:any[];programs:any[]}
const blankWater = {volume:'',minutes:'',flow:'',before:'',after:''}
const dateLabel = (s:string) => new Date(s).toLocaleString('fr-FR')
async function rpc(name:string, args:Record<string,unknown>) {
  const result = await withDeadline(signal => supabase.rpc(name,args).abortSignal(signal),25000,'Délai dépassé. Actualisez pour vérifier le résultat ; une opération peut avoir abouti.')
  if(result.error) throw result.error
  return result.data
}
function waterPayload(mode:WaterMode, values:typeof blankWater) {
  waterVolume(mode,values)
  const keys = mode==='volume'?['volume']:mode==='duration'?['minutes','flow']:['before','after']
  return {mode,...Object.fromEntries(keys.map(k=>[k,decimal(values[k as keyof typeof values])]))}
}
function WaterFields({mode,setMode,values,setValues,actual=false}:{mode:WaterMode;setMode:(m:WaterMode)=>void;values:typeof blankWater;setValues:(v:typeof blankWater)=>void;actual?:boolean}) {
  let calculated:string='—'
  try {calculated=waterFormat(waterVolume(mode,values))+' L'} catch {}
  const fields = mode==='volume'?[['volume','Volume global (L)']]:mode==='duration'?[['minutes','Durée (minutes)'],['flow','Débit total (L/h)']]:[['before','Compteur avant (m³)'],['after','Compteur après (m³)']]
  return <div className="space-y-3">
    <FormGroup label="Méthode de détermination du volume"><Select value={mode} onChange={e=>setMode(e.target.value as WaterMode)}><option value="volume">Volume saisi</option><option value="duration">Estimation durée × débit</option>{actual&&<option value="meter">Mesure par compteur</option>}</Select></FormGroup>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key,label])=><FormGroup key={key} label={label+' *'}><Input required inputMode="decimal" value={values[key as keyof typeof values]} onChange={e=>setValues({...values,[key]:e.target.value})}/></FormGroup>)}</div>
    <p className="text-sm text-fg-secondary">{mode==='meter'?'Mesuré':mode==='duration'?'Estimé':'Saisi'} : <strong>{calculated}</strong>. Volume global pour toutes les serres sélectionnées, par occurrence. Aucun volume par hectare n’est supposé.</p>
  </div>
}
export default function InterventionsPage(){
  const {activeDomain,user}=useAuth()
  const [view,setView]=useState<'cultural'|'water'>('cultural')
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('programme'))setView('water')},[])
  if(!activeDomain||!user)return <p>Sélectionnez une société.</p>
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Button variant={view==='cultural'?'primary':'secondary'} onClick={()=>setView('cultural')}>Fertigation et interventions</Button><Button variant={view==='water'?'primary':'secondary'} onClick={()=>setView('water')}>Irrigation — eau seule</Button></div>{view==='cultural'?<CulturalPage/>:<IrrigationWorkspace key={`${activeDomain.domain_id}:${user.id}`} domain={activeDomain.domain_id} userId={user.id}/>}</div>
}
function IrrigationWorkspace({domain,userId}:{domain:string;userId:string}){
  const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false)
  const generation=useRef(0),alive=useRef(true)
  const [farmFilter,setFarmFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[search,setSearch]=useState('')
  const [modal,setModal]=useState(false),[programId,setProgramId]=useState(''),[actualId,setActualId]=useState('')
  const [mode,setMode]=useState<WaterMode>('volume'),[water,setWater]=useState(blankWater)
  const [actualMode,setActualMode]=useState<WaterMode>('meter'),[actualWater,setActualWater]=useState(blankWater),[performed,setPerformed]=useState(''),[actualNotes,setActualNotes]=useState('')
  const [comment,setComment]=useState(''),[formError,setFormError]=useState('')
  const [form,setForm]=useState({title:'',farm_id:'',campaign_id:'',greenhouse_ids:[] as string[],sector:'',water_source:'',notes:''})
  const [schedule,setSchedule]=useState<'single'|'exact_dates'|'recurring'>('single'),[dates,setDates]=useState(['']),[frequency,setFrequency]=useState('daily'),[interval,setInterval]=useState(1),[count,setCount]=useState(5)
  // Keep the same immutable intent after a network timeout; a retry cannot create a duplicate.
  const pending=useRef<{id:string;input:Record<string,unknown>}|null>(null)
  const load=useCallback(async()=>{
    const serial=++generation.current;setLoading(true)
    try{const result=await rpc('irrigation_workspace',{p_domain:domain});if(alive.current&&serial===generation.current){setData(result);setError('')}}
    catch(e:any){if(alive.current&&serial===generation.current)setError(e.message||'Chargement impossible')}
    finally{if(alive.current&&serial===generation.current)setLoading(false)}
  },[domain])
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;generation.current++}},[load])
  const openedLink=useRef(false)
  useEffect(()=>{
    if(!data||openedLink.current)return
    const requested=new URLSearchParams(window.location.search).get('programme')
    if(!requested)return
    openedLink.current=true
    if(data.programs.some(p=>p.id===requested))setProgramId(requested)
    else setError('Programme introuvable dans la société sélectionnée. Vérifiez la société ou vos droits.')
  },[data])
  async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);setFormError('');try{await work();if(alive.current)await load()}catch(e:any){if(alive.current){setFormError(e.message||'Opération impossible');setError(e.message||'Opération impossible')}}finally{if(alive.current)setBusy(false)}}
  async function create(){await run(async()=>{
    if(!pending.current){
      if(form.title.trim().length<3||!form.farm_id||!form.campaign_id||!form.greenhouse_ids.length||!form.water_source.trim())throw new Error('Complétez le titre, la ferme, la campagne, les serres et la source d’eau.')
      const planned=irrigationDates(schedule,dates,frequency,interval,count)
      if(planned.some(d=>new Date(d).getTime()<=Date.now()))throw new Error('Toutes les dates prévues doivent être futures.')
      pending.current={id:crypto.randomUUID(),input:{...form,domain_id:domain,dates:planned,water:waterPayload(mode,water),schedule:{mode:schedule,frequency,interval,count}}}
    }
    const id=await rpc('save_irrigation_program',{p_id:pending.current.id,p_input:pending.current.input})
    if(alive.current){pending.current=null;setModal(false);setProgramId(id);setForm({...form,title:'',greenhouse_ids:[]});setDates(['']);setWater(blankWater)}
  })}
  const programs=(data?.programs||[]).filter(p=>(!farmFilter||p.farm_id===farmFilter)&&(!statusFilter||p.status===statusFilter)&&(!search||p.title.toLowerCase().includes(search.toLowerCase())))
  const selected=data?.programs.find(p=>p.id===programId)
  const selectedFarm=data?.farms.find(f=>f.id===selected?.farm_id)
  const canCancel=selected&&(selectedFarm?.can_validate||(selected.requested_by===userId&&selectedFarm?.can_plan))
  const occurrence=selected?.occurrences.find((o:any)=>o.id===actualId)
  const occurrences=programs.flatMap(p=>p.occurrences.map((o:any)=>({...o,status:p.status,planned_liters:p.planned_liters})))
  const overdue=occurrences.filter(o=>o.status==='approuvee'&&!o.confirmed_at&&new Date(o.planned_at).getTime()<Date.now()).length
  const farmGreenhouses=data?.greenhouses.filter(g=>g.farm_id===form.farm_id)||[]
  let schedulePreview:string[]=[]
  try{schedulePreview=irrigationDates(schedule,dates,frequency,interval,count)}catch{}
  async function action(name:string){await run(async()=>{await rpc('irrigation_program_action',{p_id:programId,p_action:name,p_comment:comment});if(alive.current)setComment('')})}
  return <div className="space-y-4">
    <PageHeader title="Interventions culturales" subtitle="Irrigation — planification et réalisé" icon={Droplets} iconColor="#0891b2" description="Premier lot : eau seule. Les produits restent dans leurs parcours spécialisés."
      actions={<><Button variant="ghost" disabled={busy||loading} onClick={load}>{loading?'Chargement…':'Actualiser'}</Button><Button disabled={!data?.farms.some(f=>f.can_plan)||busy} onClick={()=>{setFormError('');setModal(true)}}><Plus size={16}/>Programme d’irrigation</Button></>}
      stats={[{label:'Programmes filtrés',value:programs.length},{label:'À valider',value:programs.filter(p=>p.status==='soumise').length},{label:'Occurrences en retard',value:overdue},{label:'Eau réalisée (L)',value:waterFormat(occurrences.reduce((s,o)=>s+Number(o.actual_liters||0),0))}]}/>
    {error&&<div role="alert" className="rounded border border-danger/40 bg-danger/10 p-4 text-danger">{error}{/irrigation_workspace|schema cache/i.test(error)&&<p>La migration 133 doit être appliquée sur Supabase avant d’utiliser cet écran. Ne relancez pas de migration déjà appliquée.</p>}</div>}
    <Card><details><summary className="cursor-pointer font-semibold">Familles d’interventions prévues</summary><p className="my-2 text-sm">Référentiel de cadrage, pas un programme de traitements obligatoire. Un produit appliqué via l’irrigation garde ses contrôles propres.</p><div className="grid gap-2 md:grid-cols-2">{interventionTypes.map(([id,label,resource,state])=><div key={id} className="border rounded p-2"><strong>{label}</strong><p className="text-sm">{resource} · {state}</p></div>)}</div><Link href="/agronomie/traitements" className="underline inline-block mt-3">Prescriptions phytosanitaires</Link></details></Card>
    <Card><Link href="/interventions/programmes" className="font-semibold underline">Toutes les interventions culturales — planifier et réaliser</Link><p className="text-sm mt-1">Fertigation, nutrition, auxiliaires, piégeage, entretien et travaux : validations, stocks réels et coûts (135B–135C).</p><Link href="/interventions/fertigation" className="underline inline-block mt-3">Préparer les recettes d’engrais</Link></Card>
    {data&&<>
      <Card><div className="flex flex-wrap gap-3"><Select aria-label="Filtrer par ferme" className="sm:w-60" value={farmFilter} onChange={e=>setFarmFilter(e.target.value)}><option value="">Toutes les fermes</option>{data.farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select><Select aria-label="Filtrer par statut" className="sm:w-48" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(irrigationStatus).map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select><Input aria-label="Rechercher un programme" className="sm:w-64" placeholder="Rechercher un programme…" value={search} onChange={e=>setSearch(e.target.value)}/></div></Card>
      {!data.farms.some(f=>f.can_plan)&&<p>Pour créer un programme, attribuez la fonction Chargé d’irrigation ou Responsable fertigation, ou l’habilitation « Planifier une irrigation », dans la fiche utilisateur.</p>}
      <div className="grid gap-3">{programs.map(p=><Card key={p.id}><div className="flex justify-between gap-3 flex-wrap"><div><h2 className="font-semibold">{p.title}</h2><p>{data.farms.find(f=>f.id===p.farm_id)?.name} · {irrigationStatus[p.status]} · {p.occurrences.length} occurrence(s)</p><p className="text-sm">{waterFormat(Number(p.planned_liters))} L / occurrence · {p.requester||'Demandeur renseigné'}</p></div><Button variant="secondary" onClick={()=>{setProgramId(p.id);setComment('');setFormError('')}}>Ouvrir</Button></div></Card>)}</div>
      {!programs.length&&<Card>Aucun programme pour ces filtres.</Card>}
      {data.can_configure&&<Card><details><summary>Paramétrage irrigation de la société</summary><p className="my-3">Validation {data.validation_enabled?'obligatoire':'désactivée'} pour les prochaines soumissions. Une modification ne change jamais les programmes déjà soumis. Premier lot : un niveau de validation.</p><Button variant="ghost" disabled={busy} onClick={()=>{if(window.confirm('Modifier le circuit des prochaines demandes d’irrigation ? Cette modification sera historisée.'))void run(async()=>{await rpc('set_irrigation_validation',{p_domain:domain,p_enabled:!data.validation_enabled})})}}>{data.validation_enabled?'Désactiver':'Activer'} la validation</Button></details></Card>}
    </>}
    {modal&&<Modal title="NOUVEAU PROGRAMME D’IRRIGATION" size="lg" onClose={()=>{if(!busy)setModal(false)}}><form onSubmit={e=>{e.preventDefault();void create()}} className="space-y-4">
      <fieldset disabled={busy||!!pending.current} className="space-y-4">
        <FormGroup label="Titre *"><Input required minLength={3} maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></FormGroup>
        <div className="grid gap-3 sm:grid-cols-2"><FormGroup label="Ferme *"><Select required value={form.farm_id} onChange={e=>setForm({...form,farm_id:e.target.value,campaign_id:'',greenhouse_ids:[]})}><option value="">Sélectionner</option>{data?.farms.filter(f=>f.can_plan).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></FormGroup><FormGroup label="Campagne *"><Select required value={form.campaign_id} onChange={e=>setForm({...form,campaign_id:e.target.value})}><option value="">Sélectionner</option>{data?.campaigns.filter(c=>c.farm_id===form.farm_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormGroup></div>
        <FormGroup label="Serres concernées *"><label className="block mb-2"><input type="checkbox" checked={!!farmGreenhouses.length&&form.greenhouse_ids.length===farmGreenhouses.length} onChange={e=>setForm({...form,greenhouse_ids:e.target.checked?farmGreenhouses.map(g=>g.id):[]})}/> Sélectionner toutes les serres</label><div className="grid gap-2 sm:grid-cols-2">{farmGreenhouses.map(g=><label key={g.id}><input type="checkbox" checked={form.greenhouse_ids.includes(g.id)} onChange={e=>setForm({...form,greenhouse_ids:e.target.checked?[...form.greenhouse_ids,g.id]:form.greenhouse_ids.filter(id=>id!==g.id)})}/> {g.name}</label>)}</div></FormGroup>
        <div className="grid gap-3 sm:grid-cols-2"><FormGroup label="Secteur / circuit (facultatif)"><Input placeholder="Libellé du secteur, sans création de référentiel" value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}/></FormGroup><FormGroup label="Source d’eau *"><Input required placeholder="Ex. bassin principal" value={form.water_source} onChange={e=>setForm({...form,water_source:e.target.value})}/></FormGroup></div>
        <FormGroup label="Planification"><Select value={schedule} onChange={e=>setSchedule(e.target.value as typeof schedule)}><option value="single">Une seule date</option><option value="exact_dates">Dates et créneaux précis</option><option value="recurring">Fréquence définie</option></Select></FormGroup>
        <p className="text-sm text-fg-secondary">Heures du navigateur : {Intl.DateTimeFormat().resolvedOptions().timeZone}. Pour plusieurs cycles quotidiens, ajoutez les créneaux dans « Dates et créneaux précis ».</p>
        {(schedule==='exact_dates'?dates:[dates[0]]).map((date,i)=><div key={i} className="flex gap-2"><Input required aria-label={`Date prévue ${i+1}`} type="datetime-local" value={date} onChange={e=>setDates(dates.map((v,j)=>i===j?e.target.value:v))}/>{schedule==='exact_dates'&&dates.length>1&&<Button type="button" variant="ghost" onClick={()=>setDates(dates.filter((_,j)=>j!==i))}>Retirer</Button>}</div>)}
        {schedule==='exact_dates'&&<Button type="button" variant="ghost" disabled={dates.length>=100} onClick={()=>setDates([...dates,''])}>Ajouter un créneau</Button>}
        {schedule==='recurring'&&<div className="grid gap-3 sm:grid-cols-3"><FormGroup label="Fréquence"><Select value={frequency} onChange={e=>setFrequency(e.target.value)}>{[['daily','Quotidienne'],['weekly','Hebdomadaire'],['monthly','Mensuelle'],['quarterly','Trimestrielle'],['yearly','Annuelle']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select></FormGroup><FormGroup label="Intervalle"><Input type="number" min={1} max={365} required value={interval} onChange={e=>setInterval(Number(e.target.value))}/></FormGroup><FormGroup label="Occurrences (max. 100)"><Input type="number" min={1} max={100} required value={count} onChange={e=>setCount(Number(e.target.value))}/></FormGroup></div>}
        {!!schedulePreview.length&&<details><summary>{schedulePreview.length} occurrence(s) — vérifier les dates</summary>{schedulePreview.map(d=><p key={d}>{dateLabel(d)}</p>)}</details>}
        <WaterFields mode={mode} setMode={setMode} values={water} setValues={setWater}/>
        <FormGroup label="Consignes (facultatives)"><Textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></FormGroup>
      </fieldset>
      {formError&&<p role="alert" className="text-danger">{formError}</p>}
      {pending.current&&<p>Une tentative est en cours de vérification : la saisie est conservée et le même identifiant sera utilisé en cas de nouvel essai.</p>}
      <Button type="submit" loading={busy}>{pending.current?'Réessayer le même enregistrement':'Enregistrer le brouillon'}</Button><p className="text-sm">Le brouillon devra ensuite être soumis. Aucun stock ni coût n’est modifié.</p>
    </form></Modal>}
    {selected&&!actualId&&<Modal title={selected.title} size="lg" onClose={()=>{if(!busy)setProgramId('')}}><div className="space-y-4">
      <p>{irrigationStatus[selected.status]} · {selectedFarm?.name} · {selected.water_source} · {selected.sector||'Sans secteur'}</p>
      <p>Serres : {selected.greenhouse_ids.map((id:string)=>data?.greenhouses.find(g=>g.id===id)?.name||id).join(', ')}</p>
      <p>Prévu global : {waterFormat(Number(selected.planned_liters))} L par occurrence. {selected.input.water.mode==='duration'?'Estimation durée × débit.':'Volume saisi.'}</p>
      <p>{selected.input.notes}</p><p>Demandeur : {selected.requester||selected.requested_by} · Validateur : {selected.reviewer||(selected.validation_required===false?'Validation désactivée lors de la soumission':'—')}</p>
      {selected.review_comment&&<p>Décision : {selected.review_comment}</p>}
      <FormGroup label="Motif / commentaire (5 caractères minimum pour refus ou annulation)"><Textarea value={comment} onChange={e=>setComment(e.target.value)}/></FormGroup>
      <div className="flex flex-wrap gap-2">{selected.status==='brouillon'&&selected.requested_by===userId&&selectedFarm?.can_plan&&<Button disabled={busy} onClick={()=>action('submit')}>Soumettre le programme</Button>}
        {selected.status==='soumise'&&selected.requested_by!==userId&&selectedFarm?.can_validate&&<><Button disabled={busy} onClick={()=>{if(window.confirm('Approuver toutes les occurrences de ce programme ?'))void action('approve')}}>Approuver le programme</Button><Button variant="destructive" disabled={busy||comment.trim().length<5} onClick={()=>action('reject')}>Refuser</Button></>}
        {canCancel&&['brouillon','soumise','approuvee'].includes(selected.status)&&<Button variant="ghost" disabled={busy||comment.trim().length<5} onClick={()=>{if(window.confirm('Annuler les occurrences non réalisées ? Les confirmations existantes seront conservées.'))void action('cancel')}}>Annuler le restant</Button>}</div>
      {selected.status==='soumise'&&selected.requested_by===userId&&<p>Une autre personne habilitée doit valider ce programme.</p>}
      {formError&&<p role="alert" className="text-danger">{formError}</p>}
      {selected.occurrences.map((o:any)=><div key={o.id} className="border rounded p-3 space-y-2"><p>{dateLabel(o.planned_at)} · {o.confirmed_at?'Réalisé':selected.status==='annulee'?'Annulé':selected.status==='approuvee'&&new Date(o.planned_at).getTime()<Date.now()?'En retard':'Non réalisé'}</p>{o.confirmed_at?<><p>{waterFormat(Number(o.actual_liters))} L {o.actual_data.water.mode==='meter'?'mesurés':o.actual_data.water.mode==='duration'?'estimés':'saisis'} · Écart : {waterFormat(Number(o.actual_liters)-Number(selected.planned_liters))} L</p><p>{o.actual_data.notes}</p></>:selected.status==='approuvee'&&selectedFarm?.can_execute&&<Button variant="secondary" onClick={()=>{setActualId(o.id);setActualWater(blankWater);setPerformed('');setActualNotes('');setFormError('')}}>Confirmer le réalisé</Button>}</div>)}
      <details><summary>Historique</summary>{selected.audit.map((a:any)=><p key={a.id}>{dateLabel(a.created_at)} · {a.action} · {a.actor} {a.details.comment&&`— ${a.details.comment}`}</p>)}</details>
    </div></Modal>}
    {occurrence&&<Modal title="CONFIRMER L’IRRIGATION RÉELLE" size="lg" onClose={()=>{if(!busy)setActualId('')}}><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{
      const checked=irrigationDates('single',[performed],'daily',1,1)[0]
      if(new Date(checked).getTime()>Date.now())throw new Error('La date réelle ne peut pas être future.')
      await rpc('confirm_irrigation_occurrence',{p_id:actualId,p_data:{water:waterPayload(actualMode,actualWater),performed_at:checked,notes:actualNotes}})
      if(alive.current)setActualId('')
    })}}><fieldset disabled={busy} className="space-y-4"><p>Prévu le {dateLabel(occurrence.planned_at)} : {waterFormat(Number(selected.planned_liters))} L.</p><FormGroup label="Date et heure réelles *"><Input type="datetime-local" required value={performed} onChange={e=>setPerformed(e.target.value)}/></FormGroup><WaterFields actual mode={actualMode} setMode={setActualMode} values={actualWater} setValues={setActualWater}/><FormGroup label="Observation / justification de l’écart *"><Textarea minLength={5} required value={actualNotes} onChange={e=>setActualNotes(e.target.value)}/></FormGroup></fieldset>{formError&&<p role="alert" className="text-danger">{formError}</p>}<p>Cette confirmation est historisée. Elle ne consomme aucun produit et n’impute aucun coût dans ce premier lot.</p><Button type="submit" loading={busy}>Confirmer le réalisé</Button></form></Modal>}
  </div>
}
