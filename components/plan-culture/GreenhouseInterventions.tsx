'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type Intervention={id:string;kind:string;title:string;planned:string|null;actual:string|null;status:string;products:string;done:boolean;closed:boolean}
const list=(v:any):any[]=>Array.isArray(v)?v:v?[v]:[]
const labels:Record<string,string>={brouillon:'Brouillon',soumise:'À valider',approuvee:'Validée',approved:'Validée',submitted:'À valider',draft:'Brouillon',cancelled:'Annulée',completed:'Terminée',annulee:'Annulée',rejetee:'Refusée',realisee:'Réalisée',partielle:'Partiellement réalisée',non_realisee:'Non réalisée',a_confirmer:'À confirmer'}
const date=(d:string|null)=>d?new Date(d).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'—'

export function GreenhouseInterventions({domainId,farmId,campaignId,greenhouseId,plantingIds}:{domainId:string;farmId:string;campaignId:string;greenhouseId:string;plantingIds:string[]}){
 const {hasPermission}=useAuth(),allowed=hasPermission('agronomie','view')
 const [rows,setRows]=useState<Intervention[]>([]),[errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(true)
 const [filter,setFilter]=useState('all')
 const idsKey=[...plantingIds].sort().join(',')
 useEffect(()=>{
  let stop=false;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000)
  setRows([]);setErrors([]);setBusy(true)
  if(!allowed){setBusy(false);clearTimeout(timer);return}
  const ids=idsKey?idsKey.split(','):[]
  const result:Intervention[]=[],issues:string[]=[]
  async function phyto(){
   if(!ids.length)return
   try{
    const seen=new Set<string>()
    for(let batch=0;batch<ids.length;batch+=100)for(let offset=0;;offset+=250){
     const r=await supabase.from('treatment_requests').select('id,planned_at,status,target_name,treatment_request_targets!inner(campaign_planting_id),treatment_request_products(product_name,stock_items(name)),treatment_applications(application_status,actual_started_at)')
      .eq('domain_id',domainId).in('treatment_request_targets.campaign_planting_id',ids.slice(batch,batch+100)).order('id').range(offset,offset+249).abortSignal(controller.signal)
     if(r.error)throw r.error
     for(const p of r.data||[]){if(seen.has(p.id))continue;seen.add(p.id)
      const apps=list(p.treatment_applications),a=apps[0],done=apps.some(x=>['realisee','partielle'].includes(x.application_status))
      result.push({id:p.id,kind:'Phyto',title:p.target_name||'Traitement phytosanitaire',planned:p.planned_at,actual:a?.actual_started_at||null,status:a?.application_status||p.status,done,closed:!!a||['annulee','rejetee'].includes(p.status),products:list(p.treatment_request_products).map(x=>list(x.stock_items)[0]?.name||x.product_name||'Produit non renseigné').join(', ')})
     }
     if((r.data?.length||0)<250)break
    }
   }catch{issues.push('Traitements phyto indisponibles : données ou droits à vérifier.')}
  }
  async function workspace(rpc:'cultural_workspace'|'irrigation_workspace',kind:string){
   try{
    const r=await supabase.rpc(rpc,{p_domain:domainId}).abortSignal(controller.signal);if(r.error)throw r.error
    for(const p of r.data?.programs||[]){
     if(p.campaign_id!==campaignId||p.farm_id!==farmId)continue
     const relevant=rpc==='irrigation_workspace'?list(p.greenhouse_ids).includes(greenhouseId):list(p.targets).some(t=>t.greenhouse_id===greenhouseId&&ids.includes(t.planting_id))
     if(!relevant)continue
     const family=list(r.data?.families).find(f=>f.code===p.family)?.name||kind
     for(const o of p.occurrences||[]){const done=!!o.confirmed_at
      result.push({id:o.id,kind:family,title:p.title,planned:o.planned_at,actual:o.performed_at,status:done?'realisee':o.cancelled_at?'non_realisee':p.status,done,closed:done||!!o.cancelled_at||['cancelled','annulee','rejected','rejetee'].includes(p.status),products:list(p.products).map(x=>x.name||x.product_name||list(r.data?.items).find(i=>i.id===x.stock_item_id)?.name||'Article').join(', ')})
     }
    }
   }catch{issues.push(`${kind} indisponible : module non installé ou accès non autorisé.`)}
  }
  void Promise.all([phyto(),workspace('cultural_workspace','Interventions culturales'),workspace('irrigation_workspace','Irrigation')]).then(()=>{
   if(!stop){setRows(result.sort((a,b)=>(b.actual||b.planned||'').localeCompare(a.actual||a.planned||'')));setErrors(issues);setBusy(false)}
  }).finally(()=>clearTimeout(timer))
  return()=>{stop=true;controller.abort();clearTimeout(timer)}
 },[domainId,farmId,campaignId,greenhouseId,idsKey,allowed])
 const now=Date.now(),late=(r:Intervention)=>!r.closed&&['approved','approuvee','a_confirmer'].includes(r.status)&&!!r.planned&&new Date(r.planned).getTime()<now
 const filtered=rows.filter(r=>filter==='all'||filter==='done'&&r.done||filter==='late'&&late(r)||filter==='open'&&!r.closed)
 return <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Interventions de la serre · campagne sélectionnée</h3>
  {!allowed?<p className="text-sm text-fg-secondary">Droit de consultation agronomie requis.</p>:busy?<p role="status">Chargement des interventions…</p>:<>
   {errors.map(e=><p key={e} role="alert" className="rounded-lg bg-warning/10 p-3 text-sm">{e} Les compteurs ci-dessous ne couvrent que les données chargées.</p>)}
   <div className="grid grid-cols-3 gap-2">{[['Réalisées / partielles',rows.filter(r=>r.done).length],['À réaliser / à valider',rows.filter(r=>!r.closed).length],['Validées en retard',rows.filter(late).length]].map(([label,n])=><div key={label} className="rounded-lg bg-surface-input p-3"><p className="text-xs text-fg-secondary">{label}</p><strong className="text-xl">{n}</strong></div>)}</div>
   <label className="block text-sm">Afficher <select aria-label="Filtrer les interventions de la serre" className="ml-2 rounded border border-border bg-surface-input p-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Toutes</option><option value="done">Réalisées / partielles</option><option value="open">En attente</option><option value="late">En retard</option></select></label>
   <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Intervention','Prévu','Réalisé','Statut','Produits du programme'].map(l=><th key={l} className="p-2">{l}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={`${r.kind}:${r.id}`} className="border-t border-border"><td className="p-2"><strong>{r.kind}</strong><p>{r.title}</p></td><td className="p-2">{date(r.planned)}</td><td className="p-2">{date(r.actual)}</td><td className="p-2">{labels[r.status]||r.status}{late(r)&&<span className="block text-warning">En retard</span>}</td><td className="p-2">{r.products||'Sans produit renseigné'}</td></tr>)}</tbody></table></div>
   {!filtered.length&&<p className="text-sm text-fg-secondary">Aucune intervention chargée pour ce filtre.</p>}
   <p className="text-xs text-fg-tertiary">Une intervention peut concerner plusieurs serres. La liste des produits est celle du programme, pas une quantité consommée imputable à cette seule serre. Les applications partielles sont signalées séparément dans leur statut.</p>
  </>}
 </section>
}
