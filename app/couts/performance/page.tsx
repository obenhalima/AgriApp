'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { formatPlanNumber } from '@/lib/farmLayout'
import { buildFarmPerformance, performanceValue, rankedPerformance, type PerformanceData, type PerformanceMetric, type RevenueBasis } from '@/lib/farmPerformance'
const field='rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const fmt=(n:number|null)=>n==null?'Non calculable':n!==0&&Math.abs(n)<.005?(n<0?'> −0,01':'< 0,01'):formatPlanNumber(n)
const metricLabels:Record<PerformanceMetric,string>={yield:'Rendement kg/m²',costKg:'Coût réel DH/kg',marginKg:'Marge DH/kg',marginArea:'Marge DH/m²',margin:'Marge totale DH',revenue:'CA DH'}
export default function PerformancePage(){const {activeDomain}=useAuth();return <PerformanceReport key={activeDomain?.domain_id||'none'}/>}
function PerformanceReport(){
 const {activeDomain,hasPermission}=useAuth(),domain=activeDomain?.domain_id,allowed=hasPermission('couts','view')
 const [campaigns,setCampaigns]=useState<{id:string;name:string}[]>([]),[campaign,setCampaign]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('')
 const [farm,setFarm]=useState(''),[variety,setVariety]=useState(''),[level,setLevel]=useState<'variety'|'greenhouse'|'farm'>('variety')
 const [metric,setMetric]=useState<PerformanceMetric>('yield'),[basis,setBasis]=useState<RevenueBasis>('estimate'),[includeOpen,setIncludeOpen]=useState(false)
 const [data,setData]=useState<PerformanceData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState('')
 const detailRef=useRef<HTMLElement>(null)
 useEffect(()=>{if(selected){detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'});detailRef.current?.focus({preventScroll:true})}},[selected])
 useEffect(()=>{
  if(!domain||!allowed)return
  let cancelled=false
  void withDeadline(signal=>supabase.from('campaigns').select('id,name').eq('domain_id',domain).order('name').abortSignal(signal),20000,'Chargement des campagnes interrompu').then(r=>{if(!cancelled){if(r.error)setError(r.error.message);else setCampaigns(r.data||[])}}).catch(e=>{if(!cancelled)setError(e.message)})
  return()=>{cancelled=true}
 },[domain,allowed])
 useEffect(()=>{
  if(!domain||!allowed)return
  setData(null);setSelected('');setError('');setBusy(false)
  if(start&&end&&start>end){setError('La fin de période doit être postérieure ou égale au début.');return}
  let cancelled=false;setBusy(true)
  void withDeadline(signal=>supabase.rpc('get_farm_performance_data',{p_domain:domain,p_campaign:campaign||null,p_start:start||null,p_end:end||null}).abortSignal(signal),30000,'Le rapport ne répond pas après 30 secondes. Réessayez après avoir vérifié la connexion.').then(r=>{if(!cancelled){if(r.error)throw r.error;setData(r.data as PerformanceData)}}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setBusy(false)})
  return()=>{cancelled=true}
 },[domain,allowed,campaign,start,end,reload])
 const result=useMemo(()=>data?buildFarmPerformance(data,{farm,variety,level}):null,[data,farm,variety,level])
 const unresolved=!!result&&(result.pendingCount>0||result.unallocated!==0)
 const ranked=result?rankedPerformance(result.rows,metric,basis,includeOpen,unresolved):[]
 const rows=result?[...result.rows].sort((a,b)=>{
  const av=performanceValue(a,metric,basis),bv=performanceValue(b,metric,basis)
  return av==null?(bv==null?a.name.localeCompare(b.name):1):bv==null?-1:(metric==='costKg'?av-bv:bv-av)||a.name.localeCompare(b.name)
 }):[]
 const detail=rows.find(r=>r.id===selected)
 const totalKg=rows.reduce((s,r)=>s+r.kg,0),totalArea=rows.reduce((s,r)=>s+r.area,0),totalCost=rows.reduce((s,r)=>s+r.direct+r.shared,0)
 const totalMargin=rows.length&&!rows.some(r=>performanceValue(r,'margin',basis)==null)?rows.reduce((s,r)=>s+performanceValue(r,'margin',basis)!,0):null
 const farms=data?Array.from(new Map(data.plantings.map(p=>[p.farm_id,p.farm_name]))):[]
 const varieties=data?Array.from(new Map(data.plantings.filter(p=>!farm||p.farm_id===farm).map(p=>[p.variety_id,data.metadata.find(m=>m.id===p.id)?.variety_name||'Variété inconnue']))):[]
 const changeScope=()=>setSelected('')
 if(!allowed)return <p>Droit de consultation des coûts requis.</p>
 if(!domain)return <p>Sélectionnez un client / une société.</p>
 return <section className="space-y-4">
  <h1 className="text-2xl font-bold">Performance & rentabilité</h1>
  <p className="font-semibold">Client / société : {activeDomain?.domain_name}</p>
  <p>Comparez les variétés, les serres et les fermes du client sélectionné. Tous les ratios sont pondérés par les quantités ou surfaces, jamais moyennés entre eux.</p>
  <div className="flex flex-wrap gap-3 rounded border p-3">
   <label>Campagne <select aria-label="Campagne" className={field} value={campaign} onChange={e=>{setCampaign(e.target.value);setFarm('');setVariety('')}}><option value="">Toutes les campagnes</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Du <input className={field} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Au <input className={field} type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label>
   <label>Ferme <select aria-label="Ferme" className={field} value={farm} onChange={e=>{setFarm(e.target.value);setVariety('');changeScope()}}><option value="">Toutes les fermes</option>{farms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label>Variété <select aria-label="Variété" className={field} value={variety} onChange={e=>{setVariety(e.target.value);changeScope()}}><option value="">Toutes les variétés</option>{varieties.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <button className={field} disabled={busy} onClick={()=>setReload(r=>r+1)}>Actualiser</button>
  </div>
  <div className="flex flex-wrap items-center gap-3">
   <label>Comparer <select aria-label="Comparer" className={field} value={level} onChange={e=>{setLevel(e.target.value as typeof level);changeScope()}}><option value="variety">Les variétés</option><option value="greenhouse">Les serres</option><option value="farm">Les fermes</option></select></label>
   <label>Trier par <select aria-label="Trier par" className={field} value={metric} onChange={e=>setMetric(e.target.value as PerformanceMetric)}>{Object.entries(metricLabels).filter(([k])=>data?.revenue_available||['yield','costKg'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   {data?.revenue_available&&<label>Base du CA <select className={field} value={basis} onChange={e=>setBasis(e.target.value as RevenueBasis)}><option value="estimate">CA estimé des récoltes</option><option value="station">CA saisi en station</option></select></label>}
   <label className="text-sm"><input type="checkbox" checked={includeOpen} onChange={e=>setIncludeOpen(e.target.checked)}/> Inclure les cycles en cours dans le classement</label>
  </div>
  <p className="text-sm text-slate-500">Surface = cumul des surfaces plantées des cycles retenus, pas la surface cadastrale. Kg = toutes les catégories récoltées, déchets inclus. {start||end?'Les coûts et récoltes sont limités à la période : ce ne sont pas des marges de cycle complet.':'Comparaison des cycles complets et en cours selon le filtre ci-dessus.'} Les cycles non terminés sont exclus du classement par défaut, mais restent visibles dans le tableau.</p>
  {data?.revenue_available&&<p className="text-sm text-slate-500">CA estimé = catégories récoltées × prix saisis (export/local). CA station = montants renseignés sur les lots, datés par leur récolte ; ce n’est ni le CA facturé ni les encaissements. Montants interprétés en DH selon les données saisies ; vérifier les devises et les tarifs avant toute décision. Une tarification station absente ou partielle empêche le calcul de sa marge.</p>}
  <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Analyse provisoire basée sur les charges enregistrées : elle ne certifie pas leur exhaustivité. Un faible coût/kg peut provenir de charges manquantes. {result&&`${result.pendingCount} sortie(s) à rapprocher ; ${fmt(result.unallocated)} DH de coûts et ${fmt(result.plannedUnallocated)} DH de budget non répartis sur le périmètre chargé.`} {unresolved&&'Classements financiers suspendus tant que ces écarts ne sont pas traités.'} <Link className="underline" href="/couts/pilotage">Contrôler les imputations</Link></p>
  {busy&&<p role="status">Chargement des performances…</p>}{error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
  {result&&<>
   <div aria-label="Synthèse du périmètre filtré" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
    ['Récolté (kg)',fmt(totalKg)],['Rendement (kg/m²)',fmt(totalArea>0?totalKg/totalArea:null)],['Coûts imputés (DH)',fmt(totalCost)],['Coût/kg pondéré (DH)',fmt(totalKg>0&&!rows.some(r=>r.costMissing)?totalCost/totalKg:null)],['Marge du périmètre (DH)',fmt(totalMargin)]
   ].map(([label,value])=><div key={label} className="rounded border p-3"><p className="text-sm">{label}</p><strong className="text-xl">{value}</strong></div>)}</div>
   <div className="rounded border border-indigo-200 bg-indigo-50 p-4 text-indigo-950"><strong>{ranked.length?'Meilleur résultat observé — provisoire':'Aucun classement fiable pour ce critère'}</strong><p>{ranked.length?`${ranked[0].name} : ${fmt(performanceValue(ranked[0],metric,basis))} (${metricLabels[metric]}). ${ranked.length} ligne(s) éligible(s).`:'Vérifiez les récoltes, les charges, les prix et le statut des cycles. Les données restent consultables ci-dessous.'}</p></div>
   <div className="overflow-x-auto rounded border"><table className="w-full whitespace-nowrap text-right text-sm"><thead><tr>{['Rang','Périmètre','Surface m²','Récolté kg','kg/m²','Coûts réels DH','DH/kg',basis==='estimate'?'CA estimé DH':'CA station saisi DH','Marge DH','Marge DH/kg','Marge DH/m²','Budget saisi DH','Budget/kg cible','Qualité','Détail'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r=>{
    const rank=ranked.findIndex(x=>x.id===r.id)
    return <tr key={r.id} className="border-t"><td className="p-3">{rank<0?'—':rank+1}</td><th className="p-3 text-left">{r.name}</th><td className="p-3">{fmt(r.area)}</td><td className="p-3">{fmt(r.kg)}</td><td className="p-3">{fmt(performanceValue(r,'yield',basis))}</td><td className="p-3">{fmt(r.direct+r.shared)}</td><td className="p-3" title={String(performanceValue(r,'costKg',basis)??'')}>{fmt(performanceValue(r,'costKg',basis))}</td>
     <td className="p-3">{data?.revenue_available?fmt(performanceValue(r,'revenue',basis)):'Accès requis'}</td><td className="p-3">{fmt(performanceValue(r,'margin',basis))}</td><td className="p-3">{fmt(performanceValue(r,'marginKg',basis))}</td><td className="p-3">{fmt(performanceValue(r,'marginArea',basis))}</td><td className="p-3">{r.budgetMissing?'Incomplet':fmt(r.budget)}</td><td className="p-3">{fmt(start||end||r.targetMissing||r.budgetMissing?null:r.budget/r.target)}</td>
     <td className="p-3 text-left text-xs">{[r.open?'Cycle en cours / non terminé':'Cycle terminé',r.costMissing?'Coûts absents sur une plantation':null,r.provisional?'Valorisation provisoire':null,basis==='station'&&r.stationMissing?'Station non tarifée / incomplète':null,basis==='estimate'&&r.estimateMissing?'Récolte ou prix manquant':null].filter(Boolean).join(' · ')}</td><td className="p-3"><button className={field} onClick={()=>setSelected(r.id===selected?'':r.id)}>Voir le détail</button></td></tr>
   })}</tbody></table>{!rows.length&&<p className="p-4">Aucune plantation dans ce périmètre.</p>}</div>
   <p className="text-sm text-slate-500">Budget/kg cible : budget saisi ÷ objectif de production du cycle ; indisponible pour une période partielle. Coût réel/kg : charges imputées ÷ kg récoltés. Les valeurs inférieures à 0,005 DH sont signalées plutôt qu’arrondies à zéro.</p>
   {detail&&data&&<section ref={detailRef} tabIndex={-1} aria-label="Détail de performance" className="scroll-mt-24 space-y-3 rounded border p-4">
    <h2 className="text-lg font-semibold">Détail — {detail.name}</h2><p>Charges directes : {fmt(detail.direct)} DH · Charges communes affectées : {fmt(detail.shared)} DH · Clé : {data.basis==='surface'?'surface plantée':'production récoltée'}.</p>
    <h3 className="font-semibold">Charges réelles par catégorie</h3>{Object.entries(detail.categories).map(([name,amount])=><p key={name}>{name} : {fmt(amount)} DH</p>)}
    <h3 className="font-semibold">Consommations de stock imputées</h3>{detail.allocations.filter(a=>a.source&&!a.planned).map((a,i)=>{const m=data.consumptions?.find(m=>m.movement_id===a.source);return <p key={`${a.costId}:${i}`}>{m?.product||a.category} · montant imputé : {fmt(a.amount)} DH · {m?`${m.date} · sortie totale : ${fmt(Number(m.quantity))} ${m.unit}`:`Mouvement ${a.source}`} {a.provisional?'— provisoire':''}</p>})}{!detail.allocations.some(a=>a.source&&!a.planned)&&<p>Aucune consommation de stock imputée dans ce périmètre.</p>}
    <h3 className="font-semibold">Plantations et récoltes</h3>{detail.plantingIds.map(id=>{const p=data.plantings.find(p=>p.id===id)!,m=data.metadata.find(m=>m.id===id);return <p key={id}>{p.farm_name} — {p.greenhouse_name} — {m?.variety_name} · {fmt(Number(p.area))} m² · {m?.status} · plantation : {m?.start||'non renseignée'}</p>})}
    <div className="max-h-64 overflow-auto">{data.harvest_details.filter(h=>detail.plantingIds.includes(h.planting_id)).sort((a,b)=>a.date.localeCompare(b.date)).map(h=><p key={h.id}>{h.date} · {data.plantings.find(p=>p.id===h.planting_id)?.greenhouse_name} · {fmt(Number(h.kg))} kg</p>)}</div>
    <div className="flex gap-4"><Link className="underline" href="/couts">Détail des charges</Link><Link className="underline" href="/couts/pilotage">Sorties manquantes / rapprochements</Link></div>
   </section>}
  </>}
 </section>
}
