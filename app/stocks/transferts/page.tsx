'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {toast} from 'sonner'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {Field,Input,Select,Textarea} from '@/components/ui/Input'
import {Modal,ModalFooter} from '@/components/ui/Modal'
const blank=()=>({source:'',destination:'',item:'',quantity:'',date:new Date().toISOString().slice(0,10),reason:''})
export default function Transfers(){
 const {activeDomain,user,hasPermission,isAdmin,isPlatformAdmin}=useAuth()
 const [warehouses,setWarehouses]=useState<any[]>([]),[items,setItems]=useState<any[]>([]),[balances,setBalances]=useState<any[]>([]),[rows,setRows]=useState<any[]>([])
 const [form,setForm]=useState<ReturnType<typeof blank>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const version=useRef(0)
 const load=async()=>{const seq=++version.current;if(!activeDomain)return;setLoading(true);try{
 const d=activeDomain.domain_id
 const results=await Promise.all([
 supabase.from('warehouses').select('id,name,is_active').eq('domain_id',d).order('name'),
 supabase.from('stock_items').select('id,name,unit,is_active').eq('domain_id',d).order('name'),
 supabase.from('warehouse_stocks').select('*').eq('domain_id',d),
 supabase.from('stock_transfers').select('*').eq('domain_id',d).order('created_at',{ascending:false}),
 supabase.from('approval_requests').select('*,approval_decisions(level_number,decision,decided_by,decided_at,comment)').eq('domain_id',d).eq('process_code','stock_transfer')
 ])
 const failure=results.find(r=>r.error)?.error;if(failure)throw failure
 const [w,i,b,t,a]=results
 const enriched=await Promise.all((t.data||[]).map(async t=>{const approval=a.data?.find(a=>a.entity_id===t.id);let canReview=false
 if(approval?.status==='soumise'&&t.status==='soumise'&&approval.requested_by!==user?.id&&!approval.approval_decisions?.some((x:any)=>x.decided_by===user?.id)){
 const check=await supabase.rpc('can_validate_approval_level',{p_policy:approval.policy_id,p_level:approval.current_level,p_user:user?.id});canReview=check.data===true}
 return {...t,approval,canReview}}))
 if(seq!==version.current)return
 setWarehouses(w.data||[]);setItems(i.data||[]);setBalances(b.data||[]);setRows(enriched);setError('')
 }catch(e:any){if(seq===version.current)setError(e.message)}finally{if(seq===version.current)setLoading(false)}}
 useEffect(()=>{setRows([]);setWarehouses([]);setItems([]);setBalances([]);setForm(null);load();return()=>{version.current++}},[activeDomain?.domain_id,user?.id])
 const submit=async()=>{if(!form||busy)return;setBusy(true);try{const {error}=await supabase.rpc('submit_stock_transfer',{p_source:form.source,p_destination:form.destination,p_item:form.item,p_quantity:Number(form.quantity),p_date:form.date,p_reason:form.reason});if(error)throw error;toast.success('Transfert enregistré');setForm(null);await load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const action=async(row:any,act:string)=>{if(busy)return;let comment:null|string=null
 if(act==='rejeter'){comment=prompt('Motif de rejet obligatoire');if(!comment?.trim())return}
 else if(!confirm(act==='expedier'?'Confirmer la sortie du stock source ?':act==='recevoir'?'Confirmer la réception intégrale dans l’entrepôt destination ?':act==='annuler'?'Annuler ce transfert ?':'Valider ce niveau du transfert ?'))return
 setBusy(true);try{const result=['valider','rejeter'].includes(act)?await supabase.rpc('review_approval_request',{p_request:row.approval.id,p_approve:act==='valider',p_comment:comment}):await supabase.rpc('act_stock_transfer',{p_id:row.id,p_action:act});if(result.error)throw result.error;toast.success('Transfert mis à jour');await load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const label=(id:string)=>warehouses.find(w=>w.id===id)?.name||id
 const canEdit=hasPermission('stocks','edit')||isAdmin||isPlatformAdmin
 const available=form?Number(balances.find(b=>b.warehouse_id===form.source&&b.stock_item_id===form.item)?.current_qty||0):0
 const valid=!!form&&form.source!==form.destination&&!!form.source&&!!form.destination&&!!form.item&&Number(form.quantity)>0&&Number(form.quantity)<=available&&!!form.date&&!!form.reason.trim()
 return <div className="space-y-md">
 <Link href="/entrepots">← Entrepôts</Link>
 <div className="flex justify-between gap-md"><h1 className="text-heading font-bold">Transferts entre entrepôts</h1>{hasPermission('stocks','create')&&<Button disabled={busy||loading} onClick={()=>setForm(blank())}>Nouveau transfert</Button>}</div>
 <p>Demande → validation → expédition → réception. Les produits en transit ne sont pas disponibles dans l’entrepôt destination.</p>
 <Button variant="ghost" disabled={busy||loading} onClick={load}>Actualiser</Button>
 {error&&<Card><p className="text-danger">{error}</p></Card>}
 {!loading&&!error&&!rows.length&&<Card>Aucun transfert pour ce client.</Card>}
 {rows.map(r=>{const item=items.find(i=>i.id===r.stock_item_id);const state=r.status==='soumise'?(r.approval?.status||'soumise'):r.status;return <Card key={r.id}>
 <div className="flex justify-between gap-md"><strong>{item?.name} — {r.quantity} {item?.unit}</strong><span>{state.replace('_',' ')}</span></div>
 <p>{label(r.source_id)} → {label(r.destination_id)} · Prévu le {r.planned_date}</p>
 <p className="text-caption">Référence TRF-{r.id}</p><p>{r.reason}</p>
 <details className="text-caption my-2"><summary>Historique</summary>
 <p>Demandé le {new Date(r.created_at).toLocaleString('fr-FR')} · {r.requested_by}</p>
 {(r.approval?.approval_decisions||[]).map((d:any)=><p key={d.level_number}>Niveau {d.level_number} : {d.decision} · {new Date(d.decided_at).toLocaleString('fr-FR')} · {d.decided_by||'Automatique'} {d.comment}</p>)}
 {r.dispatched_at&&<p>Expédié le {new Date(r.dispatched_at).toLocaleString('fr-FR')} · {r.dispatched_by}</p>}
 {r.received_at&&<p>Réceptionné le {new Date(r.received_at).toLocaleString('fr-FR')} · {r.received_by}</p>}
 {r.cancelled_at&&<p>Annulé le {new Date(r.cancelled_at).toLocaleString('fr-FR')} · {r.cancelled_by}</p>}
 </details>
 <div className="flex gap-sm">{r.canReview&&<><Button disabled={busy} onClick={()=>action(r,'valider')}>Valider N{r.approval.current_level}/{r.approval.required_levels}</Button><Button disabled={busy} variant="ghost" onClick={()=>action(r,'rejeter')}>Rejeter</Button></>}
 {state==='approuvee'&&canEdit&&<Button disabled={busy} onClick={()=>action(r,'expedier')}>Expédier</Button>}
 {state==='en_transit'&&canEdit&&<Button disabled={busy} onClick={()=>action(r,'recevoir')}>Réceptionner</Button>}
 {r.status==='soumise'&&canEdit&&(r.requested_by===user?.id||isAdmin||isPlatformAdmin)&&<Button disabled={busy} variant="ghost" onClick={()=>action(r,'annuler')}>Annuler</Button>}</div>
 </Card>})}
 {form&&<Modal title="NOUVEAU TRANSFERT" onClose={()=>!busy&&setForm(null)}><fieldset disabled={busy} className="space-y-md">
 <Field label="Entrepôt source" required><Select value={form.source} onChange={e=>setForm({...form,source:e.target.value,item:'',quantity:'',destination:form.destination===e.target.value?'':form.destination})}><option value="">Sélectionner</option>{warehouses.filter(w=>w.is_active).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
 <Field label="Destination" required><Select value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})}><option value="">Sélectionner</option>{warehouses.filter(w=>w.is_active&&w.id!==form.source).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
 <Field label="Article" required><Select value={form.item} onChange={e=>setForm({...form,item:e.target.value,quantity:''})}><option value="">Sélectionner</option>{items.filter(i=>i.is_active&&balances.some(b=>b.warehouse_id===form.source&&b.stock_item_id===i.id&&Number(b.current_qty)>0)).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</Select></Field>
 <p>Disponible : {available} {items.find(i=>i.id===form.item)?.unit}</p>
 <Field label="Quantité" required><Input type="number" min="0.01" step="0.01" max={available} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></Field>
 <Field label="Date prévue" required><Input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field>
 <Field label="Motif" required><Textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></Field>
 </fieldset><ModalFooter onCancel={()=>!busy&&setForm(null)} onSave={submit} loading={busy} disabled={!valid||busy} saveLabel="SOUMETTRE"/></Modal>}
 </div>
}
