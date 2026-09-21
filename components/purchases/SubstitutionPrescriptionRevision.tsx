'use client'
import {useState} from 'react'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import {withDeadline} from '@/lib/withDeadline'
import {substitutionNumber} from '@/lib/purchaseSubstitutions'
import {formatPlanNumber as fmt} from '@/lib/farmLayout'
import {Button} from '@/components/ui/Button'
import {Field,Input,Textarea} from '@/components/ui/Input'
type Candidate={id:string;fingerprint:string;planned_at:string;area:number;water:number|null;old_quantity:number;old_unit:string;new_quantity:number|null;greenhouses:string;products:{name:string;dose:number;dose_unit:string;quantity:number;unit:string;replaced:boolean}[]}
type Preview={source_fingerprint:string;product_name:string;target_name:string;unit:string;dose:number;dose_min:number|null;dose_max:number;dose_unit:string;phi_days:number;rei_hours:number|null;candidates:Candidate[]}
export function SubstitutionPrescriptionRevision({substitutionId}:{substitutionId:string}){
 const [preview,setPreview]=useState<Preview|null>(null),[selected,setSelected]=useState<string[]>([]),[dose,setDose]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(0),[batch,setBatch]=useState('')
 async function load(recalculate=false){
  setBusy(true);setError('');setDone(0)
  try{
   const amount=recalculate?substitutionNumber(dose):null
   if(recalculate&&(!Number.isFinite(amount)||amount!<=0))throw new Error('Dose positive requise.')
   const r=await withDeadline(signal=>supabase.rpc('preview_substitution_prescriptions',{p_substitution:substitutionId,p_dose:amount}).abortSignal(signal),25000,'Aperçu indisponible : réessayez.')
   if(r.error)throw r.error
   setPreview(r.data);setDose(String(r.data.dose));setSelected([]);setConfirmed(false);setBatch(crypto.randomUUID())
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function submit(){
  if(!preview||!confirmed||reason.trim().length<5||!selected.length)return
  setBusy(true);setError('')
  try{
   const r=await withDeadline(signal=>supabase.rpc('revise_substitution_prescriptions',{p_id:batch,p_substitution:substitutionId,p_input:{dose:preview.dose,source_fingerprint:preview.source_fingerprint,reason,confirmed,occurrences:preview.candidates.filter(c=>selected.includes(c.id)).map(c=>({id:c.id,fingerprint:c.fingerprint}))}}).abortSignal(signal),30000,'Réponse inconnue : réessayez sans actualiser pour conserver le même identifiant.')
   if(r.error)throw r.error
   setDone(r.data.length);setPreview(null);setSelected([]);setConfirmed(false)
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 const needsCalculation=!!preview&&substitutionNumber(dose)!==Number(preview.dose)
 return <section className="space-y-3 rounded border border-brand/30 p-3">
  <Button variant="secondary" disabled={busy} onClick={()=>load()}>Réviser les prescriptions concernées</Button>
  {error&&<p role="alert" className="text-danger">{error}</p>}
  {done>0&&<p role="status" className="text-success">{done} nouvelle(s) prescription(s) soumise(s) à validation. Anciennes occurrences sélectionnées annulées. <Link className="underline" href="/agronomie/traitements">Ouvrir les prescriptions</Link></p>}
  {preview&&<>
   <p><strong>{preview.product_name} — {preview.target_name}</strong> · DAR {preview.phi_days} jours · rentrée {preview.rei_hours??'non renseignée'} h</p>
   <Field label={`Dose du remplaçant (${preview.dose_min??'—'} à ${preview.dose_max} ${preview.dose_unit})`}><Input aria-label="Dose de révision" value={dose} disabled={busy} inputMode="decimal" onChange={e=>{setDose(e.target.value);setConfirmed(false)}}/></Field>
   {needsCalculation&&<Button disabled={busy} onClick={()=>load(true)}>Recalculer les quantités</Button>}
   <p className="text-xs text-fg-tertiary">Même ferme et même cible uniquement. Décochez les occurrences qui doivent conserver le produit initial. Les quantités ne sont pas réservées : la disponibilité sera recalculée dans les prescriptions.</p>
   {!preview.candidates.length&&<p>Aucune occurrence future non exécutée ne correspond au produit initial et à cette cible dans la ferme.</p>}
   {preview.candidates.map(c=><div key={c.id} className="rounded border p-2"><label className="flex gap-2"><input aria-label={`Réviser ${c.id}`} type="checkbox" disabled={busy||needsCalculation||!c.new_quantity} checked={selected.includes(c.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id));setConfirmed(false)}}/><span>{new Date(c.planned_at).toLocaleString('fr-FR')} · {c.greenhouses||c.id} · {fmt(c.area)} m²<br/>{fmt(c.old_quantity)} {c.old_unit} du produit initial → <strong>{c.new_quantity==null?'Non calculable':fmt(c.new_quantity)} {preview.unit}</strong> de {preview.product_name}</span></label><details className="mt-2 text-xs"><summary>Vérifier tous les produits de cette occurrence</summary>{c.products.map((p,i)=><p key={i}>{p.replaced?`${p.name} → ${preview.product_name}`:`Conservé : ${p.name} · dose ${p.dose} ${p.dose_unit} · ${fmt(p.quantity)} ${p.unit}`}</p>)}</details></div>)}
   <Field label="Justification de la révision (5 caractères minimum)"><Textarea aria-label="Justification de révision" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field>
   <label className="flex gap-2 text-warning"><input type="checkbox" aria-label="Confirmer la révision" checked={confirmed} disabled={busy||needsCalculation} onChange={e=>setConfirmed(e.target.checked)}/><span>J’ai vérifié les usages et tous les produits des mélanges. J’accepte l’annulation des anciennes occurrences sélectionnées et la création de nouvelles prescriptions à valider. En cas de refus, les anciennes ne seront pas réactivées automatiquement.</span></label>
   <Button disabled={busy||needsCalculation||!confirmed||reason.trim().length<5||!selected.length} onClick={submit}>Soumettre les prescriptions révisées</Button>
  </>}
 </section>
}
