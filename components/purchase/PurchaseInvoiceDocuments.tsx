'use client'
import {TranslatedText, useLanguage} from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {withAuthDeadline} from '@/lib/authInitialization'
import {invoiceFileType,PURCHASE_INVOICE_MAX_BYTES,type SupplierInvoicePrefill} from '@/lib/purchaseInvoiceDocument'
import {SupplierInvoiceModal} from './SupplierInvoiceModal'
import type {PurchaseOrder} from '@/lib/purchase'
import {PurchaseDocIndex,type PurchaseDocumentEntry} from './PurchaseDocIndex'
type Entry=PurchaseDocumentEntry
function DocumentPreview({file,name}:{file:Blob;name:string}){
  const {t:translateUI}=useLanguage()

 const canvas=useRef<HTMLCanvasElement>(null),[page,setPage]=useState(1),[count,setCount]=useState(1),[error,setError]=useState(''),[url,setUrl]=useState('')
 useEffect(()=>{setPage(1);setCount(1)},[file])
 useEffect(()=>{const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u)},[file])
 useEffect(()=>{
  if(file.type!=='application/pdf')return
  let stale=false,task:any,render:any
  setError('')
  void (async()=>{
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs'
   task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true})
   const pdf=await task.promise;if(stale)return
   setCount(pdf.numPages);const p=await pdf.getPage(Math.min(page,pdf.numPages)),base=p.getViewport({scale:1})
   if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw Error('Dimensions PDF invalides.')
   const viewport=p.getViewport({scale:Math.min(1.3,1600/Math.max(base.width,base.height))}),element=canvas.current
   if(stale||!element)return
   element.width=viewport.width;element.height=viewport.height
   render=p.render({canvasContext:element.getContext('2d')!,viewport});await render.promise
  })().catch(()=>{if(!stale)setError('Aperçu PDF indisponible. Vous pouvez télécharger l’original.')})
  return()=>{stale=true;render?.cancel();void task?.destroy().catch(()=>{})}
 },[file,page])
 return <div className="space-y-3 rounded border p-3">
  {file.type==='application/pdf'?<><div className="flex gap-3"><button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(n=>n-1)}><TranslatedText text={"Page précédente"}/></button><span><TranslatedText text={"Page "}/>{page} / {count}</span><button className="btn btn-secondary" disabled={page>=count} onClick={()=>setPage(n=>n+1)}><TranslatedText text={"Page suivante"}/></button></div><canvas ref={canvas} className="max-w-full bg-white" aria-label={translateUI("Aperçu de la facture PDF")}/></>:<img src={url} alt={translateUI("Facture fournisseur déposée")} className="max-h-[650px] max-w-full object-contain"/>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {url&&<a className="btn btn-secondary" href={url} download={name}><TranslatedText text={"Télécharger l’original"}/></a>}
 </div>
}
export function PurchaseInvoiceDocuments({po,onCreated}:{po:PurchaseOrder&{suppliers?:any};onCreated:()=>void|Promise<void>}){
 const {activeDomain,hasPermission}=useAuth(),domain=activeDomain?.domain_id||'',scope=`${domain}:${po.id}`,current=useRef(scope);current.current=scope
 const [entries,setEntries]=useState<Entry[]>([]),[file,setFile]=useState<Blob|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<SupplierInvoicePrefill|null>(null),[created,setCreated]=useState(false)
 const [selectedId,setSelectedId]=useState('')
 const endpoint=`/api/purchases/invoice-documents?domain=${encodeURIComponent(domain)}&po=${encodeURIComponent(po.id)}`
 async function call(url=endpoint,init?:RequestInit){
  const session=await withAuthDeadline(supabase.auth.getSession()),token=session.data.session?.access_token
  if(!token)throw Error('Connexion requise pour accéder à la facture.')
  const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init?.headers},cache:'no-store',signal:AbortSignal.timeout(45000)})
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Chargement impossible. Réessayez.')}
  return response
 }
 async function load(){const captured=scope;setError('');try{const data=await (await call()).json();if(current.current===captured)setEntries(data.documents)}catch(e){if(current.current===captured)setError((e as Error).message)}}
 useEffect(()=>{setEntries([]);setFile(null);setSelected('');setSelectedId('');setDraft(null);setCreated(false);void load()},[scope])
 async function upload(uploaded:File){const captured=scope;setError('');setBusy(true)
  try{if(!uploaded.size||uploaded.size>PURCHASE_INVOICE_MAX_BYTES)throw Error('Fichier vide ou supérieur à 4 Mo.');invoiceFileType(new Uint8Array(await uploaded.slice(0,8).arrayBuffer()));const result=await (await call(endpoint,{method:'POST',headers:{'Content-Type':uploaded.type||'application/octet-stream','X-Filename':encodeURIComponent(uploaded.name)},body:uploaded})).json();if(current.current!==captured)return;await load();await preview(result.document)}catch(e){if(current.current===captured)setError((e as Error).message)}finally{if(current.current===captured)setBusy(false)}
 }
 async function preview(entry:Entry){const captured=scope;setError('');setBusy(true);try{const blob=await (await call(endpoint+'&document='+encodeURIComponent(entry.id))).blob();if(current.current===captured){setFile(blob);setSelected(entry.name);setSelectedId(entry.id)}}catch(e){if(current.current===captured)setError((e as Error).message)}finally{if(current.current===captured)setBusy(false)}}
 const canInvoice=['recu','partiellement_recu','facture','paye'].includes(po.status)&&hasPermission('factures','create')
 return <section className="my-6 space-y-4 rounded-xl border p-5">
  <h2 className="text-xl font-semibold"><TranslatedText text={"Facture fournisseur — document original"}/></h2>
  <p><TranslatedText text={"Déposez la facture reçue pour la visualiser et la conserver sur ce serveur local, rattachée au client et au bon d’achat. PDF, PNG ou JPEG, 4 Mo maximum ; 10 pièces par achat."}/></p>
  <p className="text-sm text-amber-800"><TranslatedText text={"Le dépôt seul n’envoie rien. Après visualisation, vous pouvez envoyer explicitement cette facture fictive à DocIndex. Le préremplissage est proposé uniquement après validation dans DocIndex ; les pièces restent locales, pas dans Supabase Storage."}/></p>
  {hasPermission('achats','edit')&&<label className="block"><TranslatedText text={"Ajouter la facture fournisseur"}/><input className="block mt-2" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=''}}/></label>}
  {busy&&<p role="status"><TranslatedText text={"Chargement du document…"}/></p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <ul className="space-y-2">{entries.map(entry=><li key={entry.id}><button className="btn btn-secondary" disabled={busy} onClick={()=>void preview(entry)}><TranslatedText text={"Visualiser "}/>{entry.name}</button><span className="ml-2 text-sm">{Math.ceil(entry.size/1024)}<TranslatedText text={" Ko · déposé le "}/>{new Date(entry.uploadedAt).toLocaleString('fr-FR',{timeZone:'Africa/Casablanca'})}</span></li>)}</ul>
  {file&&<><h3 className="font-semibold">{selected}</h3><DocumentPreview key={scope+selected} file={file} name={selected}/><button className="btn btn-primary" disabled={busy||!canInvoice||created} onClick={()=>setDraft({source:'manual',currency:po.currency,requireOriginalNumber:true})}><TranslatedText text={"Vérifier les informations et créer la facture"}/></button><p className="text-sm"><TranslatedText text={"Le fournisseur est celui du bon : "}/>{po.suppliers?.name||'—'}<TranslatedText text={". Les montants proposés viennent du bon, pas d’une extraction du document. Aucun enregistrement avant votre confirmation finale."}/></p>{!canInvoice&&<p className="text-sm"><TranslatedText text={"La création requiert un bon réceptionné et les droits de création des factures."}/></p>}</>}
  {created&&<p role="status" className="text-green-700"><TranslatedText text={"Facture créée après confirmation. Le document original reste disponible sur cet achat."}/></p>}
  {file&&entries.find(e=>e.id===selectedId)&&<PurchaseDocIndex key={scope+selectedId} entry={entries.find(e=>e.id===selectedId)!} endpoint={endpoint} currency={po.currency} supplier={po.suppliers?.name||'Non renseigné'} canEdit={hasPermission('achats','edit')} canInvoice={canInvoice&&!created} call={call} onUpdate={entry=>setEntries(list=>list.map(e=>e.id===entry.id?entry:e))} onPrefill={setDraft}/>}
  {draft&&<SupplierInvoiceModal key={scope} po={po} initial={draft} onClose={()=>setDraft(null)} onCreated={async()=>{setDraft(null);setCreated(true);await onCreated()}}/>}
 </section>
}
