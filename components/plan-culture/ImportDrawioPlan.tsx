'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { canonicalGreenhouseCode, DrawioPlan, initialPlanLinks, officialArea, readDrawioPlan } from '@/lib/drawioFarmPlan'
import { PlanGraphics } from './PlanGraphics'
import { withDeadline } from '@/lib/withDeadline'

type Draft={link:string;code:string;name:string;type:string;status:string;area:string;usable:string;notes:string}
type Props={farmId:string;farmName:string;revision:number;hasPlan:boolean;disabled:boolean;canCreate:boolean;
 greenhouses:{id:string;code:string;name:string}[];onDraftChange:(value:boolean)=>void;onCommitted:()=>Promise<void>}
const input='w-full rounded border bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50'
export function ImportDrawioPlan({farmId,farmName,revision,hasPlan,disabled,canCreate,greenhouses,onDraftChange,onCommitted}:Props){
 const types=useReferenceList('greenhouse_type'),statuses=useReferenceList('greenhouse_status')
 const [plan,setPlan]=useState<DrawioPlan|null>(null),[rows,setRows]=useState<Draft[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [attempt,setAttempt]=useState<{id:string;payload:any}|null>(null)
 const picker=useRef<HTMLInputElement>(null),alive=useRef(true),reading=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{onDraftChange(!!plan||busy)},[plan,busy,onDraftChange])
 const locked=busy||!!attempt
 const problems=rows.map((r,i)=>{
  if(!r.link)return 'Choisissez une serre ou « Créer une serre ».'
  if(r.link!=='new')return rows.some((other,j)=>j!==i&&other.link===r.link)?'Cette serre est déjà utilisée par une autre forme.':!greenhouses.some(g=>g.id===r.link)?'Serre indisponible.':''
  if(!canCreate)return 'Habilitation de création requise.'
  if(!r.code.trim()||r.code.trim().length>20||!r.name.trim()||r.name.trim().length>100)return 'Code et nom requis (20 et 100 caractères maximum).'
  if(greenhouses.some(g=>canonicalGreenhouseCode(g.code)===canonicalGreenhouseCode(r.code))||rows.some((other,j)=>j!==i&&other.link==='new'&&canonicalGreenhouseCode(other.code)===canonicalGreenhouseCode(r.code)))return 'Code déjà utilisé : rattachez la serre existante ou corrigez le code.'
  if(!types.values.some(v=>v.code===r.type)||!statuses.values.some(v=>v.code===r.status))return 'Choisissez le type et le statut.'
  const a=officialArea(r.area),u=r.usable.trim()?officialArea(r.usable):a
  return !a?'Renseignez la surface officielle en m² (2 décimales maximum).':!u||u>a?'La surface exploitable doit être positive et ne pas dépasser la surface totale.':''
 })
 const invalid=problems.some(Boolean)
 function update(i:number,patch:Partial<Draft>){setRows(rs=>rs.map((r,j)=>i===j?{...r,...patch}:r));setError('')}
 async function read(file:File){
  if(reading.current)return
  if(file.size>5*1024*1024){setError('Fichier limité à 5 Mo.');return}
  reading.current=true;setBusy(true);setError('')
  try{
   const data=await readDrawioPlan(await file.text());if(!alive.current)return
   const links=initialPlanLinks(data,greenhouses)
   setRows(data.greenhouses.map((g,i)=>({link:links[i],code:g.code,name:`Serre ${g.code}`,type:types.defaultCode||'tunnel',status:statuses.defaultCode||'active',area:'',usable:'',notes:''})))
   setPlan(data);setAttempt(null)
  }catch(e:any){if(alive.current)setError(e.message||'Lecture impossible.')}
  finally{reading.current=false;if(alive.current)setBusy(false);if(picker.current)picker.current.value=''}
 }
 async function commit(){
  if(busy||!plan||(!attempt&&invalid))return
  if(!attempt&&!window.confirm(`Enregistrer le plan sur « ${farmName} » et créer ${rows.filter(r=>r.link==='new').length} serre(s) ?${hasPlan?' La disposition actuelle sera remplacée. Les serres existantes ne seront pas modifiées.':''}`))return
  const request=attempt||{id:crypto.randomUUID(),payload:{p_farm:farmId,p_revision:revision,p_elements:plan.elements,p_rows:plan.greenhouses.map((g,i)=>({source_id:g.source_id,x:g.x,y:g.y,width:g.width,height:g.height,rotation:g.rotation,...(rows[i].link==='new'?{new_greenhouse:{code:rows[i].code.trim(),name:rows[i].name.trim(),type:rows[i].type,status:rows[i].status,total_area:officialArea(rows[i].area),exploitable_area:officialArea(rows[i].usable||rows[i].area),notes:rows[i].notes}}:{greenhouse_id:rows[i].link})}))}}
  setAttempt(request);setBusy(true);setError('')
  try{
   const result=await withDeadline(signal=>supabase.rpc('import_farm_drawio_plan',{...request.payload,p_import_id:request.id}).abortSignal(signal),30000,'La session ou le serveur ne répond pas après 30 secondes')
   if(result.error){
    // Server SQL failures roll back the whole import. Network/timeouts may have committed:
    // retain the same id and frozen payload in that case for an idempotent retry.
    if(result.error.code&&/^[0-9A-Z]{5}$/.test(result.error.code)&&result.error.code!=='57014')setAttempt(null)
    throw result.error
   }
   if(!alive.current)return
   setPlan(null);setRows([]);setAttempt(null);onDraftChange(false)
   try{await withDeadline(()=>onCommitted(),20000,'Actualisation trop longue')}catch{setError('Import enregistré. Actualisez la page pour recharger les nouvelles serres.')}
  }catch(e:any){if(alive.current)setError(`Enregistrement non confirmé : ${e.message||'connexion interrompue'}. En cas de délai dépassé, utilisez Réessayer : aucune serre ne sera créée en double.`)}
  finally{if(alive.current)setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="Importer un plan draw.io">
  <h3 className="font-semibold">Importer un plan draw.io — Ferme : {farmName}</h3>
  <p className="text-sm">1. Charger le fichier · 2. Rattacher ou créer chaque serre · 3. Enregistrer le plan et les serres ensemble.</p>
  {!plan&&<><input ref={picker} type="file" accept=".drawio,.xml" aria-label="Fichier draw.io" disabled={disabled||busy} onChange={e=>{const f=e.target.files?.[0];if(f)void read(f)}}/><p className="text-xs text-slate-600">Première page uniquement. Rectangles nommés S1, S2… ou portant les données fp_type=serre et fp_code. Aucun calcul de surface cadastrale à partir du dessin.</p></>}
  {busy&&<p role="status">{plan?'Enregistrement…':'Lecture du fichier…'}</p>}
  {error&&<p role="alert" className="rounded border border-red-400 bg-red-50 p-3 text-red-800">{error}</p>}
  {plan&&<>
   <p>{plan.name} : {rows.length} serres · {plan.elements.length} autres éléments · {rows.filter(r=>r.link==='new').length} créations prévues.</p>
   {plan.warnings.map(w=><p key={w} className="text-amber-800">{w}</p>)}
   <details><summary className="cursor-pointer">Aperçu du plan complet</summary><svg viewBox="0 0 1200 800" className="w-full bg-white" aria-label="Aperçu de l’import"><PlanGraphics elements={plan.elements}/>{plan.greenhouses.map(g=><g key={g.source_id} transform={`translate(${g.x},${g.y}) rotate(${g.rotation})`}><rect x={-g.width/2} y={-g.height/2} width={g.width} height={g.height} fill="#dcfce7" stroke="#16a34a"/><text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(16,g.height/2)}>{g.code}</text></g>)}</svg></details>
   <p className="text-sm">Les correspondances exactes par code sont proposées : vérifiez-les. Une serre existante conserve ses surfaces et ses cultures. Les nouvelles serres sont initialisées sans plantation ; celle-ci se prépare ensuite dans le plan de culture.</p>
   {canCreate&&rows.some(r=>!r.link)&&<button className="rounded border border-indigo-300 bg-white px-3 py-2 text-sm" disabled={locked} onClick={()=>setRows(rs=>rs.map(r=>r.link?r:{...r,link:'new'}))}>Préparer la création des serres non rattachées</button>}
   <fieldset disabled={locked} className="max-h-[620px] space-y-3 overflow-y-auto">
    {rows.map((r,i)=><div key={plan.greenhouses[i].source_id} className={`rounded border bg-white p-3 ${problems[i]?'border-amber-300':'border-green-300'}`}>
     <label className="block font-semibold">Forme {plan.greenhouses[i].code}<select aria-label={`Rattachement ${plan.greenhouses[i].code}`} className={`${input} mt-2 ${!r.link?'border-red-400':''}`} value={r.link} onChange={e=>update(i,{link:e.target.value})}>
      <option value="">Choisir une serre de cette ferme</option>{greenhouses.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}{canCreate&&<option value="new">+ Créer et initialiser une serre</option>}
     </select></label>
     {r.link==='new'&&<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label>Code *<input className={input} maxLength={20} value={r.code} onChange={e=>update(i,{code:e.target.value})}/></label>
      <label>Nom *<input className={input} maxLength={100} value={r.name} onChange={e=>update(i,{name:e.target.value})}/></label>
      <label>Type *<select className={input} value={r.type} onChange={e=>update(i,{type:e.target.value})}><option value="">Choisir</option>{types.values.map(v=><option key={v.code} value={v.code}>{v.label}</option>)}</select></label>
      <label>Statut *<select className={input} value={r.status} onChange={e=>update(i,{status:e.target.value})}><option value="">Choisir</option>{statuses.values.map(v=><option key={v.code} value={v.code}>{v.label}</option>)}</select></label>
      <label>Surface officielle (m²) *<input aria-label={`Surface officielle ${plan.greenhouses[i].code}`} inputMode="decimal" className={`${input} ${!officialArea(r.area)?'border-red-500 bg-red-50':''}`} value={r.area} onChange={e=>update(i,{area:e.target.value})}/></label>
      <label>Surface exploitable (m²)<input inputMode="decimal" className={input} placeholder="Identique à la surface totale" value={r.usable} onChange={e=>update(i,{usable:e.target.value})}/></label>
      <label className="sm:col-span-2">Notes facultatives<input className={input} maxLength={4000} value={r.notes} onChange={e=>update(i,{notes:e.target.value})}/></label>
     </div>}
     {problems[i]&&<p className="mt-2 text-sm text-red-700">{problems[i]}</p>}
    </div>)}
   </fieldset>
   {!canCreate&&<p>Vous pouvez rattacher les serres existantes. L’habilitation « Serres : créer » est nécessaire pour en ajouter.</p>}
   {busy&&<p role="status" className="rounded bg-indigo-100 p-3">Enregistrement en cours… Attente limitée à 30 secondes. Vos champs restent conservés en cas d’erreur.</p>}
   {error&&<p role="alert" className="rounded border border-red-400 bg-red-50 p-3 text-red-800">{error}</p>}
   <div className="flex flex-wrap gap-3"><button className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40" disabled={busy||(!attempt&&invalid)||disabled} onClick={()=>void commit()}>{busy?'Enregistrement…':attempt?'Réessayer le même import':'Enregistrer le plan et les serres'}</button>
    <button className="rounded border px-4 py-2" disabled={busy} onClick={()=>{if(attempt&&!window.confirm('Le précédent enregistrement a peut-être abouti. Quitter puis actualiser le plan avant tout nouvel import ?'))return;setPlan(null);setRows([]);setAttempt(null);setError('')}}>Fermer l’import</button></div>
  </>}
 </section>
}
