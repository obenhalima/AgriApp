'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { formatPlanNumber } from '@/lib/farmLayout'
import { PerformanceDashboard } from '@/components/costs/PerformanceDashboard'
import { ProductionExplorer } from '@/components/costs/ProductionExplorer'
import '@/components/ui/workspace.css'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input, Select } from '@/components/ui/Input'
import { BarChart3 } from 'lucide-react'
import { useAnalyticalEntry } from '@/lib/useAnalyticalEntry'
import { analyticalHref, type AnalyticalScope } from '@/lib/analyticalNavigation'
import { buildFarmPerformance, performanceValue, rankedPerformance, type PerformanceData, type PerformanceMetric, type RevenueBasis } from '@/lib/farmPerformance'
const field='mt-1.5'
const fmt=(n:number|null)=>n==null?'Non calculable':n!==0&&Math.abs(n)<.005?(n<0?'> −0,01':'< 0,01'):formatPlanNumber(n)
const metricLabels:Record<PerformanceMetric,string>={yield:'Rendement kg/m²',costKg:'Coût réel DH/kg',marginKg:'Marge DH/kg',marginArea:'Marge DH/m²',margin:'Marge totale DH',revenue:'CA DH'}
export default function PerformancePage(){
 const {t:_ui,text:_uiNode}=useLanguage()
const {activeDomain}=useAuth();const entry=useAnalyticalEntry(activeDomain?.domain_id);if(!activeDomain)return <p>{_ui("Sélectionnez un client.")}</p>;if(!entry)return <p>{_ui("Chargement du périmètre…")}</p>;return <PerformanceReport key={activeDomain.domain_id+JSON.stringify(entry)} entry={entry}/>}
function PerformanceReport({entry}:{entry:AnalyticalScope}){
 const {t:_ui,text:_uiNode}=useLanguage()

 const {activeDomain,hasPermission}=useAuth(),domain=activeDomain?.domain_id,allowed=hasPermission('couts','view')
 const [campaigns,setCampaigns]=useState<{id:string;name:string}[]>([]),[campaign,setCampaign]=useState(entry.campaign),[start,setStart]=useState(entry.start),[end,setEnd]=useState(entry.end)
 const [farm,setFarm]=useState(entry.farm),[variety,setVariety]=useState(''),[level,setLevel]=useState<'variety'|'greenhouse'|'farm'>(['variety','greenhouse','farm'].includes(entry.level)?entry.level as 'variety'|'greenhouse'|'farm':'variety')
 const [metric,setMetric]=useState<PerformanceMetric>(Object.keys(metricLabels).includes(entry.metric)?entry.metric as PerformanceMetric:'yield'),[basis,setBasis]=useState<RevenueBasis>('estimate'),[includeOpen,setIncludeOpen]=useState(true)
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
 if(!allowed)return <p>{_ui("Droit de consultation des coûts requis.")}</p>
 if(!domain)return <p>{_ui("Sélectionnez un client / une société.")}</p>
 return <section className="itrix-workspace performance-report space-y-4" style={{color:'var(--tx-1)'}}>
  <nav aria-label={_ui("Parcours analytique")} className="flex flex-wrap gap-3 text-sm"><Link className="text-brand underline" href={analyticalHref('/agronomie/dashboard',domain,{campaign,farm})}>{_ui("← Vue de mon exploitation")}</Link><Link className="text-brand underline" href={analyticalHref('/couts/pilotage',domain,{campaign,farm,start,end})}>{_ui("Détail des charges du même périmètre →")}</Link></nav>
  <PageHeader title={_ui("Performance & rentabilité")} subtitle={_ui("Pilotage analytique · {v0}",{v0:String(activeDomain?.domain_name)})} icon={BarChart3} iconColor="var(--neon)" description={_ui("De la vue d’ensemble à l’écriture source : explorez votre exploitation.")} actions={<Link href={analyticalHref('/couts/pilotage',domain,{campaign,farm,start,end})} className="btn btn-secondary">{_ui("Contrôler les coûts")}</Link>}/>
  <nav aria-label={_ui("Mode analytique")} className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-raised p-2"><button className={`btn ${mode==='explore'?'btn-primary':'btn-secondary'}`} aria-pressed={mode==='explore'} onClick={()=>setMode('explore')}>{_ui("Explorer les chiffres")}</button><button className={`btn ${mode==='compare'?'btn-primary':'btn-secondary'}`} aria-pressed={mode==='compare'} onClick={()=>setMode('compare')}>{_ui("Comparer et classer")}</button></nav>
  <section aria-label={_ui("Filtres analytiques")} className="card space-y-3 p-4">
   <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <label>{_ui("Campagne")}{" "}<Select aria-label={_ui("Campagne")} className={field} value={campaign} onChange={e=>{setCampaign(e.target.value);setFarm('');setVariety('')}}><option value="">{_ui("Toutes les campagnes")}</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
   <label>{_ui("Ferme")}{" "}<Select aria-label={_ui("Ferme")} className={field} value={farm} onChange={e=>{setFarm(e.target.value);setVariety('');changeScope()}}><option value="">{_ui("Toutes les fermes")}</option>{farms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select></label>
   <div className="flex items-end gap-2"><button className="btn btn-primary" disabled={busy} onClick={()=>setReload(r=>r+1)}>{_ui("Actualiser")}</button><button className="btn btn-secondary" title={_ui("Réinitialiser les filtres")} onClick={()=>{setCampaign('');setStart('');setEnd('');setFarm('');setVariety('');setSelected('')}}>{_ui("Effacer")}</button></div>
    <button className="btn btn-secondary" aria-expanded={advanced} aria-controls="analytical-extra-filters" onClick={()=>setAdvanced(v=>!v)}>{advanced?_ui("Masquer les filtres avancés"):_ui("Plus de filtres")}{[start,end,variety].filter(Boolean).length>0?_ui("· {v0} actif(s)",{v0:String([start,end,variety].filter(Boolean).length)}): ''}</button>
   </div>
   {(start||end||variety)&&<div aria-label={_ui("Filtres supplémentaires actifs")} className="flex flex-wrap gap-2 text-xs text-brand">{start&&<span className="rounded-full bg-brand/10 px-3 py-1">{_ui("Depuis le")}{" "}{start}</span>}{end&&<span className="rounded-full bg-brand/10 px-3 py-1">{_ui("Jusqu’au")}{" "}{end}</span>}{variety&&<span className="rounded-full bg-brand/10 px-3 py-1">{_ui("Variété :")}{" "}{varieties.find(([id])=>id===variety)?.[1]||variety}</span>}</div>}
   {advanced&&<div id="analytical-extra-filters" className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
    <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-fg-secondary">{_ui("Période d’analyse")}</legend><div className="grid gap-3 sm:grid-cols-2">
   <label>{_ui("Du")}{" "}<Input className={field} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>{_ui("Au")}{" "}<Input className={field} type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label>
    </div></fieldset>
    <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-fg-secondary">{_ui("Culture")}</legend>
   <label>{_ui("Variété")}{" "}<Select aria-label={_ui("Variété")} className={field} value={variety} onChange={e=>{setVariety(e.target.value);changeScope()}}><option value="">{_ui("Toutes les variétés")}</option>{varieties.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select></label>
    </fieldset>
   </div>}
  </section>
  {mode==='compare'&&<div className="card flex flex-wrap items-end gap-3 p-4">
   <p className="w-full text-xs text-fg-secondary">{_ui("Réglages du mode « Comparer et classer ». L’exploration utilise tous les cycles du périmètre sélectionné.")}</p>
   <label>{_ui("Comparer")}{" "}<Select aria-label={_ui("Comparer")} className={field} value={level} onChange={e=>{setLevel(e.target.value as typeof level);changeScope()}}><option value="variety">{_ui("Les variétés")}</option><option value="greenhouse">{_ui("Les serres")}</option><option value="farm">{_ui("Les fermes")}</option></Select></label>
   <label>{_ui("Trier par")}{" "}<Select aria-label={_ui("Trier par")} className={field} value={metric} onChange={e=>setMetric(e.target.value as PerformanceMetric)}>{Object.entries(metricLabels).filter(([k])=>data?.revenue_available||['yield','costKg'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></label>
   {data?.revenue_available&&<label>{_ui("Base du CA")}{" "}<Select className={field} value={basis} onChange={e=>setBasis(e.target.value as RevenueBasis)}><option value="estimate">{_ui("CA estimé des récoltes")}</option><option value="station">{_ui("CA saisi en station")}</option></Select></label>}
   <label className="text-sm"><input type="checkbox" checked={includeOpen} onChange={e=>setIncludeOpen(e.target.checked)}/> {" "}{_ui("Inclure les cycles en cours dans le classement")}</label>
   <p className="w-full rounded-lg border border-border bg-surface-input p-3 text-sm text-fg-secondary" role="status">{includeOpen?_ui("Comparaison à date — résultats provisoires. Les cultures en cours sont incluses : charges enregistrées divisées par les kilos déjà récoltés sur la période sélectionnée. Les résultats évolueront avec les prochaines saisies."):_ui("Comparaison limitée aux cycles terminés. Cochez l’option ci-dessus pour comparer aussi les cultures en cours.")}</p>
  </div>}
  <details className="rounded-lg border border-border bg-surface-raised p-4 text-xs leading-relaxed text-fg-tertiary"><summary className="cursor-pointer">{_ui("Méthode de calcul et limites de comparaison")}</summary><p className="mt-2">{_ui("Surface = cumul des surfaces plantées des cycles retenus, pas la surface cadastrale. Kg = toutes les catégories récoltées, déchets inclus.")}{" "}{start||end?_ui("Les coûts et récoltes sont limités à la période : ce ne sont pas des marges de cycle complet."):_ui("Comparaison des cycles complets et en cours selon le filtre ci-dessus.")} {" "}{_ui("Les cycles en cours sont inclus par défaut pour une comparaison à date ; décochez l’option pour limiter le classement aux cycles terminés. Les ratios sont pondérés par les quantités ou surfaces, jamais moyennés entre eux.")}</p>
  {data?.revenue_available&&<p className="text-sm text-fg-tertiary">{_ui("CA estimé = catégories récoltées × prix saisis (export/local). CA station = montants renseignés sur les lots, datés par leur récolte ; ce n’est ni le CA facturé ni les encaissements. Montants interprétés en DH selon les données saisies ; vérifier les devises et les tarifs avant toute décision. Une tarification station absente ou partielle empêche le calcul de sa marge.")}</p>}
  </details>
  <p className="rounded-lg border p-3 text-xs" style={{borderColor:'color-mix(in srgb, #f59e0b 35%, transparent)',background:'color-mix(in srgb, #f59e0b 7%, transparent)',color:'var(--tx-2)'}}>{_ui("Analyse provisoire : un faible coût/kg peut provenir de charges manquantes.")}{" "}{result&&_ui("{v0} sortie(s) à rapprocher ; {v1} DH de coûts et {v2} DH de budget non répartis.",{v0:String(result.pendingCount),v1:String(fmt(result.unallocated)),v2:String(fmt(result.plannedUnallocated))})} {unresolved&&_ui("Classements financiers suspendus tant que ces écarts ne sont pas traités.")} <Link className="underline" href="/couts/pilotage">{_ui("Contrôler les imputations")}</Link></p>
  {busy&&<p role="status" className="card p-6 text-center text-sm text-fg-tertiary">{_ui("Chargement des performances…")}</p>}{error&&<p role="alert" className="rounded-lg border border-danger bg-danger-dim p-4 text-sm text-danger">{_uiNode(error)}</p>}

  {data&&mode==='explore'&&<ProductionExplorer key={`${campaign}:${start}:${end}:${farm}:${variety}`} partialPeriod={!!(start||end)} data={data} farm={farm} variety={variety} client={activeDomain?.domain_name||'Client'} onFarm={setFarm}/>}
  {result&&mode==='compare'&&<>
   {data&&<PerformanceDashboard data={data} rows={rows} ranked={ranked} basis={basis} metric={metric} metricLabel={metricLabels[metric]} partialPeriod={!!(start||end)} onSelect={setSelected}/>}
   <div className="card overflow-hidden"><div className="flex items-center justify-between p-4"><h2 className="font-semibold">{_ui("Comparatif détaillé")}</h2><span className="text-xs" style={{color:'var(--tx-3)'}}>{rows.length} {" "}{_ui("ligne(s) ·")}{" "}{ranked.length} {" "}{_ui("classée(s)")}</span></div><div className="overflow-x-auto"><table className="tbl w-full whitespace-nowrap text-right text-xs tabular-nums"><thead style={{background:'var(--bg-card2)',color:'var(--tx-3)'}}><tr>{['Rang','Périmètre','Surface m²','Récolté kg','kg/m²','Coûts réels DH','DH/kg',basis==='estimate'?'CA estimé DH':'CA station saisi DH','Marge DH','Marge DH/kg','Marge DH/m²','Budget saisi DH','Budget/kg cible','Qualité','Détail'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r=>{
    const rank=ranked.findIndex(x=>x.id===r.id)
    return <tr key={r.id} className="border-t border-border hover:bg-surface-hover"><td className="p-3">{rank<0?'—':rank+1}</td><th className="p-3 text-left">{r.name}</th><td className="p-3">{fmt(r.area)}</td><td className="p-3">{fmt(r.kg)}</td><td className="p-3">{fmt(performanceValue(r,'yield',basis))}</td><td className="p-3">{fmt(r.direct+r.shared)}</td><td className="p-3" title={String(performanceValue(r,"costKg",basis)??'')}>{fmt(performanceValue(r,"costKg",basis))}</td>
     <td className="p-3">{data?.revenue_available?fmt(performanceValue(r,'revenue',basis)):_ui("Accès requis")}</td><td className="p-3">{fmt(performanceValue(r,'margin',basis))}</td><td className="p-3">{fmt(performanceValue(r,"marginKg",basis))}</td><td className="p-3">{fmt(performanceValue(r,"marginArea",basis))}</td><td className="p-3">{r.budgetMissing?_ui("Incomplet"):fmt(r.budget)}</td><td className="p-3">{fmt(start||end||r.targetMissing||r.budgetMissing?null:r.budget/r.target)}</td>
     <td className="p-3 text-left text-xs">{[r.open?'Cycle en cours / non terminé':'Cycle terminé',r.costMissing?'Coûts absents sur une plantation':null,r.provisional?'Valorisation provisoire':null,basis==='station'&&r.stationMissing?'Station non tarifée / incomplète':null,basis==='estimate'&&r.estimateMissing?'Récolte ou prix manquant':null].filter(Boolean).join(' · ')}</td><td className="p-3"><button className="btn btn-secondary" onClick={()=>setSelected(r.id===selected?'':r.id)}>{_ui("Voir le détail")}</button></td></tr>
   })}</tbody></table>{!rows.length&&<p className="p-4">{_ui("Aucune plantation dans ce périmètre.")}</p>}</div></div>
   <p className="text-sm text-fg-tertiary">{_ui("Budget/kg cible : budget saisi ÷ objectif de production du cycle ; indisponible pour une période partielle. Coût réel/kg : charges imputées ÷ kg récoltés. Les valeurs inférieures à 0,005 DH sont signalées plutôt qu’arrondies à zéro.")}</p>
   {detail&&data&&<section ref={detailRef} tabIndex={-1} aria-label={_ui("Détail de performance")} className="performance-detail card scroll-mt-24 space-y-4 p-5">
    <h2 className="text-lg font-semibold">{_ui("Détail —")}{" "}{detail.name}</h2><p>{_ui("Charges directes :")}{" "}{fmt(detail.direct)} {" "}{_ui("DH · Charges communes affectées :")}{" "}{fmt(detail.shared)} {" "}{_ui("DH · Clé :")}{" "}{data.basis==='surface'?_ui("surface plantée"):_ui("production récoltée")}.</p>
    <h3 className="font-semibold">{_ui("Charges réelles par catégorie")}</h3>{Object.entries(detail.categories).map(([name,amount])=><p key={name}>{name} : {fmt(amount)} DH</p>)}
    <h3 className="font-semibold">{_ui("Consommations de stock imputées")}</h3>{detail.allocations.filter(a=>a.source&&!a.planned).map((a,i)=>{const m=data.consumptions?.find(m=>m.movement_id===a.source);return <p key={`${a.costId}:${i}`}>{m?.product||a.category} {" "}{_ui("· montant imputé :")}{" "}{fmt(a.amount)} {" "}{_ui("DH ·")}{" "}{m?_ui("{v0} · sortie totale : {v1} {v2}",{v0:String(m.date),v1:String(fmt(Number(m.quantity))),v2:String(m.unit)}):_ui("Mouvement {v0}",{v0:String(a.source)})} {a.provisional?_ui("— provisoire"):''}</p>})}{!detail.allocations.some(a=>a.source&&!a.planned)&&<p>{_ui("Aucune consommation de stock imputée dans ce périmètre.")}</p>}
    <h3 className="font-semibold">{_ui("Plantations et récoltes")}</h3>{detail.plantingIds.map(id=>{const p=data.plantings.find(p=>p.id===id)!,m=data.metadata.find(m=>m.id===id);return <p key={id}>{p.farm_name} — {p.greenhouse_name} — {m?.variety_name} · {fmt(Number(p.area))} m² · {m?.status} {" "}{_ui("· plantation :")}{" "}{m?.start||_ui("non renseignée")}</p>})}
    <div className="max-h-64 overflow-auto">{data.harvest_details.filter(h=>detail.plantingIds.includes(h.planting_id)).sort((a,b)=>a.date.localeCompare(b.date)).map(h=><p key={h.id}>{h.date} · {data.plantings.find(p=>p.id===h.planting_id)?.greenhouse_name} · {fmt(Number(h.kg))} kg</p>)}</div>
    <div className="flex gap-4"><Link className="underline" href="/couts">{_ui("Détail des charges")}</Link><Link className="underline" href="/couts/pilotage">{_ui("Sorties manquantes / rapprochements")}</Link></div>
   </section>}
  </>}
 <style jsx>{".performance-report :global(label){font-size:11px;color:var(--tx-3);min-width:0} .performance-report :global(label select),.performance-report :global(label input[type=date]){display:block;margin-top:6px} .performance-report :global(td),.performance-report :global(th){border-color:var(--border)} .performance-detail>h3{padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--tx-2)} .performance-detail>p{font-size:13px;line-height:1.7;padding:10px 12px;border-radius:8px;background:var(--bg-card2)}"}</style></section>
}
