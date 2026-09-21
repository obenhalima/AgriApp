import {AlertTriangle,Package} from 'lucide-react'

export function TreatmentWarnings({request}:{request:any}) {
 const applications=Array.isArray(request.treatment_applications)?request.treatment_applications:request.treatment_applications?[request.treatment_applications]:[]
 const warnings=applications.flatMap((a:any)=>Array.isArray(a?.safety_warnings)?a.safety_warnings:[]).filter((w:any)=>w&&typeof w.message==='string')
 const shortages=Array.isArray(request.stock_forecast?.shortages)?request.stock_forecast.shortages:[]
 if(!warnings.length&&!shortages.length)return null
 return <div className="space-y-2 mt-3">
  {!!warnings.length&&<details className="rounded-lg border border-warning/30 bg-warning/5 text-fg-primary"><summary className="cursor-pointer px-3 py-2 text-caption font-semibold text-warning"><AlertTriangle size={13} className="inline mr-1.5"/>{warnings.length} vigilance(s) réglementaire(s)</summary><div className="px-3 pb-3 space-y-2">{warnings.map((w:any,i:number)=><div key={i} className="text-caption"><p className="font-semibold">{w.product||'Produit'}</p><p className="text-fg-secondary mt-0.5">{w.message}</p></div>)}</div></details>}
  {!!shortages.length&&<details className="rounded-lg border border-warning/30 bg-warning/5"><summary className="cursor-pointer px-3 py-2 text-caption font-semibold text-warning"><Package size={13} className="inline mr-1.5"/>{shortages.length} produit(s) à approvisionner</summary><div className="px-3 pb-3 space-y-2">{shortages.map((s:any,i:number)=><div key={i} className="text-caption"><p className="font-semibold">{s.product}</p><p className="text-fg-secondary">{s.article_missing?'Article de stock à créer · ':''}Manque {Number(s.missing||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} {s.unit}</p></div>)}</div></details>}
 </div>
}
