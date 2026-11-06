'use client'
import {TranslatedText, useLanguage} from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import {useParams,useSearchParams} from 'next/navigation'
import Link from 'next/link'
import {useAuth} from '@/lib/auth'
import {loadInvoiceDocument} from '@/lib/invoiceDocument'
import type {InvoiceDocument,InvoiceKind} from '@/lib/invoiceDocumentModel'
import {InvoiceSheet} from '@/components/invoices/InvoiceSheet'
import {Button} from '@/components/ui/Button'
import {supabase} from '@/lib/supabase'
export default function InvoiceDocumentPage(){
  const {t:translateUI}=useLanguage()

 const params=useParams(),search=useSearchParams(),{activeDomain,loading}=useAuth()
 const id=String(params?.id||''),kind=search.get('type') as InvoiceKind,domain=search.get('domain')||''
 const [doc,setDoc]=useState<InvoiceDocument|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 const current=useRef(''),scope=`${activeDomain?.domain_id}:${domain}:${kind}:${id}`;current.current=scope
 const [loadedScope,setLoadedScope]=useState(''),visible=loadedScope===scope?doc:null,printed=useRef('')
 const [settlements,setSettlements]=useState<{id:string}[]>([])
 useEffect(()=>{
  let stale=false;setSettlements([])
  if(!visible||kind!=='client')return
  void supabase.from('station_settlements').select('id').eq('domain_id',domain).eq('invoice_id',id).then(({data})=>{if(!stale)setSettlements(data||[])})
  return()=>{stale=true}
 },[visible,kind,domain,id])
 useEffect(()=>{
  let stale=false;setDoc(null);setError('');setLoadedScope('')
  if(loading)return
  if(!activeDomain||activeDomain.domain_id!==domain){setError('Sélectionnez le client de cette facture dans l’application, puis rouvrez le document depuis Factures.');return}
  loadInvoiceDocument(domain,id,kind).then(data=>{if(!stale){setDoc(data);setLoadedScope(scope)}}).catch(e=>{if(!stale)setError(e instanceof Error?e.message:'Document indisponible.')})
  return()=>{stale=true}
 },[domain,id,kind,activeDomain?.domain_id,loading,retry,scope])
 useEffect(()=>{
  if(!visible||search.get('action')!=='print'||printed.current===scope)return
  let stale=false;document.fonts.ready.then(()=>{if(!stale){printed.current=scope;window.print()}})
  return()=>{stale=true}
 },[visible,scope,search])
 async function download(){if(!visible)return;const requestScope=scope;setBusy(true);setError('');try{
  const {createInvoicePdf,saveInvoicePdf}=await import('@/lib/invoicePdf'),blob=await createInvoicePdf(visible)
  if(current.current===requestScope)saveInvoicePdf(blob,visible)
 }catch(e){if(current.current===requestScope)setError(e instanceof Error?e.message:'Export PDF impossible.')}finally{if(current.current===requestScope)setBusy(false)}}
 return <div className="invoice-document-page"><nav className="invoice-document-toolbar" aria-label={translateUI("Actions de la facture")}>
  <Link href="/factures" className="btn btn-secondary"><TranslatedText text={"Retour aux factures"}/></Link>
  <Button disabled={!visible||busy} onClick={()=>void download()}><TranslatedText text={busy?'Préparation…':'Télécharger PDF'}/></Button>
  <Button variant="secondary" disabled={!visible} onClick={()=>window.print()}><TranslatedText text={"Imprimer"}/></Button>
  {visible&&Number(visible.invoice.total_amount||0)>Number(visible.invoice.paid_amount||0)&&<Link className="btn btn-primary" href={`/factures?tab=${kind==='client'?'clients':'fournisseurs'}&invoice=${encodeURIComponent(id)}&domain=${encodeURIComponent(domain)}&action=payment`}><TranslatedText text={kind==='client'?'Encaisser':'Régler'}/></Link>}
  {visible&&settlements.map((settlement,index)=><Link key={settlement.id} className="btn btn-secondary" target="_blank" rel="noopener noreferrer" href={`/factures/bordereau/${encodeURIComponent(settlement.id)}/print`}><TranslatedText text={"Bordereau"}/>{settlements.length>1?` ${index+1}`:''}</Link>)}
 </nav>
 {error&&<div role="alert" className="mx-auto mb-4 max-w-3xl rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"><p>{error}</p><Button onClick={()=>setRetry(n=>n+1)} variant="secondary"><TranslatedText text={"Réessayer"}/></Button></div>}
 {!visible&&!error&&<p role="status" className="p-8 text-center"><TranslatedText text={"Chargement de la facture existante…"}/></p>}
 {visible&&<InvoiceSheet document={visible}/>}
 </div>
}
