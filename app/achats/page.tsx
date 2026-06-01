'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRealtimeReload } from '@/lib/useRealtimeReload'
import Link from 'next/link'
import { toast } from 'sonner'
import { ShoppingCart, Plus, Zap, Package, History, ArrowRight, AlertCircle, Search, X } from 'lucide-react'
import { motion } from 'framer-motion'

import { supabase } from '@/lib/supabase'
import { getDefaultDefinition, getStates, applyTransition, getEntityHistory, WorkflowState, WorkflowTransition, WorkflowHistoryEntry } from '@/lib/workflow'
import { createDirectPurchase } from '@/lib/purchase'
import { PurchaseLineEditor, PurchaseLineDraft, EMPTY_PURCHASE_LINE, StockItemLite } from '@/components/purchase/PurchaseLineEditor'
import { SupplierInvoiceModal } from '@/components/purchase/SupplierInvoiceModal'
import { SupplierCreateModal } from '@/components/suppliers/SupplierCreateModal'

import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, DateDisplay } from '@/components/display'

const ENTITY_TYPE = 'purchase_order'
const CATS = ['semences', 'engrais', 'phytosanitaires', 'irrigation', 'emballage', 'transport', 'energie', 'services', 'equipement', 'divers']

export default function AchatsPage() {
  const [items, setItems] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres] = useState<any[]>([])
  const [stockItems, setStockItems] = useState<StockItemLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [modalPO, setModalPO] = useState(false)
  const [savingPO, setSavingPO] = useState(false)
  const [donePO, setDonePO] = useState(false)
  const [form, setForm] = useState({ supplier_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'semences', order_date: '', expected_delivery: '', currency: 'MAD', notes: '' })
  const s = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))
  const [poLines, setPoLines] = useState<PurchaseLineDraft[]>([{ ...EMPTY_PURCHASE_LINE }])

  const [modalDirect, setModalDirect] = useState(false)
  const [savingDirect, setSavingDirect] = useState(false)
  const [doneDirect, setDoneDirect] = useState(false)
  const [direct, setDirect] = useState({ supplier_id: '', order_date: '', cost_category: 'semences', campaign_id: '', greenhouse_id: '', currency: 'MAD', reference: '', notes: '' })
  const d = (k: string) => (e: any) => setDirect(f => ({ ...f, [k]: e.target.value }))
  const [directLines, setDirectLines] = useState<PurchaseLineDraft[]>([{ ...EMPTY_PURCHASE_LINE }])

  const [states, setStates] = useState<WorkflowState[]>([])
  const [allTrans, setAllTrans] = useState<WorkflowTransition[]>([])
  const [transitingId, setTransitingId] = useState<string | null>(null)

  const [histPoId, setHistPoId] = useState<string | null>(null)
  const [histEntries, setHistEntries] = useState<WorkflowHistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const [invoicePo, setInvoicePo] = useState<{ po: any; transition: WorkflowTransition } | null>(null)
  const [supplierModalTarget, setSupplierModalTarget] = useState<null | 'po' | 'direct'>(null)

  const refreshSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id,name,category').eq('is_active', true).order('name')
    setSuppliers(data ?? [])
  }
  const refreshStockItems = async () => {
    const { data } = await supabase.from('stock_items').select('id,code,name,unit').eq('is_active', true).order('name')
    setStockItems((data ?? []) as StockItemLite[])
  }

  const load = useCallback(async () => {
    const [o, sup, c, ser, def] = await Promise.all([
      supabase.from('purchase_orders').select('*, suppliers(name,category), campaigns(name)').order('order_date', { ascending: false }).limit(100),
      supabase.from('suppliers').select('id,name,category').eq('is_active', true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
      supabase.from('greenhouses').select('id,code,name').order('code'),
      getDefaultDefinition(ENTITY_TYPE),
    ])
    setItems(o.data || []); setSuppliers(sup.data || []); setCampagnes(c.data || []); setSerres(ser.data || [])
    await refreshStockItems()
    if (def) {
      const [st, tr] = await Promise.all([
        getStates(def.id),
        supabase.from('workflow_transitions').select('*').eq('definition_id', def.id).eq('is_active', true).order('order_idx'),
      ])
      setStates(st)
      setAllTrans((tr.data ?? []) as WorkflowTransition[])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Realtime : statuts achats + factures fournisseur changent en cascade
  useRealtimeReload(
    ['purchase_orders', 'purchase_order_lines', 'purchase_receipts', 'supplier_invoices'],
    load,
    { channelName: 'achats-page' },
  )

  const filtered = useMemo(() => items.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${o.po_number} ${o.suppliers?.name ?? ''} ${o.cost_category ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [items, search, statusFilter])

  const stats = useMemo(() => {
    const total = items.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    return {
      count: items.length,
      total,
      brouillons: items.filter(o => o.status === 'brouillon').length,
      received: items.filter(o => o.status === 'recu' || o.status === 'cloture' || o.status === 'facture').length,
    }
  }, [items])

  const stateByCode = useMemo(() => Object.fromEntries(states.map(st => [st.code, st])), [states])
  const transitionsFor = (status: string): WorkflowTransition[] => {
    const fromState = states.find(s => s.code === status)
    if (!fromState) return []
    return allTrans.filter(t => t.from_state_id === fromState.id).filter(t => !['partial_receive', 'full_receive', 'complete_receive'].includes(t.code))
  }
  const toStateOf = (t: WorkflowTransition): WorkflowState | undefined => states.find(s => s.id === t.to_state_id)

  const triggerTransition = async (po: any, t: WorkflowTransition) => {
    if (t.code === 'invoice') { setInvoicePo({ po, transition: t }); return }
    const target = toStateOf(t)
    if (!target) return
    setTransitingId(po.id)
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: po.id, transitionId: t.id })
      setItems(prev => prev.map(o => o.id === po.id ? { ...o, status: target.code } : o))
      toast.success(`Statut : ${target.label || target.code}`)
    } catch (e: any) { toast.error('Transition refusée : ' + (e?.message ?? 'erreur')) }
    finally { setTransitingId(null) }
  }

  const onInvoiceCreated = async () => {
    if (!invoicePo) return
    const { po, transition } = invoicePo
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: po.id, transitionId: transition.id })
      const target = toStateOf(transition)
      if (target) setItems(prev => prev.map(o => o.id === po.id ? { ...o, status: target.code } : o))
      toast.success('Facture créée')
    } catch (e: any) { toast.error('Facture créée mais transition refusée : ' + e.message) }
    setInvoicePo(null)
  }

  const openHistory = async (poId: string) => {
    setHistPoId(poId); setHistLoading(true)
    try { setHistEntries(await getEntityHistory(ENTITY_TYPE, poId)) }
    catch (e: any) { toast.error('Erreur : ' + e.message) }
    finally { setHistLoading(false) }
  }

  const savePO = async () => {
    if (!form.supplier_id || !form.order_date) { toast.error('Fournisseur et date requis'); return }
    const validLines = poLines.filter(l => l.stockItemId && Number(l.quantity) > 0)
    if (validLines.length === 0) { toast.error('Au moins une ligne avec article + quantité requise'); return }
    setSavingPO(true)
    try {
      const num = `BC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const subtotal = validLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice || 0), 0)
      const { data: po, error: poe } = await supabase.from('purchase_orders').insert({
        po_number: num, supplier_id: form.supplier_id,
        campaign_id: form.campaign_id || null, greenhouse_id: form.greenhouse_id || null,
        cost_category: form.cost_category, status: 'brouillon',
        order_date: form.order_date, expected_delivery: form.expected_delivery || null,
        currency: form.currency || 'MAD', subtotal, tax_amount: 0, total_amount: subtotal,
        notes: form.notes || null,
      }).select('*, suppliers(name,category), campaigns(name)').single()
      if (poe) throw poe
      const lineInserts = validLines.map(l => ({
        po_id: po.id, stock_item_id: l.stockItemId,
        item_description: l.itemDescription || (stockItems.find(s => s.id === l.stockItemId)?.name ?? ''),
        unit: l.unit || null, quantity: Number(l.quantity), unit_price: Number(l.unitPrice || 0),
        line_total: Number(l.quantity) * Number(l.unitPrice || 0), received_qty: 0,
      }))
      const { error: le } = await supabase.from('purchase_order_lines').insert(lineInserts)
      if (le) throw le
      setItems(p => [po, ...p]); setDonePO(true)
      toast.success(`Bon ${num} créé`)
      setTimeout(() => {
        setModalPO(false); setDonePO(false)
        setForm({ supplier_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'semences', order_date: '', expected_delivery: '', currency: 'MAD', notes: '' })
        setPoLines([{ ...EMPTY_PURCHASE_LINE }])
      }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSavingPO(false)
  }

  const saveDirect = async () => {
    if (!direct.supplier_id || !direct.order_date) { toast.error('Fournisseur et date requis'); return }
    const lines = directLines.filter(l => l.stockItemId && Number(l.quantity) > 0).map(l => ({
      itemDescription: l.itemDescription || (stockItems.find(s => s.id === l.stockItemId)?.name ?? ''),
      unit: l.unit || undefined, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice || 0), stockItemId: l.stockItemId,
    }))
    if (lines.length === 0) { toast.error('Au moins une ligne requise'); return }
    setSavingDirect(true)
    try {
      const res = await createDirectPurchase({
        supplierId: direct.supplier_id, orderDate: direct.order_date, costCategory: direct.cost_category,
        campaignId: direct.campaign_id || undefined, greenhouseId: direct.greenhouse_id || undefined,
        currency: direct.currency, reference: direct.reference || undefined, notes: direct.notes || undefined, lines,
      })
      if (res.warnings?.length) toast.warning(`Achat ${res.po_number} créé — ${res.warnings.join(', ')}`)
      else toast.success(`Achat ${res.po_number} créé · stock mis à jour`)
      setDoneDirect(true)
      setTimeout(async () => {
        setModalDirect(false); setDoneDirect(false)
        setDirect({ supplier_id: '', order_date: '', cost_category: 'semences', campaign_id: '', greenhouse_id: '', currency: 'MAD', reference: '', notes: '' })
        setDirectLines([{ ...EMPTY_PURCHASE_LINE }])
        await load()
      }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSavingDirect(false)
  }

  const poTotal = useMemo(() => poLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0), [poLines])
  const directTotal = useMemo(() => directLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0), [directLines])

  return (
    <div>
      {/* Modal BO formel */}
      {modalPO && (
        <Modal title="NOUVEAU BON D'ACHAT" onClose={() => { setModalPO(false); setDonePO(false) }} size="lg">
          {donePO ? <SuccessMessage message="Bon d'achat créé !" /> : (
            <div className="space-y-md">
              <FormGroup label="Fournisseur *">
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <TSelect value={form.supplier_id} onChange={s('supplier_id')}>
                      <option value="">— Sélectionner —</option>
                      {suppliers.map(f => <option key={f.id} value={f.id}>{f.name} ({f.category})</option>)}
                    </TSelect>
                  </div>
                  <Button onClick={() => setSupplierModalTarget('po')} variant="secondary" size="sm">+ Nouveau</Button>
                </div>
              </FormGroup>
              <FormRow>
                <FormGroup label="Catégorie"><TSelect value={form.cost_category} onChange={s('cost_category')}>{CATS.map(c => <option key={c}>{c}</option>)}</TSelect></FormGroup>
                <FormGroup label="Devise"><TSelect value={form.currency} onChange={s('currency')}>{['MAD', 'EUR', 'USD'].map(c => <option key={c}>{c}</option>)}</TSelect></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Date commande *"><TInput type="date" value={form.order_date} onChange={s('order_date')} /></FormGroup>
                <FormGroup label="Livraison prévue"><TInput type="date" value={form.expected_delivery} onChange={s('expected_delivery')} /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Campagne"><TSelect value={form.campaign_id} onChange={s('campaign_id')}><option value="">— Optionnel —</option>{campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</TSelect></FormGroup>
                <FormGroup label="Serre"><TSelect value={form.greenhouse_id} onChange={s('greenhouse_id')}><option value="">— Optionnel —</option>{serres.map(sr => <option key={sr.id} value={sr.id}>{sr.code} — {sr.name}</option>)}</TSelect></FormGroup>
              </FormRow>
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Lignes du bon</div>
              <PurchaseLineEditor lines={poLines} onChange={setPoLines} stockItems={stockItems} onStockItemsRefresh={refreshStockItems} />
              <div className="rounded-md border border-border bg-surface-sunk p-md flex items-center justify-between">
                <span className="font-mono text-caption text-fg-tertiary">TOTAL PRÉVU</span>
                <span className="font-display text-heading font-bold text-success"><MoneyDisplay value={poTotal} compact="auto" showCurrency={false} /> {form.currency}</span>
              </div>
              <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} /></FormGroup>
              <ModalFooter onCancel={() => setModalPO(false)} onSave={savePO} loading={savingPO} disabled={!form.supplier_id || !form.order_date} saveLabel="CRÉER LE BON" />
            </div>
          )}
        </Modal>
      )}

      {/* Modal achat direct */}
      {modalDirect && (
        <Modal title="ACHAT DIRECT (RÉCEPTION IMMÉDIATE)" onClose={() => { setModalDirect(false); setDoneDirect(false) }} size="lg">
          {doneDirect ? <SuccessMessage message="Achat enregistré et stock mis à jour !" /> : (
            <div className="space-y-md">
              <div className="rounded-md border border-success/30 bg-success/5 p-md text-success text-body-sm flex items-center gap-2">
                <Zap size={14} /> Crée le bon en état <strong>reçu</strong> directement et met à jour le stock.
              </div>
              <FormRow>
                <FormGroup label="Fournisseur *">
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <TSelect value={direct.supplier_id} onChange={d('supplier_id')}>
                        <option value="">— Sélectionner —</option>
                        {suppliers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </TSelect>
                    </div>
                    <Button onClick={() => setSupplierModalTarget('direct')} variant="secondary" size="sm">+</Button>
                  </div>
                </FormGroup>
                <FormGroup label="Date *"><TInput type="date" value={direct.order_date} onChange={d('order_date')} /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Catégorie"><TSelect value={direct.cost_category} onChange={d('cost_category')}>{CATS.map(c => <option key={c}>{c}</option>)}</TSelect></FormGroup>
                <FormGroup label="Devise"><TSelect value={direct.currency} onChange={d('currency')}>{['MAD', 'EUR', 'USD'].map(c => <option key={c}>{c}</option>)}</TSelect></FormGroup>
                <FormGroup label="Référence"><TInput value={direct.reference} onChange={d('reference')} placeholder="Ticket, BL..." /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Campagne"><TSelect value={direct.campaign_id} onChange={d('campaign_id')}><option value="">— Optionnel —</option>{campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</TSelect></FormGroup>
                <FormGroup label="Serre"><TSelect value={direct.greenhouse_id} onChange={d('greenhouse_id')}><option value="">— Optionnel —</option>{serres.map(sr => <option key={sr.id} value={sr.id}>{sr.code} — {sr.name}</option>)}</TSelect></FormGroup>
              </FormRow>
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Lignes</div>
              <PurchaseLineEditor lines={directLines} onChange={setDirectLines} stockItems={stockItems} onStockItemsRefresh={refreshStockItems} />
              <div className="rounded-md border border-border bg-surface-sunk p-md flex items-center justify-between">
                <span className="font-mono text-caption text-fg-tertiary">TOTAL</span>
                <span className="font-display text-heading font-bold text-success"><MoneyDisplay value={directTotal} compact="auto" showCurrency={false} /> {direct.currency}</span>
              </div>
              <FormGroup label="Notes"><Textarea rows={2} value={direct.notes} onChange={d('notes')} /></FormGroup>
              <ModalFooter onCancel={() => setModalDirect(false)} onSave={saveDirect} loading={savingDirect} disabled={!direct.supplier_id || !direct.order_date} saveLabel="ENREGISTRER L'ACHAT" />
            </div>
          )}
        </Modal>
      )}

      <SupplierCreateModal
        open={supplierModalTarget !== null}
        onClose={() => setSupplierModalTarget(null)}
        onCreated={async (sup) => {
          await refreshSuppliers()
          if (supplierModalTarget === 'po') setForm(f => ({ ...f, supplier_id: sup.id }))
          if (supplierModalTarget === 'direct') setDirect(f => ({ ...f, supplier_id: sup.id }))
          setSupplierModalTarget(null)
        }}
      />

      {invoicePo && <SupplierInvoiceModal po={invoicePo.po} onClose={() => setInvoicePo(null)} onCreated={onInvoiceCreated} />}

      {histPoId && (
        <Modal title="HISTORIQUE DES TRANSITIONS" onClose={() => { setHistPoId(null); setHistEntries([]) }} size="md">
          {histLoading ? (
            <div className="space-y-2 p-md">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : histEntries.length === 0 ? (
            <EmptyState icon={History} title="Aucune transition" />
          ) : (
            <div className="space-y-sm">
              {histEntries.map(h => (
                <motion.div key={h.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="rounded-md border border-border bg-surface-sunk p-md">
                  <div className="font-mono text-caption text-fg-tertiary">{new Date(h.created_at).toLocaleString('fr')}</div>
                  <div className="mt-1 flex items-center gap-2 text-body-sm">
                    <Badge variant="default" size="sm">{h.from_state_code ?? '∅'}</Badge>
                    <ArrowRight size={12} className="text-fg-tertiary" />
                    <Badge variant="success" size="sm">{h.to_state_code}</Badge>
                  </div>
                  {h.comment && <div className="mt-2 text-body-sm text-fg-secondary">{h.comment}</div>}
                </motion.div>
              ))}
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Bons d'achat" subtitle="Approvisionnement" icon={ShoppingCart} iconColor="#eab308"
        description={`${items.length} bon${items.length > 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-xs">
            <Button onClick={() => setModalDirect(true)} variant="secondary"><Zap size={14} strokeWidth={2.5} /> Achat direct</Button>
            <Button onClick={() => setModalPO(true)} variant="primary"><Plus size={14} strokeWidth={2.5} /> Bon d'achat</Button>
          </div>
        }
        stats={loading ? [] : [
          { label: 'Total', value: String(stats.count), icon: ShoppingCart, color: '#eab308' },
          { label: 'Brouillons', value: String(stats.brouillons), icon: ShoppingCart, color: '#64748b' },
          { label: 'Reçus', value: String(stats.received), icon: Package, color: '#10b981' },
          { label: 'Montant total', value: <MoneyDisplay value={stats.total} compact="auto" showCurrency={false} className="!text-current" />, icon: Package, color: '#3b82f6' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder="Rechercher numéro, fournisseur, catégorie…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-auto min-w-[150px] text-body-sm">
              <option value="all">Tous statuts</option>
              {states.map(st => <option key={st.code} value={st.code}>{st.label}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart} title="Aucun bon d'achat"
            action={
              <div className="flex gap-xs">
                <Button onClick={() => setModalDirect(true)} variant="secondary"><Zap size={14} /> Achat direct</Button>
                <Button onClick={() => setModalPO(true)}><Plus size={14} /> Bon d'achat</Button>
              </div>
            }
          />
        ) : (
          <DataTable minWidth={1300}>
            <THead>
              <TR><TH>N° BA</TH><TH>Fournisseur</TH><TH>Catégorie</TH><TH>Date</TH><TH>Livraison</TH><TH right>Total</TH><TH>Statut</TH><TH>Actions workflow</TH><TH right>Détails</TH></TR>
            </THead>
            <tbody>
              {filtered.map((o, i) => {
                const st = stateByCode[o.status]
                const color = st?.color ?? '#64748b'
                const label = st?.label ?? o.status
                const available = transitionsFor(o.status)
                const isLoading = transitingId === o.id
                return (
                  <TR key={o.id} animate delay={0.04 + i * 0.02}>
                    <TD><Link href={`/achats/${o.id}`} className="font-mono text-caption font-bold text-brand hover:underline">{o.po_number}</Link></TD>
                    <TD className="font-display font-semibold text-fg-primary">{o.suppliers?.name || '—'}</TD>
                    <TD><Badge variant="warning" size="sm">{o.cost_category || '—'}</Badge></TD>
                    <TD mono className="text-caption"><DateDisplay value={o.order_date} variant="compact" /></TD>
                    <TD mono className="text-caption"><DateDisplay value={o.expected_delivery} variant="compact" /></TD>
                    <TD right mono><MoneyDisplay value={Number(o.total_amount || 0)} compact="auto" showCurrency={false} className="text-warning font-semibold" /> {o.currency}</TD>
                    <TD>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-mono uppercase tracking-wider font-semibold border"
                        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}>
                        {label}
                      </span>
                    </TD>
                    <TD>
                      {available.length === 0 ? <span className="text-caption text-fg-tertiary font-mono">—</span> : (
                        <div className="flex flex-wrap gap-1">
                          {available.map(t => {
                            const tgt = toStateOf(t)
                            const tgtColor = tgt?.color ?? '#64748b'
                            return (
                              <button key={t.id} onClick={() => triggerTransition(o, t)} disabled={isLoading}
                                className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-mono font-semibold border transition-colors', isLoading ? 'opacity-50 cursor-wait' : 'hover:opacity-80')}
                                style={{ background: `color-mix(in srgb, ${tgtColor} 12%, transparent)`, color: tgtColor, borderColor: `color-mix(in srgb, ${tgtColor} 30%, transparent)` }}>
                                {isLoading ? '…' : <>{t.label} <ArrowRight size={9} /></>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/achats/${o.id}`}><Button variant="ghost" size="icon-sm" title="Détail & réception"><Package size={12} strokeWidth={2.2} /></Button></Link>
                        <Button onClick={() => openHistory(o.id)} variant="ghost" size="icon-sm" title="Historique"><History size={12} strokeWidth={2.2} /></Button>
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
