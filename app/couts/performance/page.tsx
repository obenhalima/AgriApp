'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { formatPlanNumber } from '@/lib/farmLayout'
import { PerformanceDashboard } from '@/components/costs/PerformanceDashboard'
import { ProductionExplorer } from '@/components/costs/ProductionExplorer'
import { PageHeader } from '@/components/ui/PageHeader'
import { BarChart3 } from 'lucide-react'
import { useAnalyticalEntry } from '@/lib/useAnalyticalEntry'
import { analyticalHref, type AnalyticalScope } from '@/lib/analyticalNavigation'
import { buildFarmPerformance, performanceValue, rankedPerformance, type PerformanceData, type PerformanceMetric, type RevenueBasis } from '@/lib/farmPerformance'
const field='input'
const fmt=(n:number|null)=>n==null?'Non calculable':n!==0&&Math.abs(n)<.005?(n<0?'> −0,01':'< 0,01'):formatPlanNumber(n)
const metricLabels:Record<PerformanceMetric,string>={yield:'Rendement kg/m²',costKg:'Coût réel DH/kg',marginKg:'Marge DH/kg',marginArea:'Marge DH/m²',margin:'Marge totale DH',revenue:'CA DH'}
export default function PerformancePage(){const {activeDomain}=useAuth();const entry=useAnalyticalEntry(activeDomain?.domain_id);if(!activeDomain)return <p>Sélectionnez un client.</p>;if(!entry)return <p>Chargement du périmètre…</p>;return <PerformanceReport key={activeDomain.domain_id+JSON.stringify(entry)} entry={entry}/>}
function PerformanceReport({entry}:{entry:AnalyticalScope}){
 const {activeDomain,hasPermission}=useAuth(),domain=activeDomain?.domain_id,allowed=hasPermission('couts','view')
 const [campaigns,setCampaigns]=useState<{id:string;name:string}[]>([]),[campaign,setCampaign]=useState(entry.campaign),[start,setStart]=useState(entry.start),[end,setEnd]=useState(entry.end)
 const [farm,setFarm]=useState(entry.farm),[variety,setVariety]=useState(''),[level,setLevel]=useState<'variety'|'greenhouse'|'farm'>(['variety','greenhouse','farm'].includes(entry.level)?entry.level as 'variety'|'greenhouse'|'farm':'variety')
 const [metric,setMetric]=useState<PerformanceMetric>(Object.keys(metricLabels).includes(entry.metric)?entry.metric as PerformanceMetric:'yield'),[basis,setBasis]=useState<RevenueBasis>('estimate'),[includeOpen,setIncludeOpen]=useState(false)
 const [data,setData]=useState<PerformanceData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState('')
 const detailRef=useRef<HTMLElement>(null)
 const [mode,setMode]=useState<'explore'|'compare'>('explore')
 const [advanced,setAdvanced]=useState(!!(entry.start||entry.end))
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
 const farms=data?Array.from(new Map(data.plantings.map(p=>[p.farm_id,p.farm_name]))):[]
 const varieties=data?Array.from(new Map(data.plantings.filter(p=>!farm||p.farm_id===farm).map(p=>[p.variety_id,data.metadata.find(m=>m.id===p.id)?.variety_name||'Variété inconnue']))):[]
 const changeScope=()=>setSelected('')
 if(!allowed)return <p>Droit de consultation des coûts requis.</p>
 if(!domain)return <p>Sélectionnez un client / une société.</p>
 return <section className="performance-report space-y-4" style={{color:'var(--tx-1)'}}>
  <nav aria-label="Parcours analytique" className="flex flex-wrap gap-3 text-sm"><Link className="text-brand underline" href={analyticalHref('/agronomie/dashboard',domain,{campaign,farm})}>← Vue de mon exploitation</Link><Link className="text-brand underline" href={analyticalHref('/couts/pilotage',domain,{campaign,farm,start,end})}>Détail des charges du même périmètre →</Link></nav>
  <PageHeader title="Performance & rentabilité" subtitle={`Pilotage analytique · ${activeDomain?.domain_name}`} icon={BarChart3} iconColor="#8b5cf6" description="De la vue d’ensemble à l’écriture source : explorez votre exploitation." actions={<Link href={analyticalHref('/couts/pilotage',domain,{campaign,farm,start,end})} className="btn btn-secondary">Contrôler les coûts</Link>}/>
  <nav aria-label="Mode analytique" className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-raised p-2"><button className={`btn ${mode==='explore'?'btn-primary':'btn-secondary'}`} aria-pressed={mode==='explore'} onClick={()=>setMode('explore')}>Explorer les chiffres</button><button className={`btn ${mode==='compare'?'btn-primary':'btn-secondary'}`} aria-pressed={mode==='compare'} onClick={()=>setMode('compare')}>Comparer et classer</button></nav>
  <section aria-label="Filtres analytiques" className="card space-y-3 p-4">
   <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <label>Campagne <select aria-label="Campagne" className={field} value={campaign} onChange={e=>{setCampaign(e.target.value);setFarm('');setVariety('')}}><option value="">Toutes les campagnes</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Ferme <select aria-label="Ferme" className={field} value={farm} onChange={e=>{setFarm(e.target.value);setVariety('');changeScope()}}><option value="">Toutes les fermes</option>{farms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <div className="flex items-end gap-2"><button className="btn btn-primary" disabled={busy} onClick={()=>setReload(r=>r+1)}>Actualiser</button><button className="btn btn-secondary" title="Réinitialiser les filtres" onClick={()=>{setCampaign('');setStart('');setEnd('');setFarm('');setVariety('');setSelected('')}}>Effacer</button></div>
    <button className="btn btn-secondary" aria-expanded={advanced} aria-controls="analytical-extra-filters" onClick={()=>setAdvanced(v=>!v)}>{advanced?'Masquer les filtres avancés':'Plus de filtres'}{[start,end,variety].filter(Boolean).length>0?` · ${[start,end,variety].filter(Boolean).length} actif(s)`: ''}</button>
   </div>
   {(start||end||variety)&&<div aria-label="Filtres supplémentaires actifs" className="flex flex-wrap gap-2 text-xs text-brand">{start&&<span className="rounded-full bg-brand/10 px-3 py-1">Depuis le {start}</span>}{end&&<span className="rounded-full bg-brand/10 px-3 py-1">Jusqu’au {end}</span>}{variety&&<span className="rounded-full bg-brand/10 px-3 py-1">Variété : {varieties.find(([id])=>id===variety)?.[1]||variety}</span>}</div>}
   {advanced&&<div id="analytical-extra-filters" className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
    <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-fg-secondary">Période d’analyse</legend><div className="grid gap-3 sm:grid-cols-2">
   <label>Du <input className={field} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Au <input className={field} type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label>
    </div></fieldset>
    <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-fg-secondary">Culture</legend>
   <label>Variété <select aria-label="Variété" className={field} value={variety} onChange={e=>{setVariety(e.target.value);changeScope()}}><option value="">Toutes les variétés</option>{varieties.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    </fieldset>
   </div>}
  </section>
  {mode==='compare'&&<div className="card flex flex-wrap items-end gap-3 p-4">
   <p className="w-full text-xs text-fg-secondary">Réglages du mode « Comparer et classer ». L’exploration utilise tous les cycles du périmètre sélectionné.</p>
   <label>Comparer <select aria-label="Comparer" className={field} value={level} onChange={e=>{setLevel(e.target.value as typeof level);changeScope()}}><option value="variety">Les variétés</option><option value="greenhouse">Les serres</option><option value="farm">Les fermes</option></select></label>
   <label>Trier par <select aria-label="Trier par" className={field} value={metric} onChange={e=>setMetric(e.target.value as PerformanceMetric)}>{Object.entries(metricLabels).filter(([k])=>data?.revenue_available||['yield','costKg'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   {data?.revenue_available&&<label>Base du CA <select className={field} value={basis} onChange={e=>setBasis(e.target.value as RevenueBasis)}><option value="estimate">CA estimé des récoltes</option><option value="station">CA saisi en station</option></select></label>}
   <label className="text-sm"><input type="checkbox" checked={includeOpen} onChange={e=>setIncludeOpen(e.target.checked)}/> Inclure les cycles en cours dans le classement</label>
  </div>}
  <details className="text-xs" style={{color:'var(--tx-3)'}}><summary className="cursor-pointer">Méthode de calcul et limites de comparaison</summary><p className="mt-2">Surface = cumul des surfaces plantées des cycles retenus, pas la surface cadastrale. Kg = toutes les catégories récoltées, déchets inclus. {start||end?'Les coûts et récoltes sont limités à la période : ce ne sont pas des marges de cycle complet.':'Comparaison des cycles complets et en cours selon le filtre ci-dessus.'} Les cycles non terminés sont exclus du classement par défaut, mais restent visibles dans le tableau. Les ratios sont pondérés par les quantités ou surfaces, jamais moyennés entre eux.</p>
  {data?.revenue_available&&<p className="text-sm text-slate-500">CA estimé = catégories récoltées × prix saisis (export/local). CA station = montants renseignés sur les lots, datés par leur récolte ; ce n’est ni le CA facturé ni les encaissements. Montants interprétés en DH selon les données saisies ; vérifier les devises et les tarifs avant toute décision. Une tarification station absente ou partielle empêche le calcul de sa marge.</p>}
  </details>
  <p className="rounded-lg border p-3 text-xs" style={{borderColor:'color-mix(in srgb, #f59e0b 35%, transparent)',background:'color-mix(in srgb, #f59e0b 7%, transparent)',color:'var(--tx-2)'}}>Analyse provisoire : un faible coût/kg peut provenir de charges manquantes. {result&&`${result.pendingCount} sortie(s) à rapprocher ; ${fmt(result.unallocated)} DH de coûts et ${fmt(result.plannedUnallocated)} DH de budget non répartis.`} {unresolved&&'Classements financiers suspendus tant que ces écarts ne sont pas traités.'} <Link className="underline" href="/couts/pilotage">Contrôler les imputations</Link></p>
  {busy&&<p role="status">Chargement des performances…</p>}{error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}

  {data&&mode==='explore'&&<ProductionExplorer key={`${campaign}:${start}:${end}:${farm}:${variety}`} partialPeriod={!!(start||end)} data={data} farm={farm} variety={variety} client={activeDomain?.domain_name||'Client'} onFarm={setFarm}/>}
  {result&&mode==='compare'&&<>
   {data&&<PerformanceDashboard data={data} rows={rows} ranked={ranked} basis={basis} metric={metric} metricLabel={metricLabels[metric]} partialPeriod={!!(start||end)} onSelect={setSelected}/>}
   <div className="card overflow-hidden"><div className="flex items-center justify-between p-4"><h2 className="font-semibold">Comparatif détaillé</h2><span className="text-xs" style={{color:'var(--tx-3)'}}>{rows.length} ligne(s) · {ranked.length} classée(s)</span></div><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs"><thead style={{background:'var(--bg-3)',color:'var(--tx-3)'}}><tr>{['Rang','Périmètre','Surface m²','Récolté kg','kg/m²','Coûts réels DH','DH/kg',basis==='estimate'?'CA estimé DH':'CA station saisi DH','Marge DH','Marge DH/kg','Marge DH/m²','Budget saisi DH','Budget/kg cible','Qualité','Détail'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r=>{
    const rank=ranked.findIndex(x=>x.id===r.id)
    return <tr key={r.id} className="border-t"><td className="p-3">{rank<0?'—':rank+1}</td><th className="p-3 text-left">{r.name}</th><td className="p-3">{fmt(r.area)}</td><td className="p-3">{fmt(r.kg)}</td><td className="p-3">{fmt(performanceValue(r,'yield',basis))}</td><td className="p-3">{fmt(r.direct+r.shared)}</td><td className="p-3" title={String(performanceValue(r,'costKg',basis)??'')}>{fmt(performanceValue(r,'costKg',basis))}</td>
     <td className="p-3">{data?.revenue_available?fmt(performanceValue(r,'revenue',basis)):'Accès requis'}</td><td className="p-3">{fmt(performanceValue(r,'margin',basis))}</td><td className="p-3">{fmt(performanceValue(r,'marginKg',basis))}</td><td className="p-3">{fmt(performanceValue(r,'marginArea',basis))}</td><td className="p-3">{r.budgetMissing?'Incomplet':fmt(r.budget)}</td><td className="p-3">{fmt(start||end||r.targetMissing||r.budgetMissing?null:r.budget/r.target)}</td>
     <td className="p-3 text-left text-xs">{[r.open?'Cycle en cours / non terminé':'Cycle terminé',r.costMissing?'Coûts absents sur une plantation':null,r.provisional?'Valorisation provisoire':null,basis==='station'&&r.stationMissing?'Station non tarifée / incomplète':null,basis==='estimate'&&r.estimateMissing?'Récolte ou prix manquant':null].filter(Boolean).join(' · ')}</td><td className="p-3"><button className={field} onClick={()=>setSelected(r.id===selected?'':r.id)}>Voir le détail</button></td></tr>
   })}</tbody></table>{!rows.length&&<p className="p-4">Aucune plantation dans ce périmètre.</p>}</div></div>
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
 <style jsx>{`.performance-report :global(label){font-size:11px;color:var(--tx-3);min-width:0} .performance-report :global(label .input){display:block;margin-top:5px;min-width:0;width:100%} .performance-report :global(.input){font-size:12px;padding:8px;border:1px solid var(--bd-1);border-radius:6px;background:var(--bg-card);color:var(--tx-1)} .performance-report :global(.input:focus-visible){outline:2px solid var(--neon);outline-offset:2px} .performance-report :global(td),.performance-report :global(th){border-color:var(--bd-1)}`}</style></section>
}
