'use client'
import { Input } from '@/components/ui/Input'
import { harvestPeopleMetrics } from '@/lib/harvestPeople'
export function HarvestPeopleFields({form,setForm,kg}:{form:any;setForm:any;kg:number}){
 const metrics=harvestPeopleMetrics(kg,Number(form.harvest_people)||null,Number(form.harvest_hours)||null,false,null)
 const fmt=(v:number)=>v.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})
 return <fieldset className="my-3 space-y-3 rounded-lg border border-border p-3">
  <legend className="px-1 font-semibold">Personnel ayant participé à la récolte</legend>
  <label className="block">Nombre de personnes (facultatif)<Input type="number" min="1" step="1" value={form.harvest_people??''} onChange={e=>setForm((f:any)=>({...f,harvest_people:e.target.value}))}/></label>
  <label className="block">Heures par personne consacrées à cette récolte (facultatif)<Input type="number" min="0.01" max="24" step="0.01" value={form.harvest_hours??''} onChange={e=>setForm((f:any)=>({...f,harvest_hours:e.target.value}))}/></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!form.harvest_full_day} onChange={e=>setForm((f:any)=>({...f,harvest_full_day:e.target.checked}))}/>Cette saisie représente toute la récolte de la journée pour ces personnes.</label>
  <p className="text-xs text-fg-secondary">Aucune équipe requise. Ne cochez pas si les mêmes personnes participent à d’autres saisies ce jour : l’objectif journalier ne serait pas comparable. Les effectifs de plusieurs récoltes ne sont jamais additionnés comme des personnes distinctes.</p>
  {metrics.perPerson!=null&&<p className="text-brand font-semibold">{fmt(metrics.perPerson)} kg/personne sur cette récolte{metrics.perHour!=null&&` · ${fmt(metrics.perHour)} kg/heure-personne`} (poids estimé)</p>}
 </fieldset>
}
