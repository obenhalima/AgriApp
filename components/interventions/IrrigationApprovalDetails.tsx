'use client'
import {useLanguage} from '@/lib/i18n'
import { waterFormat } from '@/lib/irrigation'

/** Shared mobile validation context: litres of water, never pesticide mixture. */
export function IrrigationApprovalDetails({entity}:{entity:{planned_liters:number;water_source:string;sector?:string;notes?:string;greenhouses:string[];water:{mode:string;minutes?:number;flow?:number};occurrences:{id:string;planned_at:string}[]}}){
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

 const occurrences=entity.occurrences||[]
 return <section aria-label={_ui("Programme d’irrigation à valider")} className="rounded border border-cyan-200 bg-cyan-50 p-3 space-y-2 text-sm">
  <p><strong>{_ui("Eau seule — aucun produit ajouté.")}</strong> {" "}{_ui("La validation porte sur toutes les occurrences du programme.")}</p>
  <p>{_ui("Serres :")}{" "}{entity.greenhouses?.join(', ')||_ui("Non renseignées")}</p>
  <p>{_ui("Source d’eau :")}{" "}{entity.water_source}{entity.sector&&_ui("· Secteur : {v0}",{v0:String(entity.sector)})}</p>
  <p>{_ui("Volume global par occurrence :")}{" "}<strong>{waterFormat(Number(entity.planned_liters))} L</strong></p>
  {entity.water?.mode==='duration'?<p>{_ui("Volume estimé :")}{" "}{waterFormat(Number(entity.water.minutes))} {" "}{_ui("minutes ×")}{" "}{waterFormat(Number(entity.water.flow))} L/h ÷ 60.</p>:<p>{_ui("Volume prévu saisi, non mesuré.")}</p>}
  <p>{occurrences.length} {" "}{_ui("occurrence(s) · Total prévu :")}{" "}{waterFormat(Number(entity.planned_liters)*occurrences.length)} L</p>
  {entity.notes&&<p className="whitespace-pre-wrap break-words">{_ui("Consignes :")}{" "}{entity.notes}</p>}
  <details><summary className="cursor-pointer font-semibold">{_ui("Vérifier toutes les dates (")}{occurrences.length})</summary><ul className="mt-2 space-y-1">{occurrences.map(o=><li key={o.id}>{new Date(o.planned_at).toLocaleString(_uiLocale)}</li>)}</ul></details>
 </section>
}
