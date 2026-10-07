'use client'
import {useLanguage} from '@/lib/i18n'
import {waterFormat} from '@/lib/irrigation'
export function CulturalApprovalDetails({entity}:{entity:any}){
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

 return <div className="space-y-2"><strong>{entity.family}</strong><p>{entity.notes}</p><p>{_ui("Eau prévue :")}{" "}{waterFormat(Number(entity.water_liters||0))} {" "}{_ui("L par occurrence")}</p><p>{_ui("Entrepôt :")}{" "}{entity.warehouse||_ui("Sans produit")}</p><ul>{(entity.targets||[]).map((t:any)=><li key={t.planting_id}>{t.greenhouse} — {waterFormat(Number(t.area))} m²</li>)}</ul><details><summary>{entity.dates?.length||0} {" "}{_ui("occurrence(s) — afficher les dates")}</summary>{(entity.dates||[]).map((d:string)=><p key={d}>{new Date(d).toLocaleString(_uiLocale)}</p>)}</details><p className="text-sm">{_ui("La décision porte sur l’ensemble du programme. Les quantités affichées sont prévues par occurrence. Le stock sera contrôlé de nouveau lors de l’exécution.")}</p></div>
}
