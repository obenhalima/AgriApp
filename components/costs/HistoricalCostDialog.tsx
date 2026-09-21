'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/lib/withDeadline'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'

const field='w-full rounded-md border border-border bg-surface-input p-2 text-fg-primary disabled:opacity-50'
const number=(v:string)=>v.trim()?Number(v.replace(/\s/g,'').replace(',','.')):NaN
type Context={product:string;reference:string;date:string;quantity:number;unit:string;unit_cost:number;needs_area:boolean;version:string;lines:{id:string;greenhouse:string;variety:string;amount:number;surface:number|null}[]}
export function HistoricalCostDialog({movement,onClose,onConfirmed}:{movement:string;onClose:()=>void;onConfirmed:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),working=useRef(false)
 const [data,setData]=useState<Context|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [price,setPrice]=useState(''),[reason,setReason]=useState(''),[surfaces,setSurfaces]=useState<Record<string,string>>({})
 const [checked,setChecked]=useState(false),[retry,setRetry]=useState<any>(null)
 useEffect(()=>{
  dialog.current?.showModal();let stopped=false
  void withDeadline(signal=>supabase.rpc('historical_cost_context',{p_movement:movement}).abortSignal(signal),20000,'Chargement interrompu. Fermez puis réessayez.').then(r=>{
   if(stopped)return
   if(r.error)throw r.error
   const context=r.data as Context;setData(context);setPrice(String(context.unit_cost??''));setSurfaces(Object.fromEntries(context.lines.map(l=>[l.id,l.surface==null?'':String(l.surface)])))
  }).catch(e=>{if(!stopped)setError(/historical_cost_context|schema cache/i.test(e.message)?'La migration SQL 136 doit être appliquée avant de confirmer les coûts historiques.':e.message)})
  return()=>{stopped=true}
 },[movement])
 async function save(){
  if(working.current||!data)return
  setError('')
  const amount=number(price),areas=Object.fromEntries(data.lines.map(l=>[l.id,number(surfaces[l.id]||'')]))
  if(!retry&&(!Number.isFinite(amount)||amount<0||amount>1e9||reason.trim().length<5||!checked||data.needs_area&&Object.values(areas).some(a=>!Number.isFinite(a)||a<=0||a>1e9))){setError('Renseignez un prix valide, les surfaces positives si demandées, un justificatif de 5 caractères minimum et cochez la confirmation.');return}
  const payload=retry||{p_id:crypto.randomUUID(),p_movement:movement,p_version:data.version,p_unit_cost:amount,p_surfaces:data.needs_area?areas:{},p_reason:reason.trim()}
  working.current=true;setBusy(true);setRetry(payload)
  try{
   const r=await withDeadline(signal=>supabase.rpc('confirm_historical_consumption_cost',payload).abortSignal(signal),30000,'Réponse non reçue. Réessayez la même confirmation ou fermez et actualisez pour vérifier le résultat.')
   if(r.error){if(r.error.code)setRetry(null);throw r.error}
   onConfirmed()
  }catch(e:any){setError(e.message||'Confirmation impossible. Les données sont conservées.')}
  finally{working.current=false;setBusy(false)}
 }
 return createPortal(<dialog ref={dialog} aria-labelledby="historical-cost-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}} className="m-auto max-h-[90dvh] w-[min(760px,94vw)] overflow-auto rounded-xl border border-border bg-surface-raised p-5 text-fg-primary shadow-xl backdrop:bg-black/50">
  <h2 id="historical-cost-title" className="text-xl font-bold">Vérifier et confirmer le coût historique</h2>
  <p className="my-3 text-sm text-fg-secondary">Cette confirmation concerne toutes les imputations de cette consommation, même hors des filtres affichés. Elle ne modifie ni le stock actuel, ni son CUMP, ni le traitement agronomique enregistré.</p>
  {!data&&!error&&<p role="status">Chargement de la consommation…</p>}
  {data&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}>
   <p className="rounded-lg bg-surface-input p-3"><strong>{data.product}</strong> · {data.reference||movement}<br/>{data.date} · {fmt(Number(data.quantity))} {data.unit}</p>
   <fieldset disabled={busy||!!retry} className="space-y-4">
    <label className="block">Prix historique (DH / {data.unit}) *<input autoFocus aria-label="Prix historique par unité" className={field} inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <p className="text-xs text-fg-secondary">Le prix proposé correspond au coût déjà imputé divisé par la quantité consommée. Conservez-le si son justificatif le confirme.</p>
    {data.needs_area&&<p className="text-sm">Vérifiez les surfaces réellement traitées. Les valeurs proposées peuvent provenir de la prescription : elles ne constituent pas une preuve d’exécution.</p>}
    {data.lines.map(l=><div key={l.id} className="rounded-lg border border-border p-3"><p className="text-sm font-medium">{l.greenhouse||'Serre non renseignée'} · {l.variety||'Variété non renseignée'}</p><p className="text-xs text-fg-secondary">Ancien montant : {fmt(Number(l.amount))} DH</p>{data.needs_area&&<label className="block text-sm">Surface réelle de cette affectation (m²) *<input aria-label={`Surface réelle ${l.id}`} inputMode="decimal" className={field} value={surfaces[l.id]||''} onChange={e=>setSurfaces(s=>({...s,[l.id]:e.target.value}))}/></label>}</div>)}
    <label className="block">Justificatif *<textarea aria-label="Justificatif de la confirmation historique" className={field} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Facture ou pièce de référence ; confirmation des surfaces…"/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Je confirme le prix et, le cas échéant, les surfaces réelles indiquées.</label>
   </fieldset>
   <p>Total historique à confirmer : <strong>{Number.isFinite(number(price))?fmt(number(price)*Number(data.quantity)):'Non renseigné'} DH</strong></p>
   <div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-border px-3 py-2" disabled={busy} onClick={onClose}>Fermer</button><button className="rounded-md bg-brand px-3 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">{busy?'Confirmation…':retry?'Réessayer la même confirmation':'Confirmer le coût historique'}</button></div>
  </form>}
  {error&&<p role="alert" className="mt-3 rounded-lg bg-danger/10 p-3 text-danger">{error}</p>}
  {!data&&<button onClick={onClose} className="mt-3 rounded-md border border-border p-2">Fermer</button>}
 </dialog>,document.body)
}
