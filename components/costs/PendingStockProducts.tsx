'use client'

import {useEffect,useRef,useState} from 'react'
import {useLanguage} from '@/lib/i18n'
import {Modal} from '@/components/ui/Modal'
import {Button} from '@/components/ui/Button'
import {useAuth} from '@/lib/auth'
import {productReviewContext,productReviewWorkbook,readProductReviewWorkbook,reviewProducts,reviewStockProducts,sameReviewMovement,type ProductReviewContext,type ProductReviewRow,type ProductReviewResult} from '@/lib/stockProductReview'

const field='rounded-lg border border-border bg-surface-input px-3 py-2 text-sm disabled:opacity-50'
type Draft={context:ProductReviewContext;rows:ProductReviewRow[]}

export function PendingStockProducts({domain,ids,canEdit,onApplied}:{domain:string;ids:string[];canEdit:boolean;onApplied:()=>void}){
 const {t,intlLocale}=useLanguage()
 const {user,profile}=useAuth()
 const [context,setContext]=useState<ProductReviewContext|null>(null)
 const [draft,setDraft]=useState<Draft|null>(null)
 const [preview,setPreview]=useState<ProductReviewResult|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [confirmed,setConfirmed]=useState(false)
 const [message,setMessage]=useState('')
 const [editor,setEditor]=useState('')
 const [price,setPrice]=useState('')
 const [reason,setReason]=useState('')
 const [references,setReferences]=useState<Record<string,string>>({})
 const [importSource,setImportSource]=useState('')
 const [importSummary,setImportSummary]=useState('')
 const generation=useRef(0),working=useRef(false),request=useRef('')
 const selection=ids.join(',')
 const money=(amount:number)=>new Intl.NumberFormat(intlLocale,{style:'currency',currency:'MAD'}).format(amount)
 useEffect(()=>{
  const current=++generation.current
  setContext(null);setDraft(null);setPreview(null);setEditor('');setError('');setConfirmed(false)
  if(!ids.length)return
  productReviewContext(domain,ids).then(value=>{if(current===generation.current)setContext(value)})
   .catch(failure=>{if(current===generation.current)setError(failure.message)})
  return()=>{generation.current++}
 // The serialized selection keeps this request stable across parent renders.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[domain,selection])

 async function run(action:()=>Promise<void>){
  if(working.current)return
  working.current=true;setBusy(true);setError('')
  try{await action()}catch(failure){setError(failure instanceof Error?failure.message:String(failure))}
  finally{working.current=false;setBusy(false)}
 }
 async function check(value:Draft){
  request.current=crypto.randomUUID()
  setPreview(null);setConfirmed(false);setDraft(value)
  const result=await reviewStockProducts(domain,request.current,value.context,value.rows)
  setPreview(result)
 }
 const products=context?reviewProducts(context):[]
 const editMovements=context?.movements.filter(movement=>movement.item===editor)??[]
 const needsPrice=context?.method==='cump'&&editMovements.some(movement=>movement.price===null)
 function invalidate(){setPreview(null);setDraft(null);setConfirmed(false)}
 const confirmationPanel=preview&&draft&&canEdit&&<div className="space-y-3 rounded-xl border border-brand p-4">
  <h4 className="font-semibold">{t('Synthèse avant validation')}</h4>
  <p>{preview.count} {t('sorties')} · {money(preview.amount)}</p>
  <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>{t('Je confirme les prix et les affectations de ces sorties.')}</label>
  <Button type="button" disabled={busy||!confirmed} loading={busy} onClick={()=>run(async()=>{
   const result=await reviewStockProducts(domain,request.current,draft.context,draft.rows,true)
   setMessage(`${result.count} ${t('sorties rapprochées')} · ${money(result.amount)}`)
   setPreview(null);setDraft(null);setEditor('');onApplied()
  })}>{t('Valider les coûts')}</Button>
 </div>
 return <div className="space-y-4">
  {message&&<p role="status" data-feedback="success" className="rounded-lg p-3">{message}</p>}
  {importSummary&&!editor&&<p role="status" data-feedback="info" className="rounded-lg p-3">{importSummary}</p>}
  {error&&!editor&&<p role="alert" data-feedback="error" className="rounded-lg p-3">{t(error)}</p>}
  <Button type="button" variant="outline" disabled={busy} onClick={()=>{invalidate();setEditor('');onApplied()}}>{t('Actualiser les sorties à rapprocher')}</Button>
  {context&&<>
   <p className="text-sm text-fg-secondary">{context.method==='cump'?t('CUMP par article pour les sorties non valorisées. Les prix déjà calculés sont conservés.'):t('FIFO : les prix des sorties proviennent des entrées. Complétez les affectations nécessaires.')}</p>
   <div className="flex flex-wrap items-center gap-3">
    <button className={field} disabled={busy} onClick={()=>run(async()=>{
     const fresh=await productReviewContext(domain,ids)
     const blob=await productReviewWorkbook(domain,fresh)
     const url=URL.createObjectURL(blob),link=document.createElement('a')
     link.href=url;link.download=`ItriX_Valorisation_${fresh.method.toUpperCase()}.xlsx`;link.click()
     setTimeout(()=>URL.revokeObjectURL(url),1000)
    })}>{t('Exporter les articles / sorties à rapprocher')}</button>
    {canEdit&&<label className={`${field} cursor-pointer`}>{t('Recharger le fichier Excel')}<input className="block max-w-full text-xs" type="file" accept=".xlsx" disabled={busy} onChange={event=>{
     const file=event.target.files?.[0];event.target.value=''
     if(file)void run(async()=>{
      setEditor('');invalidate();setImportSummary('');setMessage('')
      const actor=profile?.full_name||user?.email||user?.id
      if(!actor)throw new Error('Session utilisateur requise pour tracer cet import.')
      const source=[importSource.trim(),`${t('Importé par')} ${actor}`,`${t('Date d’import')} ${new Date().toISOString()}`,`${t('Fichier')} ${file.name}`].filter(Boolean).join(' · ')
      const parsed=await readProductReviewWorkbook(await file.arrayBuffer(),domain,{allowPartial:true,allowCachedPrices:true,fallbackReason:source})
      const pending=new Set(ids)
      const rows=parsed.rows.filter(row=>pending.has(row.id))
      const ignored=parsed.rows.length-rows.length
      if(!rows.length){setImportSummary(t('Les sorties renseignées dans ce fichier sont déjà traitées ou hors du périmètre affiché.'));return}
      const fresh=await productReviewContext(domain,rows.map(row=>row.id))
      if(fresh.method!==parsed.context.method)throw new Error('La méthode a changé. Actualisez les sorties avant de poursuivre.')
      // Retain immutable references and allocations even when part of the old file was already processed.
      const expected=new Map(parsed.context.movements.map(movement=>[movement.id,movement]))
      for(const movement of fresh.movements){
       const original=expected.get(movement.id)
       if(!original||!sameReviewMovement(movement,original))throw new Error('Les sorties restantes ont été modifiées depuis cet export. Vérifiez les lignes concernées avant de poursuivre.')
      }
      for(const row of rows)for(const planting of row.plantings){
       const current=fresh.plantings.find(value=>value.id===planting),original=parsed.context.plantings.find(value=>value.id===planting)
       const keys=['id','ref','farm_id','campaign_id','greenhouse_id','area','variety_name'] as const
       if(!current||!original||keys.some(key=>current[key]!==original[key]))throw new Error('Les affectations ont changé depuis cet export. Vérifiez les plantations avant de poursuivre.')
      }
      await check({context:fresh,rows})
      setImportSummary(`${t('Source commune du fichier')} · ${source}. ${t('Prix lus depuis les résultats de formules enregistrés')} · ${parsed.formulaPrices}. ${t('Sorties déjà traitées ou hors périmètre ignorées')} · ${ignored}. ${t('Articles sans CUMP laissés en attente')} · ${parsed.skippedProducts.length}${parsed.skippedProducts.length?` (${parsed.skippedProducts.join(', ')})`:''}`)
     })
    }}/></label>}
   </div>
   {canEdit&&<label className="grid max-w-xl gap-1 text-sm">{t('Source commune du fichier')}<input aria-label={t('Source commune du fichier')} className={field} disabled={busy} value={importSource} placeholder={t('Ex. prix communiqués par la ferme')} onChange={event=>{setImportSource(event.target.value);invalidate();setImportSummary('')}}/><span className="text-fg-secondary">{t('Si le justificatif est vide, l’utilisateur, la date et le nom du fichier sont ajoutés automatiquement. Les articles sans CUMP restent en attente.')}</span></label>}
   <div className="grid gap-3 md:grid-cols-2">{products.map(product=><div key={product.id} className="rounded-xl border border-border p-4">
    <h4 className="font-semibold">{product.name}</h4><p className="text-sm text-fg-secondary">{product.code} · {product.count} {t('sorties')} · {product.quantity} {product.unit}</p>
    <p className="text-sm">{t('Quantité à valoriser')} · {product.unvalued} {product.unit}</p>
    {canEdit&&<button className={`${field} mt-3`} disabled={busy} onClick={()=>{
     setEditor(product.id);setPrice('');setReason('');setReferences({});setError('');setMessage('');setImportSummary('');invalidate()
    }}>{t('Rapprocher cet article')}</button>}
   </div>)}</div>
   {editor&&<Modal title={t('Rapprocher cet article')} busy={busy} dirty={price.trim()!==''||reason.trim()!==''||Object.keys(references).length>0} onClose={()=>{setEditor('');invalidate();setError('')}}>
    <div className="space-y-4">
    <p className="font-semibold">{products.find(product=>product.id===editor)?.name}</p>
    <p>{editMovements.length} {t('sorties')} · {t('Quantité à valoriser')} · {products.find(product=>product.id===editor)?.unvalued} {products.find(product=>product.id===editor)?.unit}</p>
    {needsPrice&&<>
     <label className="grid gap-1">{t('CUMP confirmé (MAD)')}<input autoFocus className={field} inputMode="decimal" value={price} disabled={busy} onChange={event=>{setPrice(event.target.value);invalidate()}}/></label>
     <p className="text-sm text-fg-secondary">{t('Saisissez une seule fois le CUMP par unité pour les sorties non valorisées de cet article.')}</p>
     <label className="grid gap-1">{t('Justificatif / source du prix')}<input className={field} value={reason} disabled={busy} onChange={event=>{setReason(event.target.value);invalidate()}}/></label>
    </>}
    <details open={editMovements.some(movement=>!movement.fixed&&!movement.linked)}><summary className="cursor-pointer">{t('Détail des sorties et affectations')}</summary>
    <div className="max-h-64 space-y-2 overflow-auto py-2">{editMovements.map(movement=><div key={movement.id} className="rounded-lg border border-border p-3 text-sm">
     <p>{movement.date} · {movement.reference||movement.id} · {movement.quantity} {movement.unit} · {movement.warehouse}</p>
     <p>{t('PU calculé (MAD)')} · {movement.price===null?'—':movement.price}</p>
     {movement.fixed||movement.linked?<p>{t('Affectations existantes conservées')}</p>:<label className="grid gap-1">{t('Références plantations séparées par ;')}<input className={field} value={references[movement.id]??''} disabled={busy} onChange={event=>{setReferences({...references,[movement.id]:event.target.value});invalidate()}}/></label>}
    </div>)}</div></details>
    {editMovements.some(movement=>!movement.fixed&&!movement.linked)&&<details><summary>{t('Référentiel des plantations')}</summary>{context.plantings.map(planting=><p className="text-xs" key={planting.id}>{planting.ref} · {planting.farm_name} · {planting.campaign_name} · {planting.greenhouse_name} · {planting.variety_name}</p>)}</details>}
    <button className={field} disabled={busy} onClick={()=>run(async()=>{
     const normalized=price.replace(/\s/g,'').replace(',','.')
     if(needsPrice&&(!normalized||!Number.isFinite(Number(normalized))||Number(normalized)<0))throw new Error('Renseignez un CUMP positif ou nul pour cet article.')
     if(needsPrice&&reason.trim().length<5)throw new Error('Indiquez la source du CUMP avec au moins 5 caractères.')
     const fresh=await productReviewContext(domain,editMovements.map(movement=>movement.id))
     if(fresh.method!==context.method)throw new Error('La méthode a changé. Actualisez les sorties avant de poursuivre.')
     const rows=fresh.movements.map(movement=>{
      const refs=(references[movement.id]??'').split(';').map(value=>value.trim()).filter(Boolean)
      const plantings=refs.map(ref=>fresh.plantings.find(planting=>planting.ref===ref)?.id)
      if(plantings.some(id=>!id))throw new Error(t('Référence de plantation inconnue.'))
      return {id:movement.id,price:movement.price===null?normalized:String(movement.price),reason:reason.trim(),plantings:plantings as string[]}
     })
     await check({context:fresh,rows})
    })}>{t('Contrôler avant validation')}</button>
    <button className={`${field} ml-2`} disabled={busy} onClick={()=>{setEditor('');invalidate();setError('')}}>{t('Annuler')}</button>
    {error&&<p role="alert" data-feedback="error" className="rounded-lg p-3">{t(error)}</p>}
    {confirmationPanel}
    </div>
   </Modal>}
   {!editor&&confirmationPanel}
  </>}
 </div>
}
