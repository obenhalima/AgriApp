'use client'

import { SupplierInvoiceImports, SupplierInvoicePreview, SupplierImportLines, SupplierImportDetails } from '@/components/invoices/SupplierInvoiceImports'
import { SupplierCreateModal } from '@/components/suppliers/SupplierCreateModal'
import { invoiceImportLink, matchSupplier, stockSuggestion, unitFactor, type ExtractedLine, type ImportData, type InvoiceImport, type LineMatch, type StockOption } from '@/lib/supplierInvoiceImport'
import {useLanguage, TranslatedText} from '@/lib/i18n'

import '@/components/ui/workspace.css'
/**
 * /factures — Refonte avec design system.
 * Conserve toute la logique (calendrier, échéances, paiements) — refait l'UI.
 */
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useRealtimeReload } from '@/lib/useRealtimeReload'
import { useRefreshOnEvent } from '@/lib/useAuthGuard'
import { useReferenceList } from '@/lib/useReferenceList'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Receipt, Plus, AlertCircle, Search, X, Calendar, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  Banknote, FileBarChart, BadgeDollarSign, Truck, Printer,
} from 'lucide-react'

import { BordereauxSection } from './BordereauxSection'
import { InvoiceDocumentActions } from '@/components/invoices/InvoiceDocumentActions'

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
import { useAuth } from '@/lib/auth'

