'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {toast} from 'sonner'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {Field,Input,Select} from '@/components/ui/Input'

type Row={product_id:string;name:string;selected:boolean;supplier_id:string;unit:string;packaging:string;unit_cost:string;supplier_reference:string;existing:boolean}
export default function Preparation(){
 const {activeDomain}=useAuth()
 const [lists,setLists]=useState<any[]>([]),[listId,setListId]=useState(''),[rows,setRows]=useState<Row[]>([])
 const [suppliers,setSuppliers]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [showExisting,setShowExisting]=useState(false)
 useEffect(()=>{let cancelled=false;setRows([]);setListId('');setLists([]);setSuppliers([]);if(!activeDomain)return;const d=activeDomain.domain_id
 Promise.all([
 supabase.from('phyto_positive_lists').select('id,version,status').eq('domain_id',d).order('imported_at',{ascending:false}),
 supabase.from('suppliers').select('id,name').eq('domain_id',d).eq('is_active',true).order('name')
 ]).then(([l,s])=>{if(cancelled)return;setError(l.error?.message||'');setLists(l.data||[]);setSuppliers(s.data||[]);const requested=new URLSearchParams(window.location.search).get('list');setListId((l.data||[]).some(x=>x.id===requested)?requested!:l.data?.[0]?.id||'')})
 return()=>{cancelled=true}},[activeDomain?.domain_id])
 useEffect(()=>{let cancelled=false;setRows([]);if(!listId||!activeDomain)return;const d=activeDomain.domain_id
 Promise.all([
 supabase.from('phyto_positive_list_entries').select('product_id,commercial_name,supplier_name').eq('domain_id',d).eq('list_id',listId).eq('review_status','valide').eq('station_approved',true),
 supabase.from('stock_items').select('plant_protection_product_id,unit,supplier_id,packaging,unit_cost,supplier_reference').eq('domain_id',d).eq('is_active',true),
 supabase.rpc('get_positive_list_stock_units',{p_list:listId})
 ]).then(([entries,items,uses])=>{if(cancelled)return;const e=entries.error||items.error||uses.error;if(e){setError(e.message);return}setError('');const unique=[...new Map((entries.data||[]).filter(e=>e.product_id).map(e=>[e.product_id,e])).values()]
setRows(unique.map(e=>{const existing=items.data?.find(i=>i.plant_protection_product_id===e.product_id);const inferred=(uses.data||[]).find((u:any)=>u.product_id===e.product_id)?.unit;return {product_id:e.product_id,name:e.commercial_name,selected:false,supplier_id:existing?.supplier_id||'',unit:existing?.unit||inferred||'',packaging:existing?.packaging||'',unit_cost:existing?.unit_cost==null?'':String(existing.unit_cost),supplier_reference:existing?.supplier_reference||'',existing:!!existing}}))})
 return()=>{cancelled=true}},[listId,activeDomain?.domain_id])
 const update=(id:string,key:keyof Row,value:any)=>setRows(old=>old.map(r=>r.product_id===id?{...r,[key]:value}:r))
 const pending=rows.filter(r=>!r.existing)
 const visibleRows=showExisting?rows:pending
 const selected=pending.filter(r=>r.selected)
 const ready=selected.length>0&&selected.every(r=>r.unit.trim()&&Number.isFinite(Number(r.unit_cost))&&Number(r.unit_cost)>=0)
 const save=async()=>{if(!ready||busy)return;setBusy(true);try{const {data,error}=await supabase.rpc('prepare_positive_list_stock',{p_list:listId,p_rows:selected.map(({name,selected,existing,...r})=>({...r,unit_cost:r.unit_cost===''?null:Number(r.unit_cost)}))});if(error)throw error;toast.success(data.created+' article(s) créé(s), '+data.existing+' article(s) existant(s) réutilisé(s).');setRows(old=>old.map(r=>r.selected?{...r,selected:false,existing:true}:r))}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 return <div className="space-y-md">
 <Link href="/agronomie/produits/listes">← Listes positives</Link>
 <h1 className="text-heading font-bold">Préparer les articles de stock</h1>
 <p>L’unité de stock est déduite automatiquement des doses de la liste positive et des usages enregistrés. Si elle est absente ou contradictoire, complétez la source avant préparation. Le fournisseur sera choisi à l’achat et l’entrepôt à la réception. Aucun stock physique n’est créé ici.</p>
 {error&&<Card><p className="text-danger">{error}</p></Card>}
 <Field label="Liste positive"><Select disabled={busy} value={listId} onChange={e=>setListId(e.target.value)}><option value="">Sélectionner</option>{lists.map(l=><option key={l.id} value={l.id}>Version {l.version} — {l.status}</option>)}</Select></Field>
 <p>{pending.length} article(s) à préparer · {rows.length-pending.length} déjà lié(s).</p>
 <label className="flex gap-sm"><input type="checkbox" checked={showExisting} onChange={e=>setShowExisting(e.target.checked)}/> Afficher aussi les articles déjà liés</label>
 <label className="flex gap-sm"><input type="checkbox" disabled={busy||!pending.length} checked={pending.length>0&&selected.length===pending.length} onChange={e=>setRows(old=>old.map(r=>({...r,selected:!r.existing&&e.target.checked})))}/> Sélectionner tous les produits restant à préparer</label>
 <fieldset disabled={busy} className="space-y-md">{visibleRows.map(r=><Card key={r.product_id}>
 <label className="flex gap-sm font-semibold"><input type="checkbox" disabled={r.existing} checked={r.selected} onChange={e=>update(r.product_id,'selected',e.target.checked)}/>{r.name} {r.existing?'— article déjà lié':''}</label>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-md mt-md">
 <Field label="Fournisseur préféré (facultatif)"><Select disabled={r.existing} value={r.supplier_id} onChange={e=>update(r.product_id,'supplier_id',e.target.value)}><option value="">À choisir lors de l’achat</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
 <Field label="Unité de stock automatique" required><Input disabled value={r.unit||'À déterminer : compléter la dose source'}/></Field>
 <Field label="Conditionnement (facultatif)"><Input disabled={r.existing} value={r.packaging} onChange={e=>update(r.product_id,'packaging',e.target.value)} placeholder="Bidon de 1 L"/></Field>
 <Field label="Prix indicatif / unité de stock (MAD)"><Input type="number" min="0" step="any" value={r.unit_cost} onChange={e=>update(r.product_id,'unit_cost',e.target.value)}/></Field>
 <Field label="Référence fournisseur"><Input value={r.supplier_reference} onChange={e=>update(r.product_id,'supplier_reference',e.target.value)}/></Field>
 </div>{r.existing&&<p className="text-caption mt-md">L’article existant est réutilisé : ses informations, quantités et seuils déjà enregistrés sont conservés.</p>}
 </Card>)}</fieldset>
 {!rows.length&&!error&&<p>Aucun produit validé à préparer dans cette liste.</p>}
 {!!rows.length&&!pending.length&&!error&&<p>Tous les produits de cette liste sont déjà liés à un article de stock.</p>}
 <Button disabled={!ready||busy} loading={busy} onClick={save}>Créer les {selected.length} articles sélectionnés au catalogue</Button>
 </div>
}
