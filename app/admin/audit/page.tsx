'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useEffect,useRef,useState} from 'react'
import {ShieldCheck} from 'lucide-react'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {supabase} from '@/lib/supabase'
import {PageHeader} from '@/components/ui/PageHeader'
import {Input,Select} from '@/components/ui/Input'
import {auditEntityLabel,auditTableLabel} from '@/lib/auditPresentation'
import {AuditEventDetails} from '@/components/audit/AuditEventDetails'
import {AuditHistoryButton} from '@/components/audit/AuditHistoryButton'
import {auditArgs,auditCsv,auditDate,auditError,auditActionLabels,type AuditFilters,type AuditReport} from '@/lib/auditReport'

const initial=():AuditFilters=>({from:new Date(Date.now()-29*86400000).toISOString().slice(0,10),to:new Date().toISOString().slice(0,10),category:'',action:'',actor:'',table:''})
export default function AuditPage(){
 const {t:_ui,locale}=useLanguage()
 const {activeDomain,isAdmin,isPlatformAdmin,loading:authLoading}=useAuth()
 const domain=activeDomain?.domain_id||'',allowed=isAdmin||isPlatformAdmin
 const [platform,setPlatform]=useState(false)
 const reportKey=platform?'platform':domain
 const [filters,setFilters]=useState(initial),[applied,setApplied]=useState<AuditFilters|null>(null)
 const [state,setState]=useState<{domain:string;report:AuditReport}|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const sequence=useRef(0),abort=useRef<AbortController|null>(null)
 const report=state?.domain===reportKey?state.report:null
 useEffect(()=>{sequence.current++;abort.current?.abort();setState(null);setApplied(null);setError('');setBusy(false);setFilters(initial());return()=>{sequence.current++;abort.current?.abort()}},[domain,allowed,platform])
 async function load(more=false){
  if(!allowed||(!platform&&!domain)||busy)return
  const selected=more&&applied?applied:filters,prior=more?report:null
  let args
  try{args=auditArgs(platform?null:domain,selected,more?prior?.events.at(-1):undefined)}catch(e){setError((e as Error).message);return}
  const id=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller
  setBusy(true);setError('');if(!more)setState(null)
  try{
   const {data,error:failure}=await supabase.rpc('audit_report',args).abortSignal(controller.signal)
   if(id!==sequence.current)return
   if(failure)throw failure
   if(!data||!Array.isArray(data.events)||!data.summary)throw Error('Invalid report')
   setApplied(selected);setState({domain:reportKey,report:{...data,events:[...(prior?.events||[]),...data.events]}})
  }catch(e){if(id===sequence.current&&!controller.signal.aborted)setError(auditError(e as {code?:string}))}
  finally{if(id===sequence.current)setBusy(false)}
 }
 function exportCsv(){if(!report||!applied)return;const client=platform?'PLATEFORME':activeDomain?.domain_code||domain;const blob=new Blob([auditCsv(report.events,client)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`audit-${client}-${applied.from}-${applied.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 if(authLoading)return <p role="status">{_ui('Chargement…')}</p>
 if(!allowed)return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{_ui('Rapport réservé aux administrateurs du client actif.')}</p>
 const patch=(key:keyof AuditFilters,value:string)=>setFilters(f=>({...f,[key]:value}))
 return <div className="space-y-5">
  <PageHeader title={_ui('Piste d’audit')} subtitle={platform?_ui('Plateforme / paramétrage partagé'):activeDomain?.domain_name||''} description={_ui('Connexions, transactions et validations du client actif.')} icon={ShieldCheck}/>
  {isPlatformAdmin&&<label className="block max-w-md">{_ui('Périmètre du rapport')}<Select value={platform?'platform':'client'} onChange={e=>setPlatform(e.target.value==='platform')}><option value="client">{_ui('Client actif')}</option><option value="platform">{_ui('Plateforme / paramétrage partagé')}</option></Select></label>}
  <p className="text-sm text-fg-secondary">{_ui('Horaires : Africa/Casablanca. Période de recherche en UTC, 93 jours maximum.')}</p>
  <form className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden" onSubmit={e=>{e.preventDefault();void load()}}>
   <label>{_ui('Du (UTC)')}<Input type="date" required value={filters.from} onChange={e=>patch('from',e.target.value)}/></label>
   <label>{_ui('Au (UTC)')}<Input type="date" required value={filters.to} onChange={e=>patch('to',e.target.value)}/></label>
   <label>{_ui('Catégorie')}<Select value={filters.category} onChange={e=>patch('category',e.target.value)}><option value="">{_ui('Toutes')}</option><option value="connection">{_ui('Connexions')}</option><option value="transaction">{_ui('Transactions')}</option></Select></label>
   <label>{_ui('Action')}<Select value={filters.action} onChange={e=>patch('action',e.target.value)}><option value="">{_ui('Toutes')}</option>{Object.entries(auditActionLabels).map(([key,label])=><option value={key} key={key}>{_ui(label)}</option>)}</Select></label>
   <label>{_ui('Utilisateur')}<Select value={filters.actor} onChange={e=>patch('actor',e.target.value)}><option value="">{_ui('Tous')}</option>{report?.actor_options?.map(a=><option value={a.actor_id} key={a.actor_id}>{a.actor_label}</option>)}</Select></label>
   <label>{_ui('Module / type de fiche')}<Select value={filters.table} onChange={e=>patch('table',e.target.value)}><option value="">{_ui('Toutes')}</option><option value="auth">{_ui('Authentification')}</option>{report?.coverage.map(t=><option key={t} value={t}>{_ui(auditTableLabel(t))}</option>)}</Select></label>
   <button className="btn btn-primary" disabled={busy||!domain}>{busy?_ui('Chargement…'):_ui('Afficher le rapport')}</button>
  </form>
  {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{_ui(error)}</p>}
  {report&&<>
   <p className="text-sm">{platform?_ui('Plateforme / paramétrage partagé'):activeDomain?.domain_code} · {applied?.from} → {applied?.to} (UTC)</p>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[[_ui('Événements'),report.summary.total],[_ui('Connexions'),report.summary.logins],[_ui('Transactions'),report.summary.transactions],[_ui('Validations'),report.summary.validations]].map(([label,value])=><div className="card p-4" key={label}><p>{label}</p><strong className="text-2xl">{value}</strong></div>)}</div>
   {!report.summary.logins&&<p className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-950 text-sm">{_ui(!report.auth_source_present?'Source des connexions indisponible sur cette base.':!report.connection_diagnostics?'Diagnostic des connexions à activer avec le complément d’audit.':report.connection_diagnostics.own_refreshes>0&&!report.connection_diagnostics.own_logins?'Votre session a été renouvelée, mais aucune nouvelle connexion de votre compte n’est enregistrée sur cette période.':'Aucune connexion remontée pour ces filtres. Vérifiez la période et le stockage des journaux Auth en base, puis effectuez une nouvelle connexion.')}</p>}
   <details className="text-sm"><summary className="cursor-pointer">{_ui('Comprendre les connexions affichées')}</summary><p>{_ui('Les connexions concernent les comptes rattachés au client. Les administrateurs de plateforme voient aussi les accès aux comptes plateforme, identifiés séparément. Un accès au compte ne prouve ni le client utilisé ni une présence en ligne. Les tentatives non attribuables ne sont pas incluses.')}</p></details>
   <p className="text-sm">{_ui('Les transactions sont journalisées après activation, sans reconstitution du passé. Seuls les champs autorisés sont conservés. Les opérations annulées en base ne sont pas comptées.')}</p>
   <p className="text-sm">{_ui('Une transaction SQL peut regrouper plusieurs événements. Son identifiant est disponible dans le détail.')}</p>
   {!report.auth_source_present&&<p role="alert" className="text-red-800">{_ui('Source des connexions indisponible sur cette base.')}</p>}
   {Boolean(report.unassigned_events)&&<p role="alert" className="text-red-800">{_ui('Événements sans client à examiner par l’administrateur de plateforme.')} ({report.unassigned_events})</p>}
   <div className="flex flex-wrap gap-3 print:hidden"><button className="btn btn-secondary" onClick={exportCsv} disabled={!report.events.length}>{_ui('Exporter les lignes chargées (CSV)')}</button><button className="btn btn-secondary" onClick={()=>window.print()}>{_ui('Imprimer le rapport affiché')}</button></div>
   <p className="text-sm" role="status">{_ui('Lignes chargées / événements filtrés')} : {report.events.length} / {report.summary.total}</p>
   <div className="overflow-x-auto"><FilterableTable className="w-full text-sm"><caption className="sr-only">{_ui('Journal du client actif')}</caption><thead><tr>{['Date / heure','Utilisateur','Action','Module / type de fiche','Fiche','Détail'].map(t=><th className="p-3 text-start" key={t}>{_ui(t)}</th>)}</tr></thead><tbody>{report.events.map(e=><tr key={e.event_id} className="border-t align-top"><td className="p-3 whitespace-nowrap">{auditDate(e.occurred_at,locale)}</td><td className="p-3">{e.actor_label}</td><td className="p-3">{_ui(auditActionLabels[e.action]||e.action)}</td><td className="p-3">{_ui(auditTableLabel(e.table_name))}</td><td className="p-3">{_ui(auditEntityLabel(e))}{e.scope_kind==='unassigned'&&<p className="text-red-700">{_ui('Client à déterminer')}</p>}{!platform&&e.category==='transaction'&&e.entity_id&&<div className="mt-2"><AuditHistoryButton table={e.table_name} entity={e.entity_id} label={_ui("Historique de cette fiche")}/></div>}</td><td className="p-3"><AuditEventDetails event={e}/></td></tr>)}</tbody></FilterableTable></div>
   {!report.events.length&&<p>{_ui('Aucun événement pour ces filtres. Un journal vide ne prouve pas une absence d’activité.')}</p>}
   {report.has_more&&<button className="btn btn-secondary print:hidden" disabled={busy} onClick={()=>void load(true)}>{_ui('Charger la suite')}</button>}
   <details className="card p-4"><summary className="cursor-pointer">{_ui('Périmètre de journalisation')}</summary><p>{report.started_at&&auditDate(report.started_at,locale)}</p><p className="text-sm">{_ui('Tables couvertes à l’installation. Les nouvelles tables ou les rattachements ambigus doivent être examinés séparément.')}</p><p className="break-words">{report.coverage.map(auditTableLabel).join(', ')}</p></details>
  </>}
 </div>
}
