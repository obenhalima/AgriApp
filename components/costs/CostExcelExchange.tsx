'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage, TranslatedText} from '@/lib/i18n'

import { useEffect,useRef,useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Modal } from '@/components/ui/Modal'
import { planCostRows,type CostKind,type CostCatalog,type CostRow } from '@/lib/costWorkbookPlan'
export function CostExcelExchange({kind,onImported}:{kind:CostKind;onImported:()=>void}) {
 const {activeDomain,hasPermission}=useAuth()
 if(!activeDomain||!hasPermission('couts','view'))return null
 return <Panel key={`${activeDomain.domain_id}:${kind}`} domainId={activeDomain.domain_id} domainName={activeDomain.domain_name} kind={kind} canImport={hasPermission('couts','create')} onImported={onImported}/>
}
function Panel({domainId,domainName,kind,canImport,onImported}:{domainId:string;domainName:string;kind:CostKind;canImport:boolean;onImported:()=>void}) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false)
 const [preview,setPreview]=useState<{rows:CostRow[];catalog:CostCatalog;plan:ReturnType<typeof planCostRows>}|null>(null)
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function download(){setBusy(true);setError('');try{const lib=await import('@/lib/costWorkbookExchange'),c=await lib.costExchangeCatalog(domainId,domainName),blob=await lib.costExchangeTemplate(c,kind);if(!alive.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ItriX_${kind==='budget'?'Budget':'Couts_reels'}_${domainName.replace(/[^a-z0-9_-]/gi,'_')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function check(file:File){setBusy(true);setError('');setPreview(null);setMessage('');setConfirmed(false);try{if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw Error('Choisir un .xlsx de 10 Mo maximum.');const lib=await import('@/lib/costWorkbookExchange'),c=await lib.costExchangeCatalog(domainId,domainName),rows=await lib.readCostExchange(await file.arrayBuffer(),domainId,kind);if(alive.current)setPreview({rows,catalog:c,plan:planCostRows(rows,c,kind)})}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function commit(){if(!preview||!confirmed||!canImport||preview.plan.issues.length||busy)return;setBusy(true);setError('');try{const lib=await import('@/lib/costWorkbookExchange'),c=await lib.costExchangeCatalog(domainId,domainName),plan=planCostRows(preview.rows,c,kind);if(plan.issues.length||JSON.stringify(plan.entries)!==JSON.stringify(preview.plan.entries)){setPreview({rows:preview.rows,catalog:c,plan});setConfirmed(false);throw Error('Le référentiel a changé. Vérifier le nouvel aperçu avant de confirmer.')}if(!alive.current)return;const result=await lib.commitCostPlan(plan.entries);setMessage(`${result.inserted} écriture(s) créée(s), ${result.skipped} déjà importée(s).`);setPreview(null);setConfirmed(false);onImported()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <><button className="btn-ghost" onClick={()=>setOpen(true)}>{_ui("Excel · Modèle et import")}</button>{open&&<Modal size="lg" title={_ui("Excel — {v0}",{v0:String(kind==='budget'?'Budget prévisionnel':'Coûts réels')})} onClose={()=>{if(!busy)setOpen(false)}}><div className="space-y-4">
  <p><strong>{domainName}</strong> · {kind==='budget'?_ui("Les écritures seront prévisionnelles."):_ui("Les écritures seront des charges réelles.")}</p>
  <p>{_ui("Ponctuel, mensuel, par surface ou mensuel × surface. Choisissez les références déjà paramétrées. Les montants sont en MAD.")}</p>
  <button className="btn-primary" disabled={busy} onClick={download}>{_ui("Télécharger le modèle")}{" "}{kind==='budget'?_ui("Budget"):_ui("Réel")}</button>
  <label className="block">{_ui("Charger et contrôler le fichier")}<input className="block mt-2" aria-label={_ui("Fichier coûts Excel")} type="file" accept=".xlsx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void check(f)}}/></label>
  {busy&&<p role="status">{_ui("Traitement en cours…")}</p>}{error&&<p role="alert" className="text-red-700">{_uiNode(error)}</p>}{message&&<p role="status">{_uiNode(message)}</p>}
  {preview&&<><p>{preview.rows.length} {" "}{_ui("coût(s) source ·")}{" "}{preview.plan.entries.length} {" "}{_ui("écriture(s) ·")}{" "}{preview.plan.total.toLocaleString(_uiLocale)} MAD</p>
   {!!preview.plan.issues.length&&<ul role="alert" className="max-h-48 overflow-auto">{preview.plan.issues.map((i,n)=><li key={n}>{_ui("Ligne")}{" "}{i.row} : {_uiNode(i.message)}</li>)}</ul>}
   <div className="max-h-72 overflow-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Ligne','Référence','Date','Serre / périmètre','MAD'].map(h=><th className="p-2 text-left" key={h}><TranslatedText text={h}/></th>)}</tr></thead><tbody>{preview.plan.entries.slice(0,500).map((e,i)=><tr key={i} className="border-t"><td className="p-2">{e.sourceRow}</td><td className="p-2">{e.ref}</td><td className="p-2">{e.entry_date}</td><td className="p-2">{preview.catalog.greenhouses.find(g=>g.id===e.greenhouse_id)?.label||_ui("Campagne (charge commune)")}</td><td className="p-2">{e.amount.toLocaleString(_uiLocale)}</td></tr>)}</tbody></FilterableTable>{preview.plan.entries.length>500&&<p>{_ui("500 premières écritures affichées sur")}{" "}{preview.plan.entries.length}.</p>}</div>
   <p className="text-sm">{_ui("Vérifiez que ces charges ne sont pas déjà saisies ou générées par les stocks, factures ou pointages. Les références stables protègent contre la relance du même import, pas contre une double saisie avec une autre référence.")}</p>
   <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy||!!preview.plan.issues.length} onChange={e=>setConfirmed(e.target.checked)}/>{_ui("Je valide les répartitions et confirme l’import en")}{" "}<TranslatedText text={kind==='budget'?'budget':_ui("réel")}/> {" "}{_ui("pour")}{" "}{domainName}.</label>
   <button className="btn-primary" disabled={busy||!confirmed||!canImport||!!preview.plan.issues.length} onClick={commit}>{_ui("Confirmer l’import")}</button>{!canImport&&<p>{_ui("Droit de création de coûts requis pour importer.")}</p>}
  </>}
 </div></Modal>}</>
}
