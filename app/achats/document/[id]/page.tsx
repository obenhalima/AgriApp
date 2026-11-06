'use client'
import {TranslatedText, useLanguage} from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import {useParams,useSearchParams} from 'next/navigation'
import Link from 'next/link'
import {useAuth} from '@/lib/auth'
import {loadPurchaseOrderDocument} from '@/lib/purchaseOrderDocument'
import type {InvoiceDocument} from '@/lib/invoiceDocumentModel'
import {InvoiceSheet} from '@/components/invoices/InvoiceSheet'
import {Button} from '@/components/ui/Button'
export default function PurchaseDocumentPage(){
  const {t:translateUI}=useLanguage()

 const params=useParams(),search=useSearchParams(),{activeDomain,loading,hasPermission}=useAuth()
 const id=String(params?.id||''),domain=search.get('domain')||'',scope=`${activeDomain?.domain_id}:${domain}:${id}`
 const [doc,setDoc]=useState<InvoiceDocument|null>(null),[loaded,setLoaded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 const current=useRef(scope);current.current=scope
 const visible=loaded===scope&&activeDomain?.domain_id===domain?doc:null
 useEffect(()=>{
  let stale=false;setDoc(null);setLoaded('');setError('');setBusy(false)
  if(loading)return
  if(!activeDomain||activeDomain.domain_id!==domain||!hasPermission('achats','view')){setError('Sélectionnez le client du bon et vérifiez vos droits de consultation des achats.');return}
  loadPurchaseOrderDocument(domain,id).then(d=>{if(!stale){setDoc(d);setLoaded(scope)}}).catch(()=>{if(!stale)setError('Chargement du BDC impossible. Vérifiez vos droits puis réessayez. Aucune donnée n’a été modifiée.')})
  return()=>{stale=true}
 },[domain,id,scope,loading,retry,hasPermission])
 async function download(){if(!visible)return;const requestScope=scope;setBusy(true);setError('');try{
  const {createInvoicePdf,saveInvoicePdf}=await import('@/lib/invoicePdf'),blob=await createInvoicePdf(visible)
  if(current.current===requestScope)saveInvoicePdf(blob,visible)
 }catch{if(current.current===requestScope)setError('Téléchargement PDF impossible. Réessayez ou utilisez Imprimer.')}finally{if(current.current===requestScope)setBusy(false)}}
 return <div className="invoice-document-page"><nav className="invoice-document-toolbar" aria-label={translateUI("Actions du bon de commande")}>
  <Link href={`/achats/${encodeURIComponent(id)}`} className="btn btn-secondary"><TranslatedText text={"Retour au BDC"}/></Link>
  <Button disabled={!visible||busy} onClick={()=>void download()}><TranslatedText text={busy?'Préparation…':'Télécharger PDF'}/></Button>
  <Button variant="secondary" disabled={!visible} onClick={()=>window.print()}><TranslatedText text={"Imprimer"}/></Button>
 </nav>{error&&<div role="alert" className="p-4 text-red-700"><p>{error}</p><Button onClick={()=>setRetry(n=>n+1)}><TranslatedText text={"Réessayer"}/></Button></div>}
 {!visible&&!error&&<p role="status"><TranslatedText text={"Chargement du bon de commande…"}/></p>}{visible&&<InvoiceSheet document={visible}/>}</div>
}
