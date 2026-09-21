'use client'
import Link from 'next/link'
import { ArrowUpRight, ArrowRight, Sprout, Target, AlertTriangle, CalendarDays } from 'lucide-react'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'
type Priority={label:string;count:number|null;detail:string;href:string}
export function ExecutiveOverview({farmName,campaignName,kg,target,progress,late,missing,stock,pending,partial,upcoming,at}: {
 farmName:string;campaignName:string;kg:number|null;target:number|null;progress:number|null;late:number|null;missing:number|null;stock:number|null;pending:number|null;partial:boolean;upcoming:{name:string;planned:string;href:string}[];at:string
}){
 const priorities:Priority[]=[
  {label:'Interventions en retard',count:late,detail:'Validées, mais sans confirmation d’exécution.',href:'/interventions'},
  {label:'Saisies de récolte à vérifier',count:missing,detail:'Aucune saisie récente dans la fenêtre prévue.',href:'/recoltes'},
  {label:'Stocks sous seuil',count:stock,detail:'Vérifier les besoins avant de réapprovisionner.',href:'/stocks'},
  {label:'Demandes à valider',count:pending,detail:'Consulter les demandes selon vos habilitations.',href:'/validations'},
 ]
 const open=priorities.filter(p=>p.count!=null&&p.count>0)
 const percent=Math.max(0,Math.min(100,progress??0)),circumference=2*Math.PI*54
 return <div className="grid min-w-0 gap-4 xl:grid-cols-[1.7fr_1fr]">
  <section className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg sm:p-8" style={{background:'linear-gradient(120deg,#102d32 0%,#124c43 60%,#166955 100%)'}}>
   <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border border-white/10"/>
   <div className="relative flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-emerald-100"><Sprout size={16}/>Le point sur votre exploitation</span><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">{partial?'Données partielles':'Données chargées'} · {at}</span></div>
   <h2 className="relative mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{farmName}</h2><p className="mt-1 text-sm text-emerald-100">{campaignName}</p>
   <div className="relative mt-6 grid items-center gap-6 sm:grid-cols-[1fr_150px]">
    <div><p className="text-sm text-emerald-100">Production récoltée sur la campagne</p><p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{kg==null?'—':fmt(kg/1000)} <span className="text-xl font-normal text-emerald-100">tonnes</span></p>
     <p className="mt-4 max-w-lg text-sm leading-relaxed text-emerald-50">{kg==null?'Les données de récolte ne sont pas disponibles.':target!=null&&target>0?`${fmt(Math.max(0,target-kg)/1000)} tonnes restent à produire pour atteindre l’objectif de campagne de ${fmt(target/1000)} tonnes.`:'Renseignez les objectifs de production pour mesurer l’avancement de la campagne.'}</p>
    </div>
    <div className="relative mx-auto h-36 w-36" role="img" aria-label={progress==null?'Objectif non calculable':`${fmt(progress)} % de l’objectif de campagne`}>
     <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8"/><circle cx="64" cy="64" r="54" fill="none" stroke="#6ee7b7" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference*(1-percent/100)}/></svg>
     <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl">{progress==null?'—':fmt(progress)+' %'}</strong><span className="text-xs text-emerald-100">de l’objectif</span></div>
    </div>
   </div>
   <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-white/20 pt-4"><span className="flex items-center gap-2 text-sm"><Target size={16}/>{open.length?`${open.length} sujet(s) à examiner`:'Aucun signal détecté dans les données chargées'}</span><Link href="/plan-culture" className="ml-auto inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">Explorer mes serres<ArrowRight size={15}/></Link></div>
   <p className="relative mt-3 text-[11px] text-emerald-100">Récolte brute, déchets inclus. L’objectif est celui de la campagne entière, pas une prévision à date.</p>
  </section>
  <section className="min-w-0 rounded-2xl border border-border bg-surface-raised p-5 shadow-sm">
   <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-warning"/>Votre attention aujourd’hui</h2><p className="mt-1 text-xs text-fg-secondary">Des signaux factuels, des actions accessibles.</p>
   <div className="mt-4 space-y-2">{open.length?open.map((p,i)=><Link key={p.label} href={p.href} className="group flex items-start gap-3 rounded-xl border border-border p-3 hover:border-brand/40 hover:bg-brand/5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 font-bold text-warning">{p.count}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{p.label}</p><p className="mt-1 text-xs text-fg-secondary">{p.detail}</p></div><ArrowUpRight size={15} className="text-fg-tertiary"/></Link>):<p className="rounded-lg bg-surface-input p-3 text-sm text-fg-secondary">{partial?'Certaines sources sont indisponibles : vérifiez les messages de qualité des données.':'Aucun retard, seuil de stock ou silence de récolte détecté avec les filtres actuels.'}</p>}</div>
   <div className="mt-4 border-t border-border pt-3"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary"><CalendarDays size={14}/>Prochaine échéance chargée</h3>{upcoming[0]?<Link href={upcoming[0].href} className="mt-2 block text-sm"><strong>{upcoming[0].name}</strong><p className="text-fg-secondary">{new Date(upcoming[0].planned).toLocaleString('fr-FR')}</p></Link>:<p className="mt-2 text-sm text-fg-tertiary">Aucune dans l’horizon sélectionné.</p>}</div>
  </section>
 </div>
}
