'use client'
import { TranslatedText } from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/lib/auth'
import {defaultErpConfig,checkConfig,queueFixture,deliverFixture,simulatedAdapter,type ErpConfig,type Transfer,type FixtureInvoice} from '@/lib/erpConnector'
import type {InvoiceDocument} from '@/lib/invoiceDocumentModel'
import {DocIndexLiveTest} from '@/components/invoices/DocIndexLiveTest'

const recipients=[{id:'fixture-recipient-A',name:'Destinataire A'},{id:'fixture-recipient-B',name:'Destinataire B'}]
export default function IntegrationsPage(){
 const {activeDomain,user,isAdmin,isPlatformAdmin}=useAuth()
 const [recipient,setRecipient]=useState(recipients[0].id),[config,setConfig]=useState<ErpConfig|null>(null),[jobs,setJobs]=useState<Transfer[]>([]),[loaded,setLoaded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[fail,setFail]=useState(false)
 const domain=activeDomain?.domain_id||'',scope=`${user?.id}:${domain}:${recipient}`,storageKey=`itrix-erp-simulation-v1:${scope}`
 const currentScope=useRef(scope);currentScope.current=scope
 useEffect(()=>{
  setLoaded('');setError('');setJobs([]);setConfig(null);setBusy(false)
  if(!domain||!user)return
  let next=defaultErpConfig(domain,recipient),history:Transfer[]=[]
  try{const raw=localStorage.getItem(storageKey);if(raw){const saved=JSON.parse(raw);checkConfig(saved.config);if(saved.config.domainId!==domain||saved.config.recipientId!==recipient)throw Error();next=saved.config;history=(saved.jobs||[]).filter((job:Transfer)=>job.domainId===domain&&job.recipientId===recipient)}}catch{setError('Paramètres locaux illisibles : configuration réinitialisée et désactivée.')}
  setConfig(next);setJobs(history);setLoaded(scope)
 },[domain,recipient,user?.id,scope,storageKey])
 const ready=loaded===scope&&!!config,admin=isAdmin||isPlatformAdmin
 function save(next:ErpConfig,history=jobs){checkConfig(next);localStorage.setItem(storageKey,JSON.stringify({config:next,jobs:history}));setConfig(next);setJobs(history)}
 async function run(origin:FixtureInvoice['origin'],previous?:Transfer){
  if(!ready||!config||!user||!admin||busy)return
  const captured=scope;setBusy(true);setError('')
  try{
   checkConfig(config)
   const invoice:FixtureInvoice={id:previous?.invoiceId||`fixture-${origin}`,domainId:domain,recipientId:recipient,number:previous?.invoiceNumber||`DEMO-${origin.toUpperCase()}`,fictitious:true,origin}
   const job=previous||queueFixture(config,invoice,user.id,origin==='manual',jobs)
   if(!job){setError(origin==='history'?'Historique ignoré : aucun envoi automatique.':'Activez la simulation pour ce destinataire avant le test.');return}
   const document:InvoiceDocument={kind:'client',domainId:domain,invoice:{id:invoice.id,invoice_number:invoice.number,invoice_date:'2026-01-01',currency:'MAD',subtotal:100,tax_amount:0,total_amount:100,paid_amount:0,status:'en_attente',notes:'FACTURE FICTIVE — RECETTE LOCALE — AUCUNE TRANSMISSION EXTERNE'},issuer:{name:'Entreprise de test ITRIX (fictive)'},recipient:{name:recipients.find(r=>r.id===recipient)!.name},currency:'MAD',lines:[{description:'Prestation fictive de recette',quantity:1,unit:'unité',price:100,amount:100,source:'Jeu de test'}],payments:[],warnings:[]}
   const {createInvoicePdf}=await import('@/lib/invoicePdf')
   const pdf=new Uint8Array(await (await createInvoicePdf(document)).arrayBuffer())
   const result=await deliverFixture(config,job,user.id,pdf,simulatedAdapter(fail),!!previous)
   // A changed scope is never saved under another tenant/recipient key.
   const history=[...jobs.filter(item=>item.key!==result.key),result]
   localStorage.setItem(`itrix-erp-simulation-v1:${captured}`,JSON.stringify({config,jobs:history}))
   if(captured===currentScope.current)setJobs(history)
  }catch(e){if(captured===currentScope.current)setError(e instanceof Error?e.message:'Simulation impossible.')}finally{if(captured===currentScope.current)setBusy(false)}
 }
 if(!admin)return <div role="alert" className="p-6"><TranslatedText text={"Configuration réservée aux administrateurs du client actif."}/></div>
 return <div key={scope} className="mx-auto max-w-5xl space-y-6">
  <Link href="/factures" className="btn btn-secondary"><TranslatedText text={"Retour aux factures"}/></Link>
  <h1 className="text-2xl font-bold"><TranslatedText text={"Intégrations — DocIndex et ERP"}/></h1>
  <p role="note" className="rounded-lg border border-amber-300 p-4"><strong><TranslatedText text={"Environnement local — tests sur données fictives."}/></strong><TranslatedText text={" Aucune publication sur Vercel. La configuration DocIndex permet des envois réels après confirmation ; la simulation ERP ci-dessous ne contacte aucun service externe."}/></p>
  <p><TranslatedText text={"Client ITRIX : "}/><strong>{activeDomain?.domain_code} — {activeDomain?.domain_name}</strong></p>
  <label className="block"><TranslatedText text={"Destinataire "}/><select className="ml-3 rounded border p-2" value={recipient} disabled={busy} onChange={e=>setRecipient(e.target.value)}>{recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  {ready&&<DocIndexLiveTest key={scope} domain={domain} recipient={recipient}/>}
  {ready&&config&&<form className="space-y-4 rounded-xl border p-5" onSubmit={e=>{e.preventDefault();setError('');try{save(config)}catch(err){setError(err instanceof Error?err.message:'Configuration invalide.')}}}>
   <h2 className="text-xl font-semibold"><TranslatedText text={"Simulation ERP — sans envoi externe"}/></h2>
   <label className="block"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/><TranslatedText text={" Activer la simulation pour ce destinataire"}/></label>
   <label className="block"><TranslatedText text={"Adaptateur "}/><select className="ml-3 rounded border p-2" value={config.adapter} onChange={e=>setConfig({...config,adapter:e.target.value as ErpConfig['adapter']})}><option value="docindex">DocIndex</option><option value="erp"><TranslatedText text={"Autre ERP — contrat à implémenter"}/></option></select></label>
   <label className="block"><TranslatedText text={"URL cible (non appelée)"}/><input className="block w-full rounded border p-2" type="url" value={config.endpoint} onChange={e=>setConfig({...config,endpoint:e.target.value})}/></label>
   <label className="block"><TranslatedText text={"Nom du secret serveur prévu (facultatif en simulation)"}/><input className="block w-full rounded border p-2" placeholder="ERP_RECIPIENT_A_API_KEY" value={config.credentialRef} onChange={e=>setConfig({...config,credentialRef:e.target.value})}/></label>
   <p className="text-sm"><TranslatedText text={"Ne saisissez jamais de clé API dans cette simulation. Pour DocIndex, utilisez le champ « Clé API DocIndex » dans la configuration ci-dessus."}/></p>
   <button className="btn btn-primary" disabled={busy}><TranslatedText text={"Enregistrer les paramètres locaux"}/></button>
  </form>}
  {error&&<p role="alert" className="rounded border border-red-300 p-3 text-red-700">{error}</p>}
  {ready&&<section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold"><TranslatedText text={"Scénarios fictifs"}/></h2>
   <label className="block"><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/><TranslatedText text={" Simuler une panne du destinataire"}/></label>
   <div className="flex flex-wrap gap-3">
    <button className="btn btn-primary" disabled={busy||!config?.enabled} onClick={()=>void run('manual')}><TranslatedText text={"Valider une facture fictive"}/></button>
    <button className="btn btn-secondary" disabled={busy||!config?.enabled} onClick={()=>void run('validated_settlement')}><TranslatedText text={"Simuler un bordereau validé"}/></button>
    <button className="btn btn-secondary" disabled={busy} onClick={()=>void run('history')}><TranslatedText text={"Vérifier l’exclusion de l’historique"}/></button>
   </div><p><TranslatedText text={busy?'Préparation du PDF fictif et simulation…':'Aucun téléchargement ou aperçu ne déclenche un envoi.'}/></p>
  </section>}
  <section className="space-y-3"><h2 className="text-xl font-semibold"><TranslatedText text={"Journal de simulation du destinataire"}/></h2>
   {ready&&jobs.length===0&&<p><TranslatedText text={"Aucune transmission simulée."}/></p>}
   {ready&&jobs.map(job=><article key={job.key} className="rounded-xl border p-4 space-y-2"><h3 className="font-bold">{job.invoiceNumber}</h3><p><TranslatedText text={job.state==='simulated'?'Réception simulée — à vérifier humainement':job.state==='failed'?'Échec simulé — renvoi possible':'À envoyer'}/> · {job.attempts}<TranslatedText text={" tentative(s)"}/></p>
    {job.lastError&&<p className="text-red-700"><TranslatedText text={"Le destinataire simulé n’a pas accepté le document. La facture source est inchangée."}/></p>}
    <p className="text-sm"><TranslatedText text={"Validé par "}/>{job.validatedBy} le {job.validatedAt}</p>
    <button className="btn btn-secondary" disabled={busy||!config?.enabled} onClick={()=>void run(job.invoiceId.includes('settlement')?'validated_settlement':'manual',job)}><TranslatedText text={"Renvoyer en simulation"}/></button>
    <details><summary><TranslatedText text={"Voir les événements de recette"}/></summary><ul>{job.events.map((event,i)=><li key={i}>{event.at} · {event.actor} · {event.action}</li>)}</ul><p className="break-all"><TranslatedText text={"Référence stable : "}/>{job.key}</p><p className="break-all"><TranslatedText text={"Réception : "}/>{job.remoteId||'—'}</p></details>
   </article>)}
  </section>
 </div>
}
