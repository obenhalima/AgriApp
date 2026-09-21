'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Leaf, X, Sprout, Scale, Target, MapPin } from 'lucide-react'
import { ProductionCostReport } from '@/components/costs/ProductionCostReport'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'
import { GreenhouseInterventions } from './GreenhouseInterventions'

type Planting = { id: string; variety_id: string; planted_area: number; planting_date: string | null; status: string; target_total_production: number | null; target_yield_per_m2: number | null; harvest_start_date?:string|null; harvest_end_date?:string|null; first_harvest_date?:string|null; last_harvest_date?:string|null; plant_count?:number|null; actual_density?:number|null }
type Harvest = { id: string; campaign_planting_id: string; total_qty: number; harvest_date: string }
const statuses: Record<string,string> = { planifie:'Planifiée', en_cours:'En cours', termine:'Terminée', terminee:'Terminée', recolte:'En récolte', annule:'Annulée' }
const date = (value: string | null) => value ? new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('fr-FR') : 'Non renseignée'
const target = (p: Planting) => p.target_total_production != null ? Number(p.target_total_production) : p.target_yield_per_m2 != null ? Number(p.target_yield_per_m2)*Number(p.planted_area) : null

export function GreenhouseDetailsDialog({ greenhouse, farmName, domainId, farmId, campaignId, plantings, harvests, varieties, busy, error, onClose }: {
  greenhouse: {id:string;code:string;name:string;total_area:number;type?:string}; farmName:string; campaignId:string;
  domainId:string; farmId:string; plantings:Planting[]; harvests:Harvest[]; varieties:Record<string,string>; busy:boolean; error:string; onClose:()=>void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [costKpiTarget, setCostKpiTarget] = useState<HTMLDivElement | null>(null)
  useEffect(()=>{
    const dialog=ref.current, previous=document.activeElement as HTMLElement | null
    const overflow=document.body.style.overflow
    dialog?.showModal(); document.body.style.overflow='hidden'
    return ()=>{ dialog?.close(); document.body.style.overflow=overflow; previous?.focus() }
  },[])
  const area=plantings.reduce((s,p)=>s+Number(p.planted_area),0)
  const total=harvests.reduce((s,h)=>s+Number(h.total_qty||0),0)
  const targets=plantings.map(target)
  const planned=targets.length && targets.every(t=>t!=null) ? targets.reduce<number>((s,t)=>s+(t??0),0) : null
  const ready=!!campaignId&&!busy&&!error
  const dates=harvests.map(h=>h.harvest_date).sort()
  const kpis=[
    {label:'Surface officielle',value:fmt(Number(greenhouse.total_area)),unit:'m²',icon:MapPin},
    {label:'Production cible',value:fmt(ready?planned:null),unit:'kg',icon:Target},
    {label:'Récolte enregistrée',value:fmt(ready?total:null),unit:'kg',icon:Scale},
    {label:'Rendement récolté',value:fmt(ready&&area>0?total/area:null),unit:'kg/m² planté',icon:Sprout},
    {label:'Surface plantée cumulée',value:fmt(ready?area:null),unit:'m²',icon:MapPin},
    {label:'Objectif restant',value:fmt(ready&&planned!=null?Math.max(0,planned-total):null),unit:'kg',icon:Target},
    {label:'Nombre de récoltes',value:ready?String(harvests.length):'—',unit:'saisies',icon:Scale},
    {label:'Moyenne par saisie',value:fmt(ready&&harvests.length?total/harvests.length:null),unit:'kg / saisie',icon:Scale},
  ]
  return <dialog ref={ref} aria-labelledby="greenhouse-dialog-title" onCancel={e=>{e.preventDefault();onClose()}}
    onClick={e=>{if(e.target===e.currentTarget)onClose()}}
    className="m-auto w-[calc(100%-2rem)] max-w-5xl max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface-raised p-0 text-fg-primary shadow-2xl backdrop:bg-black/50">
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface-raised p-5">
      <span className="rounded-xl bg-brand/10 p-3 text-brand"><Leaf size={24}/></span>
      <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-wider text-fg-tertiary">Fiche serre · {farmName}</p>
        <h2 id="greenhouse-dialog-title" className="text-xl font-bold">{greenhouse.code} — {greenhouse.name}</h2></div>
      <button autoFocus aria-label="Fermer la fiche serre" onClick={onClose} className="rounded-md p-2 text-fg-secondary hover:bg-surface-input focus-visible:ring-2 focus-visible:ring-brand"><X size={20}/></button>
    </header>
    <div className="space-y-5 p-5">
      <p className="text-sm text-fg-secondary">Données de la campagne sélectionnée, toutes variétés de cette serre. Type : {greenhouse.type||'Non renseigné'}.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(k=><div key={k.label} className="rounded-xl border border-border bg-surface-input p-4">
        <k.icon size={18} className="mb-2 text-brand"/><p className="text-xs text-fg-secondary">{k.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{k.value}</p><p className="text-xs text-fg-tertiary">{k.unit}</p>
      </div>)}</div>
      {campaignId && <section aria-label="Indicateurs financiers de la serre" className="space-y-3"><h3 className="font-semibold">Indicateurs financiers</h3><div ref={setCostKpiTarget}/></section>}
      {!campaignId ? <p role="status">Sélectionnez une campagne pour consulter la production et les coûts.</p> : busy ? <p role="status">Chargement des cultures et récoltes…</p> : error ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4">{error}</p> : <>
        <section className="rounded-xl border border-border p-4"><h3 className="mb-3 font-semibold">Cultures et objectifs</h3>
          {!plantings.length ? <p className="text-sm text-fg-secondary">Aucune plantation sur cette campagne.</p> : <div className="grid gap-3 md:grid-cols-2">{plantings.map(p=><article key={p.id} className="rounded-lg bg-surface-input p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong>{varieties[p.variety_id]||'Variété non disponible'}</strong><span className="text-brand">{statuses[p.status]||p.status}</span></div>
            <dl className="mt-3 grid grid-cols-2 gap-2"><dt className="text-fg-secondary">Plantation</dt><dd>{date(p.planting_date)}</dd><dt className="text-fg-secondary">Surface plantée</dt><dd>{fmt(Number(p.planted_area))} m²</dd><dt className="text-fg-secondary">Objectif</dt><dd>{fmt(target(p))} kg</dd><dt className="text-fg-secondary">Récolté</dt><dd>{fmt(harvests.filter(h=>h.campaign_planting_id===p.id).reduce((s,h)=>s+Number(h.total_qty||0),0))} kg</dd></dl>
          </article>)}</div>}
          <div className="mt-4 space-y-3">{plantings.map(p=>{
            const hd=harvests.filter(h=>h.campaign_planting_id===p.id).map(h=>h.harvest_date).sort()
            return <div key={p.id} className="rounded-lg border border-border p-3"><h4 className="mb-2 text-sm font-semibold">Dates clés · {varieties[p.variety_id]||'Plantation'}</h4><dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {[
                ['Plantation',date(p.planting_date)],['Début récolte prévu',date(p.harvest_start_date||p.first_harvest_date||null)],
                ['Fin récolte prévue',date(p.harvest_end_date||p.last_harvest_date||null)],['Première récolte enregistrée',date(hd[0]||null)],
                ['Dernière récolte enregistrée',date(hd[hd.length-1]||null)],['Nombre de plants',fmt(p.plant_count??null)],['Densité renseignée (plants/m²)',fmt(p.actual_density??null)],
              ].map(([label,value])=><div key={label}><dt className="text-xs text-fg-secondary">{label}</dt><dd className="font-medium">{value}</dd></div>)}
            </dl></div>
          })}</div>
          <p className="mt-2 text-xs text-fg-tertiary">La dernière récolte saisie ne constitue pas une date de fin réelle du cycle. Les dates prévues restent distinctes des récoltes enregistrées.</p>
          {planned!=null&&planned>0&&<div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span>Réalisation de l’objectif</span><strong>{fmt(total/planned*100)} %</strong></div><progress className="h-2 w-full accent-brand" aria-label="Réalisation de l’objectif de production" value={Math.min(total,planned)} max={planned}/></div>}
          <p className="mt-3 text-xs text-fg-tertiary">Récolte brute, déchets inclus. Les surfaces plantées sont cumulées si plusieurs cycles sont présents. Un objectif incomplet n’est pas assimilé à zéro.</p>
        </section>
        <section className="rounded-xl border border-border p-4"><h3 className="font-semibold">Historique des récoltes</h3><p className="my-2 text-sm text-fg-secondary">{harvests.length} saisie(s) · Première : {date(dates[0]||null)} · Dernière : {date(dates[dates.length-1]||null)}</p>
          {!!harvests.length&&<div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead className="text-left text-fg-tertiary"><tr><th className="p-2">Date</th><th className="p-2">Variété</th><th className="p-2 text-right">Quantité (kg)</th></tr></thead><tbody>{[...harvests].sort((a,b)=>b.harvest_date.localeCompare(a.harvest_date)).map(h=><tr key={h.id} className="border-t border-border"><td className="p-2">{date(h.harvest_date)}</td><td className="p-2">{varieties[plantings.find(p=>p.id===h.campaign_planting_id)?.variety_id||'']||'Non renseignée'}</td><td className="p-2 text-right tabular-nums">{fmt(Number(h.total_qty))}</td></tr>)}</tbody></table></div>}
          {!harvests.length&&<p className="text-sm">Aucune récolte enregistrée. Cela ne prouve pas l’absence de récolte réelle.</p>}
        </section>
      </>}
      {campaignId&&ready&&<GreenhouseInterventions domainId={domainId} farmId={farmId} campaignId={campaignId} greenhouseId={greenhouse.id} plantingIds={plantings.map(p=>p.id)}/>}
      {campaignId&&<section className="rounded-xl border border-border p-4"><ProductionCostReport compact compactKpiTarget={costKpiTarget} fixedCampaign={campaignId} fixedGreenhouse={greenhouse.id}/></section>}
      <p className="text-xs text-fg-tertiary">CA et marge : non disponibles dans cette fiche tant que les ventes ne sont pas rapprochées de cette serre. Aucun montant estimé n’est présenté comme un réalisé.</p>
      <nav aria-label="Accès aux modules de la serre" className="flex flex-wrap gap-2">{[['/serres','Référentiel des serres'],['/plantations','Plantations'],['/recoltes','Récoltes'],['/couts/pilotage','Analyse des coûts']].map(([url,label])=><Link key={url} href={url} className="rounded-md border border-border px-3 py-2 text-sm text-brand hover:bg-brand/10">{label}</Link>)}</nav>
      <p className="text-xs text-fg-tertiary">Ces liens ouvrent les modules ; leurs filtres restent à sélectionner.</p>
    </div>
  </dialog>
}
