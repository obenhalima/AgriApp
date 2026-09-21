'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {withDeadline} from '@/lib/withDeadline'
import {formatPlanNumber as fmt} from '@/lib/farmLayout'
import {substitutionNumber,validateSubstitutionAmounts,type PurchaseSubstitution} from '@/lib/purchaseSubstitutions'
import type {PurchaseOrderLine} from '@/lib/purchase'
import {originalSubstitutionTargets,matchingSubstitutions,type SubstitutionOption} from '@/lib/substitutionTargets'
import {Button} from '@/components/ui/Button'
import {Field,Input,Select,Textarea} from '@/components/ui/Input'
import {Card} from '@/components/ui/Card'
import {SubstitutionPrescriptionRevision} from './SubstitutionPrescriptionRevision'

export function PurchaseSubstitutions({poId,lines=[],warehouses=[],canRequest=false,onChange}:{poId?:string;lines?:PurchaseOrderLine[];warehouses?:{id:string;name:string}[];canRequest?:boolean;onChange?:(rows:PurchaseSubstitution[])=>void}) {
 const {activeDomain,user}=useAuth(),domain=activeDomain?.domain_id
 const [rows,setRows]=useState<PurchaseSubstitution[]>([]),[options,setOptions]=useState<SubstitutionOption[]>([])
 const receiptVersion=lines.map(l=>`${l.id}:${l.received_qty}`).join('|')
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0)
 const [line,setLine]=useState(''),[warehouse,setWarehouse]=useState(''),[choice,setChoice]=useState(''),[qty,setQty]=useState(''),[delivered,setDelivered]=useState(''),[price,setPrice]=useState(''),[reason,setReason]=useState('')
 const [target,setTarget]=useState('')
 const [comments,setComments]=useState<Record<string,string>>({}),[requestId,setRequestId]=useState('')
 useEffect(()=>{
  let stopped=false;setRows([]);setOptions([]);setError('');setOpen(false)
  if(!domain)return
  void withDeadline(async signal=>{
   let query=supabase.from('purchase_phyto_substitutions').select('*').eq('domain_id',domain).order('requested_at',{ascending:false})
   if(poId)query=query.eq('po_id',poId)
   const result=await query.abortSignal(signal)
   if(result.error)throw result.error
   if(!stopped){setRows(result.data as PurchaseSubstitution[]);onChange?.(result.data as PurchaseSubstitution[])}
  },20000,'Chargement des remplacements interrompu').catch(e=>{if(!stopped)setError(e.message)})
  return()=>{stopped=true}
 },[domain,poId,reload,receiptVersion])
 async function prepare(){
  setBusy(true);setError('');setMessage('')
  try{
   const [stocks,entries,lists,targets]=await withDeadline(signal=>Promise.all([
    supabase.from('stock_items').select('id,name,unit,plant_protection_product_id').eq('domain_id',domain!).eq('is_active',true).eq('category','phytosanitaires').abortSignal(signal),
    supabase.from('phyto_positive_list_entries').select('id,list_id,product_id,target_id,authorized_use_id').eq('domain_id',domain!).eq('review_status','valide').eq('station_approved',true).abortSignal(signal),
    supabase.from('phyto_positive_lists').select('id').eq('domain_id',domain!).eq('status','active').abortSignal(signal),
    supabase.from('phyto_targets').select('id,canonical_name').eq('is_active',true).abortSignal(signal),
   ]),20000,'Chargement du catalogue interrompu')
   for(const r of [stocks,entries,lists,targets])if(r.error)throw r.error
   const active=new Set(lists.data?.map(l=>l.id))
   setOptions((entries.data||[]).filter(e=>active.has(e.list_id)&&e.target_id&&e.authorized_use_id).flatMap(e=>(stocks.data||[]).filter(s=>s.plant_protection_product_id===e.product_id).map(s=>({id:e.id,stock:s.id,name:s.name,unit:s.unit,targetId:e.target_id,target:targets.data?.find(t=>t.id===e.target_id)?.canonical_name||'Cible à vérifier'}))))
   setLine('');setTarget('');setChoice('');setQty('');setDelivered('');setPrice('');setReason('');setRequestId(crypto.randomUUID());setOpen(true)
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function submit(){
  const l=lines.find(l=>l.id===line),selected=matchingSubstitutions(options,l?.stock_item_id,target).find(o=>`${o.id}:${o.stock}`===choice)
  if(!selected||!l||!warehouse){setError('Choisissez la ligne commandée, la cible / le produit livré et l’entrepôt.');return}
  const invalid=validateSubstitutionAmounts(qty,delivered,price,reason,Number(l.quantity)-Number(l.received_qty||0))
  if(invalid){setError(invalid);return}
  setBusy(true);setError('')
  try{
   const r=await withDeadline(signal=>supabase.rpc('request_purchase_substitution',{p_input:{id:requestId,line_id:line,warehouse_id:warehouse,replacement_stock_item_id:selected.stock,positive_entry_id:selected.id,ordered_qty:substitutionNumber(qty),delivered_qty:substitutionNumber(delivered),unit_price:substitutionNumber(price),reason}}).abortSignal(signal),25000,'Réponse inconnue : réessayez cette même demande, sans en créer une autre.')
   if(r.error)throw r.error
   setOpen(false);setMessage('Demande enregistrée. Aucun mouvement de stock avant accord et réception.');setReload(n=>n+1)
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function decide(id:string,action:string){
  setBusy(true);setError('');setMessage('')
  try{
   const r=await withDeadline(signal=>supabase.rpc('review_purchase_substitution',{p_id:id,p_action:action,p_reason:comments[id]||null}).abortSignal(signal),25000,'Décision non confirmée : actualisez avant de réessayer.')
   if(r.error)throw r.error
   setMessage('Décision enregistrée. Les prescriptions restent inchangées.');setReload(n=>n+1)
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 const current=lines.find(l=>l.id===line),option=options.find(o=>`${o.id}:${o.stock}`===choice)
 return <Card className="my-md space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Remplacements de produits livrés</h2><div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={()=>setReload(n=>n+1)}>Actualiser les demandes</Button>{canRequest&&<Button disabled={busy} onClick={prepare}>Proposer un remplacement</Button>}</div></div>
  <p className="text-xs text-fg-tertiary">Accord de réception par un responsable phyto distinct du demandeur. Ce n’est pas une autorisation de traitement : cible, dose, DAR et accords Station devront être revus dans une nouvelle prescription.</p>
  {error&&<p role="alert" className="rounded border border-danger p-3 text-sm text-danger">{error} {error.includes('schema cache')?'La migration locale 130 doit être installée pour utiliser ce parcours.':''}</p>}
  {message&&<p role="status" className="text-sm text-success">{message}</p>}
  {open&&<div className="space-y-3 rounded border border-brand/30 p-4">
   <div className="grid gap-3 md:grid-cols-2"><Field label="Ligne commandée" required><Select aria-label="Ligne commandée" value={line} disabled={busy} onChange={e=>{setLine(e.target.value);setChoice('');setQty('');const ts=originalSubstitutionTargets(options,lines.find(l=>l.id===e.target.value)?.stock_item_id);setTarget(ts.length===1?ts[0].id:'')}}><option value="">Choisir</option>{lines.filter(l=>l.stock_item_id&&Number(l.quantity)>Number(l.received_qty||0)).map(l=><option key={l.id} value={l.id}>{l.item_description} · restant {fmt(Number(l.quantity)-Number(l.received_qty||0))} {l.unit}</option>)}</Select></Field>
   <Field label="Entrepôt de destination" required><Select aria-label="Entrepôt de destination" value={warehouse} disabled={busy} onChange={e=>setWarehouse(e.target.value)}><option value="">Choisir</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
   <Field label="Cible biologique du produit commandé" required><Select aria-label="Cible biologique du produit commandé" value={target} disabled={busy||!current} onChange={e=>{setTarget(e.target.value);setChoice('')}}><option value="">Choisir la cible à conserver</option>{originalSubstitutionTargets(options,current?.stock_item_id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select>{current&&!originalSubstitutionTargets(options,current.stock_item_id).length&&<p className="text-xs text-warning">Aucune cible éligible pour ce produit commandé : compléter son lien à la liste Station avant remplacement.</p>}</Field>
   <Field label="Cible / produit réellement livré" required><Select aria-label="Cible / produit réellement livré" value={choice} disabled={busy||!target} onChange={e=>setChoice(e.target.value)}><option value="">Choisir dans la liste Station active</option>{matchingSubstitutions(options,current?.stock_item_id,target).map(o=><option key={`${o.id}:${o.stock}`} value={`${o.id}:${o.stock}`}>{o.target} — {o.name} ({o.unit})</option>)}</Select></Field>
   <Field label={`Quantité du bon remplacée (${current?.unit||'unité du bon'})`} required><Input inputMode="decimal" aria-label="Quantité du bon remplacée" value={qty} disabled={busy} onChange={e=>setQty(e.target.value)}/></Field>
   <Field label={`Quantité réellement livrée (${option?.unit||'unité du produit'})`} required><Input inputMode="decimal" aria-label="Quantité réellement livrée" value={delivered} disabled={busy} onChange={e=>setDelivered(e.target.value)}/></Field>
   <Field label="Prix / unité livrée (devise du bon)" required><Input inputMode="decimal" aria-label="Prix par unité livrée" value={price} disabled={busy} onChange={e=>setPrice(e.target.value)}/></Field></div>
   <p className="text-xs text-warning">Aucune équivalence de dose ou de quantité n’est déduite entre deux produits. Le responsable doit contrôler la proposition et les conditions commerciales. Si le montant livré dépasse celui de la quantité remplacée, un nouveau bon avec validation achat est requis.</p>
   <Field label="Motif fournisseur / justification (5 caractères minimum)" required><Textarea aria-label="Motif du remplacement" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field>
   <div className="flex gap-2"><Button disabled={busy} onClick={submit}>Demander la validation phyto</Button><Button variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>Fermer</Button></div>
  </div>}
  {!rows.length&&!error&&<p className="text-sm text-fg-tertiary">Aucune demande sur ce périmètre.</p>}
  {rows.map(r=><article key={r.id} className="space-y-2 rounded border border-surface-border p-3 text-sm">
   <div className="flex flex-wrap justify-between gap-2"><strong>{r.snapshot.replacement.name} — {r.snapshot.target}</strong><span>{r.status.replace('_',' ')}</span></div>
   <p>{fmt(Number(r.ordered_qty))} {r.snapshot.ordered.unit} du bon remplacés par {fmt(Number(r.delivered_qty))} {r.snapshot.replacement.unit} · prix {fmt(Number(r.unit_price))} {r.snapshot.ordered.currency} / {r.snapshot.replacement.unit}</p>
   <p>Motif : {r.reason}</p><p className="text-xs text-fg-tertiary">Demande du {new Date(r.requested_at).toLocaleString('fr-FR')} · {r.requested_by}{r.reviewed_at?` · décision du ${new Date(r.reviewed_at).toLocaleString('fr-FR')} par ${r.reviewed_by} : ${r.review_reason}`:''}</p>
   <details className="text-xs"><summary>Usage de référence à contrôler</summary><p>Dose : {r.snapshot.use?.dose_min??'—'} à {r.snapshot.use?.dose_max??'—'} {r.snapshot.use?.dose_unit} · DAR : {r.snapshot.use?.phi_days??'—'} jours · rentrée : {r.snapshot.use?.rei_hours??'—'} h.</p></details>
   {r.status==='en_attente'&&r.requested_by!==user?.id&&<div className="space-y-2"><Field label="Justification du responsable phyto"><Input aria-label="Justification du responsable phyto" value={comments[r.id]||''} disabled={busy} onChange={e=>setComments(c=>({...c,[r.id]:e.target.value}))}/></Field><div className="flex gap-2"><Button disabled={busy||(comments[r.id]||'').trim().length<5} onClick={()=>decide(r.id,'approuver')}>Accepter le remplacement</Button><Button variant="secondary" disabled={busy||(comments[r.id]||'').trim().length<5} onClick={()=>decide(r.id,'rejeter')}>Refuser</Button></div></div>}
   {['en_attente','approuve'].includes(r.status)&&r.requested_by===user?.id&&<Button variant="secondary" disabled={busy} onClick={()=>decide(r.id,'annuler')}>Annuler la demande</Button>}
   {!poId&&<Link className="underline" href={`/achats/${r.po_id}`}>Ouvrir le bon d’achat</Link>}
   {r.status==='receptionne'&&<p className="text-warning">Produit reçu. Vérifiez la facture fournisseur et faites revoir les prescriptions concernées. Aucun remplacement automatique des traitements.</p>}
   {r.status==='receptionne'&&<SubstitutionPrescriptionRevision substitutionId={r.id}/>}
  </article>)}
 </Card>
}