type InvoiceTab = 'clients' | 'fournisseurs'
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
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const { activeDomain, isAdmin, isPlatformAdmin, hasPermission } = useAuth()
  const { values: PAY_METHODS } = useReferenceList('payment_method')
  const [tab, setTab] = useState<InvoiceTab>('clients')
  const [modal, setModal] = useState<ModalType>(null)
  const [loading, setLoading] = useState(true)
  const [invoiceLoadError, setInvoiceLoadError] = useState('')
  const loadVersion = useRef(0), currentDomain = useRef(activeDomain?.domain_id)
  currentDomain.current = activeDomain?.domain_id
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
  const [invoiceImport, setInvoiceImport] = useState<InvoiceImport | null>(null)
  const [importDomain, setImportDomain] = useState('')
  const activeImportDomain = useRef(activeDomain?.domain_id)
  activeImportDomain.current = activeDomain?.domain_id
  const reviewRequest = useRef(0)
  const prefilledPurchase = useRef('')
  const [reviewFields, setReviewFields] = useState({ number: '', currency: '', vat: '', stamp: '', total: '' })
  const [reviewData, setReviewData] = useState<ImportData | null>(null)
  const [reviewLines, setReviewLines] = useState<ExtractedLine[]>([])
  const [lineMatches, setLineMatches] = useState<LineMatch[]>([])
  const [stockOptions, setStockOptions] = useState<StockOption[]>([])
  const [newSupplier, setNewSupplier] = useState(false)
  const [duplicateInvoice, setDuplicateInvoice] = useState('')
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: '', po_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'services',
    invoice_date: '', due_date: '', subtotal: '', notes: '',
  })
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  // Map invoice_id → settlement_id pour bouton "Imprimer PDF" sur chaque facture bordereau
  const [settlementByInvoiceId, setSettlementByInvoiceId] = useState<Map<string, string>>(new Map())
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({ amount: '', payment_method: 'virement', reference: '' })

  const [clientFilter, setClientFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)

  const searchParams = useSearchParams()

  const load = useCallback(() => {
    const version = ++loadVersion.current, domain = activeDomain?.domain_id
    const isCurrent = () => version === loadVersion.current && domain === currentDomain.current
    setLoading(true); setInvoiceLoadError('')
    setClientInvoices([]); setSupplierInvoices([])
    if (!activeDomain) { setClients([]); setSuppliers([]); setCampagnes([]); setSerres([]); setLoading(false); return Promise.resolve() }
    return (
    // Promise.allSettled : si une requete echoue, les autres aboutissent quand meme
    // (avant : une requete echouee effacait TOUTES les factures de l'UI)
    Promise.allSettled([
      getFactures(activeDomain.domain_id), getFacturesFournisseurs(activeDomain.domain_id), getClients(activeDomain.domain_id), getFournisseurs(activeDomain.domain_id), getCampagnes(activeDomain.domain_id), getSerres(activeDomain.domain_id),
      // Charge les POs réceptionnés (entièrement ou partiellement) qui n'ont pas encore de facture
      // NOTE : la colonne est po_number, pas code (regression du schema initial)
      supabase.from('purchase_orders')
        .select('id, po_number, supplier_id, total_amount, currency, status, order_date, campaign_id, greenhouse_id, suppliers(name)')
        .eq('domain_id', activeDomain.domain_id)
        .in('status', ['recu', 'partiellement_recu', 'envoye'])
        .order('order_date', { ascending: false })
        .limit(100),
      // Charge tous les clients (y compris inactifs) pour le mapping de fallback
      // sur les jointures qui retourneraient null (ex: client Station désactivé)
      supabase.from('clients').select('id, name, is_active').eq('domain_id', activeDomain.domain_id).order('name'),
      // Bordereaux avec invoice_id : pour bouton "Imprimer PDF" sur les lignes facture
      supabase.from('station_settlements').select('id, invoice_id').eq('domain_id', activeDomain.domain_id).not('invoice_id', 'is', null),
    ])
      .then((results) => {
        if (!isCurrent()) return
        if (results[0].status === 'rejected') {
          const candidate = results[0].reason?.code
          const code = typeof candidate === 'string' && /^[A-Z0-9_]{3,20}$/.test(candidate) ? ` (code ${candidate})` : ''
          setInvoiceLoadError(`Impossible de charger les factures clients${code}. Les factures existantes sont conservées. Réessayez ou contactez votre administrateur.`)
        }
        // Helper : recupere la valeur si fulfilled, sinon valeur par defaut + log d'erreur
        const get = <T,>(idx: number, fallback: T, label: string): T => {
          const r = results[idx]
          if (r.status === 'fulfilled') return r.value as T
          console.error(`[factures] ${label} failed:`, (r as any).reason)
          return fallback
        }
        const fc = get<any[]>(0, [], 'getFactures')
        const ff = get<any[]>(1, [], 'getFacturesFournisseurs')
        const cd = get<any[]>(2, [], 'getClients')
        const sd = get<any[]>(3, [], 'getFournisseurs')
        const cad = get<any[]>(4, [], 'getCampagnes')
        const srd = get<any[]>(5, [], 'getSerres')
        const pos = get<any>(6, { data: [] }, 'purchase_orders')
        const allCl = get<any>(7, { data: [] }, 'all clients')
        const settlementsRes = get<any>(8, { data: [] }, 'settlements_for_invoice_map')
        // Build map invoice_id -> settlement_id
        const sMap = new Map<string, string>()
        for (const s of (settlementsRes.data ?? []) as any[]) {
          if (s.invoice_id) sMap.set(s.invoice_id, s.id)
        }
        setSettlementByInvoiceId(sMap)
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
        if (!isCurrent()) return
        console.error('[factures] load error:', e)
        setInvoiceLoadError('Impossible de charger les factures clients. Les factures existantes sont conservées. Réessayez ou contactez votre administrateur.')
        setLoading(false)
      })
    )
  }, [activeDomain?.domain_id])
  useEffect(() => { load() }, [load])
  useEffect(() => { setClientFilter('all'); setSupplierFilter('all'); setStatusFilter('all'); setSearch('') }, [activeDomain?.domain_id])

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
  const openedPayment = useRef('')
  useEffect(() => {
    if (loading || invoiceLoadError || !activeDomain || searchParams?.get('action') !== 'payment' || searchParams.get('domain') !== activeDomain.domain_id) return
    const supplier = searchParams.get('tab') === 'fournisseurs'
    const key = `${activeDomain.domain_id}:${supplier}:${focusInvoiceId}`
    if (openedPayment.current === key) return
    const item = (supplier ? supplierInvoices : clientInvoices).find(invoice => invoice.id === focusInvoiceId && invoice.domain_id === activeDomain.domain_id)
    if (!item || Number(item.total_amount || 0) <= Number(item.paid_amount || 0)) return
    openedPayment.current = key
    setPaymentError('')
    if (supplier) { setSelectedSupplierInvoice(item); setModal('paiement_fournisseur') }
    else { setSelectedClientInvoice(item); setModal('paiement_client') }
  }, [loading, invoiceLoadError, activeDomain?.domain_id, searchParams, focusInvoiceId, clientInvoices, supplierInvoices])
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
    if (!focusInvoiceId || loading || invoiceLoadError || !activeDomain) return
    const exists = clientInvoices.some((i) => i.id === focusInvoiceId)
    if (exists) return
    let stale = false
    console.warn(`[factures] facture ${focusInvoiceId} demandee mais absente de la liste, fetch direct…`)
    supabase
      .from('invoices')
      .select('*, clients!invoices_client_id_fkey(name)')
      .eq('domain_id', activeDomain.domain_id)
      .eq('id', focusInvoiceId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (stale) return
        if (error) { console.error('[factures] fetch direct error:', error); return }
        if (!data) { console.warn(`[factures] facture ${focusInvoiceId} introuvable en DB`); return }
        // Resoudre le client name si null
        const enriched: any = { ...data }
        if (!enriched.clients?.name && enriched.client_id) {
          const local = clients.find((c) => c.id === enriched.client_id)
          enriched.clients = { name: local?.name ?? '(client inconnu)' }
        }
        toast.info(_ui("Facture {v0} chargée (n'apparaissait pas via la requête principale)",{v0:String(enriched.invoice_number)}))
        setClientInvoices((prev) => [enriched, ...prev])
      })
    return () => { stale = true }
  }, [focusInvoiceId, clientInvoices, loading, clients,_ui,invoiceLoadError,activeDomain?.domain_id])

  // ─── Onglet actif depuis ?tab=bordereaux|clients|fournisseurs ─────────
  useEffect(() => {
    const tabParam = searchParams?.get('tab')
    // Bordereaux module a ete deplace dans /recoltes — redirige si l'URL pointe ici
    if (tabParam === 'bordereaux') {
      window.location.href = '/recoltes?tab=bordereaux'
      return
    }
    if (tabParam === 'clients' || tabParam === 'fournisseurs') {
      setTab(tabParam)
    }
  }, [searchParams])

  // ─── Pré-remplir depuis ?po=<id> (lien depuis page achat) ──────────────
  useEffect(() => {
    const poId = searchParams?.get('po')
    if (!poId) { prefilledPurchase.current = ''; return }
    if (!activeDomain || purchaseOrders.length === 0) return
    const key = activeDomain.domain_id + ':' + poId
    if (prefilledPurchase.current === key) return
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) return
    prefilledPurchase.current = key
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
      notes: `Facture liée au bon d'achat ${po.po_number}`,
    })
    setTab('fournisseurs')
    setModal('facture_fournisseur')
  }, [searchParams, purchaseOrders, activeDomain])

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
    if (invoiceImport) setSupplierForm({ supplier_id: '', po_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'services', invoice_date: '', due_date: '', subtotal: '', notes: '' })
    reviewRequest.current++
    setInvoiceImport(null)
    setNewSupplier(false)
    setDuplicateInvoice('')
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
      toast.success(_ui("Facture client créée"))
      setTimeout(() => {
        resetModalState()
        setClientForm({ client_id: '', invoice_date: '', due_date: '', subtotal: '', notes: '' })
      }, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
    setSaving(false)
  }

  async function reviewSupplierImport(entry: InvoiceImport) {
    const data = entry.extracted_data
    if (!data || !activeDomain) return
    const domain = activeDomain.domain_id
    const supplier = matchSupplier(data.supplier, suppliers)
    const purchase = purchaseOrders.find(po => supplier && po.supplier_id === supplier.id &&
      data.invoice.purchase_order_ref?.trim().toUpperCase() === po.po_number?.trim().toUpperCase())
    const request = ++reviewRequest.current
    const [items, history, phyto] = await Promise.all([
      supabase.from('stock_items').select('id,code,name,unit,plant_protection_product_id')
        .eq('domain_id', domain).eq('is_active', true).order('name'),
      supplier ? supabase.from('supplier_invoice_imports')
        .select('validated_data,supplier_invoices!supplier_invoice_imports_invoice_id_fkey!inner(supplier_id)')
        .eq('domain_id', domain).eq('status', 'validated').eq('supplier_invoices.supplier_id', supplier.id)
        .order('validated_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      supabase.from('plant_protection_products').select('id,commercial_name,authorization_number')
        .eq('domain_id', domain).eq('is_active', true),
    ])
    if (request !== reviewRequest.current || activeImportDomain.current !== domain) return
    const phytoById = new Map((phyto.data ?? []).map(product => [product.id, product]))
    const options: StockOption[] = (items.data ?? []).map(item => {
      const reference = phytoById.get(item.plant_protection_product_id)
      return { ...item, phytoName: reference?.commercial_name, phytoCode: reference?.authorization_number }
    })
    const prior = (history.data ?? []).flatMap(row => row.validated_data?.stock_matches ?? [])
    setDuplicateInvoice('')
    setImportDomain(domain)
    setInvoiceImport(entry)
    setStockOptions(options)
    setReviewData(data)
    setReviewLines(data.lines)
    setLineMatches(data.lines.map(line => {
      const historic = prior.find(item => (line.product_code && line.product_code === item.product_code) ||
        (line.description && line.description === item.description))
      const item = stockSuggestion(line, options, historic?.stock_item_id)
      return { stock_item_id: item?.id ?? '', factor: item ? unitFactor(line, item.unit) : '' }
    }))
    setReviewFields({
      number: data.invoice.number ?? '', currency: data.invoice.currency ?? '',
      vat: String(data.totals.total_vat ?? ''), stamp: String(data.totals.stamp_duty ?? ''),
      total: String(data.totals.total_ttc ?? ''),
    })
    setSupplierForm({
      supplier_id: supplier?.id ?? '', po_id: purchase?.id ?? '', campaign_id: purchase?.campaign_id ?? '',
      greenhouse_id: purchase?.greenhouse_id ?? '', cost_category: 'services',
      invoice_date: data.invoice.date ?? '', due_date: data.invoice.due_date ?? '',
      subtotal: String(data.totals.total_ht ?? ''), notes: '',
    })
    setModal('facture_fournisseur')
  }

  function importIssue(path: string) {
    const issue = invoiceImport?.checks.find(check => check.path === path)?.message
    const confidence = invoiceImport?.extracted_data?.confidence[path]
    return issue || (invoiceImport && (confidence ?? 0) < 0.8 ? 'Confiance faible dans la lecture. Vérifiez ce champ.' : undefined)
  }

  const saveSupplierInvoice = async () => {
    if (saving) return
    if (!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal) {
      toast.error(_ui("Champs requis manquants"))
      return
    }
    setSaving(true)
    try {
      const subtotal = Number(supplierForm.subtotal)
      let total = subtotal
      let imported: Parameters<typeof createFactureFournisseur>[0]['invoiceImport']
      if (invoiceImport) {
        setDuplicateInvoice('')
        if (activeDomain?.domain_id !== importDomain) throw Error('Le client actif a changé.')
        if (!reviewData) throw Error('Données d’import indisponibles.')
        const vat = Number(reviewFields.vat)
        const stamp = Number(reviewFields.stamp || 0)
        const tax = vat + stamp
        total = Number(reviewFields.total)
        const number = reviewFields.number.trim()
        const currency = reviewFields.currency.trim().toUpperCase()
        if (!number || number.length > 30 || !/^[A-Z]{3}$/.test(currency)) throw Error('Vérifiez le numéro original et la devise.')
        if (!reviewFields.vat.trim() || !reviewFields.total.trim() || ![subtotal, vat, stamp, total].every(Number.isFinite)
          || Math.min(subtotal, vat, stamp) < 0 || total <= 0 || Math.abs(Math.round((subtotal + tax - total) * 100)) > 5) {
          throw Error('Vérifiez le HT, les taxes et le TTC.')
        }
        if (lineMatches.some(match => match.stock_item_id && !match.confirmed)) throw Error('Confirmez ou retirez les rapprochements d’articles proposés.')
        if (lineMatches.some(match => match.stock_item_id && !(Number(match.factor) > 0 && Number.isFinite(Number(match.factor))))) {
          throw Error('Indiquez une conversion positive pour chaque article sélectionné.')
        }
        const data = reviewData
        const verifiedData = {
          ...data, lines: reviewLines,
          invoice: { ...data.invoice, number, currency, date: supplierForm.invoice_date, due_date: supplierForm.due_date },
          totals: { ...data.totals, total_ht: subtotal, total_vat: vat, stamp_duty: reviewFields.stamp ? stamp : null, total_ttc: total },
        }
        imported = { id: invoiceImport.id, number, tax, currency,
          review: { data: verifiedData, supplier_id: supplierForm.supplier_id,
            stock_matches: lineMatches.flatMap((match, index) => match.stock_item_id ? [{
              ...match, description: reviewLines[index]?.description, product_code: reviewLines[index]?.product_code,
            }] : []) } }
      }
      const created = await createFactureFournisseur({
        ...supplierForm,
        campaign_id: supplierForm.campaign_id || undefined,
        greenhouse_id: supplierForm.greenhouse_id || undefined,
        po_id: supplierForm.po_id || undefined,
        subtotal, total_amount: total, invoiceImport: imported,
      })
      setSupplierInvoices(p => [created, ...p]); setDone(true)
      toast.success(_ui("✅ Facture fournisseur créée") + (supplierForm.po_id ? _ui("et liée au bon d'achat") : ''))
      setTimeout(() => {
        resetModalState()
        setSupplierForm({ supplier_id: '', po_id: '', campaign_id: '', greenhouse_id: '', cost_category: 'services', invoice_date: '', due_date: '', subtotal: '', notes: '' })
      }, 1200)
    } catch (e: any) {
      if (invoiceImport && /^[0-9a-f-]{36}$/i.test(e.details ?? '')) setDuplicateInvoice(e.details)
      toast.error(_ui("Erreur :") + e.message)
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
      subtotal: invoiceImport ? f.subtotal : String(po.total_amount ?? f.subtotal),
      notes: f.notes || `Facture liée au bon d'achat ${po.po_number}`,
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
      toast.success(_ui("Encaissement enregistré"))
      setTimeout(() => { resetModalState(); setClientPaymentForm({ amount: '', payment_method: 'virement', reference: '' }) }, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
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
      toast.success(_ui("Paiement fournisseur enregistré"))
      setTimeout(() => { resetModalState(); setSupplierPaymentForm({ amount: '', payment_method: 'virement', reference: '' }) }, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
    setSaving(false)
  }

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="itrix-workspace">
      {/* ─── MODALS ─── */}
      {modal === 'facture_client' && (
        <Modal title={_ui("Nouvelle facture client")} onClose={resetModalState}>
          {done ? <SuccessMessage message={_ui("Facture client créée !")} /> : (
            <div className="space-y-md">
              <Field label={_ui("Client")} required>
                <TSelect value={clientForm.client_id} onChange={(e) => setClientForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">{_ui("— Sélectionner —")}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TSelect>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Date facture")} required><TInput type="date" value={clientForm.invoice_date} onChange={(e) => setClientForm(f => ({ ...f, invoice_date: e.target.value }))} /></Field>
                <Field label={_ui("Date échéance")} required><TInput type="date" value={clientForm.due_date} onChange={(e) => setClientForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
              </div>
              <Field label={_ui("Montant total (MAD)")} required><TInput type="number" value={clientForm.subtotal} onChange={(e) => setClientForm(f => ({ ...f, subtotal: e.target.value }))} /></Field>
              <Field label={_ui("Notes")}><Textarea rows={2} value={clientForm.notes} onChange={(e) => setClientForm(f => ({ ...f, notes: e.target.value }))} /></Field>
              <ModalFooter onCancel={resetModalState} onSave={saveClientInvoice} loading={saving} disabled={!clientForm.client_id || !clientForm.invoice_date || !clientForm.due_date || !clientForm.subtotal} saveLabel={_ui("Créer la facture")} />
            </div>
          )}
        </Modal>
      )}

      {modal === 'facture_fournisseur' && !newSupplier && (!invoiceImport || activeDomain?.domain_id === importDomain) && (
        <Modal title={_ui("Nouvelle facture fournisseur")} onClose={resetModalState} size={invoiceImport ? 'xl' : 'lg'} busy={saving}>
          {done ? <SuccessMessage message={_ui("Facture fournisseur créée !")} /> : (
            <div className={invoiceImport ? 'grid gap-4 lg:grid-cols-2' : ''}>
              {invoiceImport && <SupplierInvoicePreview key={invoiceImport.id} entry={invoiceImport} />}
              <div className="space-y-md min-w-0">
              {/* Lien optionnel vers un bon d'achat */}
              <Field label={_ui("Bon d'achat lié (optionnel)")} hint={_ui("Sélectionne pour auto-remplir fournisseur + montant")}>
                <TSelect value={supplierForm.po_id} onChange={(e) => selectPoForInvoice(e.target.value)}>
                  <option value="">{_ui("— Aucun (saisie libre) —")}</option>
                  {purchaseOrders
                    .filter(po => !supplierForm.supplier_id || po.supplier_id === supplierForm.supplier_id)
                    .map(po => (
                      <option key={po.id} value={po.id}>
                        {po.po_number} · {po.suppliers?.name ?? '?'} · {Number(po.total_amount ?? 0).toLocaleString(_uiLocale)} {" "}{_ui("MAD ·")}{" "}{po.status}
                      </option>
                    ))}
                </TSelect>
              </Field>

              <Field label={_ui("Fournisseur")} error={importIssue('supplier.name')} required>
                <TSelect value={supplierForm.supplier_id} onChange={(e) => setSupplierForm(f => ({ ...f, supplier_id: e.target.value, po_id: '' }))}>
                  <option value="">{_ui("— Sélectionner —")}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </TSelect>
              </Field>
              {invoiceImport && !supplierForm.supplier_id && hasPermission('fournisseurs', 'create') &&
                <Button variant="secondary" onClick={() => setNewSupplier(true)}>Créer le fournisseur</Button>}
              {invoiceImport && <div className="grid grid-cols-2 gap-2">
                <Field label="Numéro original" required error={importIssue('invoice.number')}><TInput title={importIssue('invoice.number')} value={reviewFields.number} onChange={e => setReviewFields(f => ({ ...f, number: e.target.value }))} /></Field>
                <Field label="Devise" required error={importIssue('invoice.currency')}><TInput title={importIssue('invoice.currency')} maxLength={3} value={reviewFields.currency} onChange={e => setReviewFields(f => ({ ...f, currency: e.target.value }))} /></Field>
              </div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Date facture")} error={importIssue('invoice.date')} required><TInput title={importIssue('invoice.date')} type="date" value={supplierForm.invoice_date} onChange={(e) => setSupplierForm(f => ({ ...f, invoice_date: e.target.value }))} /></Field>
                <Field label={_ui("Date échéance")} error={importIssue('invoice.due_date')} required><TInput title={importIssue('invoice.due_date')} type="date" value={supplierForm.due_date} onChange={(e) => setSupplierForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Campagne")}>
                  <TSelect value={supplierForm.campaign_id} onChange={(e) => setSupplierForm(f => ({ ...f, campaign_id: e.target.value }))}>
                    <option value="">{_ui("— Optionnel —")}</option>
                    {campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </TSelect>
                </Field>
                <Field label={_ui("Serre")}>
                  <TSelect value={supplierForm.greenhouse_id} onChange={(e) => setSupplierForm(f => ({ ...f, greenhouse_id: e.target.value }))}>
                    <option value="">{_ui("— Optionnel —")}</option>
                    {serres.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                  </TSelect>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Catégorie")}>
                  <TSelect value={supplierForm.cost_category} onChange={(e) => setSupplierForm(f => ({ ...f, cost_category: e.target.value }))}>
                    {['semences', 'engrais', 'phytosanitaires', 'irrigation', 'emballage', 'transport', 'energie', 'services', 'equipement', 'divers'].map(c => <option key={c} value={c}>{c}</option>)}
                  </TSelect>
                </Field>
                <Field label={invoiceImport ? 'Montant HT' : _ui("Montant total (MAD)")} error={importIssue('totals.total_ht')} required><TInput title={importIssue('totals.total_ht')} type="number" value={supplierForm.subtotal} onChange={(e) => setSupplierForm(f => ({ ...f, subtotal: e.target.value }))} /></Field>
              </div>
              {invoiceImport && <>
                <div className="grid grid-cols-3 gap-2">
                  {([{ key: 'vat', label: 'TVA', path: 'totals.total_vat' }, { key: 'stamp', label: 'Timbre', path: 'totals.stamp_duty' },
                    { key: 'total', label: 'TTC', path: 'totals.total_ttc' }] as const).map(({ key, label, path }) =>
                      <Field key={key} label={label} error={importIssue(path)}><TInput title={importIssue(path)} type="number" value={reviewFields[key]} onChange={e => setReviewFields(f => ({ ...f, [key]: e.target.value }))} /></Field>)}
                </div>
                {reviewData && <SupplierImportDetails data={reviewData} issue={importIssue} onChange={setReviewData} />}
                <SupplierImportLines lines={reviewLines} matches={lineMatches} options={stockOptions}
                  issue={importIssue} onLines={setReviewLines} onMatches={setLineMatches} />
                {invoiceImport.checks.length > 0 && <ul className="list-disc pl-5">{invoiceImport.checks.map(check =>
                  <li key={check.path + check.message}>{check.message}</li>)}</ul>}
                {invoiceImport.extracted_data?.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
                {duplicateInvoice && <Link href={invoiceImportLink(duplicateInvoice, importDomain)}>Voir la facture existante</Link>}
              </>}
              <Field label={_ui("Notes")}><Textarea rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm(f => ({ ...f, notes: e.target.value }))} /></Field>
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierInvoice} loading={saving} disabled={!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal} saveLabel={_ui("Créer la facture")} />
              </div>
            </div>
          )}
        </Modal>
      )}
      {invoiceImport && newSupplier && activeDomain?.domain_id === importDomain && <SupplierCreateModal key={invoiceImport.id} open initial={reviewData?.supplier}
        onClose={() => setNewSupplier(false)} onCreated={supplier => {
          setSuppliers(current => [...current, supplier]); setNewSupplier(false)
          setSupplierForm(current => ({ ...current, supplier_id: supplier.id, po_id: '' }))
        }} />}

      {modal === 'paiement_client' && selectedClientInvoice && (
        <Modal title={_ui("Encaisser une facture client")} onClose={resetModalState}>
          {done ? <SuccessMessage message={_ui("Encaissement enregistré !")} /> : (
            <div className="space-y-md">
              <div className="rounded-lg border border-success/30 bg-success/5 p-md">
                <div className="font-mono text-caption text-fg-secondary">{selectedClientInvoice.invoice_number} · {selectedClientInvoice.clients?.name}</div>
                <div className="mt-1 text-body-sm">
                  {" "}{_ui("À encaisser :")}{" "}<strong className="text-success font-mono"><MoneyDisplay value={Math.max(Number(selectedClientInvoice.total_amount || 0) - Number(selectedClientInvoice.paid_amount || 0), 0)} /></strong>
                </div>
              </div>
              <Field label={_ui("Montant encaissé")} required><TInput type="number" value={clientPaymentForm.amount} onChange={(e) => { setClientPaymentForm(f => ({ ...f, amount: e.target.value })); setPaymentError('') }} autoFocus /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Mode de paiement")}>
                  <TSelect value={clientPaymentForm.payment_method} onChange={(e) => setClientPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {PAY_METHODS.map(p => <option key={p.code} value={p.code}>{_uiNode(p.label)}</option>)}
                  </TSelect>
                </Field>
                <Field label={_ui("Référence")}><TInput value={clientPaymentForm.reference} onChange={(e) => setClientPaymentForm(f => ({ ...f, reference: e.target.value }))} /></Field>
              </div>
              {paymentError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-sm text-body-sm text-danger flex items-center gap-2">
                  <AlertCircle size={14} /> {paymentError}
                </div>
              )}
              <ModalFooter onCancel={resetModalState} onSave={saveClientPayment} loading={saving} disabled={!clientPaymentForm.amount} saveLabel={_ui("Encaisser")} />
            </div>
          )}
        </Modal>
      )}

      {modal === 'paiement_fournisseur' && selectedSupplierInvoice && (
        <Modal title={_ui("Régler une facture fournisseur")} onClose={resetModalState}>
          {done ? <SuccessMessage message={_ui("Paiement fournisseur enregistré !")} /> : (
            <div className="space-y-md">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-md">
                <div className="font-mono text-caption text-fg-secondary">{selectedSupplierInvoice.invoice_number} · {selectedSupplierInvoice.suppliers?.name}</div>
                <div className="mt-1 text-body-sm">
                  {" "}{_ui("À régler :")}{" "}<strong className="text-warning font-mono"><MoneyDisplay value={Math.max(Number(selectedSupplierInvoice.total_amount || 0) - Number(selectedSupplierInvoice.paid_amount || 0), 0)} /></strong>
                </div>
              </div>
              <Field label={_ui("Montant réglé")} required><TInput type="number" value={supplierPaymentForm.amount} onChange={(e) => { setSupplierPaymentForm(f => ({ ...f, amount: e.target.value })); setPaymentError('') }} autoFocus /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Field label={_ui("Mode de paiement")}>
                  <TSelect value={supplierPaymentForm.payment_method} onChange={(e) => setSupplierPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {PAY_METHODS.map(p => <option key={p.code} value={p.code}>{_uiNode(p.label)}</option>)}
                  </TSelect>
                </Field>
                <Field label={_ui("Référence")}><TInput value={supplierPaymentForm.reference} onChange={(e) => setSupplierPaymentForm(f => ({ ...f, reference: e.target.value }))} /></Field>
              </div>
              {paymentError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-sm text-body-sm text-danger flex items-center gap-2">
                  <AlertCircle size={14} /> {paymentError}
                </div>
              )}
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierPayment} loading={saving} disabled={!supplierPaymentForm.amount} saveLabel={_ui("Régler")} />
            </div>
          )}
        </Modal>
      )}

      {/* ─── HEADER ─── */}
      <PageHeader
        title={_ui("Factures")}
        subtitle={_ui("Trésorerie")}
        icon={Receipt}
        iconColor="#f43f5e"
        description={_ui("Crédit clients · Débit fournisseurs · Échéances")}
        actions={
          <>
          {(isAdmin||isPlatformAdmin)&&<Link href="/factures/integrations" className="btn btn-secondary"><TranslatedText text={"Connecteurs ERP — simulation"}/></Link>}
          <Button onClick={() => setModal(tab === 'clients' ? 'facture_client' : 'facture_fournisseur')} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> {tab === 'clients' ? _ui("Facture client") : _ui("Facture fournisseur")}
          </Button>
          </>
        }
      />

      {tab === 'fournisseurs' && activeDomain && <SupplierInvoiceImports key={activeDomain.domain_id} domain={activeDomain.domain_id}
        canUpload={hasPermission('achats', 'create')} onReview={entry => void reviewSupplierImport(entry)} />}
      {invoiceLoadError && <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
        <p>{_ui(invoiceLoadError)}</p>
        <Button variant="secondary" onClick={() => void load()}>{_ui('Réessayer')}</Button>
      </div>}
      <div hidden={Boolean(invoiceLoadError)}>
      {/* ─── KPI Trésorerie (5 hero) ─── */}
      {loading ? (
        <div className="itrix-kpis">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="itrix-kpis">
          <KPICard label={_ui("Encaissements")} icon={ArrowDownCircle} accent="#10b981" delay={0}    value={<MoneyDisplay value={treasury.collected}   compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD reçus" />
          <KPICard label={_ui("Paiements")}     icon={ArrowUpCircle}   accent="#f59e0b" delay={0.05} value={<MoneyDisplay value={treasury.paidOut}    compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD versés" />
          <KPICard label={_ui("Solde net")}     icon={treasury.net >= 0 ? TrendingUp : TrendingDown} accent={treasury.net >= 0 ? '#22c55e' : '#ef4444'} delay={0.1}
            value={<MoneyDisplay value={treasury.net} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />}
            sub={treasury.net >= 0 ? 'Excédent' : 'Déficit'}
          />
          <KPICard label={_ui("Créances")}      icon={Wallet}          accent="#3b82f6" delay={0.15} value={<MoneyDisplay value={treasury.receivables} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD à recevoir" />
          <KPICard label={_ui("Dettes")}        icon={AlertTriangle}   accent="#ef4444" delay={0.2}  value={<MoneyDisplay value={treasury.payables}    compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD à payer" />
        </div>
      )}

      {/* ─── Calendrier + Échéances (2 colonnes) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-md mb-md">
        {/* Calendrier */}
        <Card animate delay={0.25} padding="none" className="overflow-hidden">
          <div className="px-md py-sm border-b border-border flex flex-wrap gap-2 items-center justify-between">
            <div>
              <div className="font-display text-heading-sm font-bold text-fg-primary flex items-center gap-2">
                <Calendar size={14} className="text-info" /> {" "}{_ui("Calendrier")}{" "}</div>
              <div className="font-mono text-caption text-fg-tertiary mt-0.5">{_ui("Échéances du mois")}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button onClick={() => setCalendarMonthOffset(v => v - 1)} variant="ghost" size="icon-sm" title={_ui("Mois précédent")}>
                <ChevronLeft size={12} strokeWidth={2.2} />
              </Button>
              <div className="font-mono text-caption font-semibold text-fg-secondary text-center min-w-[88px] capitalize">
                {formatMonthLabel(calendarDate)}
              </div>
              <Button onClick={() => setCalendarMonthOffset(v => v + 1)} variant="ghost" size="icon-sm" title={_ui("Mois suivant")}>
                <ChevronRight size={12} strokeWidth={2.2} />
              </Button>
            </div>
          </div>
          <div className="p-sm">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {[_ui("Lun"), _ui("Mar"), _ui("Mer"), _ui("Jeu"), _ui("Ven"), _ui("Sam"), _ui("Dim")].map(d => (
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
                      {_uiNode(day.label)}
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
                          {new Date(`${day.iso}T00:00:00`).toLocaleDateString(_uiLocale, { day: '2-digit', month: 'long' })}
                        </div>
                        {day.events.map((e, i) => (
                          <div key={i} className="text-caption">
                            <Badge variant={e.kind === 'client' ? 'info' : 'warning'} size="xs">{e.kind === 'client' ? _ui("Crédit") : _ui("Débit")}</Badge>
                            <span className="ml-1.5 font-semibold">{_uiNode(e.label)}</span>
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
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-info" />{_ui("Crédit")}</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" />{_ui("Débit")}</span>
            </div>
          </div>
        </Card>

        {/* Prochaines échéances */}
        <Card animate delay={0.3} padding="none" className="itrix-table">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary flex items-center gap-2">
              <FileBarChart size={14} className="text-warning" /> {" "}{_ui("Prochaines échéances")}{" "}</div>
            <div className="font-mono text-caption text-fg-tertiary mt-0.5">{_ui("Top 12 par proximité")}</div>
          </div>
          {nextDue.length === 0 ? (
            <div className="p-xl text-center text-fg-tertiary text-body-sm">{_ui("Aucune échéance ouverte à venir.")}</div>
          ) : (
            <DataTable>
              <THead>
                <TR>
                  <TH>{_ui("Type")}</TH>
                  <TH>{_ui("Compte")}</TH>
                  <TH>{_ui("N° Facture")}</TH>
                  <TH>{_ui("Échéance")}</TH>
                  <TH right>{_ui("Jours")}</TH>
                  <TH right>{_ui("Montant")}</TH>
                </TR>
              </THead>
              <tbody>
                {nextDue.map((item, i) => (
                  <TR key={`${item.kind}-${item.invoice_number}-${i}`} animate delay={0.35 + i * 0.02}>
                    <TD>
                      <Badge variant={item.kind === 'client' ? 'info' : 'warning'} size="xs">
                        {item.kind === 'client' ? _ui("Crédit") : _ui("Débit")}
                      </Badge>
                    </TD>
                    <TD className="font-display font-semibold text-fg-primary">{_uiNode(item.label)}</TD>
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
          <div className="itrix-tabs itrix-invoice-tabs !mb-0 max-w-full">
            {[
              { k: 'clients' as InvoiceTab, l: 'Crédit clients', i: ArrowDownCircle, c: '#10b981' },
              { k: 'fournisseurs' as InvoiceTab, l: 'Débit fournisseurs', i: ArrowUpCircle, c: '#f59e0b' },
            ].map(t => {
              const Icon = t.i
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  aria-pressed={tab === t.k}
                  className={cn(
                    'flex items-center gap-2 h-8 px-md rounded font-mono text-caption uppercase tracking-wider font-semibold transition-all',
                    tab === t.k
                      ? 'text-white shadow-raised'
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-hover'
                  )}
                  style={tab === t.k ? { background: t.c } : undefined}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  <TranslatedText text={t.l}/>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="text-fg-tertiary flex-shrink-0" />
            <TInput
              placeholder={_ui("Rechercher numéro, {v0}…",{v0:String(tab === 'clients' ? 'client' : 'fournisseur')})}
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="border-none bg-transparent focus:ring-0 px-0"
            />
            {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
          </div>

          {tab === 'clients' ? (
            <TSelect aria-label={_ui("Filtrer par client")} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-8 w-auto min-w-[180px] text-body-sm">
              <option value="all">{_ui("Tous les clients")}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </TSelect>
          ) : (
            <TSelect aria-label={_ui("Filtrer par fournisseur")} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-8 w-auto min-w-[180px] text-body-sm">
              <option value="all">{_ui("Tous les fournisseurs")}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </TSelect>
          )}

          <TSelect aria-label={_ui("Statut des factures")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-auto min-w-[150px] text-body-sm">
            <option value="all">{_ui("Tous statuts")}</option>
            <option value="en_attente">{_ui("En attente")}</option>
            <option value="partiellement_paye">{_ui("Partiel")}</option>
            <option value="en_retard">{_ui("En retard")}</option>
            <option value="paye">{_ui("Payée")}</option>
          </TSelect>
        </div>
      </Card>

      {/* ─── KPI tab spécifique ─── */}
      {!loading && (
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
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{_uiNode(kpi.label)}</span>
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
      {balance.length > 0 && (
        <Card animate delay={0.45} padding="none" className="itrix-table mb-md">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary">
              {" "}{_ui("Synthèse")}{" "}<TranslatedText text={tab === 'clients' ? 'clients' : 'fournisseurs'}/>
            </div>
          </div>
          <DataTable>
            <THead>
              <TR>
                <TH>{_ui("Compte")}</TH>
                <TH right>{_ui("Factures")}</TH>
                <TH right>{_ui("Total")}</TH>
                <TH right>{tab === 'clients' ? _ui("Encaissé") : _ui("Réglé")}</TH>
                <TH right>{_ui("Encours")}</TH>
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

      {/* ─── Bandeau diagnostic : factures cachées par un filtre ─── */}
      {!loading && (() => {
        const totalRaw = tab === 'clients' ? clientInvoices.length : supplierInvoices.length
        const totalShown = tab === 'clients' ? filteredClient.length : filteredSupplier.length
        const hiddenCount = totalRaw - totalShown
        if (hiddenCount > 0 && (clientFilter !== 'all' || supplierFilter !== 'all' || statusFilter !== 'all' || search)) {
          return (
            <div role="status" className="itrix-notice mb-md border border-warning bg-warning/10 flex flex-wrap items-center justify-between gap-md">
              <div className="text-body-sm text-fg-primary">
                <AlertCircle size={14} className="inline mr-1 text-warning" />
                <strong>{hiddenCount}</strong> {" "}{_ui("facture(s) cachée(s) par les filtres actifs")}{" "}{search && <span className="font-mono text-xs ml-2">{_ui("[recherche: \"")}{search}"]</span>}
                {clientFilter !== 'all' && tab === 'clients' && <span className="font-mono text-xs ml-2">{_ui("[client filtré]")}</span>}
                {statusFilter !== 'all' && <span className="font-mono text-xs ml-2">{_ui("[statut:")}{" "}{statusFilter}]</span>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setClientFilter('all'); setSupplierFilter('all'); setStatusFilter('all') }}
              >
                <X size={12} /> {" "}{_ui("Réinitialiser")}{" "}</Button>
            </div>
          )
        }
        return null
      })()}

      {/* ─── Table principale ─── */}
      <Card animate delay={0.5} padding="none" className="itrix-table">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (tab === 'clients' ? filteredClient : filteredSupplier).length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={tab === 'clients' ? _ui("Aucune facture client") : _ui("Aucune facture fournisseur")}
            description={_ui("Les factures s'afficheront ici.")}
            action={<Button onClick={() => setModal(tab === 'clients' ? 'facture_client' : 'facture_fournisseur')}><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle")}</Button>}
          />
        ) : (
          <DataTable minWidth={tab === 'clients' ? 1100 : 1200}>
            <THead>
              <TR>
                <TH>{_ui("N° Facture")}</TH>
                <TH>{tab === 'clients' ? _ui("Client") : _ui("Fournisseur")}</TH>
                {tab === 'fournisseurs' && <TH>{_ui("Catégorie")}</TH>}
                <TH>{_ui("Date")}</TH>
                <TH>{_ui("Échéance")}</TH>
                <TH right>{_ui("Montant")}</TH>
                <TH right>{tab === 'clients' ? _ui("Encaissé") : _ui("Réglé")}</TH>
                <TH right>{_ui("Reste")}</TH>
                <TH>{_ui("Statut")}</TH>
                <TH right>{_ui("Actions")}</TH>
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
                    <TD><Badge variant={st.variant} size="sm">{_uiNode(st.label)}</Badge></TD>
                    <TD right>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {activeDomain&&<InvoiceDocumentActions id={item.id} kind={tab==='clients'?'client':'fournisseur'} domain={activeDomain.domain_id}/>}
                        {item.effectiveStatus !== 'paye' && <Button size="xs" variant={tab==='clients'?'primary':'secondary'} onClick={()=>{
                          setPaymentError('')
                          if(tab==='clients'){setSelectedClientInvoice(item);setModal('paiement_client')}
                          else {setSelectedSupplierInvoice(item);setModal('paiement_fournisseur')}
                        }}>{tab==='clients'?_ui("Encaisser"):_ui("Régler")}</Button>}
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
    </div>
  )
}
