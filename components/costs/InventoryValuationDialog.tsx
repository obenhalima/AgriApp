'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'

export type ValuationItem={warehouse_id:string;stock_item_id:string;warehouse_name:string;item_name:string;qty:number|string;unit:string;value:number|string|null;verified:boolean}
export function InventoryValuationDialog({item,onClose,onConfirmed}:{item:ValuationItem;onClose:()=>void;onConfirmed:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null)
 const [price,setPrice]=useState(item.value==null?'':String(Number(item.value)/Number(item.qty)))
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false)
 const amount=Number(price.replace(/\s/g,'').replace(',','.'))
 const priceValid=price.trim()!==''&&Number.isFinite(amount)&&amount>=0
 const reasonValid=reason.trim().length>=5
 useEffect(()=>{dialog.current?.showModal()},[])
 async function save(){
  if(busy)return
  setSubmitted(true);setError('')
  if(!priceValid||!reasonValid)return
  setBusy(true)
  try{
   const result=await withDeadline(signal=>supabase.rpc('confirm_inventory_value',{p_warehouse:item.warehouse_id,p_item:item.stock_item_id,p_expected_qty:Number(item.qty),p_unit_cost:amount,p_reason:reason.trim()}).abortSignal(signal),30000,'Confirmation non reçue après 30 secondes. Fermez puis actualisez le rapport pour vérifier le statut avant de réessayer.')
   if(result.error)throw result.error
   onConfirmed()
  }catch(e:any){setError(e.message||'Confirmation impossible. Vos champs sont conservés.')}
  finally{setBusy(false)}
 }
 return createPortal(<dialog ref={dialog} aria-labelledby="stock-valuation-title" className="w-[min(580px,94vw)] rounded-xl border bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
  <h2 id="stock-valuation-title" className="text-lg font-semibold">Valoriser / confirmer le stock</h2>
  <p className="mt-2 font-medium">{item.item_name}</p><p>{item.warehouse_name} · {fmt(Number(item.qty))} {item.unit}</p>
  <p className="my-3 text-sm text-slate-600">Cette action confirme la valeur du stock actuel. Elle ne modifie ni la quantité ni les coûts des anciennes consommations.</p>
  <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}>
   <div><label htmlFor="valuation-price">Coût unitaire (DH / {item.unit}) *</label>
    <input id="valuation-price" autoFocus inputMode="decimal" disabled={busy} value={price} onChange={e=>setPrice(e.target.value)} aria-invalid={submitted&&!priceValid} aria-describedby="valuation-price-help" className={`mt-1 w-full rounded border p-2 ${submitted&&!priceValid?'border-red-500':'border-slate-300'}`}/>
    <p id="valuation-price-help" className={submitted&&!priceValid?'text-sm text-red-700':'text-sm text-slate-500'}>{submitted&&!priceValid?'Renseignez un nombre positif ou nul, sans unité (exemple : 125,50).':'Saisissez le prix par unité de stock, pas le montant total.'}</p>
   </div>
   <div><label htmlFor="valuation-reason">Justificatif * — au moins 5 caractères</label>
    <textarea id="valuation-reason" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} aria-invalid={submitted&&!reasonValid} aria-describedby="valuation-reason-help" placeholder="Ex. prix confirmé sur facture fournisseur…" className={`mt-1 w-full rounded border p-2 ${submitted&&!reasonValid?'border-red-500':'border-slate-300'}`}/>
    <p id="valuation-reason-help" className={submitted&&!reasonValid?'text-sm text-red-700':'text-sm text-slate-500'}>{submitted&&!reasonValid?'Le justificatif doit contenir au moins 5 caractères hors espaces aux extrémités.':'Indiquez la source du prix ou la raison de la confirmation.'}</p>
   </div>
   <p className="rounded bg-slate-100 p-3">Valeur totale à confirmer : <strong>{priceValid?fmt(amount*Number(item.qty)):'Non renseignée'} DH</strong></p>
   {error&&<p role="alert" className="rounded border border-red-400 bg-red-50 p-3 text-red-800">{error}</p>}
   <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded border px-4 py-2">Annuler</button><button type="submit" disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">{busy?'Confirmation…':'Confirmer la valorisation'}</button></div>
  </form>
 </dialog>,document.body)
}
