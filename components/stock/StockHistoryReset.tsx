'use client'
import {useEffect,useRef,useState} from 'react'
import {useLanguage} from '@/lib/i18n'
import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {resetStockHistory,type StockResetResult} from '@/lib/stockHistoryApi'

export function StockHistoryReset({domain,onApplied,onBusy}:{domain:string;onApplied:(result:StockResetResult)=>Promise<void>;onBusy:(busy:boolean)=>void}){
 const {t}=useLanguage()
 const [preview,setPreview]=useState<StockResetResult|null>(null)
 const [confirmation,setConfirmation]=useState(''),[checked,setChecked]=useState(false)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const working=useRef(false),request=useRef('')
 const active=useRef(true)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const blocked=!!preview&&Object.values(preview.blockers).some(count=>count>0)
 async function submit(apply:boolean){
  if(working.current||(apply&&(!preview||blocked||!checked||confirmation!==preview.domain_code)))return
  working.current=true;setBusy(true);onBusy(true);setError('')
  try{
   if(!apply){request.current=crypto.randomUUID();setPreview(null);setChecked(false);setConfirmation('')}
   const response=await resetStockHistory(domain,request.current,apply?preview!.fingerprint:null,apply?confirmation:null,apply)
   if(!active.current)return
   if(response.status==='applied')await onApplied(response)
   else setPreview(response)
  }catch(e){if(active.current)setError(e instanceof Error?e.message:String(e))}
  finally{working.current=false;if(active.current){setBusy(false);onBusy(false)}}
 }
 return <Card className="space-y-4 border-danger/40">
  <h2 className="font-semibold">{t('Repartir de zéro pour ce client')}</h2>
  <p>{t('Cette action supprime les mouvements existants et leurs coûts de stock, puis remet les soldes à zéro. Les articles, entrepôts, fermes et plantations sont conservés.')}</p>
  <Button variant="secondary" disabled={busy} onClick={()=>void submit(false)}>{t('Afficher l’aperçu de remise à zéro')}</Button>
  {preview&&<>
   <p className="font-medium">{t('Client concerné')} · {preview.domain_code}</p>
   <ul className="list-disc space-y-1 ps-5">
    <li>{preview.movements} {t('Mouvements à supprimer')}</li>
    <li>{preview.costs} {t('Coûts de stock à supprimer')}</li>
    <li>{preview.balances} {t('Soldes à remettre à zéro')}</li>
    <li>{preview.items} {t('Articles conservés')}</li>
   </ul>
   {blocked&&<div role="alert" className="space-y-2 text-danger">
    <p>{t('Des opérations liées empêchent cette remise à zéro. Elles doivent être traitées avant de poursuivre.')}</p>
    {Object.entries(preview.blockers).filter(([,count])=>count>0).map(([key,count])=><p key={key}>{t(({purchases:'Réceptions d’achat',transfers:'Transferts',requests:'Demandes de sortie',treatments:'Traitements phytosanitaires',cultural:'Interventions culturales',inconsistent:'Liens entre clients incohérents'} as Record<string,string>)[key])} · {count}</p>)}
   </div>}
   <label className="block space-y-2"><span>{t('Recopiez le code du client pour confirmer')} · <strong>{preview.domain_code}</strong></span><input className="form-input" value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
   <label className="flex items-start gap-2"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/><span>{t('Je confirme la suppression des mouvements et coûts affichés pour reconstruire cet historique par import.')}</span></label>
   <Button variant="destructive" disabled={busy||blocked||!checked||confirmation!==preview.domain_code} onClick={()=>void submit(true)}>{t('Remettre les mouvements et soldes à zéro')}</Button>
  </>}
  {error&&<p role="alert" className="text-danger">{t(error)}</p>}
 </Card>
}
