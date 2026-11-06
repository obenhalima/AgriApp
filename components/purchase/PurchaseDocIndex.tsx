'use client'
import {TranslatedText, useLanguage} from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {docIndexPurchasePrefill,type DocIndexSummary} from '@/lib/docIndexPurchase'
import type {SupplierInvoicePrefill} from '@/lib/purchaseInvoiceDocument'
export type PurchaseDocumentEntry={id:string;name:string;mime:string;size:number;uploadedAt:string;uploadedBy:string;docindex?:{recipient:string;remoteId?:string;summary?:DocIndexSummary;events:{at:string;actor:string;action:string}[]}|null}
type Props={entry:PurchaseDocumentEntry;endpoint:string;currency:string;supplier:string;canEdit:boolean;canInvoice:boolean;call:(url:string,init?:RequestInit)=>Promise<Response>;onUpdate:(entry:PurchaseDocumentEntry)=>void;onPrefill:(draft:SupplierInvoicePrefill)=>void}
export function PurchaseDocIndex({entry,endpoint,currency,supplier,canEdit,canInvoice,call,onUpdate,onPrefill}:Props){
  const {t:translateUI}=useLanguage()

 const [connections,setConnections]=useState<{recipient:string;space:string}[]>([]),[recipient,setRecipient]=useState(entry.docindex?.recipient||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[supplierConfirmed,setSupplierConfirmed]=useState(false)
 const mounted=useRef(true),pending=useRef(false),callbacks=useRef({call,onUpdate});callbacks.current={call,onUpdate}
 useEffect(()=>{mounted.current=true;void callbacks.current.call(endpoint+'&action=connections').then(r=>r.json()).then(d=>{if(mounted.current){setConnections(d.connections);if(!entry.docindex?.recipient&&d.connections.length===1)setRecipient(d.connections[0].recipient)}}).catch(()=>{if(mounted.current)setError('Configuration DocIndex inaccessible. Réessayez en rouvrant le document.')});return()=>{mounted.current=false}},[endpoint,entry.id])
 async function action(kind:'send'|'status'|'rebind'){
  if(pending.current||!canEdit)return
  const target=connections.find(c=>c.recipient===recipient)
  if(kind==='send'&&(!target||!window.confirm(`Envoyer la pièce « ${entry.name} » à l’espace DocIndex « ${target.space} » ? Vous confirmez qu’il s’agit de données fictives. Aucun enregistrement de facture dans Itrix.`)))return
  if(kind==='rebind'&&(!target||!window.confirm(`Utiliser la clé actuellement configurée pour « ${target.space} » ? Vous confirmez qu’elle appartient à la MÊME entreprise DocIndex et au MÊME destinataire qu’avant. Sans identifiant de réception, Itrix ne peut pas vérifier automatiquement cette entreprise. Le fichier et la référence seront conservés. Cette action n’envoie aucune facture. Si le document a déjà été reçu, son accès sera vérifié avec la nouvelle clé avant toute modification.`)))return
  pending.current=true;setBusy(true);setError('');setNotice('')
  try{const data=await (await callbacks.current.call(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,document:entry.id,recipient,confirmSend:kind==='send',confirmFictitious:kind==='send',confirmNewKey:kind==='rebind',confirmSameSpace:kind==='rebind'})})).json();if(mounted.current){callbacks.current.onUpdate(data.document);setNotice(data.message||'')}}catch(e){if(mounted.current)setError((e as Error).message)}finally{pending.current=false;if(mounted.current)setBusy(false)}
 }
 const summary=entry.docindex?.summary
 useEffect(()=>{
  if(!entry.docindex?.remoteId||!canEdit||['validated','rejected','reading_failed'].includes(summary?.stage||''))return
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void action('status')},60000)
  return()=>clearInterval(timer)
 },[entry.docindex?.remoteId,summary?.stage,recipient,canEdit])
 let draft:SupplierInvoicePrefill|null=null,block=''
 if(summary){try{draft=docIndexPurchasePrefill(summary,currency)}catch(e){block=(e as Error).message}}
 const stages:Record<string,string>={reading:'Lecture en cours',to_review:'À vérifier et valider dans DocIndex',validated:'Validé dans DocIndex',rejected:'Document rejeté',reading_failed:'Échec de lecture dans DocIndex'}
 return <section className="space-y-3 rounded-lg border border-green-200 p-4" aria-label={translateUI("Lecture de facture DocIndex")}>
  <h3 className="font-semibold"><TranslatedText text={"Lire la facture avec DocIndex"}/></h3>
  <p className="text-sm"><TranslatedText text={"Envoi uniquement après votre accord. Le suivi est vérifié une fois par minute tant que cet écran est ouvert et visible. Les pièces restent également chiffrées sur ce PC."}/></p>
  <label className="block"><TranslatedText text={"Destinataire DocIndex"}/><select className="block border rounded p-2" value={recipient} disabled={busy||!!entry.docindex} onChange={e=>setRecipient(e.target.value)}><option value=""><TranslatedText text={"Choisir un espace"}/></option>{connections.map(c=><option key={c.recipient} value={c.recipient}>{c.space}</option>)}</select></label>
  {!connections.length&&<p><TranslatedText text={"Configurez une clé pour ce client dans "}/><Link href="/factures/integrations" className="underline"><TranslatedText text={"Factures → Intégrations"}/></Link>.</p>}
  <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" disabled={busy||!recipient||!canEdit||!!entry.docindex?.remoteId} onClick={()=>void action('send')}><TranslatedText text={entry.docindex?'Renvoyer avec la même référence':'Envoyer cette facture à DocIndex'}/></button><button className="btn btn-secondary" disabled={busy||!entry.docindex?.remoteId||!canEdit} onClick={()=>void action('status')}><TranslatedText text={"Actualiser le statut"}/></button></div>
  {busy&&<p role="status"><TranslatedText text={"Échange avec DocIndex en cours…"}/></p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
  {entry.docindex&&<><button className="btn btn-secondary" disabled={busy||!canEdit||!connections.some(c=>c.recipient===recipient)} onClick={()=>void action('rebind')}><TranslatedText text={"Utiliser la nouvelle clé pour ce destinataire"}/></button><p className="text-sm"><TranslatedText text={"Uniquement pour une clé remplacée dans la même entreprise DocIndex. Cette action conserve le fichier, la référence et l’historique ; elle ne renvoie rien."}/></p></>}
  {notice&&<p role="status" className="text-green-700">{notice}</p>}
  {entry.docindex?.remoteId&&<p className="text-green-700"><TranslatedText text={"Réception confirmée : "}/>{entry.docindex.remoteId}. <TranslatedText text={summary?stages[summary.stage]:'En attente du premier suivi.'}/></p>}
  {summary&&<><dl><dt><TranslatedText text={"Numéro extrait"}/></dt><dd><TranslatedText text={summary.invoice_number||'Non renseigné'}/></dd><dt><TranslatedText text={"Fournisseur extrait"}/></dt><dd><TranslatedText text={summary.supplier||'Non renseigné'}/></dd><dt><TranslatedText text={"Montant DocIndex (nature TTC non confirmée)"}/></dt><dd><TranslatedText text={summary.total||'Non renseigné'}/> {summary.currency}</dd></dl>{block&&<p className="text-amber-800">{block}</p>}</>}
  {draft&&<><label className="block"><input type="checkbox" checked={supplierConfirmed} onChange={e=>setSupplierConfirmed(e.target.checked)}/><TranslatedText text={" Je confirme que « "}/>{summary?.supplier}<TranslatedText text={" » correspond au fournisseur du BDC « "}/>{supplier}<TranslatedText text={" » et que le numéro extrait est correct."}/></label><button className="btn btn-primary" disabled={busy||!supplierConfirmed||!canInvoice} onClick={()=>draft&&onPrefill(draft)}><TranslatedText text={"Vérifier le préremplissage et créer la facture"}/></button><p className="text-sm"><TranslatedText text={"Seuls le numéro et la devise viennent de DocIndex. Dates à saisir ; HT, taxes et total à vérifier avec le PDF. Le montant DocIndex n’est pas affecté au TTC sans contrat confirmé. Aucun enregistrement avant votre confirmation finale."}/></p></>}
  {!!entry.docindex?.events?.length&&<details><summary><TranslatedText text={"Historique des échanges"}/></summary>{entry.docindex.events.map((e,i)=><p key={i}>{new Date(e.at).toLocaleString('fr-FR')} · {e.action}<TranslatedText text={" · utilisateur "}/>{e.actor}</p>)}</details>}
 </section>
}
