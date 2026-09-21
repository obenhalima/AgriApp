'use client'
import {useState} from 'react'
import {CartesianGrid,Legend,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {harvestPeriodSummary,type HarvestPeopleRow} from '@/lib/harvestPeople'
const fmt=(n:number|null)=>n==null?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})
const date=(v:string)=>new Date(`${v}T00:00:00Z`).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
export function HarvestPeopleSummary({rows}:{rows:HarvestPeopleRow[]}){
 const [period,setPeriod]=useState<'day'|'week'>('day')
 const points=harvestPeriodSummary(rows,period)
 const total=points.reduce((s,p)=>({kg:s.kg+p.kg,expected:s.expected+p.expected,people:s.people+p.personDays,excluded:s.excluded+p.excluded,count:s.count+p.count}),{kg:0,expected:0,people:0,excluded:0,count:0})
 const attainment=total.expected>0?total.kg/total.expected*100:null
 const met=points.filter(p=>p.attainment!=null&&p.attainment>=100).length
 const assessed=points.filter(p=>p.count>0).length
 return <section className="space-y-4" aria-label="Synthèse des objectifs de récolte">
  <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="font-bold text-xl">Réalisé et objectifs · {period==='day'?'par jour':'par semaine'}</h2><div className="flex gap-2">{(['day','week'] as const).map(p=><button key={p} aria-pressed={p===period} onClick={()=>setPeriod(p)} className={`rounded-lg border px-4 py-2 ${p===period?'bg-brand text-white':'bg-surface-raised border-border'}`}>{p==='day'?'Par jour':'Par semaine'}</button>)}</div></div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
   ['Récolté comparable',total.count?fmt(total.kg)+' kg':'—'],['Objectif cumulé',total.count?fmt(total.expected)+' kg':'—'],['Atteinte de l’objectif',attainment==null?'—':fmt(attainment)+' %'],['Écart réalisé − objectif',total.count?fmt(total.kg-total.expected)+' kg':'—']
  ].map(([label,value])=><div key={label} className="rounded-xl border border-border bg-surface-raised p-4"><p className="text-sm text-fg-secondary">{label}</p><strong className="text-xl text-brand">{value}</strong></div>)}</div>
  <div className="rounded-xl bg-brand/5 p-4 space-y-2">
   <p>{assessed?`${met} ${period==='day'?'jour(s)':'semaine(s)'} sur ${assessed} avec objectif atteint. Productivité : ${fmt(total.kg/total.people)} kg/journée-personne, pour un objectif pondéré de ${fmt(total.expected/total.people)}.`:'Aucune saisie comparable : renseignez l’effectif, un objectif et la déclaration de journée complète.'}</p>
   <p className="text-sm text-fg-secondary">{total.excluded} saisie(s) exclue(s) de la comparaison. Objectif = effectif déclaré × objectif journalier conservé. Par semaine (lundi–dimanche), les objectifs des journées renseignées sont additionnés : ce n’est pas une prévision sur sept jours. Une semaine filtrée ou incomplètement saisie est donc partielle.</p>
   <p className="text-xs text-fg-secondary">Les journées-personnes sont des participations déclarées, pas un nombre de personnes distinctes. Ne déclarez pas plusieurs journées complètes pour les mêmes personnes le même jour. Les jours sans saisie ne sont pas assimilés à zéro production.</p>
  </div>
  {assessed>0&&<div className="rounded-xl border border-border bg-surface-raised p-4"><h3 className="font-semibold mb-3">Courbe du réalisé face à l’objectif (kg)</h3><div className="h-72 min-w-0" role="img" aria-label="Courbe en kilos, détaillée dans le tableau ci-dessous"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{left:15,right:15,top:10,bottom:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={date} minTickGap={40}/><YAxis tickFormatter={v=>Number(v).toLocaleString('fr-FR')}/><Tooltip labelFormatter={v=>`${period==='week'?'Semaine du ':''}${date(String(v))}`} formatter={(v:number)=>[fmt(v)+' kg']}/><Legend/><Line name="Récolté comparable" type="linear" dataKey="actual" stroke="#6366f1" strokeWidth={3} dot={{r:3}} connectNulls={false}/><Line name="Objectif cumulé" type="linear" dataKey="objective" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={{r:3}} connectNulls={false}/></LineChart></ResponsiveContainer></div></div>}
  <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised"><table className="w-full text-sm [&_th]:p-3 [&_td]:p-3 [&_td]:whitespace-nowrap"><thead><tr>{[period==='day'?'Jour':'Semaine du lundi','Jours comparables','Réalisé kg','Objectif kg','Écart kg','Atteinte','Kg/journée-personne','Saisies exclues'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{points.map(p=><tr key={p.date} className="border-t border-border"><td>{date(p.date)}</td><td>{p.days}</td><td>{fmt(p.actual)}</td><td>{fmt(p.objective)}</td><td>{fmt(p.gap)}</td><td>{p.attainment==null?'—':fmt(p.attainment)+' %'}</td><td>{fmt(p.perPersonDay)}</td><td>{p.excluded}</td></tr>)}</tbody></table>{!points.length&&<p className="p-4">Aucune récolte sur la période.</p>}</div>
 </section>
}
