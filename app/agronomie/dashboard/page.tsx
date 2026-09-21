'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, Leaf, RefreshCw, ArrowUpRight } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'
import { buildFarmPerformance, type PerformanceData } from '@/lib/farmPerformance'
import { activity360, production360, defaultAgroCampaign, type AgroActivity, type AgroPlanting, type AgroHarvest, type AgroGreenhouse } from '@/lib/agronomy360'
import { ExecutiveOverview } from '@/components/agronomy/ExecutiveOverview'
import { ProductionExplorer } from '@/components/costs/ProductionExplorer'
import { useAnalyticalEntry } from '@/lib/useAnalyticalEntry'
import { analyticalHref, type AnalyticalScope } from '@/lib/analyticalNavigation'

const panel='min-w-0 rounded-xl border border-border bg-surface-raised p-5'
const input='rounded-md border border-border bg-surface-input px-3 py-2 text-sm text-fg-primary'
const arr=(x:any):any[]=>Array.isArray(x)?x:x?[x]:[]
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Casablanca'})
type Data={plantings:AgroPlanting[];harvests:AgroHarvest[];greenhouses:AgroGreenhouse[];activities:AgroActivity[];balances:any[];warehouses:any[];finance:PerformanceData|null;ready:Record<string,boolean>;errors:string[];at:string}
export default function AgronomyDashboardPage(){const {activeDomain}=useAuth();const entry=useAnalyticalEntry(activeDomain?.domain_id);if(!activeDomain)return <p>Sélectionnez un client.</p>;if(!entry)return <p>Chargement du périmètre…</p>;return <Dashboard key={activeDomain.domain_id+JSON.stringify(entry)} entry={entry}/>}
function Dashboard({entry}:{entry:AnalyticalScope}){
 const {activeDomain,hasPermission}=useAuth(),domain=activeDomain?.domain_id
 const allowed=hasPermission('agronomie','view'),canCost=hasPermission('couts','view'),canStock=hasPermission('stocks','view'),canHarvest=hasPermission('recoltes','view'),canProduction=hasPermission('production','view')
 const [farms,setFarms]=useState<any[]>([]),[campaigns,setCampaigns]=useState<any[]>([]),[farm,setFarm]=useState(''),[campaign,setCampaign]=useState(''),[refsError,setRefsError]=useState('')
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[days,setDays]=useState(15),[absence,setAbsence]=useState(7)
 const [selectionNote,setSelectionNote]=useState('Recherche de la campagne en cours…')
 const [section,setSection]=useState<'overview'|'explore'>('overview')
 useEffect(()=>{if(!campaign||!allowed)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setReload(n=>n+1)},300000);return()=>clearInterval(timer)},[campaign,allowed])
 useEffect(()=>{
  if(!domain||!allowed)return
  let stop=false;const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000)
  void Promise.all([supabase.from('farms').select('id,name').eq('domain_id',domain).eq('is_active',true).order('name').abortSignal(c.signal),supabase.from('campaigns').select('id,name,farm_id,status,preparation_start,planting_start,campaign_end').eq('domain_id',domain).order('name').abortSignal(c.signal)]).then(([f,p])=>{if(stop)return;if(f.error||p.error)throw Error(f.error?.message||p.error?.message);setFarms(f.data||[]);setCampaigns(p.data||[]);const choice=defaultAgroCampaign(p.data||[],today());const preserved=(p.data||[]).some(x=>x.id===entry.campaign);setCampaign(preserved?entry.campaign:choice.id);setFarm((f.data||[]).some(x=>x.id===entry.farm)?entry.farm:'');setSelectionNote(preserved?'Campagne conservée depuis votre analyse':choice.reason)}).catch(e=>{if(!stop)setRefsError(e.message)}).finally(()=>clearTimeout(timer))
  return()=>{stop=true;c.abort();clearTimeout(timer)}
 },[domain,allowed])
 useEffect(()=>{
  setData(null);setBusy(false)
  if(!domain||!allowed||!campaign)return
  let stop=false;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  const d:Data={plantings:[],harvests:[],greenhouses:[],activities:[],balances:[],warehouses:[],finance:null,ready:{},errors:[],at:''}
  setBusy(true)
  async function paged(make:(start:number)=>any){const rows:any[]=[];for(let start=0;;start+=500){const r=await make(start).range(start,start+499).abortSignal(controller.signal);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data?.length||0)<500)return rows}}
  async function source(name:string,permission:boolean,fn:()=>Promise<void>){if(!permission){d.errors.push(`${name} : droit de consultation requis.`);return}try{await fn();d.ready[name]=true}catch{d.errors.push(`${name} : indisponible (connexion, droits ou module à vérifier).`)}}
  async function load(){
   await source('Production',canProduction,async()=>{
    const [g,p]=await Promise.all([
     paged(()=>supabase.from('greenhouses').select('id,code,name,farm_id,total_area,farms!inner(domain_id)').eq('farms.domain_id',domain).order('id')),
     paged(()=>supabase.from('campaign_plantings').select('id,greenhouse_id,variety_id,planted_area,planting_date,harvest_start_date,harvest_end_date,first_harvest_date,last_harvest_date,status,target_total_production,target_yield_per_m2').eq('domain_id',domain).eq('campaign_id',campaign).order('id'))
    ]);d.greenhouses=g;d.plantings=p
   })
   await Promise.all([
    source('Récoltes',canHarvest&&d.ready.Production,async()=>{d.harvests=await paged(()=>supabase.from('harvests').select('id,campaign_planting_id,harvest_date,total_qty,campaign_plantings!inner(campaign_id)').eq('domain_id',domain).eq('campaign_plantings.campaign_id',campaign).order('id'))}),
    source('Finances',canCost,async()=>{const r=await supabase.rpc('get_farm_performance_data',{p_domain:domain,p_campaign:campaign,p_start:null,p_end:null}).abortSignal(controller.signal);if(r.error)throw r.error;d.finance=r.data}),
    source('Stocks',canStock,async()=>{[d.warehouses,d.balances]=await Promise.all([
     paged(()=>supabase.from('warehouses').select('id,name,farm_id').eq('domain_id',domain).order('id')),
     paged(()=>supabase.from('warehouse_stocks').select('warehouse_id,stock_item_id,current_qty,min_qty,inventory_value,valuation_verified,stock_items(name,unit)').eq('domain_id',domain).order('warehouse_id').order('stock_item_id'))
    ])}),
    source('Phyto',!!d.ready.Production,async()=>{
     const ps=new Map(d.plantings.map(p=>[p.id,p])),gs=new Map(d.greenhouses.map(g=>[g.id,g]))
     const ids=d.plantings.map(p=>p.id),seen=new Set<string>()
     for(let start=0;start<ids.length;start+=100){const requests=await paged(()=>supabase.from('treatment_requests').select('id,planned_at,status,target_name,treatment_request_targets!inner(campaign_planting_id),treatment_applications(application_status,actual_started_at)').eq('domain_id',domain).in('treatment_request_targets.campaign_planting_id',ids.slice(start,start+100)).order('id'))
      for(const r of requests){const farms=Array.from(new Set(arr(r.treatment_request_targets).map(t=>gs.get(ps.get(t.campaign_planting_id)?.greenhouse_id||'')?.farm_id).filter(Boolean))) as string[]
       if(seen.has(r.id)){const previous=d.activities.find(x=>x.family==='Phyto'&&x.id===r.id);if(previous)previous.farms=Array.from(new Set([...previous.farms,...farms]));continue}seen.add(r.id);const apps=arr(r.treatment_applications),a=apps[0]
       d.activities.push({id:r.id,family:'Phyto',name:r.target_name,farms,planned:r.planned_at,actual:a?.actual_started_at||null,status:a?.application_status||r.status,done:apps.some(a=>['realisee','partielle'].includes(a.application_status)),closed:!!a||['annulee','rejetee'].includes(r.status),water:null,href:'/agronomie/traitements'})}
     }
    }),
    ...(['cultural_workspace','irrigation_workspace'] as const).map(rpc=>source(rpc==='cultural_workspace'?'Cultural':'Irrigation',true,async()=>{
     const r=await supabase.rpc(rpc,{p_domain:domain}).abortSignal(controller.signal);if(r.error)throw r.error
     for(const p of r.data?.programs||[]){if(p.campaign_id!==campaign)continue;for(const o of p.occurrences||[]){const confirmed=!!o.confirmed_at;d.activities.push({id:o.id,family:rpc==='irrigation_workspace'?'Irrigation':arr(r.data?.families).find(f=>f.code===p.family)?.name||p.family,name:p.title,farms:[p.farm_id],planned:o.planned_at,actual:o.performed_at,status:confirmed?'realisee':o.cancelled_at?'non_realisee':p.status,done:confirmed,closed:confirmed||!!o.cancelled_at||['annulee','rejetee','terminee'].includes(p.status),water:confirmed?(rpc==='irrigation_workspace'?o.actual_liters:o.actual?.water_liters)??null:null,href:rpc==='irrigation_workspace'?'/interventions':'/interventions/programmes'})}}
    }))
   ])
   clearTimeout(timer);if(!stop){d.at=new Date().toLocaleTimeString('fr-FR');setData(d);setBusy(false)}
  }
  void load().catch(()=>{if(!stop){setBusy(false);setData({...d,errors:[...d.errors,'Chargement interrompu. Actualisez le tableau de bord.']})}})
  return()=>{stop=true;controller.abort();clearTimeout(timer)}
 },[domain,allowed,canCost,canStock,canHarvest,canProduction,campaign,reload])
 const production=useMemo(()=>data?production360(data.plantings,data.harvests,data.greenhouses,farm,today(),absence):null,[data,farm,absence])
 const activities=useMemo(()=>data?activity360(data.activities,farm,Date.now(),days):null,[data,farm,days])
 const financial=useMemo(()=>data?.finance?buildFarmPerformance(data.finance,{farm,level:'farm'}):null,[data,farm])
 const costs=financial?.rows.length?financial.rows.reduce((s,r)=>s+r.direct+r.shared,0):null,financeKg=financial?.rows.reduce((s,r)=>s+r.kg,0)||0
 const costIncomplete=!!financial&&(financial.pendingCount>0||financial.unallocated!==0||financial.rows.some(r=>r.costMissing||r.provisional))
 const balances=data?.balances.filter(b=>!farm||data.warehouses.some(w=>w.id===b.warehouse_id&&w.farm_id===farm))||[]
 const stockAlerts=balances.filter(b=>Number(b.min_qty)>0&&Number(b.current_qty)<=Number(b.min_qty))
 const knownStock=balances.reduce((s,b)=>s+Number(b.inventory_value||0),0),unvalued=balances.filter(b=>Number(b.current_qty)>0&&(b.inventory_value==null||!b.valuation_verified)).length
 const readyProduction=data?.ready.Production,readyHarvest=readyProduction&&data?.ready['Récoltes']
 const operationalComplete=data?.ready.Phyto&&data?.ready.Cultural&&data?.ready.Irrigation
 const operationalLoaded=data?.ready.Phyto||data?.ready.Cultural||data?.ready.Irrigation
 const kpis=[['Récolte brute',readyHarvest?production?.kg:null,'kg'],['Rendement',readyHarvest?production?.yield:null,'kg/m² planté'],['Objectif réalisé',readyHarvest?production?.progress:null,'%'],['Coûts enregistrés',costs,'DH'],['Coût / kg',costs!=null&&financeKg>0?costs/financeKg:null,costIncomplete?'DH/kg · provisoire':'DH/kg'],['Interventions en retard',operationalLoaded?activities?.late.length:null,operationalComplete?'validées':'données partielles'],['Eau enregistrée',activities?.water!=null?activities.water/1000:null,'m³ · irrigation et interventions'],['Stock : valeur connue',data?.ready.Stocks?knownStock:null,'DH · stock actuel']]
 if(!allowed)return <p>Accès agronomie requis pour consulter cette vue.</p>
 return <div className="min-w-0 space-y-5">
  <PageHeader title="Mon exploitation" subtitle="Pilotage · Vue 360" icon={Leaf} iconColor="#10b981" description="Production, interventions et ressources : comprendre les écarts et prioriser les actions." actions={<button className={`${input} flex items-center gap-2`} disabled={busy||!campaign} onClick={()=>setReload(x=>x+1)}><RefreshCw size={16}/>Actualiser</button>}/>
  <div className={`${panel} flex flex-wrap items-end gap-4`}>
   <label className="grid gap-1 text-xs text-fg-secondary">Campagne<select aria-label="Campagne Agronomie 360" className={input} value={campaign} onChange={e=>{setCampaign(e.target.value);setFarm('');setSelectionNote('Campagne sélectionnée manuellement.')}}><option value="">Sélectionner une campagne</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}{c.status==='en_cours'?' · En cours':''}</option>)}</select></label>
   <label className="grid gap-1 text-xs text-fg-secondary">Ferme<select aria-label="Ferme Agronomie 360" className={input} value={farm} onChange={e=>setFarm(e.target.value)}><option value="">Toutes les fermes</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
   <details className="text-sm"><summary className="cursor-pointer text-brand">Réglages des alertes · {days} j / {absence} j</summary><div className="mt-3 flex flex-wrap gap-3">
   <label className="grid gap-1 text-xs text-fg-secondary">Échéances à venir<select aria-label="Horizon des interventions" className={input} value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,15,30].map(n=><option key={n} value={n}>{n} jours</option>)}</select></label>
   <label className="grid gap-1 text-xs text-fg-secondary">Sans saisie de récolte depuis<select aria-label="Seuil absence de récolte" className={input} value={absence} onChange={e=>setAbsence(Number(e.target.value))}>{[3,7,15].map(n=><option key={n} value={n}>{n} jours</option>)}</select></label>
   </div></details>
   <span className="text-xs text-fg-tertiary">{selectionNote}<br/>Actualisation automatique toutes les 5 minutes lorsque la page est visible.</span>
  </div>
  {refsError&&<p role="alert" className="text-danger">{refsError}</p>}
  {!campaign?<div className={panel}>Choisissez une campagne pour ouvrir la vue 360. Aucun chiffre n’est présumé avant le chargement.</div>:busy?<div role="status" className={panel}>Chargement des indicateurs de la campagne…</div>:data&&production&&activities&&<>
   {!!data.errors.length&&<div className="rounded-xl border border-warning/30 bg-warning/10 p-4"><strong>Vue partielle</strong>{data.errors.map(e=><p key={e} className="text-sm">{e}</p>)}</div>}
   <nav aria-label="Rubriques de mon exploitation" className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-raised p-2"><button className={`btn ${section==='overview'?'btn-primary':'btn-secondary'}`} aria-pressed={section==='overview'} onClick={()=>setSection('overview')}>Vue 360 et priorités</button>{canCost&&<button className={`btn ${section==='explore'?'btn-primary':'btn-secondary'}`} aria-pressed={section==='explore'} onClick={()=>setSection('explore')}>Explorer ma production et mes coûts</button>}</nav>
   {section==='explore'&&canCost&&(data.finance?<ProductionExplorer key={`${campaign}:${farm}`} data={data.finance} farm={farm} variety="" client={activeDomain?.domain_name||'Mon exploitation'} onFarm={setFarm}/>:<p className={panel}>Analyse indisponible. Actualisez la page ou vérifiez vos accès aux coûts.</p>)}
   {section==='overview'&&<>
   <ExecutiveOverview farmName={farms.find(f=>f.id===farm)?.name||'Votre exploitation · toutes les fermes'} campaignName={campaigns.find(c=>c.id===campaign)?.name||''}
    kg={readyHarvest?production.kg:null} target={readyProduction?production.target:null} progress={readyHarvest?production.progress:null}
    late={operationalLoaded?activities.late.length:null} missing={readyHarvest?production.missingHarvest.length:null}
    stock={data.ready.Stocks?stockAlerts.length:null} pending={operationalLoaded?activities.pending.length:null}
    partial={data.errors.length>0||costIncomplete||unvalued>0} upcoming={activities.upcoming} at={data.at}/>
   {canCost&&<nav aria-label="Analyses de mon exploitation" className="flex flex-wrap gap-3">{[['variety','Comparer les variétés'],['greenhouse','Comparer les serres'],['farm','Comparer les fermes']].map(([level,label])=><Link key={level} href={analyticalHref('/couts/performance',domain!,{campaign,farm,level,metric:'costKg'})} className="rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand hover:bg-brand/10">{label} →</Link>)}</nav>}
   <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{kpis.map(([label,value,unit],index)=>{const href=index===3&&canCost?analyticalHref('/couts/pilotage',domain!,{campaign,farm}):index===4&&canCost?analyticalHref('/couts/performance',domain!,{campaign,farm,metric:'costKg',level:'greenhouse'}):index===7?'#stock-details':index===6?'#water-details':index<3?'#production-details':index===5?'#agenda-details':null;const body=<><p className="text-xs text-fg-secondary">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-brand">{fmt(value as number|null|undefined??null)}</p><p className="text-xs text-fg-tertiary">{unit}</p>{href&&<span className="mt-3 block text-xs text-brand">Voir le détail →</span>}</>;return href?<Link key={String(label)} href={href} className={`${panel} hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}>{body}</Link>:<div key={String(label)} className={panel}>{body}</div>})}</div>
   <p className="text-xs text-fg-tertiary">Production et coûts : campagne entière, toutes variétés. Récolte brute, déchets inclus ; surfaces cumulées des cycles. Stock : solde actuel, indépendant de la campagne. Les réglages de jours ci-dessus filtrent cette vue uniquement.</p>
   <details className={panel}><summary className="mb-3 cursor-pointer text-sm font-semibold">Détail des signaux et règles de contrôle</summary>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[
     ['Interventions validées en retard',operationalLoaded?activities.late.length:null,'/interventions',operationalComplete?'':'Périmètre partiellement chargé'],
     ['Demandes à valider',operationalLoaded?activities.pending.length:null,'/validations','Sous réserve de vos habilitations'],
     ['Plantations sans saisie récente',readyHarvest?production.missingHarvest.length:null,'/recoltes',`Fenêtre de récolte prévue ouverte · seuil ${absence} jours`],
     ['Articles sous seuil',data.ready.Stocks?stockAlerts.length:null,'/stocks',`${unvalued} solde(s) non valorisé(s) / à confirmer`],
    ].map(([title,n,href,note])=><Link key={String(title)} href={String(href)} className="rounded-lg border border-border p-3 hover:bg-surface-input"><div className="flex justify-between"><strong className="text-xl">{n??'—'}</strong><ArrowUpRight size={16}/></div><p className="text-sm">{title}</p><p className="mt-1 text-xs text-fg-tertiary">{note}</p></Link>)}</div>
    <p className="mt-3 text-xs text-fg-tertiary">Une absence de saisie n’est pas une absence de récolte réelle. Les liens ouvrent les modules ; leurs filtres restent à sélectionner. Cette synthèse ne remplace pas les contrôles réglementaires DAR ni les validations.</p>
   </details>
   <div className="grid gap-5 xl:grid-cols-2">
    <section id="water-details" className={`${panel} scroll-mt-24`}><h2 className="font-semibold">Eau enregistrée · ferme et campagne sélectionnées</h2><div className="mt-3 max-h-64 overflow-auto text-sm">{activities.done.filter(a=>a.water!=null).map(a=><p key={`${a.family}:${a.id}`} className="border-b border-border py-2">{a.name} · {a.actual?new Date(a.actual).toLocaleDateString('fr-FR'):'Date non renseignée'} · {fmt(Number(a.water)/1000)} m³</p>)}{activities.water==null&&<p>Aucun volume disponible dans les données chargées.</p>}</div></section>
    <section id="stock-details" className={`${panel} scroll-mt-24`}><h2 className="font-semibold">Stock actuel · ferme sélectionnée</h2><p className="text-xs text-fg-tertiary">Indépendant de la campagne ; valeurs non renseignées non assimilées à zéro.</p><div className="mt-3 max-h-64 overflow-auto text-sm">{data.ready.Stocks?balances.map(b=><div key={`${b.warehouse_id}:${b.stock_item_id}`} className="border-b border-border py-2"><strong>{arr(b.stock_items)[0]?.name||'Article'}</strong><p>{data.warehouses.find(w=>w.id===b.warehouse_id)?.name} · {fmt(Number(b.current_qty))} {arr(b.stock_items)[0]?.unit} · {b.inventory_value==null?'Valeur non renseignée':`${fmt(Number(b.inventory_value))} DH`}</p></div>):<p>Stocks indisponibles ou accès non autorisé.</p>}{data.ready.Stocks&&!balances.length&&<p>Aucun solde dans ce périmètre.</p>}</div>{canCost&&<Link className="mt-3 inline-block text-sm text-brand underline" href={analyticalHref('/couts/pilotage',domain!,{campaign,farm,tab:'stock'})}>Contrôler le stock valorisé de tous les entrepôts du client →</Link>}</section>
   </div>
   <h2 id="production-details" className="scroll-mt-24 text-lg font-semibold">Comprendre ma production</h2>
   <div className="grid gap-5 xl:grid-cols-2">
    <section className={panel}><h2 className="font-semibold">Production enregistrée par mois</h2><p className="mb-3 text-xs text-fg-tertiary">kg bruts · mois comportant des saisies</p>{readyHarvest&&production.timeline.length?<div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={production.timeline}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis width={60}/><Tooltip formatter={(v:number)=>[fmt(v)+' kg','Récolté']}/><Area dataKey="quantity" stroke="#10b981" fill="#10b981" fillOpacity={0.15}/></AreaChart></ResponsiveContainer></div>:<p className="p-6 text-sm text-fg-secondary">{readyHarvest?'Aucune récolte enregistrée.':'Données de récolte indisponibles.'}</p>}</section>
    <section className={panel}><h2 className="font-semibold">Rendement enregistré par serre</h2><p className="mb-3 text-xs text-fg-tertiary">Top 8 · kg/m² planté · cycles potentiellement à des stades différents</p>{readyHarvest&&production.comparison.length?<div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={production.comparison.slice(0,8)}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={(v:number)=>[fmt(v)+' kg/m²','Rendement']}/><Bar dataKey="yield" fill="#8b5cf6" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>:<p className="p-6 text-sm text-fg-secondary">Aucune comparaison disponible.</p>}</section>
   </div>
   <div id="agenda-details" className="grid scroll-mt-24 gap-5 xl:grid-cols-2">
    <section className={panel}><h2 className="mb-3 font-semibold">Agenda et retards · {days} prochains jours</h2><div className="max-h-80 overflow-auto">{[...activities.late,...activities.upcoming].map(a=><Link key={`${a.family}:${a.id}`} href={a.href} className="block border-b border-border py-3 text-sm"><strong>{a.family} · {a.name}</strong><p className="text-fg-secondary">{new Date(a.planned).toLocaleString('fr-FR')} · {activities.late.includes(a)?'En retard':a.status==='soumise'?'À valider':'Validée'}</p></Link>)}{!activities.upcoming.length&&!activities.late.length&&<p className="text-sm text-fg-secondary">Aucune échéance dans les données chargées.</p>}</div></section>
    <section className={panel}><h2 className="mb-3 font-semibold">Lecture économique</h2>{financial?<><dl className="grid grid-cols-2 gap-3 text-sm"><dt>Coûts enregistrés</dt><dd>{fmt(costs)} DH</dd><dt>Budget saisi</dt><dd>{fmt(financial.rows.reduce((s,r)=>s+r.budget,0))} DH</dd><dt>CA station valorisé</dt><dd>{fmt(financial.rows.length&&financial.rows.every(r=>!r.stationMissing)?financial.rows.reduce((s,r)=>s+r.stationRevenue,0):null)} DH</dd></dl><p className="mt-3 text-xs text-fg-tertiary">{costIncomplete?'Coûts incomplets ou provisoires : examiner les imputations avant de conclure sur la rentabilité.':'Coûts imputés selon la clé analytique existante ; ce rapport ne vaut pas clôture comptable.'} Le CA station n’est pas présenté comme un chiffre d’affaires comptable facturé.</p></>:<p className="text-sm text-fg-secondary">Données financières indisponibles ou accès non autorisé.</p>}<Link href={analyticalHref('/couts/performance',domain!,{campaign,farm,metric:'costKg'})} className="mt-3 inline-block text-sm text-brand underline">Analyser la performance et la rentabilité</Link></section>
   </div>
   <section className={panel}><h2 className="mb-3 font-semibold">Détail des serres</h2><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Serre','Surface plantée cumulée (m²)','Récolte (kg)','Rendement (kg/m²)'].map(h=><th key={h} className="p-2 text-xs text-fg-secondary">{h}</th>)}</tr></thead><tbody>{production.comparison.map(g=><tr key={g.id} className="border-t border-border"><td className="p-2">{g.name}</td><td className="p-2">{fmt(g.area)}</td><td className="p-2">{fmt(readyHarvest?g.kg:null)}</td><td className="p-2">{fmt(readyHarvest?g.yield:null)}</td></tr>)}</tbody></table></div><Link href="/plan-culture" className="mt-3 inline-block text-sm text-brand underline">Ouvrir le plan et les fiches détaillées des serres</Link></section>
   </>}
  </>}
 </div>
}
