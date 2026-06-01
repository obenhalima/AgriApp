'use client'
/**
 * /factures — Refonte avec design system.
 * Conserve toute la logique (calendrier, échéances, paiements) — refait l'UI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRealtimeReload } from '@/lib/useRealtimeReload'
import { useRefreshOnEvent } from '@/lib/useAuthGuard'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Receipt, Plus, AlertCircle, Search, X, Calendar, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  Banknote, FileBarChart, BadgeDollarSign, Truck,
} from 'lucide-react'

import { BordereauxSection } from './BordereauxSection'

import {
  createFacture, createFactureFournisseur, getCampagnes, getClients, getFactures,
  getFacturesFournisseurs, getFournisseurs, getSerres, payerFacture, payerFactureFournisseur,
  supabase,
} from '@/lib/supabase'
import { cn } from '@/lib/cn'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { KPICard } from '@/components/ui/KPICard'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, DateDisplay } from '@/components/display'
import { Tooltip } from '@/components/ui/Tooltip'

type InvoiceTab = 'clients' | 'fournisseurs' | 'bordereaux'
type ModalType = 'facture_client' | 'paiement_client' | 'facture_fournisseur' | 'paiement_fournisseur' | null

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toIsoDate(value?: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}
function getEffectiveStatus(item: any) {
  const total = Number(item.total_amount || 0)
  const paid = Number(item.paid_amount || 0)
  const balance = total - paid
  const today = new Date().toISOString().slice(0, 10)
  const dueDate = toIsoDate(item.due_date)
  if (balance <= 0) return 'paye'
  if (dueDate && dueDate < today) return 'en_retard'
  if (paid > 0) return 'partiellement_paye'
  return 'en_attente'
}
function diffDays(fromIso: string, toIso: string) {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / 86400000)
}
function addDays(base: Date, days: number) {
  const d = new Date(base); d.setDate(d.getDate() + days); return d
}
function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

const STATUS_CONFIG: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }> = {
  en_attente:         { variant: 'warning', label: 'En attente' },
  partiellement_paye: { variant: 'info',    label: 'Partiel' },
  paye:               { variant: 'success', label: 'Payée' },
  en_retard:          { variant: 'danger',  label: 'En retard' },
}

// ════════════════════════════════════════════════════════════════════════════
export default function FacturesPage() {
  const [tab, setTab] = useState<InvoiceTab>('clients')
  const [modal, setModal] = useState<ModalType>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const [clientInvoices, setClientInvoices] = useState<any[]>([])
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres] = useState<any[]>([])

  const [selectedClientInvoice, setSelectedClientInvoice] = useState<any>(null)
  const [selectedSupplierInvoice, setSelectedSupplierInvoice] = useState<any>(null)

  const [clientForm, setClientForm] = useState({ client_id: '', invoice_date: '', due_date: '', subtotal: '', notes: '' })
  const [clientPaymentForm, setClientPaymentForm] = useState({ amount: '', payment_method: 'virement', reference: '' })
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: '', po_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'services',
    invoice_date: '', due_date: '', subtotal: '', notes: '',
  })
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({ amount: '', payment_method: 'virement', reference: '' })

  const [clientFilter, setClientFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)

  const searchParams = useSearchParams()

  const load = useCallback(() =>
    Promise.all([
      getFactures(), getFacturesFournisseurs(), getClients(), getFournisseurs(), getCampagnes(), getSerres(),
      // Charge les POs réceptionnés (entièrement ou partiellement) qui n'ont pas encore de facture
      supabase.from('purchase_orders')
        .select('id, code, supplier_id, total_amount, currency, status, order_date, campaign_id, greenhouse_id, suppliers(name)')
        .in('status', ['recu', 'partiellement_recu', 'envoye'])
        .order('order_date', { ascending: false })
        .limit(100),
      // Charge tous les clients (y compris inactifs) pour le mapping de fallback
      // sur les jointures qui retourneraient null (ex: client Station désactivé)
      supabase.from('clients').select('id, name, is_active').order('name'),
    ])
      .then(([fc, ff, cd, sd, cad, srd, pos, allCl]) => {
        // Enrichit chaque facture : si la jointure clients(name) retourne null,
        // on retombe sur le map allClients pour avoir le nom quand même
        const clientNameById = new Map<string, string>()
        for (const c of (allCl.data ?? []) as any[]) {
          clientNameById.set(c.id, c.name)
        }
        const enriched = fc.map((inv: any) => ({
          ...inv,
          clients: inv.clients ?? (inv.client_id && clientNameById.has(inv.client_id)
            ? { name: clientNameById.get(inv.client_id) }
            : { name: '(client inconnu)' }),
        }))
        setClientInvoices(enriched)
        setSupplierInvoices(ff); setClients(cd); setSuppliers(sd); setCampagnes(cad); setSerres(srd)
        setPurchaseOrders((pos.data ?? []) as any[])
        // Diagnostic console : aide à identifier si des factures sont chargées
        // mais cachees par un filtre. Visible en dev.
        if (typeof console !== 'undefined') {
          console.log(`[factures] loaded ${enriched.length} client invoices (${enriched.filter((i: any) => i.invoice_number?.startsWith('FB-')).length} bordereau)`)
        }
        setLoading(false)
      })
      .catch((e) => {
        console.error('[factures] load error:', e)
        setLoading(false)
      })
  , [])
  useEffect(() => { load() }, [load])

  // Realtime : synchro auto factures + paiements + bordereaux + achats
  useRealtimeReload(
    ['invoices', 'supplier_invoices', 'payments_received', 'payments_made',
     'station_settlements', 'station_settlement_lines', 'purchase_orders'],
    load,
    { channelName: 'factures-page' },
  )

  // Bouton refresh Topbar OU action explicite (ex: génération facture bordereau)
  useRefreshOnEvent(load)

  // Highlight de la facture ciblée par ?invoice=ID (après generation depuis bordereau)
  const focusInvoiceId = searchParams?.get('invoice') ?? null
  useEffect(() => {
    if (!focusInvoiceId) return
    // Scroll vers la ligne après que la table soit rendue
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-invoice-id="${focusInvoiceId}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 600)
    return () => clearTimeout(t)
  }, [focusInvoiceId, clientInvoices.length])

  // Fallback : si on cherche une facture spécifique mais elle n'est pas dans la liste,
  // on la fetch directement et on l'injecte (cas RLS ou limit(100) qui l'exclurait)
  useEffect(() => {
    if (!focusInvoiceId || loading) return
    const exists = clientInvoices.some((i) => i.id === focusInvoiceId)
    if (exists) return
    console.warn(`[factures] facture ${focusInvoiceId} demandee mais absente de la liste, fetch direct…`)
    supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('id', focusInvoiceId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[factures] fetch direct error:', error); return }
        if (!data) { console.warn(`[factures] facture ${focusInvoiceId} introuvable en DB`); return }
        // Resoudre le client name si null
        const enriched: any = { ...data }
        if (!enriched.clients?.name && enriched.client_id) {
          const local = clients.find((c) => c.id === enriched.client_id)
          enriched.clients = { name: local?.name ?? '(client inconnu)' }
        }
        toast.info(`Facture ${enriched.invoice_number} chargée (n'apparaissait pas via la requête principale)`)
        setClientInvoices((prev) => [enriched, ...prev])
      })
  }, [focusInvoiceId, clientInvoices, loading, clients])

  // ─── Onglet actif depuis ?tab=bordereaux|clients|fournisseurs ─────────
  useEffect(() => {
    const tabParam = searchParams?.get('tab')
    if (tabParam === 'bordereaux' || tabParam === 'clients' || tabParam === 'fournisseurs') {
      setTab(tabParam)
    }
  }, [searchParams])

  // ─── Pré-remplir depuis ?po=<id> (lien depuis page achat) ──────────────
  useEffect(() => {
    const poId = searchParams?.get('po')
    if (!poId || purchaseOrders.length === 0) return
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) return
    // Pré-remplit le formulaire et ouvre la modale
    const today = new Date().toISOString().slice(0, 10)
    const due = new Date(); due.setDate(due.getDate() + 30)
    setSupplierForm({
      supplier_id: po.supplier_id ?? '',
      po_id: po.id,
      campaign_id: po.campaign_id ?? '',
      greenhouse_id: po.greenhouse_id ?? '',
      cost_category: 'services',
      invoice_date: today,
      due_date: due.toISOString().slice(0, 10),
      subtotal: String(po.total_amount ?? ''),
      notes: `Facture liée au bon d'achat ${po.code}`,
    })
    setTab('fournisseurs')
    setModal('facture_fournisseur')
  }, [searchParams, purchaseOrders])

  // ─── Dérivations ─────────────────────────────────────────────────────────
  const effClient = useMemo(() => clientInvoices.map(i => ({ ...i, effectiveStatus: getEffectiveStatus(i) })), [clientInvoices])
  const effSupplier = useMemo(() => supplierInvoices.map(i => ({ ...i, effectiveStatus: getEffectiveStatus(i) })), [supplierInvoices])

  const filteredClient = useMemo(() => effClient.filter(i => {
    if (clientFilter !== 'all' && i.client_id !== clientFilter) return false
    if (statusFilter !== 'all' && i.effectiveStatus !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${i.invoice_number} ${i.clients?.name ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [effClient, clientFilter, statusFilter, search])

  const filteredSupplier = useMemo(() => effSupplier.filter(i => {
    if (supplierFilter !== 'all' && i.supplier_id !== supplierFilter) return false
    if (statusFilter !== 'all' && i.effectiveStatus !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${i.invoice_number} ${i.suppliers?.name ?? ''} ${i.cost_category ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [effSupplier, supplierFilter, statusFilter, search])

  const clientSummary = useMemo(() => {
    const total = filteredClient.reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const paid = filteredClient.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    return {
      total, paid,
      outstanding: filteredClient.reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
      overdue: filteredClient.filter(i => i.effectiveStatus === 'en_retard').reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
    }
  }, [filteredClient])

  const supplierSummary = useMemo(() => {
    const total = filteredSupplier.reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const paid = filteredSupplier.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    return {
      total, paid,
      outstanding: filteredSupplier.reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
      overdue: filteredSupplier.filter(i => i.effectiveStatus === 'en_retard').reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
    }
  }, [filteredSupplier])

  const balance = useMemo(() => {
    const grouped = new Map<string, any>()
    const source = tab === 'clients' ? filteredClient : filteredSupplier
    source.forEach((i: any) => {
      const key = tab === 'clients' ? i.client_id : i.supplier_id
      const name = tab === 'clients' ? i.clients?.name : i.suppliers?.name
      const cur = grouped.get(key) || { key, name: name || '—', count: 0, total: 0, paid: 0, outstanding: 0 }
      cur.count += 1
      cur.total += Number(i.total_amount || 0)
      cur.paid += Number(i.paid_amount || 0)
      cur.outstanding += Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0)
      grouped.set(key, cur)
    })
    return Array.from(grouped.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [filteredClient, filteredSupplier, tab])

  const treasury = useMemo(() => {
    const collected = effClient.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    const paidOut = effSupplier.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    return {
      collected, paidOut, net: collected - paidOut,
      receivables: effClient.reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
      payables: effSupplier.reduce((s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0),
    }
  }, [effClient, effSupplier])

  // ─── Calendrier ──
  const allOpenDue = useMemo(() => [
    ...effClient.map(i => ({ kind: 'client' as const, label: i.clients?.name || '—', invoice_number: i.invoice_number, due_date: toIsoDate(i.due_date), remaining: Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0) })),
    ...effSupplier.map(i => ({ kind: 'fournisseur' as const, label: i.suppliers?.name || '—', invoice_number: i.invoice_number, due_date: toIsoDate(i.due_date), remaining: Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0) })),
  ].filter(x => x.remaining > 0 && x.due_date), [effClient, effSupplier])

  const calendarDate = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + calendarMonthOffset); return d
  }, [calendarMonthOffset])

  const calendarRange = useMemo(() => {
    const monthStart = new Date(calendarDate)
    const gridStart = new Date(monthStart)
    gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7))
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 41)
    return { startIso: gridStart.toISOString().slice(0, 10), endIso: gridEnd.toISOString().slice(0, 10) }
  }, [calendarDate])

  const monthDue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allOpenDue
      .map(i => ({ ...i, daysLeft: diffDays(today, i.due_date) }))
      .filter(i => i.due_date >= calendarRange.startIso && i.due_date <= calendarRange.endIso)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [allOpenDue, calendarRange])

  const nextDue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allOpenDue
      .map(i => ({ ...i, daysLeft: diffDays(today, i.due_date) }))
      .filter(i => i.daysLeft >= 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 12)
  }, [allOpenDue])

  const upcomingByDate = useMemo(() => {
    const m = new Map<string, any[]>()
    monthDue.forEach(i => { (m.get(i.due_date) ?? []).push(i); m.set(i.due_date, m.get(i.due_date) ?? [i]) })
    // re-correct (above is buggy due to ?? pattern):
    const fixed = new Map<string, any[]>()
    monthDue.forEach(i => {
      const arr = fixed.get(i.due_date) ?? []
      arr.push(i); fixed.set(i.due_date, arr)
    })
    return fixed
  }, [monthDue])

  const monthGridDays = useMemo(() => {
    const monthStart = new Date(calendarDate)
    const gridStart = new Date(monthStart); gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(gridStart, i)
      const iso = d.toISOString().slice(0, 10)
      return {
        iso, label: d.getDate(),
        inMonth: d.getMonth() === calendarDate.getMonth(),
        isToday: iso === new Date().toISOString().slice(0, 10),
        events: upcomingByDate.get(iso) || [],
      }
    })
  }, [calendarDate, upcomingByDate])

  // ─── Actions ─────────────────────────────────────────────────────────────
  const resetModalState = () => {
    setDone(false); setPaymentError(''); setModal(null)
    setSelectedClientInvoice(null); setSelectedSupplierInvoice(null)
  }

  const saveClientInvoice = async () => {
    if (!clientForm.client_id || !clientForm.invoice_date || !clientForm.due_date || !clientForm.subtotal) return
    setSaving(true)
    try {
      const total = Number(clientForm.subtotal)
      const created = await createFacture({ ...clientForm, subtotal: total, total_amount: total })
      setClientInvoices(p => [created, ...p]); setDone(true)
      toast.success('Facture client créée')
      setTimeout(() => {
        resetModalState()
        setClientForm({ client_id: '', invoice_date: '', due_date: '', subtotal: '', notes: '' })
      }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveSupplierInvoice = async () => {
    if (!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal) {
      toast.error('Champs requis manquants')
      return
    }
    setSaving(true)
    try {
      const total = Number(supplierForm.subtotal)
      const created = await createFactureFournisseur({
        ...supplierForm,
        campaign_id: supplierForm.campaign_id || undefined,
        greenhouse_id: supplierForm.greenhouse_id || undefined,
        po_id: supplierForm.po_id || undefined,
        subtotal: total, total_amount: total,
      })
      setSupplierInvoices(p => [created, ...p]); setDone(true)
      toast.success('✅ Facture fournisseur créée' + (supplierForm.po_id ? ' et liée au bon d\'achat' : ''))
      setTimeout(() => {
        resetModalState()
        setSupplierForm({ supplier_id: '', po_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'services', invoice_date: '', due_date: '', subtotal: '', notes: '' })
      }, 1200)
    } catch (e: any) {
      console.error('[saveSupplierInvoice]', e)
      toast.error('Erreur : ' + e.message)
    }
    setSaving(false)
  }

  // Helper : sélectionner un PO depuis la modale → auto-remplit les champs
  const selectPoForInvoice = (poId: string) => {
    setSupplierForm(f => ({ ...f, po_id: poId }))
    if (!poId) return
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) return
    setSupplierForm(f => ({
      ...f,
      supplier_id: po.supplier_id ?? f.supplier_id,
      campaign_id: po.campaign_id ?? f.campaign_id,
      greenhouse_id: po.greenhouse_id ?? f.greenhouse_id,
      subtotal: String(po.total_amount ?? f.subtotal),
      notes: f.notes || `Facture liée au bon d'achat ${po.code}`,
    }))
  }

  const saveClientPayment = async () => {
    if (!selectedClientInvoice || !clientPaymentForm.amount) return
    const amount = Number(clientPaymentForm.amount)
    const remaining = Number(selectedClientInvoice.total_amount || 0) - Number(selectedClientInvoice.paid_amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return setPaymentError('Le montant doit être supérieur à zéro')
    if (amount > remaining) return setPaymentError(`Le paiement dépasse le reste à encaisser (${remaining.toFixed(2)} MAD)`)
    setSaving(true)
    try {
      await payerFacture({ invoice_id: selectedClientInvoice.id, amount, payment_method: clientPaymentForm.payment_method, reference: clientPaymentForm.reference })
      await load(); setDone(true)
      toast.success('Encaissement enregistré')
      setTimeout(() => { resetModalState(); setClientPaymentForm({ amount: '', payment_method: 'virement', reference: '' }) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveSupplierPayment = async () => {
    if (!selectedSupplierInvoice || !supplierPaymentForm.amount) return
    const amount = Number(supplierPaymentForm.amount)
    const remaining = Number(selectedSupplierInvoice.total_amount || 0) - Number(selectedSupplierInvoice.paid_amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return setPaymentError('Le montant doit être supérieur à zéro')
    if (amount > remaining) return setPaymentError(`Le paiement dépasse le reste à régler (${remaining.toFixed(2)} MAD)`)
    setSaving(true)
    try {
      await payerFactureFournisseur({ supplier_invoice_id: selectedSupplierInvoice.id, amount, payment_method: supplierPaymentForm.payment_method, reference: supplierPaymentForm.reference })
      await load(); setDone(true)
      toast.success('Paiement fournisseur enregistré')
      setTimeout(() => { resetModalState(); setSupplierPaymentForm({ amount: '', payment_method: 'virement', reference: '' }) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ─── MODALS ─── */}
      {modal === 'facture_client' && (
        <Modal title="Nouvelle facture client" onClose={resetModalState}>
          {done ? <SuccessMessage message="Facture client créée !" /> : (
            <div className="space-y-md">
              <Field label="Client" required>
                <TSelect value={clientForm.client_id} onChange={(e) => setClientForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TSelect>
              </Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Date facture" required><TInput type="date" value={clientForm.invoice_date} onChange={(e) => setClientForm(f => ({ ...f, invoice_date: e.target.value }))} /></Field>
                <Field label="Date échéance" required><TInput type="date" value={clientForm.due_date} onChange={(e) => setClientForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
              </div>
              <Field label="Montant total (MAD)" required><TInput type="number" value={clientForm.subtotal} onChange={(e) => setClientForm(f => ({ ...f, subtotal: e.target.value }))} /></Field>
              <Field label="Notes"><Textarea rows={2} value={clientForm.notes} onChange={(e) => setClientForm(f => ({ ...f, notes: e.target.value }))} /></Field>
              <ModalFooter onCancel={resetModalState} onSave={saveClientInvoice} loading={saving} disabled={!clientForm.client_id || !clientForm.invoice_date || !clientForm.due_date || !clientForm.subtotal} saveLabel="Créer la facture" />
            </div>
          )}
        </Modal>
      )}

      {modal === 'facture_fournisseur' && (
        <Modal title="Nouvelle facture fournisseur" onClose={resetModalState} size="lg">
          {done ? <SuccessMessage message="Facture fournisseur créée !" /> : (
            <div className="space-y-md">
              {/* Lien optionnel vers un bon d'achat */}
              <Field label="Bon d'achat lié (optionnel)" hint="Sélectionne pour auto-remplir fournisseur + montant">
                <TSelect value={supplierForm.po_id} onChange={(e) => selectPoForInvoice(e.target.value)}>
                  <option value="">— Aucun (saisie libre) —</option>
                  {purchaseOrders
                    .filter(po => !supplierForm.supplier_id || po.supplier_id === supplierForm.supplier_id)
                    .map(po => (
                      <option key={po.id} value={po.id}>
                        {po.code} · {po.suppliers?.name ?? '?'} · {Number(po.total_amount ?? 0).toLocaleString('fr-FR')} MAD · {po.status}
                      </option>
                    ))}
                </TSelect>
              </Field>

              <Field label="Fournisseur" required>
                <TSelect value={supplierForm.supplier_id} onChange={(e) => setSupplierForm(f => ({ ...f, supplier_id: e.target.value, po_id: '' }))}>
                  <option value="">— Sélectionner —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </TSelect>
              </Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Date facture" required><TInput type="date" value={supplierForm.invoice_date} onChange={(e) => setSupplierForm(f => ({ ...f, invoice_date: e.target.value }))} /></Field>
                <Field label="Date échéance" required><TInput type="date" value={supplierForm.due_date} onChange={(e) => setSupplierForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Campagne">
                  <TSelect value={supplierForm.campaign_id} onChange={(e) => setSupplierForm(f => ({ ...f, campaign_id: e.target.value }))}>
                    <option value="">— Optionnel —</option>
                    {campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </TSelect>
                </Field>
                <Field label="Serre">
                  <TSelect value={supplierForm.greenhouse_id} onChange={(e) => setSupplierForm(f => ({ ...f, greenhouse_id: e.target.value }))}>
                    <option value="">— Optionnel —</option>
                    {serres.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                  </TSelect>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Catégorie">
                  <TSelect value={supplierForm.cost_category} onChange={(e) => setSupplierForm(f => ({ ...f, cost_category: e.target.value }))}>
                    {['semences', 'engrais', 'phytosanitaires', 'irrigation', 'emballage', 'transport', 'energie', 'services', 'equipement', 'divers'].map(c => <option key={c} value={c}>{c}</option>)}
                  </TSelect>
                </Field>
                <Field label="Montant total (MAD)" required><TInput type="number" value={supplierForm.subtotal} onChange={(e) => setSupplierForm(f => ({ ...f, subtotal: e.target.value }))} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm(f => ({ ...f, notes: e.target.value }))} /></Field>
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierInvoice} loading={saving} disabled={!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal} saveLabel="Créer la facture" />
            </div>
          )}
        </Modal>
      )}

      {modal === 'paiement_client' && selectedClientInvoice && (
        <Modal title="Encaisser une facture client" onClose={resetModalState}>
          {done ? <SuccessMessage message="Encaissement enregistré !" /> : (
            <div className="space-y-md">
              <div className="rounded-lg border border-success/30 bg-success/5 p-md">
                <div className="font-mono text-caption text-fg-secondary">{selectedClientInvoice.invoice_number} · {selectedClientInvoice.clients?.name}</div>
                <div className="mt-1 text-body-sm">
                  À encaisser : <strong className="text-success font-mono"><MoneyDisplay value={Math.max(Number(selectedClientInvoice.total_amount || 0) - Number(selectedClientInvoice.paid_amount || 0), 0)} /></strong>
                </div>
              </div>
              <Field label="Montant encaissé" required><TInput type="number" value={clientPaymentForm.amount} onChange={(e) => { setClientPaymentForm(f => ({ ...f, amount: e.target.value })); setPaymentError('') }} autoFocus /></Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Mode de paiement">
                  <TSelect value={clientPaymentForm.payment_method} onChange={(e) => setClientPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {['virement', 'cheque', 'especes', 'lettre_change'].map(p => <option key={p} value={p}>{p}</option>)}
                  </TSelect>
                </Field>
                <Field label="Référence"><TInput value={clientPaymentForm.reference} onChange={(e) => setClientPaymentForm(f => ({ ...f, reference: e.target.value }))} /></Field>
              </div>
              {paymentError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-sm text-body-sm text-danger flex items-center gap-2">
                  <AlertCircle size={14} /> {paymentError}
                </div>
              )}
              <ModalFooter onCancel={resetModalState} onSave={saveClientPayment} loading={saving} disabled={!clientPaymentForm.amount} saveLabel="Encaisser" />
            </div>
          )}
        </Modal>
      )}

      {modal === 'paiement_fournisseur' && selectedSupplierInvoice && (
        <Modal title="Régler une facture fournisseur" onClose={resetModalState}>
          {done ? <SuccessMessage message="Paiement fournisseur enregistré !" /> : (
            <div className="space-y-md">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-md">
                <div className="font-mono text-caption text-fg-secondary">{selectedSupplierInvoice.invoice_number} · {selectedSupplierInvoice.suppliers?.name}</div>
                <div className="mt-1 text-body-sm">
                  À régler : <strong className="text-warning font-mono"><MoneyDisplay value={Math.max(Number(selectedSupplierInvoice.total_amount || 0) - Number(selectedSupplierInvoice.paid_amount || 0), 0)} /></strong>
                </div>
              </div>
              <Field label="Montant réglé" required><TInput type="number" value={supplierPaymentForm.amount} onChange={(e) => { setSupplierPaymentForm(f => ({ ...f, amount: e.target.value })); setPaymentError('') }} autoFocus /></Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Mode de paiement">
                  <TSelect value={supplierPaymentForm.payment_method} onChange={(e) => setSupplierPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {['virement', 'cheque', 'especes', 'lettre_change'].map(p => <option key={p} value={p}>{p}</option>)}
                  </TSelect>
                </Field>
                <Field label="Référence"><TInput value={supplierPaymentForm.reference} onChange={(e) => setSupplierPaymentForm(f => ({ ...f, reference: e.target.value }))} /></Field>
              </div>
              {paymentError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-sm text-body-sm text-danger flex items-center gap-2">
                  <AlertCircle size={14} /> {paymentError}
                </div>
              )}
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierPayment} loading={saving} disabled={!supplierPaymentForm.amount} saveLabel="Régler" />
            </div>
          )}
        </Modal>
      )}

      {/* ─── HEADER ─── */}
      <PageHeader
        title="Factures"
        subtitle="Trésorerie"
        icon={Receipt}
        iconColor="#f43f5e"
        description="Crédit clients · Débit fournisseurs · Échéances"
        actions={
          tab === 'bordereaux' ? null : (
            <Button onClick={() => setModal(tab === 'clients' ? 'facture_client' : 'facture_fournisseur')} variant="primary">
              <Plus size={14} strokeWidth={2.5} /> {tab === 'clients' ? 'Facture client' : 'Facture fournisseur'}
            </Button>
          )
        }
      />

      {/* ─── KPI Trésorerie (5 hero) ─── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          <KPICard label="Encaissements" icon={ArrowDownCircle} accent="#10b981" delay={0}    value={<MoneyDisplay value={treasury.collected}   compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD reçus" />
          <KPICard label="Paiements"     icon={ArrowUpCircle}   accent="#f59e0b" delay={0.05} value={<MoneyDisplay value={treasury.paidOut}    compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD versés" />
          <KPICard label="Solde net"     icon={treasury.net >= 0 ? TrendingUp : TrendingDown} accent={treasury.net >= 0 ? '#22c55e' : '#ef4444'} delay={0.1}
            value={<MoneyDisplay value={treasury.net} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />}
            sub={treasury.net >= 0 ? 'Excédent' : 'Déficit'}
          />
          <KPICard label="Créances"      icon={Wallet}          accent="#3b82f6" delay={0.15} value={<MoneyDisplay value={treasury.receivables} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD à recevoir" />
          <KPICard label="Dettes"        icon={AlertTriangle}   accent="#ef4444" delay={0.2}  value={<MoneyDisplay value={treasury.payables}    compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD à payer" />
        </div>
      )}

      {/* ─── Calendrier + Échéances (2 colonnes) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-md mb-md">
        {/* Calendrier */}
        <Card animate delay={0.25} padding="none" className="overflow-hidden">
          <div className="px-md py-sm border-b border-border flex items-center justify-between">
            <div>
              <div className="font-display text-heading-sm font-bold text-fg-primary flex items-center gap-2">
                <Calendar size={14} className="text-info" /> Calendrier
              </div>
              <div className="font-mono text-caption text-fg-tertiary mt-0.5">Échéances du mois</div>
            </div>
            <div className="flex items-center gap-1">
              <Button onClick={() => setCalendarMonthOffset(v => v - 1)} variant="ghost" size="icon-sm" title="Mois précédent">
                <ChevronLeft size={12} strokeWidth={2.2} />
              </Button>
              <div className="font-mono text-caption font-semibold text-fg-secondary text-center min-w-[88px] capitalize">
                {formatMonthLabel(calendarDate)}
              </div>
              <Button onClick={() => setCalendarMonthOffset(v => v + 1)} variant="ghost" size="icon-sm" title="Mois suivant">
                <ChevronRight size={12} strokeWidth={2.2} />
              </Button>
            </div>
          </div>
          <div className="p-sm">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                <div key={d} className="font-mono text-[8px] uppercase tracking-wider text-fg-tertiary text-center font-semibold">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGridDays.map(day => {
                const cellContent = (
                  <div className={cn(
                    'relative aspect-square p-1 rounded border text-left transition-all duration-150',
                    day.inMonth ? 'border-border bg-surface-raised' : 'border-transparent bg-transparent opacity-40',
                    day.isToday && 'border-brand bg-brand/5',
                    day.events.length > 0 && 'hover:border-border-strong hover:shadow-raised cursor-pointer'
                  )}>
                    <div className={cn('font-display text-[11px] font-bold', day.isToday ? 'text-brand' : 'text-fg-primary')}>
                      {day.label}
                    </div>
                    {day.events.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {day.events.slice(0, 4).map((e, idx) => (
                          <span key={idx} className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            e.kind === 'client' ? 'bg-info' : 'bg-warning'
                          )} />
                        ))}
                        {day.events.length > 4 && (
                          <span className="text-[8px] font-mono text-fg-tertiary">+{day.events.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
                if (day.events.length === 0) return <div key={day.iso}>{cellContent}</div>
                return (
                  <Tooltip
                    key={day.iso}
                    content={
                      <div className="space-y-1">
                        <div className="font-mono text-[10px] text-fg-tertiary uppercase tracking-wider mb-1">
                          {new Date(`${day.iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                        </div>
                        {day.events.map((e, i) => (
                          <div key={i} className="text-caption">
                            <Badge variant={e.kind === 'client' ? 'info' : 'warning'} size="xs">{e.kind === 'client' ? 'Crédit' : 'Débit'}</Badge>
                            <span className="ml-1.5 font-semibold">{e.label}</span>
                            <span className="ml-1 text-fg-tertiary font-mono">{e.invoice_number}</span>
                          </div>
                        ))}
                      </div>
                    }
                  >
                    {cellContent}
                  </Tooltip>
                )
              })}
            </div>
            <div className="flex gap-md mt-md text-caption font-mono text-fg-tertiary">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-info" />Crédit</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" />Débit</span>
            </div>
          </div>
        </Card>

        {/* Prochaines échéances */}
        <Card animate delay={0.3} padding="none" className="overflow-hidden">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary flex items-center gap-2">
              <FileBarChart size={14} className="text-warning" /> Prochaines échéances
            </div>
            <div className="font-mono text-caption text-fg-tertiary mt-0.5">Top 12 par proximité</div>
          </div>
          {nextDue.length === 0 ? (
            <div className="p-xl text-center text-fg-tertiary text-body-sm">Aucune échéance ouverte à venir.</div>
          ) : (
            <DataTable>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Compte</TH>
                  <TH>N° Facture</TH>
                  <TH>Échéance</TH>
                  <TH right>Jours</TH>
                  <TH right>Montant</TH>
                </TR>
              </THead>
              <tbody>
                {nextDue.map((item, i) => (
                  <TR key={`${item.kind}-${item.invoice_number}-${i}`} animate delay={0.35 + i * 0.02}>
                    <TD>
                      <Badge variant={item.kind === 'client' ? 'info' : 'warning'} size="xs">
                        {item.kind === 'client' ? 'Crédit' : 'Débit'}
                      </Badge>
                    </TD>
                    <TD className="font-display font-semibold text-fg-primary">{item.label}</TD>
                    <TD mono className="text-caption">{item.invoice_number}</TD>
                    <TD mono className="text-caption text-fg-secondary">{item.due_date}</TD>
                    <TD right mono className={cn('font-bold', item.daysLeft <= 7 ? 'text-danger' : 'text-warning')}>{item.daysLeft}j</TD>
                    <TD right mono><MoneyDisplay value={item.remaining} className="font-semibold" /></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>

      {/* ─── Tab toggle + Filtres ─── */}
      <Card animate delay={0.35} className="mb-md">
        <div className="flex flex-wrap gap-md items-center">
          <div className="flex gap-1 p-1 rounded-md border border-border bg-surface-sunk">
            {[
              { k: 'clients' as InvoiceTab, l: 'Crédit clients', i: ArrowDownCircle, c: '#10b981' },
              { k: 'fournisseurs' as InvoiceTab, l: 'Débit fournisseurs', i: ArrowUpCircle, c: '#f59e0b' },
              { k: 'bordereaux' as InvoiceTab, l: 'Bordereaux station', i: Truck, c: '#8b5cf6' },
            ].map(t => {
              const Icon = t.i
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={cn(
                    'flex items-center gap-2 h-8 px-md rounded font-mono text-caption uppercase tracking-wider font-semibold transition-all',
                    tab === t.k
                      ? 'text-white shadow-raised'
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-hover'
                  )}
                  style={tab === t.k ? { background: t.c } : undefined}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {t.l}
                </button>
              )
            })}
          </div>

          {tab !== 'bordereaux' && (
            <>
              <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
                <Search size={14} className="text-fg-tertiary flex-shrink-0" />
                <TInput
                  placeholder={`Rechercher numéro, ${tab === 'clients' ? 'client' : 'fournisseur'}…`}
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="border-none bg-transparent focus:ring-0 px-0"
                />
                {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
              </div>

              {tab === 'clients' ? (
                <TSelect value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-8 w-auto min-w-[180px] text-body-sm">
                  <option value="all">Tous les clients</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TSelect>
              ) : (
                <TSelect value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-8 w-auto min-w-[180px] text-body-sm">
                  <option value="all">Tous les fournisseurs</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </TSelect>
              )}

              <TSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-auto min-w-[150px] text-body-sm">
                <option value="all">Tous statuts</option>
                <option value="en_attente">En attente</option>
                <option value="partiellement_paye">Partiel</option>
                <option value="en_retard">En retard</option>
                <option value="paye">Payée</option>
              </TSelect>
            </>
          )}
        </div>
      </Card>

      {/* ─── Section Bordereaux station ─── */}
      {tab === 'bordereaux' && <BordereauxSection />}

      {/* ─── KPI tab spécifique ─── */}
      {tab !== 'bordereaux' && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm mb-md">
          {[
            { label: tab === 'clients' ? 'Facturé'      : 'À payer', value: tab === 'clients' ? clientSummary.total       : supplierSummary.total,       color: '#3b82f6', icon: Banknote },
            { label: tab === 'clients' ? 'Encaissé'     : 'Réglé',   value: tab === 'clients' ? clientSummary.paid        : supplierSummary.paid,        color: '#10b981', icon: BadgeDollarSign },
            { label: tab === 'clients' ? 'Encours'      : 'Dette',   value: tab === 'clients' ? clientSummary.outstanding : supplierSummary.outstanding, color: '#f59e0b', icon: Wallet },
            { label: 'En retard', value: tab === 'clients' ? clientSummary.overdue : supplierSummary.overdue, color: '#ef4444', icon: AlertTriangle },
          ].map((kpi, i) => {
            const Icon = kpi.icon
            return (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.04 }}
                className="rounded-md border bg-surface-raised p-md"
                style={{ borderTopColor: kpi.color, borderTopWidth: 3 }}
              >
                <div className="flex items-center gap-sm mb-1">
                  <Icon size={12} strokeWidth={2.5} style={{ color: kpi.color }} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{kpi.label}</span>
                </div>
                <div className="font-display text-display-sm font-extrabold" style={{ color: kpi.color }}>
                  <MoneyDisplay value={kpi.value} compact="auto" showCurrency={false} className="!text-current" />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ─── Synthèse par compte ─── */}
      {tab !== 'bordereaux' && balance.length > 0 && (
        <Card animate delay={0.45} padding="none" className="overflow-hidden mb-md">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary">
              Synthèse {tab === 'clients' ? 'clients' : 'fournisseurs'}
            </div>
          </div>
          <DataTable>
            <THead>
              <TR>
                <TH>Compte</TH>
                <TH right>Factures</TH>
                <TH right>Total</TH>
                <TH right>{tab === 'clients' ? 'Encaissé' : 'Réglé'}</TH>
                <TH right>Encours</TH>
              </TR>
            </THead>
            <tbody>
              {balance.map((b, i) => (
                <TR key={b.key} animate delay={0.5 + i * 0.02}>
                  <TD className="font-display font-semibold text-fg-primary">{b.name}</TD>
                  <TD right mono>{b.count}</TD>
                  <TD right mono><MoneyDisplay value={b.total} compact="auto" /></TD>
                  <TD right mono className="text-success"><MoneyDisplay value={b.paid} compact="auto" /></TD>
                  <TD right mono className="text-warning font-bold"><MoneyDisplay value={b.outstanding} compact="auto" /></TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}

      {/* ─── Table principale ─── */}
      {tab !== 'bordereaux' && (
      <Card animate delay={0.5} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (tab === 'clients' ? filteredClient : filteredSupplier).length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={tab === 'clients' ? 'Aucune facture client' : 'Aucune facture fournisseur'}
            description="Les factures s'afficheront ici."
            action={<Button onClick={() => setModal(tab === 'clients' ? 'facture_client' : 'facture_fournisseur')}><Plus size={14} strokeWidth={2.5} /> Nouvelle</Button>}
          />
        ) : (
          <DataTable minWidth={tab === 'clients' ? 1100 : 1200}>
            <THead>
              <TR>
                <TH>N° Facture</TH>
                <TH>{tab === 'clients' ? 'Client' : 'Fournisseur'}</TH>
                {tab === 'fournisseurs' && <TH>Catégorie</TH>}
                <TH>Date</TH>
                <TH>Échéance</TH>
                <TH right>Montant</TH>
                <TH right>{tab === 'clients' ? 'Encaissé' : 'Réglé'}</TH>
                <TH right>Reste</TH>
                <TH>Statut</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {(tab === 'clients' ? filteredClient : filteredSupplier).map((item, i) => {
                const remaining = Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0)
                const st = STATUS_CONFIG[item.effectiveStatus] || STATUS_CONFIG.en_attente
                const isFocused = item.id === focusInvoiceId
                return (
                  <TR
                    key={item.id}
                    animate
                    delay={0.55 + i * 0.02}
                    data-invoice-id={item.id}
                    className={isFocused ? 'bg-info/10 ring-2 ring-info ring-inset' : undefined}
                  >
                    <TD mono className="font-bold text-fg-primary">
                      {isFocused && <span className="inline-block w-1.5 h-1.5 rounded-full bg-info mr-1.5 animate-pulse" />}
                      {item.invoice_number}
                    </TD>
                    <TD className="font-display font-semibold text-fg-primary">
                      {tab === 'clients' ? item.clients?.name : item.suppliers?.name}
                    </TD>
                    {tab === 'fournisseurs' && (
                      <TD><Badge variant="default" size="sm">{item.cost_category || '—'}</Badge></TD>
                    )}
                    <TD mono className="text-caption"><DateDisplay value={item.invoice_date} variant="compact" /></TD>
                    <TD mono className="text-caption"><DateDisplay value={item.due_date} variant="compact" /></TD>
                    <TD right mono><MoneyDisplay value={Number(item.total_amount || 0)} compact="auto" className="text-fg-primary" /></TD>
                    <TD right mono><MoneyDisplay value={Number(item.paid_amount || 0)} compact="auto" className="text-success" /></TD>
                    <TD right mono><MoneyDisplay value={remaining} compact="auto" className={remaining > 0 ? 'text-warning font-bold' : 'text-fg-tertiary'} /></TD>
                    <TD><Badge variant={st.variant} size="sm">{st.label}</Badge></TD>
                    <TD right>
                      {item.effectiveStatus !== 'paye' && (
                        <Button
                          onClick={() => {
                            setPaymentError('')
                            if (tab === 'clients') {
                              setSelectedClientInvoice(item); setModal('paiement_client')
                            } else {
                              setSelectedSupplierInvoice(item); setModal('paiement_fournisseur')
                            }
                          }}
                          variant={tab === 'clients' ? 'primary' : 'secondary'}
                          size="xs"
                        >
                          {tab === 'clients' ? 'Encaisser' : 'Régler'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
      )}
    </div>
  )
}
