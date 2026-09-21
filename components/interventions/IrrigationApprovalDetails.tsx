import { waterFormat } from '@/lib/irrigation'

/** Shared mobile validation context: litres of water, never pesticide mixture. */
export function IrrigationApprovalDetails({entity}:{entity:{planned_liters:number;water_source:string;sector?:string;notes?:string;greenhouses:string[];water:{mode:string;minutes?:number;flow?:number};occurrences:{id:string;planned_at:string}[]}}){
 const occurrences=entity.occurrences||[]
 return <section aria-label="Programme d’irrigation à valider" className="rounded border border-cyan-200 bg-cyan-50 p-3 space-y-2 text-sm">
  <p><strong>Eau seule — aucun produit ajouté.</strong> La validation porte sur toutes les occurrences du programme.</p>
  <p>Serres : {entity.greenhouses?.join(', ')||'Non renseignées'}</p>
  <p>Source d’eau : {entity.water_source}{entity.sector&&` · Secteur : ${entity.sector}`}</p>
  <p>Volume global par occurrence : <strong>{waterFormat(Number(entity.planned_liters))} L</strong></p>
  {entity.water?.mode==='duration'?<p>Volume estimé : {waterFormat(Number(entity.water.minutes))} minutes × {waterFormat(Number(entity.water.flow))} L/h ÷ 60.</p>:<p>Volume prévu saisi, non mesuré.</p>}
  <p>{occurrences.length} occurrence(s) · Total prévu : {waterFormat(Number(entity.planned_liters)*occurrences.length)} L</p>
  {entity.notes&&<p className="whitespace-pre-wrap break-words">Consignes : {entity.notes}</p>}
  <details><summary className="cursor-pointer font-semibold">Vérifier toutes les dates ({occurrences.length})</summary><ul className="mt-2 space-y-1">{occurrences.map(o=><li key={o.id}>{new Date(o.planned_at).toLocaleString('fr-FR')}</li>)}</ul></details>
 </section>
}
