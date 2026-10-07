'use client'
import {useLanguage} from '@/lib/i18n'

import { useMemo, useState } from 'react'
import { buildFarmPerformance, type PerformanceData } from '@/lib/farmPerformance'
import { productionExplorer } from '@/lib/productionExplorer'
import { formatPlanNumber as format } from '@/lib/farmLayout'
import { PerformanceDashboard } from './PerformanceDashboard'

const fmt = (n:number|null) => n == null ? 'Non calculable' : format(n)
const button = 'rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm text-fg-primary shadow-sm transition-colors hover:bg-surface-hover hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand'
export function ProductionExplorer({data,farm,variety,client,onFarm,partialPeriod=false}:{data:PerformanceData;farm:string;variety:string;client:string;onFarm:(id:string)=>void;partialPeriod?:boolean}) {
 const {t:_ui,text:_uiNode}=useLanguage()

 const [greenhouse,setGreenhouse]=useState(''),[category,setCategory]=useState<string|null>(null),[costId,setCostId]=useState('')
 const view=useMemo(()=>productionExplorer(data,farm,greenhouse,variety),[data,farm,greenhouse,variety])
 const farms=useMemo(()=>buildFarmPerformance(data,{variety,level:'farm'}).rows,[data,variety])
 const farmName=data.plantings.find(p=>p.farm_id===farm)?.farm_name||'Ferme'
 const greenhouseName=data.plantings.find(p=>p.greenhouse_id===greenhouse)?.greenhouse_name||'Serre'
 const reset=()=>{setGreenhouse('');setCategory(null);setCostId('')}
 const up=()=>{if(costId)setCostId('');else if(category!==null)setCategory(null);else if(greenhouse)setGreenhouse('');else onFarm('')}
 const parentLabel=costId?'Retour aux écritures':category!==null?`Retour à ${greenhouseName}`:greenhouse?`Retour à ${farmName}`:'Toutes les fermes'
 const lines=view.allocations.filter(a=>category===null||a.category===category)
 const grouped=Array.from(new Set(lines.map(a=>a.costId))).map(id=>({id,amount:lines.filter(a=>a.costId===id).reduce((s,a)=>s+a.amount,0),source:data.costs.find(c=>c.id===id)}))
 const operation=grouped.find(c=>c.id===costId)
 const movement=data.consumptions?.find(m=>m.movement_id===operation?.source?.source)
 const [chartMetric,setChartMetric]=useState<'costKg'|'yield'>('costKg')
 const drill=(id:string)=>{setCategory(null);setCostId('');if(farm)setGreenhouse(id);else onFarm(id)}
 return <section aria-label={_ui("Exploration production et coût par kg")} className="space-y-5 min-w-0">
  <div><h2 className="text-xl font-bold">{_ui("Comprendre ma production et mes coûts")}</h2><p className="text-sm text-fg-secondary">{_ui("Cliquez pour descendre dans les chiffres. Utilisez « Remonter » pour revenir au niveau précédent.")}</p></div>
  <div className="sticky top-16 z-20 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
   <div className="mb-2 flex flex-wrap items-center gap-3"><button type="button" aria-label={_ui("← Remonter d’un niveau")} disabled={!farm&&!greenhouse&&category===null&&!costId} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={up}>{_ui("↑ Remonter ·")}{" "}{parentLabel}</button><span aria-live="polite" className="text-xs text-fg-secondary">{costId?_ui("Écriture source"):category!==null?_ui("Catégorie : {v0}",{v0:String(category)}):greenhouse?_ui("Serre : {v0}",{v0:String(greenhouseName)}):farm?_ui("Ferme : {v0}",{v0:String(farmName)}):_ui("Vue client · niveau le plus haut")}</span></div>
  <nav aria-label={_ui("Niveaux de l’analyse")} className="flex flex-wrap items-center gap-2 text-sm">
   <button className={button} onClick={()=>{reset();onFarm('')}}>{client} {" "}{_ui("· Toutes les fermes")}</button>
   {farm&&<><span aria-hidden>›</span><button className={button} onClick={reset}>{farmName}</button></>}
   {greenhouse&&<><span aria-hidden>›</span><button className={button} onClick={()=>{setCategory(null);setCostId('')}}>{greenhouseName}</button></>}
   {category!==null&&<><span aria-hidden>›</span><button className={button} onClick={()=>setCostId('')}>{category}</button></>}
   {costId&&<span aria-current="page">{_ui("› Écriture source")}</span>}
  </nav>
  </div>
  <p className="text-xs text-fg-secondary">{_ui("Campagne, période et variété : filtres ci-dessus conservés. Tous les cycles du périmètre sont inclus ; il ne s’agit pas d’un classement de rentabilité.")}</p>
  {view.incomplete&&<p role="status" className="rounded-lg border border-warning bg-warning-dim p-4 text-sm leading-relaxed text-fg-secondary">{_ui("Coûts incomplets ou provisoires. Les contrôles de rapprochement globaux restent applicables ; un faible coût/kg ne prouve pas une meilleure performance.")}</p>}
  <div className="flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="text-sm font-semibold text-fg-primary">{greenhouse?greenhouseName:farm?farmName:client} · {view.rows.length} {" "}{_ui("serre(s)")}</p><div className="flex gap-2">{(["costKg",'yield'] as const).map(m=><button key={m} className={`btn ${chartMetric===m?'btn-primary':'btn-secondary'}`} aria-pressed={chartMetric===m} onClick={()=>setChartMetric(m)}>{m==='costKg'?_ui("Coût / kg"):_ui("Rendement")}</button>)}</div></div>
  <PerformanceDashboard data={data} rows={farm?view.rows:farms} ranked={[]} basis="estimate" metric={chartMetric} metricLabel={chartMetric==='costKg'?'Coût / kg · DH/kg':'Rendement · kg/m²'} partialPeriod={partialPeriod} onSelect={drill} exploration/>
  <p className="text-xs text-fg-tertiary">{_ui("Coût/kg = charges imputées ÷ kg récoltés, déchets inclus. Les charges communes gardent leur répartition d’origine. Les KPI restent ceux du périmètre ; choisir une catégorie filtre uniquement les écritures ci-dessous.")}</p>
  {!greenhouse&&<div className="grid gap-3 md:grid-cols-2">{(farm?view.rows:farms).map(r=><button key={r.id} className={`${button} text-left`} onClick={()=>{setCategory(null);setCostId('');if(farm)setGreenhouse(r.id);else onFarm(r.id)}}><strong className="block">{r.name} →</strong><span className="mt-2 block text-xs tabular-nums text-fg-tertiary">{fmt(r.kg)} {" "}{_ui("kg ·")}{" "}{fmt(r.direct+r.shared)} {" "}{_ui("DH ·")}{" "}{fmt(r.kg>0&&!r.costMissing?(r.direct+r.shared)/r.kg:null)} DH/kg</span></button>)}</div>}
  {!view.rows.length&&<p>{_ui("Aucune plantation dans ce périmètre.")}</p>}
  {greenhouse&&category===null&&<><h3 className="font-semibold">{_ui("Quelles charges expliquent ce coût ?")}</h3><div className="grid gap-3 md:grid-cols-2">{view.categories.map(c=><button key={c.name} className={`${button} text-left`} onClick={()=>setCategory(c.name)}><span className="flex justify-between gap-3"><strong>{c.name} →</strong><span>{fmt(c.amount)} DH</span></span><span aria-hidden className="mt-2 block h-2 rounded bg-surface-input"><span className="block h-2 rounded bg-brand" style={{width:`${Math.min(100,Math.abs(c.amount)/Math.max(1,...view.categories.map(x=>Math.abs(x.amount)))*100)}%`}}/></span></button>)}</div>{!view.categories.length&&<p>{_ui("Aucune charge imputée à cette serre.")}</p>}</>}
  {category!==null&&!operation&&<><h3 className="font-semibold">{_ui("Écritures imputées ·")}{" "}{category}</h3>{grouped.map(c=><button key={c.id} className={`${button} block w-full text-left`} onClick={()=>setCostId(c.id)}>{data.consumptions?.find(m=>m.movement_id===c.source?.source)?.product||c.source?.category||_ui("Charge")} · {fmt(c.amount)} {" "}{_ui("DH imputés →")}</button>)}</>}
  {operation&&<div className="card space-y-3 p-5 text-sm leading-relaxed"><h3 className="font-semibold">{_ui("Écriture source ·")}{" "}{movement?.product||operation.source?.category}</h3><p>{_ui("Montant imputé au périmètre :")}{" "}{fmt(operation.amount)} DH</p><p>{_ui("Montant total de l’écriture :")}{" "}{fmt(Number(operation.source?.amount))} DH</p><p className="break-all text-xs">{_ui("Référence charge :")}{" "}{operation.id}</p>{operation.source?.source&&<p className="break-all text-xs">{_ui("Mouvement source :")}{" "}{operation.source.source}</p>}{movement&&<p>{movement.date} {" "}{_ui("· Sortie totale :")}{" "}{fmt(Number(movement.quantity))} {movement.unit}{_ui(". Cette quantité n’est pas nécessairement consommée par cette seule serre.")}</p>}<p className="text-sm">{lines.some(a=>a.costId===costId&&a.shared)?_ui("Charge commune répartie"):_ui("Charge directe")} · {lines.some(a=>a.costId===costId&&a.provisional)?_ui("Valorisation provisoire"):_ui("Aucune valorisation provisoire signalée")}</p>{!movement&&<p className="text-xs">{_ui("Détail du justificatif non fourni par ce rapport. La référence permet de retrouver la saisie dans les coûts.")}</p>}</div>}
  {greenhouse&&<details className="card p-4"><summary className="cursor-pointer font-semibold">{_ui("Récoltes qui composent les")}{" "}{fmt(view.kg)} kg</summary><div className="mt-3 max-h-64 overflow-auto">{view.harvests.map(h=><p key={h.id} className="border-b border-border py-2 text-sm">{h.date} · {data.metadata.find(m=>m.id===h.planting_id)?.variety_name||_ui("Variété")} · {fmt(Number(h.kg))} kg</p>)}{!view.harvests.length&&<p>{_ui("Aucune récolte enregistrée.")}</p>}</div></details>}
 </section>
}
