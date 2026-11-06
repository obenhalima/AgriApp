'use client'
import { useLanguage } from "@/lib/i18n"

import '@/components/ui/workspace.css'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Package, Plus, Pencil, ArrowUpCircle, ArrowDownCircle, AlertTriangle, BarChart3, Search, X, Check, ShieldCheck } from 'lucide-react'
import { getStocks, createStockItem, createMouvement, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay } from '@/components/display'
import { useReferenceList } from '@/lib/useReferenceList'
import { useAuth } from '@/lib/auth'
import { StockAllocationSelector } from '@/components/stock/StockAllocationSelector'
import { allocationPreview, stockAllocationRpc, type StockAllocationPlanting } from '@/lib/stockAllocation'

export default function StocksPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

 const {t}=useLanguage()

  const { activeDomain, user, hasPermission, isAdmin, isPlatformAdmin } = useAuth()
  const { values: CATS } = useReferenceList('stock_category')
  const { values: UNITS } = useReferenceList('unit')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalArticle, setModalArticle] = useState(false)
  const [modalEditArt, setModalEditArt] = useState<any>(null)
  const [modalMvt, setModalMvt] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [warehouses,setWarehouses]=useState<any[]>([])
  const [balances,setBalances]=useState<any[]>([])
  const [warehouseId,setWarehouseId]=useState('')
  const [allocationRows,setAllocationRows]=useState<StockAllocationPlanting[]>([])
  const [allocationCampaign,setAllocationCampaign]=useState('')
  const [allocationIds,setAllocationIds]=useState<string[]>([])
  const [allocationError,setAllocationError]=useState('')
  const [allocationLoading,setAllocationLoading]=useState(false)
  const allocationRequest=useRef({key:'',id:''})
  const [cancellingRequest,setCancellingRequest]=useState('')
  const [exitRequests, setExitRequests] = useState<any[]>([])
  const [phytoProducts, setPhytoProducts] = useState<any[]>([])
  const [exitPolicy,setExitPolicy]=useState<any>(null)
  const responsible = isAdmin || isPlatformAdmin || exitPolicy?.responsible_role_id===activeDomain?.role_id

  const blankA = { code: '', name: '', category: 'engrais', unit: 'kg', min_qty: '', unit_cost: '', location: '', plant_protection_product_id: '' }
  const [formA, setFormA] = useState({ ...blankA })
  const [formAE, setFormAE] = useState<Record<string, any>>({})
  const [movementError,setMovementError]=useState('')
  const [formM, setFormM] = useState({ stock_item_id: '', warehouse_id: '', movement_type: 'entree', quantity: '', movement_date: '', reference: '', notes: '' })
  const sa = (k: string) => (e: any) => setFormA(f => ({ ...f, [k]: e.target.value }))
  const sae = (k: string) => (e: any) => setFormAE(f => ({ ...f, [k]: e.target.value }))
  const sm = (k: string) => (e: any) => setFormM(f => ({ ...f, [k]: e.target.value }))

  const load = async () => {
    if (!activeDomain) { setItems([]); setExitRequests([]); setLoading(false); return }
    try {
      const [stocks, requests, phyto, policy, wh, bal] = await Promise.all([
        getStocks(activeDomain.domain_id),
        supabase.from('stock_exit_requests').select('*,stock_items(name,unit)').eq('domain_id', activeDomain.domain_id).order('created_at', { ascending: false }).limit(50),
        supabase.from('plant_protection_products').select('id,commercial_name,authorization_number,product_authorized_uses(dose_unit,is_active)').eq('domain_id',activeDomain.domain_id).eq('is_active',true).eq('authorization_status','autorise').order('commercial_name'),
        supabase.from('approval_policies').select('*').eq('domain_id',activeDomain.domain_id).eq('process_code','stock_exit').eq('is_active',true).maybeSingle(),
        supabase.from('warehouses').select('id,name,is_active,is_default,farm_id').eq('domain_id',activeDomain.domain_id).order('name'),
        supabase.from('warehouse_stocks').select('*').eq('domain_id',activeDomain.domain_id),
      ])
      if(wh.error||bal.error) throw new Error(wh.error?.message||bal.error?.message)
      setWarehouses(wh.data||[]);setBalances(bal.data||[])
      setItems(stocks); setExitRequests((requests.data || []).map(r=>({...r,stock_items:r.stock_items?{...r.stock_items,name:r.stock_items.name+' · '+((wh.data||[]).find(w=>w.id===r.warehouse_id)?.name||'Entrepôt principal')}:r.stock_items}))); setPhytoProducts(phyto.data || []);setExitPolicy(policy.data||null)
    } catch(e:any) { toast.error(_ui(e.message)) } finally { setLoading(false) }
  }
  useEffect(() => { setWarehouseId('');setItems([]);setBalances([]);setWarehouses([]);setModalMvt(null);load() }, [activeDomain?.domain_id])
  useEffect(()=>{
    let cancelled=false
    setAllocationRows([]);setAllocationError('');setAllocationCampaign('');setAllocationIds([])
    if(!activeDomain || !modalMvt || formM.movement_type!=='sortie'){setAllocationLoading(false);return}
    setAllocationLoading(true)
    stockAllocationRpc<StockAllocationPlanting[]>('get_stock_allocation_catalog',{p_domain:activeDomain.domain_id})
      .then(rows=>{if(!cancelled)setAllocationRows(rows||[])})
      .catch(e=>{if(!cancelled)setAllocationError(e.message)})
      .finally(()=>{if(!cancelled)setAllocationLoading(false)})
    return ()=>{cancelled=true}
  },[activeDomain?.domain_id,modalMvt?.id,formM.movement_type])
  const allocationFarm=warehouses.find(w=>w.id===formM.warehouse_id)?.farm_id||''
  const validAllocation=allocationPreview(allocationRows.filter(p=>p.farm_id===allocationFarm&&p.campaign_id===allocationCampaign),allocationIds).length>0

  const scopedItems=useMemo(()=>items.filter(i=>!warehouseId||balances.some(b=>b.stock_item_id===i.id&&b.warehouse_id===warehouseId)).map(i=>{const b=balances.find(b=>b.stock_item_id===i.id&&b.warehouse_id===warehouseId);return warehouseId?{...i,current_qty:Number(b?.current_qty||0),min_qty:Number(b?.min_qty||0)}:i}),[items,balances,warehouseId])
  const filtered = useMemo(() => scopedItems.filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false
    if (search && !`${i.code} ${i.name} ${i.location ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [scopedItems, search, catFilter])

  const stats = useMemo(() => {
    const alerts = scopedItems.filter(i => i.current_qty <= i.min_qty && i.min_qty > 0).length
    const totalValue = scopedItems.reduce((s, i) => s + (i.current_qty || 0) * (i.unit_cost || 0), 0)
    return { count: scopedItems.length, alerts, cats: new Set(scopedItems.map(i => i.category)).size, totalValue }
  }, [items,scopedItems])

  const openNewArt = () => { setFormA({ ...blankA, code: genCode('ST', items.map(i => i.code)) }); setModalArticle(true) }
  const openEditArt = (i: any) => {
    setFormAE({ code: i.code, name: i.name, category: i.category, unit: i.unit, min_qty: String(i.min_qty || 0), unit_cost: String(i.unit_cost || ''), location: i.location || '', plant_protection_product_id: i.plant_protection_product_id || '' })
    setModalEditArt(i)
  }
  const openMvt = (item: any, type = 'entree') => {
    allocationRequest.current={key:'',id:''};setAllocationCampaign('');setAllocationIds([])
    setMovementError('')
    setFormM({ stock_item_id: item.id, warehouse_id: warehouseId||warehouses.find(w=>w.is_default&&w.is_active)?.id||'', movement_type: type, quantity: '', movement_date: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
    setModalMvt(item)
  }

  const saveArticle = async () => {
    if (!formA.name) return
    setSaving(true)
    try {
      if (!activeDomain) throw new Error('Aucun domaine actif')
      const n = await createStockItem({ ...formA, plant_protection_product_id: formA.category==='phytosanitaires'&&formA.plant_protection_product_id?formA.plant_protection_product_id:undefined, domain_id: activeDomain.domain_id, min_qty: Number(formA.min_qty) || 0, unit_cost: formA.unit_cost ? Number(formA.unit_cost) : undefined } as any)
      setItems(p => [n, ...p]); setDone(true)
      toast.success(_ui("Article \"{v0}\" créé",{v0:String(n.name)}))
      setTimeout(() => { setModalArticle(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + _ui(e.message)) }
    setSaving(false)
  }

  const saveEditArt = async () => {
    if (!modalEditArt || !formAE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('stock_items').update({
        code: formAE.code, name: formAE.name, category: formAE.category, unit: formAE.unit,
        min_qty: Number(formAE.min_qty) || 0,
        unit_cost: formAE.unit_cost ? Number(formAE.unit_cost) : null,
        location: formAE.location || null,
        plant_protection_product_id: formAE.category==='phytosanitaires' ? formAE.plant_protection_product_id||null : null,
      }).eq('id', modalEditArt.id)
      if (error) throw error
      setDone(true)
      toast.success(_ui("Article modifié"))
      setTimeout(() => { setModalEditArt(null); setDone(false); load() }, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + _ui(e.message)) }
    setSaving(false)
  }

  const saveMvt = async () => {
    setMovementError('')
    if (!formM.stock_item_id || !formM.warehouse_id || !Number.isFinite(Number(formM.quantity)) || Number(formM.quantity)<=0 || !formM.movement_date) { setMovementError('Choisissez un entrepôt, une date et une quantité strictement positive.'); return }
    setSaving(true)
    try {
      if (formM.movement_type === 'sortie') {
        if(allocationError || allocationLoading || !validAllocation)throw new Error('Choisissez la campagne et au moins une serre de la ferme de l’entrepôt.')
        const payload={
          p_warehouse:formM.warehouse_id,p_item: formM.stock_item_id, p_quantity: Number(formM.quantity),
          p_date: formM.movement_date, p_reason: formM.notes, p_reference: formM.reference || null,
          p_farm:allocationFarm,p_plantings:[...allocationIds].sort(),
        }
        const key=JSON.stringify(payload)
        if(allocationRequest.current.key!==key)allocationRequest.current={key,id:crypto.randomUUID()}
        await stockAllocationRpc('submit_allocated_stock_exit',{...payload,p_request:allocationRequest.current.id})
      } else {
        await createMouvement({ ...formM, quantity: Number(formM.quantity) })
      }
      await load(); setDone(true)
      toast.success(formM.movement_type === 'sortie' ? _ui("Demande de sortie envoyée au responsable") : _ui("Mouvement enregistré"))
      setTimeout(() => { setModalMvt(null); setDone(false) }, 1200)
    } catch (e: any) { setMovementError(e.message); toast.error(_ui("Erreur :") + _ui(e.message)) }
    setSaving(false)
  }

  const changePhytoProduct = (setter: any) => (e: any) => {
    const product = phytoProducts.find(p => p.id === e.target.value)
    const doseUnit = product?.product_authorized_uses?.find((u:any) => u.is_active)?.dose_unit || ''
    const liquid = ['ml_100l','ml_ha','l_ha','l_1000m2'].includes(doseUnit)
    const solid = ['g_100l','g_ha','kg_ha','kg_1000m2'].includes(doseUnit)
    setter((current:any) => ({ ...current, plant_protection_product_id:e.target.value, unit:liquid?'l':solid?'kg':doseUnit==='unite_ha'?'unite':current.unit }))
  }

  const reviewExit = async (id: string, approve: boolean) => {
    const reason = approve ? null : prompt(_ui("Motif obligatoire du rejet :"))
    if (!approve && !reason) return
    const { error } = await supabase.rpc('review_stock_exit_request', { p_request_id: id, p_approve: approve, p_reason: reason })
    if (error) toast.error(_ui(error.message)); else { toast.success(approve ? _ui("Sortie validée et stock déduit") : _ui("Sortie rejetée")); load() }
  }
  const cancelExit = async (id: string) => {
    if (!confirm(_ui("Annuler cette demande de sortie ?"))) return
    setCancellingRequest(id)
    try {
      const {error}=await supabase.rpc('cancel_stock_exit_request',{p_request_id:id})
      if(error) throw error
      toast.success(_ui("Demande de sortie annulée"))
      await load()
    } catch(e:any) { toast.error(_ui(e.message)) }
    finally { setCancellingRequest('') }
  }

  // Render as a helper: a nested component type would remount every input on
  // each keystroke and reapply the Name field's autofocus.
  const renderArticleForm = ({ vals, onChange }: any) => (
    <div className="space-y-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={t("Code")}><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label={t("Nom")} required><TInput value={vals.name} onChange={onChange('name')} placeholder="NPK 20-20-20" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={t("Catégorie")}><TSelect value={vals.category} onChange={onChange('category')}>{CATS.map(c => <option key={c.code} value={c.code}>{_uiNode(c.label)}</option>)}</TSelect></Field>
        <Field label={t("Unité")}><TSelect value={vals.unit} onChange={onChange('unit')}>{UNITS.map(u => <option key={u.code} value={u.code}>{_uiNode(u.label)}</option>)}</TSelect></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={t("Stock min. (alerte)")}><TInput type="number" value={vals.min_qty} onChange={onChange('min_qty')} placeholder="100" /></Field>
        <Field label={t("Coût unitaire (MAD)")}><TInput type="number" value={vals.unit_cost} onChange={onChange('unit_cost')} placeholder="12.50" /></Field>
      </div>
      <Field label={t("Emplacement")}><TInput value={vals.location} onChange={onChange('location')} placeholder={_ui("Entrepôt A / Rayon 3")} /></Field>
      {vals.category === 'phytosanitaires' && <Field label={t("Produit phytosanitaire homologué")} hint={t("L’unité est proposée depuis l’usage autorisé et contrôlée à l’enregistrement.")}><TSelect value={vals.plant_protection_product_id||''} onChange={changePhytoProduct(vals===formA?setFormA:setFormAE)}><option value="">{t("— Non lié —")}</option>{phytoProducts.map(p=><option key={p.id} value={p.id}>{p.commercial_name} {" "}{_ui("· AMM")}{" "}{p.authorization_number}</option>)}</TSelect></Field>}
    </div>
  )

  return (
    <div className="itrix-workspace">
      {modalArticle && (
        <Modal title={t("NOUVEL ARTICLE")} onClose={() => { setModalArticle(false); setDone(false) }}>
          {done ? <SuccessMessage message={_ui("Article créé !")} /> : (<>{renderArticleForm({ vals: formA, onChange: sa })}<ModalFooter onCancel={() => setModalArticle(false)} onSave={saveArticle} loading={saving} disabled={!formA.name} saveLabel={_ui("CRÉER L'ARTICLE")} /></>)}
        </Modal>
      )}
      {modalEditArt && (
        <Modal title={_ui("MODIFIER — {v0}",{v0:String(modalEditArt.name)})} onClose={() => { setModalEditArt(null); setDone(false) }}>
          {done ? <SuccessMessage message={_ui("Article modifié !")} /> : (<>{renderArticleForm({ vals: formAE, onChange: sae })}<ModalFooter onCancel={() => setModalEditArt(null)} onSave={saveEditArt} loading={saving} disabled={!formAE.name} saveLabel={_ui("ENREGISTRER")} /></>)}
        </Modal>
      )}
      {modalMvt && (
        <Modal title={_ui("MOUVEMENT — {v0}",{v0:String(modalMvt.name)})} onClose={() => { setModalMvt(null); setDone(false) }}>
          {done ? <SuccessMessage message={_ui("Mouvement enregistré !")} /> : (
            <div className="space-y-md">
              <div className="rounded-md border border-border bg-surface-sunk p-md text-body-sm">
                {" "}{_ui("Stock de l’entrepôt :")}{" "}<strong className="text-success font-mono">{balances.find(b=>b.warehouse_id===formM.warehouse_id&&b.stock_item_id===modalMvt.id)?.current_qty||0} {modalMvt.unit}</strong>
                <span className="text-fg-tertiary ml-md">{_ui("Min :")}{" "}{modalMvt.min_qty} {modalMvt.unit}</span>
              </div>
              <FormRow>
                <FormGroup label={t("Entrepôt *")}><TSelect value={formM.warehouse_id} onChange={e=>{sm('warehouse_id')(e);setAllocationCampaign('');setAllocationIds([])}}><option value="">{t("Sélectionner")}</option>{warehouses.filter(w=>w.is_active).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</TSelect></FormGroup>
                <FormGroup label={t("Type")}>
                  <TSelect value={formM.movement_type} onChange={sm('movement_type')}>
                    <option value="entree">{t("Entrée (réception)")}</option>
                    <option value="sortie">{t("Sortie (consommation)")}</option>
                  </TSelect>
                </FormGroup>
                <FormGroup label={t("Quantité *")}><TInput type="number" value={formM.quantity} onChange={sm('quantity')} autoFocus /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label={t("Date *")}><TInput type="date" value={formM.movement_date} onChange={sm('movement_date')} /></FormGroup>
                <FormGroup label={t("Référence")}><TInput value={formM.reference} onChange={sm('reference')} placeholder="BL-2026-001" /></FormGroup>
              </FormRow>
              {movementError && <p role="alert" className="text-danger">{movementError}</p>}
              <FormGroup label={t(formM.movement_type==='sortie' ? "Note de sortie (facultatif)" : "Notes")}><Textarea rows={2} value={formM.notes} onChange={sm('notes')} /></FormGroup>
              {formM.movement_type==='sortie' && <>{allocationLoading&&<p role="status">{t('Chargement des serres…')}</p>}{allocationError&&<p role="alert" className="text-danger">{allocationError}</p>}{!allocationFarm&&<p role="alert">{t('Choisissez un entrepôt rattaché à une ferme.')}</p>}<StockAllocationSelector plantings={allocationRows} farm={allocationFarm} campaign={allocationCampaign} selected={allocationIds} onCampaign={id=>{setAllocationCampaign(id);setAllocationIds([])}} onSelected={setAllocationIds} disabled={saving||allocationLoading} quantity={Number(formM.quantity)||undefined}/><p className="text-sm text-fg-secondary">{t('À la validation, le coût CUMP sera réparti sur ces serres. Si le stock n’est pas valorisé, les affectations seront conservées pour Sorties à rapprocher.')}</p></>}
              {formM.movement_type === 'sortie' && <div className="rounded-md border border-warning/30 bg-warning/10 p-sm text-body-sm text-warning">{t("La validation du responsable déduira le stock et générera les coûts si le prix est connu.")}</div>}
              <ModalFooter onCancel={() => setModalMvt(null)} onSave={saveMvt} loading={saving} disabled={!formM.warehouse_id || !Number.isFinite(Number(formM.quantity)) || Number(formM.quantity)<=0 || !formM.movement_date || (formM.movement_type === 'sortie' && (!validAllocation||allocationLoading||!!allocationError))} saveLabel={formM.movement_type === 'sortie' ? _ui("SOUMETTRE LA DEMANDE") : _ui("ENREGISTRER")} />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title={t("Stocks")} subtitle={t("Inventaire")} icon={Package} iconColor="#14b8a6"
        description={_ui("{v0} article{v1} · {v2} alerte{v3}",{v0:String(items.length),v1:String(items.length > 1 ? 's' : ''),v2:String(stats.alerts),v3:String(stats.alerts > 1 ? 's' : '')})}
        actions={
          <div className="itrix-actions">
            <Link href="/stocks/reprise"><Button variant="secondary">{t('Reprise du stock initial / Excel')}</Button></Link>
            <Link href="/stocks/mouvements">
              <Button variant="ghost"><BarChart3 size={14} strokeWidth={2.2} /> {t("Mouvements")}</Button>
            </Link>
            <Link href="/stocks/preparation-phyto"><Button variant="secondary">{t("Préparer les articles phyto")}</Button></Link>
            <Link href="/stocks/transferts"><Button variant="ghost">{t("Transferts")}</Button></Link>
            <Button onClick={openNewArt} variant="primary"><Plus size={14} strokeWidth={2.5} /> {t("Nouvel article")}</Button>
          </div>
        }
        stats={loading ? [] : [
          { label: 'Articles', value: String(stats.count), icon: Package, color: '#14b8a6' },
          { label: 'Alertes', value: String(stats.alerts), icon: AlertTriangle, color: stats.alerts > 0 ? '#f59e0b' : '#10b981' },
          { label: 'Catégories', value: String(stats.cats), icon: BarChart3, color: '#a855f7' },
          { label: 'Valeur totale', value: <MoneyDisplay value={stats.totalValue} compact="auto" showCurrency={false} className="!text-current" />, icon: BarChart3, color: '#3b82f6' },
        ]}
      />

      {/* Bandeau alertes */}
      {!loading && stats.alerts > 0 && (
        <Card variant="ghost" className="mb-md border-warning/30 bg-warning/5">
          <div className="space-y-1.5">
            {scopedItems.filter(i => i.current_qty <= i.min_qty && i.min_qty > 0).slice(0, 3).map(i => (
              <div key={i.id} className="flex items-center gap-sm text-body-sm">
                <AlertTriangle size={14} className="text-warning flex-shrink-0" />
                <strong className="text-fg-primary">{i.name}</strong>
                <span className="text-fg-tertiary">{_ui("— Stock :")}{" "}<span className="text-warning font-mono">{i.current_qty} {i.unit}</span> {" "}{_ui("· Seuil :")}{" "}{i.min_qty} {i.unit}</span>
              </div>
            ))}
            {stats.alerts > 3 && <div className="text-caption text-fg-tertiary">+{stats.alerts - 3} {" "}{_ui("autre")}{stats.alerts - 3 > 1 ? 's' : ''} {" "}{_ui("alerte")}{stats.alerts - 3 > 1 ? 's' : ''}</div>}
          </div>
        </Card>
      )}

      {!loading && exitRequests.length > 0 && (
        <Card className="mb-md" padding="none">
          <div className="p-md border-b border-border flex items-center gap-sm"><ShieldCheck size={15} className="text-warning"/><strong>{t("Demandes de sortie")}</strong></div>
          <DataTable minWidth={850}><THead><TR><TH>{t("Article")}</TH><TH right>{t("Quantité")}</TH><TH>{t("Motif")}</TH><TH>{t("Statut")}</TH><TH>{t("Demandeur")}</TH><TH right>{t("Actions")}</TH></TR></THead>
            <tbody>{exitRequests.map(r => <TR key={r.id}><TD>{r.stock_items?.name}</TD><TD right mono>{r.quantity} {r.stock_items?.unit}</TD><TD>{r.reason}</TD><TD><Badge variant={r.status==='soumise'?'warning':r.status==='approuvee'?'success':r.status==='executee'?'info':'danger'}>{r.status==='annulee'?t('Annulée'):r.stock_movement_id?t('Validée et comptabilisée'):r.status==='approuvee'?t('Ancienne demande approuvée — mouvement à vérifier'):r.status}</Badge></TD><TD mono className="text-caption">{r.requested_by===user?.id?_ui("Moi"):r.requested_by.slice(0,8)}</TD><TD right><div className="flex justify-end gap-xs">{r.status==='soumise'&&!r.stock_movement_id&&responsible&&r.requested_by!==user?.id&&<><Button size="xs" variant="secondary" onClick={()=>reviewExit(r.id,true)}><Check size={12}/> {t("Valider")}</Button><Button size="xs" variant="ghost" onClick={()=>reviewExit(r.id,false)}><X size={12}/> {t("Rejeter")}</Button></>}{r.status==='soumise'&&!r.stock_movement_id&&r.requested_by===user?.id&&<Button size="xs" variant="ghost" disabled={!!cancellingRequest} onClick={()=>cancelExit(r.id)}><X size={12}/> {t("Annuler ma demande")}</Button>}</div></TD></TR>)}</tbody>
          </DataTable>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder={t("Rechercher code, nom, emplacement…")} value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">{t("Toutes catégories")}</option>
              {CATS.map(c => <option key={c.code} value={c.code}>{_uiNode(c.label)}</option>)}
            </TSelect>
            <TSelect value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} className="w-auto"><option value="">{t("Tous les entrepôts — total client")}</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}{w.is_active?'':_ui("(inactif)")}</option>)}</TSelect>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="itrix-table">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title={t("Stock vide")} description={t("Crée un article pour commencer.")} action={<Button onClick={openNewArt}><Plus size={14} /> {t("Article")}</Button>} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>{t("Code")}</TH><TH>{t("Article")}</TH><TH>{t("Catégorie")}</TH><TH right>{t("Stock")}</TH><TH right>{t("Seuil")}</TH><TH right>{t("Coût unit.")}</TH><TH right>{t("Valeur")}</TH><TH>{t("Alerte")}</TH><TH right>{t("Actions")}</TH></TR>
            </THead>
            <tbody>
              {filtered.map((i, idx) => {
                const alerte = i.current_qty <= i.min_qty && i.min_qty > 0
                return (
                  <TR key={i.id} animate delay={0.04 + idx * 0.02}>
                    <TD mono className="text-caption text-fg-tertiary">{i.code}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{i.name}</TD>
                    <TD><Badge variant="info" size="sm">{i.category}</Badge></TD>
                    <TD right mono className={alerte ? 'text-danger font-bold' : 'text-success font-bold'}>{i.current_qty} {i.unit}</TD>
                    <TD right mono className="text-caption text-fg-tertiary">{i.min_qty} {i.unit}{warehouseId&&hasPermission('stocks','edit')&&<Button size="xs" variant="ghost" onClick={async()=>{const value=prompt(_ui("Seuil d’alerte pour cet entrepôt"),String(i.min_qty));if(value===null)return;const n=Number(value.replace(',','.'));if(!Number.isFinite(n)||n<0){toast.error(_ui("Seuil invalide"));return}const {error}=await supabase.rpc('set_warehouse_stock_threshold',{p_warehouse:warehouseId,p_item:i.id,p_min:n});if(error)toast.error(_ui(error.message));else{toast.success(_ui("Seuil enregistré"));load()}}}>{t("Modifier")}</Button>}</TD>
                    <TD right mono className="text-caption">{i.unit_cost ? _ui("{v0} MAD",{v0:String(i.unit_cost.toFixed(2))}) : '—'}</TD>
                    <TD right mono className="font-semibold"><MoneyDisplay value={(i.current_qty || 0) * (i.unit_cost || 0)} compact="auto" showCurrency={false} /></TD>
                    <TD>{alerte ? <Badge variant="danger" size="sm">{t("⚠ Alerte")}</Badge> : <Badge variant="success" size="sm" dot>OK</Badge>}</TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1">
                        <Button onClick={() => openMvt(i, 'entree')} variant="secondary" size="xs" title={t("Entrée")}><ArrowUpCircle size={12} /></Button>
                        <Button onClick={() => openMvt(i, 'sortie')} variant="ghost" size="xs" title={t("Sortie")}><ArrowDownCircle size={12} /></Button>
                        <Button onClick={() => openEditArt(i)} variant="ghost" size="icon-sm"><Pencil size={12} strokeWidth={2.2} /></Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
