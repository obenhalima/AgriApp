'use client'
import {useLanguage} from '@/lib/i18n'

import { useState } from 'react'
import Link from 'next/link'
import { ConnectedGreenhouseDialog } from '@/components/plan-culture/ConnectedGreenhouseDialog'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'
import type { activity360, production360 } from '@/lib/agronomy360'

export function TerrainOverview({production, activities, ready, operational, canHarvest, canStock, stockAlerts, domainId, campaignId, farms}: {
 domainId:string; campaignId:string; farms:{id:string;name:string}[];
 production:ReturnType<typeof production360>; activities:ReturnType<typeof activity360>; ready:boolean; operational:boolean; canHarvest:boolean; canStock:boolean; stockAlerts:number|null
}) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

 const [selected,setSelected]=useState<string|null>(null)
 const greenhouse=production.gs.find(g=>g.id===selected)
 return <div className="space-y-5">
  {greenhouse&&<ConnectedGreenhouseDialog key={`${domainId}:${campaignId}:${greenhouse.id}`} greenhouse={greenhouse} farmName={farms.find(f=>f.id===greenhouse.farm_id)?.name||'Ferme'} domainId={domainId} farmId={greenhouse.farm_id} campaignId={campaignId} onClose={()=>setSelected(null)}/>}
  <section className="rounded-2xl bg-[#e6edda] p-6 text-[#24412d]">
   <p className="text-xs font-semibold uppercase tracking-widest">{_ui("Le terrain, en un regard")}</p>
   <h2 className="mt-2 text-3xl font-semibold tracking-tight">{_ui("Une journée bien pilotée.")}</h2>
   <p className="mt-2 text-sm">{_ui("Serres, saisies et échéances de la campagne sélectionnée. Les retards restent visibles jusqu’à leur confirmation.")}</p>
  </section>
  <div className="grid gap-4 sm:grid-cols-3">
   {[[_ui("Récolte de campagne"),ready?fmt(production.kg)+' kg':'—'],[_ui("Interventions en retard"),operational?String(activities.late.length):'—'],[_ui("Articles sous seuil"),stockAlerts==null?'—':String(stockAlerts)]].map(([label,value])=><div key={label} className="rounded-xl border border-border bg-surface-raised p-5"><p className="text-sm text-fg-secondary">{_uiNode(label)}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}
  </div>
  <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
   <section className="rounded-2xl border border-border bg-surface-raised p-5"><h2 className="text-lg font-semibold">{_ui("Votre ferme, serre par serre ·")}{" "}{production.terrain.length} {" "}{_ui("serre(s)")}</h2><p className="mb-5 text-xs text-fg-secondary">{_ui("Toutes les serres du périmètre, même sans plantation dans la campagne sélectionnée. Vue schématique, non géographique. Cliquez pour consulter la fiche.")}</p>
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#eff3e9] p-4 sm:grid-cols-3">{production.terrain.map(g=><button key={g.id} aria-label={_ui("Ouvrir la fiche serre {v0}",{v0:String(g.name)})} aria-haspopup="dialog" onClick={()=>setSelected(g.id)} className="rounded-t-3xl rounded-b-lg border border-[#b8cba8] bg-[#dfead5] p-4 text-left text-[#26482e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"><strong className="text-lg">{g.name}</strong><p className="text-xs">{farms.find(f=>f.id===g.farm_id)?.name||_ui("Ferme")}</p><p className="mt-2 text-xs">{g.plantings?_ui("{v0} m² plantés",{v0:String(fmt(g.area))}):_ui("{v0} m² de surface",{v0:String(fmt(g.totalArea))})}</p><p className="text-sm">{!g.plantings?_ui("Sans plantation sur cette campagne"):!g.area?_ui("Surface plantée à renseigner"):ready?fmt(g.kg)+_ui("kg récoltés"):_ui("Récolte indisponible")}</p></button>)}</div>
    {!production.terrain.length&&<p className="py-4 text-sm">{_ui("Aucune serre dans ce périmètre, ou données indisponibles. Vérifiez le filtre Ferme et vos droits de consultation.")}</p>}

   </section>
   <section className="rounded-2xl border border-border bg-surface-raised p-5"><h2 className="text-lg font-semibold">{_ui("Vos prochaines actions")}</h2><div className="mt-3 divide-y divide-border">{[...activities.late,...activities.upcoming].slice(0,6).map(a=><Link key={a.family+a.id} href={a.href} className="block py-4 hover:text-brand"><span className="text-xs text-fg-secondary">{_ui(a.family)} · {new Date(a.planned).toLocaleDateString(_uiLocale)}</span><strong className="block">{a.name} ↗</strong><span className="text-xs">{activities.late.includes(a)?_ui("En retard"):a.status==='soumise'?_ui("À valider"):_ui("À venir")}</span></Link>)}</div>{!activities.late.length&&!activities.upcoming.length&&<p className="mt-4 text-sm text-fg-secondary">{operational?_ui("Aucune échéance dans l’horizon sélectionné."):_ui("Interventions indisponibles.")}</p>}</section>
  </div>
  <div className="flex flex-wrap gap-3">{canHarvest&&<Link className="btn btn-primary" href="/recoltes">{_ui("Saisir une récolte →")}</Link>}{canStock&&<Link className="btn btn-secondary" href="/stocks">{_ui("Consulter les stocks →")}</Link>}</div>
  <p className="text-xs text-fg-tertiary">{_ui("Les raccourcis ouvrent les modules ; vérifiez leur périmètre avant toute saisie.")}</p>
 </div>
}
