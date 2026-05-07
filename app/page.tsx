'use client'
/**
 * DASHBOARD CEO — Synthèse exécutive « comprendre en 5 secondes ».
 *
 * Philosophie « Big Four » :
 *   1. Status banner global (santé du domaine en 1 phrase)
 *   2. 4 KPI hero financiers (avec variance vs Budget + N-1 si dispo)
 *   3. Actions prioritaires triées par impact € (computed)
 *   4. Santé production : yield vs cible, mix qualité, top/flop serres
 *   5. Tendance 30 jours (CA · Production · Coûts · Marge)
 *   6. P&L compact YTD + Structure du CA
 *
 * Tout est calculé côté client à partir des données existantes — pas de nouveaux
 * endpoints requis. Filtre temporel : Mois en cours par défaut (= ce que le CEO
 * regarde en premier le matin), avec toggle pour basculer en semaine ou personnalisé.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Area, AreaChart,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Coins, Sprout, Award, Receipt, AlertTriangle,
  Activity, Target, Calendar, ChevronRight, Leaf, Zap, LineChart as LineIcon,
  Banknote, Boxes, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertCircle,
  XCircle, ArrowRight, Globe, Package, Users, ShieldAlert, Eye,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { formatMoney, formatWeight, formatPercent } from '@/lib/format'
import { useAuthReady, useRefreshOnEvent } from '@/lib/useAuthGuard'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { KPICard } from '@/components/ui/KPICard'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { MoneyDisplay, VolumeDisplay } from '@/components/display'

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════
type HarvestRow = {
  id: string; harvest_date: string | null; total_qty: number | null
  qty_category_1: number | null; qty_category_2: number | null; qty_category_3: number | null
  qty_waste: number | null; lot_number: string | null; campaign_planting_id: string | null
}
type PlantingRow = {
  id: string; greenhouse_id: string | null; variety_id: string | null
  planted_area: number | null; target_yield_per_m2: number | null; target_total_production: number | null
}
type GreenhouseRow = { id: string; code: string | null; name: string | null; total_area: number | null; exploitable_area: number | null }
type InvoiceRow = { status: string | null; total_amount: number | null; paid_amount: number | null; invoice_date: string | null; due_date: string | null; clients?: { name: string | null } | null }
type SupplierInvRow = { total_amount: number | null; paid_amount: number | null; invoice_date: string | null; due_date: string | null }
type CostEntryRow = { cost_category: string | null; amount: number | null; is_planned: boolean | null; entry_date: string | null; account_categories?: { type: string | null } | null }
type CampaignRow = { id: string; name: string; status: string | null; production_target_kg: number | null; preparation_start: string | null; campaign_end: string | null; budget_total: number | null }
type DispatchRow = { id: string; quantity_kg: number | null; notes: string | null; created_at: string }
type AlertRow = { id: string; type: string | null; level: string | null; message: string | null; created_at: string }
type StockItem = { id: string; name: string; current_qty: number | null; min_qty: number | null; unit: string | null }
type VarietyRow = { id: string; commercial_name: string | null }

type DashboardData = {
  harvests: HarvestRow[]
  plantings: PlantingRow[]
  greenhouses: GreenhouseRow[]
  varieties: VarietyRow[]
  invoices: InvoiceRow[]
  supplierInvoices: SupplierInvRow[]
  costEntries: CostEntryRow[]
  campaigns: CampaignRow[]
  dispatches: DispatchRow[]
  alerts: AlertRow[]
  stockItems: StockItem[]
  workersCount: number
}

const EMPTY_DATA: DashboardData = {
  harvests: [], plantings: [], greenhouses: [], varieties: [], invoices: [],
  supplierInvoices: [], costEntries: [], campaigns: [], dispatches: [], alerts: [], stockItems: [], workersCount: 0,
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
const toNumber = (v: any) => (typeof v === 'number' && !isNaN(v) ? v : 0)
const normalizeDate = (v: string | null | undefined) => v ? v.slice(0, 10) : ''
const parseMeta = (s: string | null): any => { try { return JSON.parse(s || '{}') } catch { return {} } }

function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function endOfMonth(d = new Date())   { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function daysAgo(n: number, d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) }
function diffDays(a: string, b: string) { return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) }
function isInRange(d: string | null | undefined, from: string, to: string) {
  const n = normalizeDate(d); return !!(n && n >= from && n <= to)
}

// Statut basé sur seuils business (vert/ambre/rouge)
type Health = 'good' | 'warning' | 'critical'
const healthColor = (h: Health) => h === 'good' ? '#10b981' : h === 'warning' ? '#f59e0b' : '#ef4444'

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())

  const { ready: authReady } = useAuthReady()
  const [reloadKey, setReloadKey] = useState(0)
  useRefreshOnEvent(() => setReloadKey(k => k + 1))

  // Horloge live
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── Chargement data (auth-guarded + refresh-aware) ───
  useEffect(() => {
    if (!authReady) return
    let mounted = true
    async function load() {
      setLoading(true)
      const monthStart = startOfMonth()
      const monthEnd = endOfMonth()
      const fromStart = daysAgo(180)  // 6 mois pour la tendance

      const [
        harvestsRes, plantingsRes, ghsRes, varietiesRes,
        invoicesRes, supplierInvRes, costsRes, campaignsRes,
        dispatchesRes, alertsRes, stockRes, workersRes,
      ] = await Promise.all([
        supabase.from('harvests')
          .select('id, harvest_date, total_qty, qty_category_1, qty_category_2, qty_category_3, qty_waste, lot_number, campaign_planting_id')
          .gte('harvest_date', fromStart)
          .order('harvest_date', { ascending: false }).limit(300),
        supabase.from('campaign_plantings')
          .select('id, greenhouse_id, variety_id, planted_area, target_yield_per_m2, target_total_production'),
        supabase.from('greenhouses').select('id, code, name, total_area, exploitable_area'),
        supabase.from('varieties').select('id, commercial_name').eq('is_active', true),
        supabase.from('invoices')
          .select('status, total_amount, paid_amount, invoice_date, due_date, clients(name)')
          .gte('invoice_date', fromStart)
          .order('invoice_date', { ascending: false }).limit(200),
        supabase.from('supplier_invoices')
          .select('total_amount, paid_amount, invoice_date, due_date')
          .gte('invoice_date', fromStart).limit(200),
        supabase.from('cost_entries')
          .select('cost_category, amount, is_planned, entry_date, account_categories(type)')
          .gte('entry_date', fromStart)
          .order('entry_date', { ascending: false }).limit(500),
        supabase.from('campaigns')
          .select('id, name, status, production_target_kg, preparation_start, campaign_end, budget_total')
          .order('preparation_start', { ascending: false, nullsFirst: false }).limit(5),
        supabase.from('harvest_lots')
          .select('id, quantity_kg, notes, created_at')
          .eq('category', 'station_dispatch')
          .gte('created_at', fromStart)
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('alerts').select('id, type, level, message, created_at').eq('is_resolved', false).order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_items').select('id, name, current_qty, min_qty, unit').eq('is_active', true).limit(200),
        supabase.from('workers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      if (!mounted) return

      setData({
        harvests: (harvestsRes.data ?? []) as any,
        plantings: (plantingsRes.data ?? []) as any,
        greenhouses: (ghsRes.data ?? []) as any,
        varieties: (varietiesRes.data ?? []) as any,
        invoices: (invoicesRes.data ?? []) as any,
        supplierInvoices: (supplierInvRes.data ?? []) as any,
        costEntries: (costsRes.data ?? []) as any,
        campaigns: (campaignsRes.data ?? []) as any,
        dispatches: (dispatchesRes.data ?? []) as any,
        alerts: (alertsRes.data ?? []) as any,
        stockItems: (stockRes.data ?? []) as any,
        workersCount: workersRes.count ?? 0,
      })
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [authReady, reloadKey])

  // ════════════════════════════════════════════════════════════════════════
  // MÉTRIQUES CALCULÉES (cœur de la valeur exécutive)
  // ════════════════════════════════════════════════════════════════════════
  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = startOfMonth()
    const monthEnd = endOfMonth()
    const last30 = daysAgo(30)
    const last60 = daysAgo(60)
    const prev30Start = daysAgo(60)
    const prev30End = daysAgo(31)

    // ─── PRODUCTION ─────────────────────────────────────────────────
    const harvestsMonth = data.harvests.filter(h => isInRange(h.harvest_date, monthStart, monthEnd))
    const harvests30 = data.harvests.filter(h => isInRange(h.harvest_date, last30, today))
    const harvestsPrev30 = data.harvests.filter(h => isInRange(h.harvest_date, prev30Start, prev30End))

    const prodMonth = harvestsMonth.reduce((s, h) => s + toNumber(h.total_qty), 0)
    const prod30 = harvests30.reduce((s, h) => s + toNumber(h.total_qty), 0)
    const prodPrev30 = harvestsPrev30.reduce((s, h) => s + toNumber(h.total_qty), 0)
    const prodTrend = prodPrev30 > 0 ? ((prod30 - prodPrev30) / prodPrev30) * 100 : 0

    const cat1 = harvestsMonth.reduce((s, h) => s + toNumber(h.qty_category_1), 0)
    const cat2 = harvestsMonth.reduce((s, h) => s + toNumber(h.qty_category_2), 0)
    const cat3 = harvestsMonth.reduce((s, h) => s + toNumber(h.qty_category_3), 0)
    const waste = harvestsMonth.reduce((s, h) => s + toNumber(h.qty_waste), 0)
    const totalQ = cat1 + cat2 + cat3 + waste
    const premiumRate = totalQ > 0 ? (cat1 / totalQ) * 100 : 0
    const wasteRate = totalQ > 0 ? (waste / totalQ) * 100 : 0

    // Yield kg/m² actuel vs cible (sur les plantations actives)
    const activePlantings = data.plantings.filter(p => toNumber(p.target_yield_per_m2) > 0 && toNumber(p.planted_area) > 0)
    const totalPlantedArea = activePlantings.reduce((s, p) => s + toNumber(p.planted_area), 0)
    const totalTargetProd = activePlantings.reduce((s, p) => s + toNumber(p.target_total_production), 0)
    // yield réalisé = production totale (sur la campagne) / surface plantée
    const allHarvests = data.harvests.reduce((s, h) => s + toNumber(h.total_qty), 0)
    const yieldKgM2 = totalPlantedArea > 0 ? allHarvests / totalPlantedArea : 0
    const targetYield = activePlantings.length > 0
      ? activePlantings.reduce((s, p) => s + toNumber(p.target_yield_per_m2) * toNumber(p.planted_area), 0) / totalPlantedArea
      : 0
    const yieldRatio = targetYield > 0 ? (yieldKgM2 / targetYield) * 100 : 0

    // ─── COMMERCE ──────────────────────────────────────────────────
    // CA confirmé (dispatches avec ca_amount dans notes)
    const dispatchesMonth = data.dispatches.filter(d => isInRange(d.created_at?.slice(0, 10) ?? null, monthStart, monthEnd))
    const caDispatches = data.dispatches.reduce((s, d) => s + toNumber(parseMeta(d.notes).ca_amount), 0)
    const caMonth = dispatchesMonth.reduce((s, d) => s + toNumber(parseMeta(d.notes).ca_amount), 0)
    const dispatchesNoPriceCount = data.dispatches.filter(d => {
      const meta = parseMeta(d.notes)
      return !meta.ca_amount && toNumber(d.quantity_kg) > 0
    }).length

    // Factures clients
    const invMonth = data.invoices.filter(i => isInRange(i.invoice_date, monthStart, monthEnd))
    const totalInvoiced = data.invoices.reduce((s, i) => s + toNumber(i.total_amount), 0)
    const totalCollected = data.invoices.reduce((s, i) => s + toNumber(i.paid_amount), 0)
    const totalReceivable = data.invoices.reduce((s, i) => s + Math.max(toNumber(i.total_amount) - toNumber(i.paid_amount), 0), 0)
    const overdueInvoices = data.invoices.filter(i => {
      const remain = toNumber(i.total_amount) - toNumber(i.paid_amount)
      const due = normalizeDate(i.due_date)
      return remain > 0 && due && due < today
    })
    const overdueAmount = overdueInvoices.reduce((s, i) => s + Math.max(toNumber(i.total_amount) - toNumber(i.paid_amount), 0), 0)

    // Encours client par client
    const receivablesByClient: Map<string, number> = new Map()
    data.invoices.forEach(i => {
      const remain = Math.max(toNumber(i.total_amount) - toNumber(i.paid_amount), 0)
      if (remain > 0) {
        const name = i.clients?.name ?? '—'
        receivablesByClient.set(name, (receivablesByClient.get(name) ?? 0) + remain)
      }
    })
    const topReceivables = Array.from(receivablesByClient.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 3)

    // ─── COÛTS / TRÉSORERIE ──────────────────────────────────────────
    const costsMonth = data.costEntries.filter(c => !c.is_planned && isInRange(c.entry_date, monthStart, monthEnd))
    const costs30 = data.costEntries.filter(c => !c.is_planned && isInRange(c.entry_date, last30, today))
    const totalCostsMonth = costsMonth.reduce((s, c) => s + toNumber(c.amount), 0)
    const totalCosts30 = costs30.reduce((s, c) => s + toNumber(c.amount), 0)
    const totalCostsAll = data.costEntries.filter(c => !c.is_planned).reduce((s, c) => s + toNumber(c.amount), 0)

    // Coûts par type comptable
    const costsByType: Record<string, number> = {}
    data.costEntries.filter(c => !c.is_planned).forEach(c => {
      const t = c.account_categories?.type ?? 'autre'
      costsByType[t] = (costsByType[t] ?? 0) + toNumber(c.amount)
    })

    // Trésorerie : encaissé - payé fournisseurs
    const totalPaidOut = data.supplierInvoices.reduce((s, i) => s + toNumber(i.paid_amount), 0)
    const totalToPay = data.supplierInvoices.reduce((s, i) => s + Math.max(toNumber(i.total_amount) - toNumber(i.paid_amount), 0), 0)
    const cashPosition = totalCollected - totalPaidOut

    // ─── MARGE BRUTE ───────────────────────────────────────────────
    // CA = invoices facturées + dispatches confirmés (préférence dispatches pour le réel terrain)
    const caTotal = totalInvoiced + caDispatches
    const margeBrute = caTotal - totalCostsAll
    const margePct = caTotal > 0 ? (margeBrute / caTotal) * 100 : 0

    // ─── EBITDA YTD vs Budget annuel campagne ────────────────────────
    const activeCampaign = data.campaigns.find(c => c.status === 'en_cours') ?? data.campaigns[0]
    const budgetTotal = toNumber(activeCampaign?.budget_total)
    const targetProd = toNumber(activeCampaign?.production_target_kg)
    // Variance budget : différence entre coûts réels et budget attendu prorata
    let budgetProgressPct = 0
    if (activeCampaign?.preparation_start && activeCampaign?.campaign_end) {
      const totalDays = diffDays(activeCampaign.preparation_start, activeCampaign.campaign_end)
      const elapsedDays = Math.max(0, diffDays(activeCampaign.preparation_start, today))
      budgetProgressPct = totalDays > 0 ? Math.min(100, (elapsedDays / totalDays) * 100) : 0
    }
    const expectedCostsByNow = (budgetTotal * budgetProgressPct) / 100
    const costsVsBudgetPct = expectedCostsByNow > 0 ? ((totalCostsAll - expectedCostsByNow) / expectedCostsByNow) * 100 : 0

    // ─── PERFORMANCE PAR SERRE ──────────────────────────────────────
    const ghMap = new Map(data.greenhouses.map(g => [g.id, g]))
    const plantingMap = new Map(data.plantings.map(p => [p.id, p]))
    type GhPerf = { ghId: string; ghCode: string; ghName: string; production: number; targetProd: number; ratio: number; area: number }
    const perfByGh = new Map<string, GhPerf>()

    data.harvests.forEach(h => {
      if (!h.campaign_planting_id) return
      const planting = plantingMap.get(h.campaign_planting_id)
      if (!planting?.greenhouse_id) return
      const gh = ghMap.get(planting.greenhouse_id)
      if (!gh) return
      const cur = perfByGh.get(gh.id) ?? {
        ghId: gh.id, ghCode: gh.code ?? '?', ghName: gh.name ?? '',
        production: 0, targetProd: 0, ratio: 0, area: 0,
      }
      cur.production += toNumber(h.total_qty)
      perfByGh.set(gh.id, cur)
    })

    // Compute targets per greenhouse
    data.plantings.forEach(p => {
      if (!p.greenhouse_id) return
      const gh = ghMap.get(p.greenhouse_id)
      if (!gh) return
      const cur = perfByGh.get(gh.id) ?? {
        ghId: gh.id, ghCode: gh.code ?? '?', ghName: gh.name ?? '',
        production: 0, targetProd: 0, ratio: 0, area: 0,
      }
      cur.targetProd += toNumber(p.target_total_production)
      cur.area += toNumber(p.planted_area)
      perfByGh.set(gh.id, cur)
    })

    // Compute ratio + filter only those with both data points
    const ghPerfList = Array.from(perfByGh.values())
      .filter(g => g.targetProd > 0)
      .map(g => ({ ...g, ratio: (g.production / g.targetProd) * 100 }))
      .sort((a, b) => b.ratio - a.ratio)

    const topGh = ghPerfList.slice(0, 3)
    const flopGh = [...ghPerfList].reverse().slice(0, 3)

    // ─── STOCKS EN ALERTE ──────────────────────────────────────────
    const stockAlerts = data.stockItems.filter(s => toNumber(s.min_qty) > 0 && toNumber(s.current_qty) <= toNumber(s.min_qty))

    // ─── ACTIONS PRIORITAIRES (smart alerts) ────────────────────────
    const actions: Array<{ priority: 1 | 2 | 3; impact?: number; title: string; subtitle: string; href: string; icon: any; color: string }> = []

    if (dispatchesNoPriceCount > 0) {
      // Estimation : on prend la moyenne des prix des dispatches qui ont un prix
      const dispatchesWithPrice = data.dispatches.filter(d => toNumber(parseMeta(d.notes).ca_amount) > 0)
      const avgKgPrice = dispatchesWithPrice.length > 0
        ? dispatchesWithPrice.reduce((s, d) => s + toNumber(parseMeta(d.notes).ca_amount), 0)
          / dispatchesWithPrice.reduce((s, d) => s + Math.max(toNumber(d.quantity_kg), 1), 0)
        : 0
      const estimatedKg = data.dispatches.filter(d => !parseMeta(d.notes).ca_amount).reduce((s, d) => s + toNumber(d.quantity_kg), 0)
      const estimatedCA = estimatedKg * avgKgPrice
      actions.push({
        priority: 1,
        impact: estimatedCA,
        title: `${dispatchesNoPriceCount} dispatch${dispatchesNoPriceCount > 1 ? 'es' : ''} sans prix`,
        subtitle: `Saisir les prix pour libérer ~${formatMoney(estimatedCA, { compact: 'auto' })} de CA`,
        href: '/recoltes',
        icon: Receipt,
        color: '#ef4444',
      })
    }
    if (overdueAmount > 0) {
      actions.push({
        priority: 1,
        impact: overdueAmount,
        title: `${overdueInvoices.length} facture${overdueInvoices.length > 1 ? 's' : ''} en retard`,
        subtitle: `${formatMoney(overdueAmount, { compact: 'auto' })} à recouvrer`,
        href: '/factures',
        icon: AlertTriangle,
        color: '#ef4444',
      })
    }
    if (stockAlerts.length > 0) {
      actions.push({
        priority: 2,
        title: `${stockAlerts.length} article${stockAlerts.length > 1 ? 's' : ''} sous le seuil`,
        subtitle: stockAlerts.slice(0, 2).map(s => s.name).join(', ') + (stockAlerts.length > 2 ? '…' : ''),
        href: '/stocks',
        icon: Package,
        color: '#f59e0b',
      })
    }
    if (costsVsBudgetPct > 10) {
      actions.push({
        priority: 2,
        impact: totalCostsAll - expectedCostsByNow,
        title: `Coûts +${costsVsBudgetPct.toFixed(0)}% vs budget`,
        subtitle: `Dérive de ${formatMoney(totalCostsAll - expectedCostsByNow, { compact: 'auto' })}`,
        href: '/admin/compte-exploitation',
        icon: TrendingUp,
        color: '#f59e0b',
      })
    }
    if (yieldRatio < 80 && totalPlantedArea > 0) {
      actions.push({
        priority: 2,
        title: `Yield ${yieldRatio.toFixed(0)}% de la cible`,
        subtitle: `${yieldKgM2.toFixed(1)} kg/m² réalisé · cible ${targetYield.toFixed(1)} kg/m²`,
        href: '/production',
        icon: Sprout,
        color: '#f59e0b',
      })
    }
    if (data.alerts.length > 0) {
      const critical = data.alerts.filter(a => a.level === 'critical' || a.level === 'high')
      if (critical.length > 0) {
        actions.push({
          priority: 1,
          title: `${critical.length} alerte${critical.length > 1 ? 's' : ''} critique${critical.length > 1 ? 's' : ''}`,
          subtitle: critical[0]?.message ?? 'Voir le détail',
          href: '/alertes',
          icon: ShieldAlert,
          color: '#ef4444',
        })
      }
    }
    if (premiumRate < 50 && totalQ > 0) {
      actions.push({
        priority: 3,
        title: `Premium à ${premiumRate.toFixed(0)}% (cible 60%+)`,
        subtitle: `${formatWeight(cat1)} en Cat. 1 sur ${formatWeight(totalQ)}`,
        href: '/recoltes',
        icon: Award,
        color: '#f59e0b',
      })
    }
    if (wasteRate > 8 && totalQ > 0) {
      actions.push({
        priority: 2,
        title: `Taux de perte élevé : ${wasteRate.toFixed(1)}%`,
        subtitle: `${formatWeight(waste)} de déchets`,
        href: '/recoltes',
        icon: AlertCircle,
        color: '#ef4444',
      })
    }

    // Tri par priorité puis impact
    actions.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return (b.impact ?? 0) - (a.impact ?? 0)
    })

    // ─── TENDANCE 30 JOURS (8 buckets, ~4 jours chacun) ──────────────
    type TrendBucket = { label: string; sortKey: string; production: number; ca: number; couts: number }
    const trendMap = new Map<string, TrendBucket>()
    for (let i = 0; i < 30; i += 4) {
      const dt = daysAgo(29 - i)
      const key = dt.slice(5)  // "MM-DD"
      trendMap.set(dt, {
        label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(dt + 'T00:00:00')),
        sortKey: dt, production: 0, ca: 0, couts: 0,
      })
    }
    const findBucket = (d: string) => {
      const keys = Array.from(trendMap.keys()).sort()
      for (let i = keys.length - 1; i >= 0; i--) {
        if (d >= keys[i]) return keys[i]
      }
      return null
    }
    data.harvests.forEach(h => {
      const d = normalizeDate(h.harvest_date); if (!d) return
      const k = findBucket(d); if (!k) return
      const b = trendMap.get(k); if (!b) return
      b.production += toNumber(h.total_qty)
    })
    data.dispatches.forEach(dp => {
      const d = normalizeDate(dp.created_at); if (!d) return
      const k = findBucket(d); if (!k) return
      const b = trendMap.get(k); if (!b) return
      b.ca += toNumber(parseMeta(dp.notes).ca_amount)
    })
    data.costEntries.filter(c => !c.is_planned).forEach(c => {
      const d = normalizeDate(c.entry_date); if (!d) return
      const k = findBucket(d); if (!k) return
      const b = trendMap.get(k); if (!b) return
      b.couts += toNumber(c.amount)
    })
    const trendData = Array.from(trendMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))

    // ─── HEALTH STATUS GLOBAL ─────────────────────────────────────
    let health: Health = 'good'
    let healthMessage = '✅ Le domaine performe bien'
    if (actions.filter(a => a.priority === 1).length >= 1) {
      health = 'critical'
      healthMessage = '🚨 Actions urgentes à traiter'
    } else if (actions.filter(a => a.priority <= 2).length >= 2 || costsVsBudgetPct > 15) {
      health = 'warning'
      healthMessage = '⚠ Plusieurs points méritent votre attention'
    } else if (margePct < 0) {
      health = 'critical'
      healthMessage = '🚨 Marge brute négative — diagnostic urgent'
    }

    // Phrase de synthèse contextuelle
    const synthesis: string[] = []
    if (margeBrute > 0) synthesis.push(`Marge brute ${formatMoney(margeBrute, { compact: 'auto' })} (${margePct.toFixed(1)}%)`)
    else synthesis.push(`⚠ Marge brute négative ${formatMoney(margeBrute, { compact: 'auto' })}`)
    if (prodTrend !== 0) synthesis.push(`Production ${prodTrend > 0 ? '+' : ''}${prodTrend.toFixed(1)}% sur 30j`)
    if (yieldRatio > 0) synthesis.push(`Yield ${yieldRatio.toFixed(0)}% de la cible`)

    return {
      // Production
      prodMonth, prod30, prodPrev30, prodTrend,
      cat1, cat2, cat3, waste, totalQ, premiumRate, wasteRate,
      yieldKgM2, targetYield, yieldRatio, totalPlantedArea,
      allHarvests, totalTargetProd,
      // Commerce
      caDispatches, caMonth, caTotal, dispatchesNoPriceCount,
      totalInvoiced, totalCollected, totalReceivable, overdueAmount, overdueInvoices,
      topReceivables,
      // Coûts
      totalCostsMonth, totalCosts30, totalCostsAll, costsByType,
      cashPosition, totalPaidOut, totalToPay,
      // Marge
      margeBrute, margePct,
      // Budget
      activeCampaign, budgetTotal, targetProd, budgetProgressPct, expectedCostsByNow, costsVsBudgetPct,
      // Performance
      ghPerfList, topGh, flopGh,
      // Stocks / RH
      stockAlerts, workersCount: data.workersCount,
      // Actions
      actions, alerts: data.alerts,
      // Trends
      trendData,
      // Health
      health, healthMessage, synthesis,
    }
  }, [data])

  // ════════════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════════════
  if (loading) return <DashboardSkeleton />

  return (
    <div className="relative z-[1] flex flex-col gap-lg pb-2xl">

      {/* ═══════════ STATUS BANNER (santé globale du domaine) ═══════════ */}
      <HealthBanner
        health={metrics.health}
        message={metrics.healthMessage}
        synthesis={metrics.synthesis}
        time={time}
        campaign={metrics.activeCampaign}
        budgetProgressPct={metrics.budgetProgressPct}
      />

      {/* ═══════════ 4 KPI HERO FINANCIERS ═══════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <KPICard
          label="Marge brute"
          icon={metrics.margeBrute >= 0 ? TrendingUp : TrendingDown}
          accent={metrics.margeBrute >= 0 ? '#10b981' : '#ef4444'}
          value={<MoneyDisplay value={metrics.margeBrute} compact="auto" showCurrency={false} className="!text-current font-display !text-display-lg" />}
          sub={`${metrics.margePct.toFixed(1)}% du CA · CA ${formatMoney(metrics.caTotal, { compact: 'auto' })}`}
          variant="hero"
          delay={0}
        />
        <KPICard
          label="Trésorerie nette"
          icon={Wallet}
          accent={metrics.cashPosition >= 0 ? '#3b82f6' : '#ef4444'}
          value={<MoneyDisplay value={metrics.cashPosition} compact="auto" showCurrency={false} className="!text-current font-display !text-display-lg" />}
          sub={`Encaissé ${formatMoney(metrics.totalCollected, { compact: 'auto' })} − Payé ${formatMoney(metrics.totalPaidOut, { compact: 'auto' })}`}
          variant="hero"
          delay={0.05}
        />
        <KPICard
          label="Créances clients"
          icon={Receipt}
          accent={metrics.overdueAmount > 0 ? '#f59e0b' : '#10b981'}
          value={<MoneyDisplay value={metrics.totalReceivable} compact="auto" showCurrency={false} className="!text-current font-display !text-display-lg" />}
          sub={metrics.overdueAmount > 0 ? `⚠ ${formatMoney(metrics.overdueAmount, { compact: 'auto' })} en retard` : 'Aucun retard'}
          variant="hero"
          delay={0.1}
        />
        <KPICard
          label="Coûts vs Budget"
          icon={metrics.costsVsBudgetPct > 5 ? TrendingUp : metrics.costsVsBudgetPct < -5 ? TrendingDown : Activity}
          accent={Math.abs(metrics.costsVsBudgetPct) <= 5 ? '#10b981' : metrics.costsVsBudgetPct > 10 ? '#ef4444' : '#f59e0b'}
          value={<span className="font-display !text-display-lg">{metrics.costsVsBudgetPct > 0 ? '+' : ''}{metrics.costsVsBudgetPct.toFixed(1)}%</span>}
          sub={`Engagé ${formatMoney(metrics.totalCostsAll, { compact: 'auto' })} · Budget ${formatMoney(metrics.expectedCostsByNow, { compact: 'auto' })}`}
          variant="hero"
          delay={0.15}
        />
      </div>

      {/* ═══════════ 2 COLONNES : ACTIONS PRIORITAIRES + SANTÉ PRODUCTION ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-md">
        <ActionsCard actions={metrics.actions} />
        <ProductionHealthCard metrics={metrics} />
      </div>

      {/* ═══════════ TENDANCE 30 JOURS ═══════════ */}
      <Card animate delay={0.25}>
        <SectionLabel icon={LineIcon} color="#6366f1">Tendance 30 jours · Production / CA / Coûts</SectionLabel>
        <div className="h-72 mt-md -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics.trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
              <YAxis yAxisId="kg" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
              <YAxis yAxisId="mad" orientation="right" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
              <RTooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: 'var(--shadow-floating)' }}
                labelStyle={{ color: 'var(--tx-2)', fontWeight: 600 }}
                formatter={(v: number, n: string) => n === 'Production' ? [formatWeight(v), n] : [formatMoney(v, { compact: 'auto' }), n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
              <Line yAxisId="kg"  type="monotone" dataKey="production" name="Production" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="mad" type="monotone" dataKey="ca"         name="CA"         stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="mad" type="monotone" dataKey="couts"      name="Coûts"      stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ═══════════ TOP/FLOP SERRES + STRUCTURE CA ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <PerformersCard kind="top" items={metrics.topGh} />
        <PerformersCard kind="flop" items={metrics.flopGh} />
        <RevenueStructureCard
          dispatchesCA={metrics.caDispatches}
          invoicedCA={metrics.totalInvoiced - metrics.caDispatches}
          margeBrute={metrics.margeBrute}
          totalCostsAll={metrics.totalCostsAll}
        />
      </div>

      {/* ═══════════ P&L COMPACT YTD ═══════════ */}
      <PLCompactCard metrics={metrics} />

      {/* ═══════════ FOOTER : NAVIGATION CONTEXTUELLE ═══════════ */}
      <div className="flex flex-wrap gap-xs justify-center pt-md">
        {[
          { l: 'Compte d\'exploitation', h: '/admin/compte-exploitation', i: LineIcon },
          { l: 'Plan de culture',        h: '/plan-culture',              i: Leaf },
          { l: 'Récoltes',               h: '/recoltes',                  i: Sprout },
          { l: 'Factures',               h: '/factures',                  i: Receipt },
        ].map(item => {
          const Icon = item.i
          return (
            <Link key={item.h} href={item.h}
              className="inline-flex items-center gap-1.5 px-md py-1.5 rounded-full border border-border bg-surface-raised text-fg-secondary hover:border-border-strong hover:text-fg-primary hover:-translate-y-0.5 transition-all duration-150 text-caption">
              <Icon size={11} strokeWidth={2.2} />
              {item.l}
              <ArrowUpRight size={10} className="opacity-60" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════════════════

// ─── Banner statut global ─────────────────────────────────────────────
function HealthBanner({ health, message, synthesis, time, campaign, budgetProgressPct }: {
  health: Health; message: string; synthesis: string[]; time: Date
  campaign: any; budgetProgressPct: number
}) {
  const color = healthColor(health)
  const Icon = health === 'good' ? CheckCircle2 : health === 'warning' ? AlertCircle : XCircle
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <Card
        variant="gradient"
        className="relative overflow-hidden border-l-[4px]"
        style={{ borderLeftColor: color }}
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }} />

        <div className="relative grid gap-md lg:grid-cols-[1fr_auto] items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-sm mb-sm">
              <div className="rounded-full flex items-center justify-center"
                style={{ width: 36, height: 36, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
                <Icon size={20} strokeWidth={2.4} />
              </div>
              <div className="flex-1">
                <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-0.5">SANTÉ DU DOMAINE</div>
                <h1 className="font-display text-display-sm sm:text-display text-fg-primary tracking-tight" style={{ color }}>
                  {message}
                </h1>
              </div>
            </div>
            {synthesis.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-sm">
                {synthesis.map((s, i) => (
                  <span key={i} className="text-body-sm text-fg-secondary px-3 py-1 rounded-full bg-surface-sunk border border-border">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-sm min-w-[260px]">
            <div className="rounded-md border border-border bg-surface-sunk/60 backdrop-blur-sm px-md py-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                <span className="font-mono text-caption text-fg-tertiary uppercase tracking-wider">Live</span>
              </div>
              <div className="font-mono text-body-sm text-fg-primary tabular-nums">
                {time.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })} · {time.toLocaleTimeString('fr-FR')}
              </div>
            </div>
            {campaign && (
              <div className="rounded-md border border-border bg-surface-sunk/60 px-md py-sm">
                <div className="font-mono text-caption text-fg-tertiary uppercase tracking-wider mb-1">Campagne en cours</div>
                <div className="text-body-sm font-semibold text-fg-primary truncate">{campaign.name}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-base overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${budgetProgressPct.toFixed(0)}%`, background: `linear-gradient(90deg, var(--neon), var(--blue))` }} />
                  </div>
                  <span className="font-mono text-[10px] text-fg-tertiary tabular-nums">{budgetProgressPct.toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Carte Actions prioritaires ─────────────────────────────────────────
function ActionsCard({ actions }: { actions: any[] }) {
  return (
    <Card animate delay={0.15} padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center gap-sm">
        <Target size={14} className="text-danger" strokeWidth={2.4} />
        <span className="font-display text-heading-sm font-bold text-fg-primary">Actions prioritaires</span>
        <Badge variant={actions.length > 0 ? 'danger' : 'success'} size="sm" className="ml-auto">
          {actions.length === 0 ? 'Aucune action requise' : `${actions.length} action${actions.length > 1 ? 's' : ''}`}
        </Badge>
      </div>
      {actions.length === 0 ? (
        <div className="p-xl text-center">
          <CheckCircle2 size={32} className="text-success mx-auto mb-sm" />
          <div className="font-display text-body font-semibold text-fg-primary">Tout est sous contrôle</div>
          <div className="text-caption text-fg-tertiary mt-1">Aucune action urgente à traiter</div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {actions.slice(0, 6).map((a, i) => {
            const Icon = a.icon
            const priorityLabel = a.priority === 1 ? 'URGENT' : a.priority === 2 ? 'IMPORTANT' : 'À SUIVRE'
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
              >
                <Link href={a.href} className="flex items-start gap-sm px-md py-sm hover:bg-surface-hover transition-colors group">
                  <div className="rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}>
                    <Icon size={15} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}>
                        {priorityLabel}
                      </span>
                      <div className="font-display text-body-sm font-bold text-fg-primary truncate">{a.title}</div>
                    </div>
                    <div className="text-caption text-fg-tertiary truncate">{a.subtitle}</div>
                  </div>
                  <ChevronRight size={14} className="text-fg-tertiary group-hover:text-fg-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2" />
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Carte Santé Production ─────────────────────────────────────────────
function ProductionHealthCard({ metrics }: { metrics: any }) {
  return (
    <Card animate delay={0.2} padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center gap-sm">
        <Sprout size={14} className="text-success" strokeWidth={2.4} />
        <span className="font-display text-heading-sm font-bold text-fg-primary">Santé production</span>
      </div>

      <div className="p-md space-y-md">
        {/* Yield */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary">Yield (kg/m²)</div>
              <div className="font-display text-display-sm font-extrabold mt-0.5"
                style={{ color: metrics.yieldRatio >= 95 ? '#10b981' : metrics.yieldRatio >= 80 ? '#f59e0b' : '#ef4444' }}>
                {metrics.yieldKgM2.toFixed(1)}
                <span className="text-body text-fg-tertiary font-normal ml-1">/ {metrics.targetYield.toFixed(1)} cible</span>
              </div>
            </div>
            <Badge
              variant={metrics.yieldRatio >= 95 ? 'success' : metrics.yieldRatio >= 80 ? 'warning' : 'danger'}
              size="md"
            >
              {metrics.yieldRatio.toFixed(0)}%
            </Badge>
          </div>
          <div className="h-2 rounded-full bg-surface-sunk overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${Math.min(120, metrics.yieldRatio)}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${metrics.yieldRatio >= 95 ? '#10b981' : metrics.yieldRatio >= 80 ? '#f59e0b' : '#ef4444'}, ${metrics.yieldRatio >= 95 ? '#22c55e' : metrics.yieldRatio >= 80 ? '#fbbf24' : '#dc2626'})` }}
            />
          </div>
        </div>

        {/* Mix qualité */}
        <div>
          <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-2">Mix qualité (mois)</div>
          <div className="flex h-5 rounded-md overflow-hidden border border-border">
            {[
              { v: metrics.cat1, c: '#10b981', l: 'Cat 1' },
              { v: metrics.cat2, c: '#3b82f6', l: 'Cat 2' },
              { v: metrics.cat3, c: '#f59e0b', l: 'Cat 3' },
              { v: metrics.waste, c: '#ef4444', l: 'Déchets' },
            ].map((s, i) => {
              const pct = metrics.totalQ > 0 ? (s.v / metrics.totalQ) * 100 : 0
              return pct > 0 ? <div key={i} title={`${s.l} : ${pct.toFixed(1)}%`} style={{ width: `${pct}%`, background: s.c }} /> : null
            })}
          </div>
          <div className="grid grid-cols-4 gap-xs mt-2">
            <QualityCell label="Cat 1" value={metrics.cat1} pct={metrics.totalQ > 0 ? (metrics.cat1 / metrics.totalQ) * 100 : 0} color="#10b981" highlight={metrics.premiumRate >= 60} />
            <QualityCell label="Cat 2" value={metrics.cat2} pct={metrics.totalQ > 0 ? (metrics.cat2 / metrics.totalQ) * 100 : 0} color="#3b82f6" />
            <QualityCell label="Cat 3" value={metrics.cat3} pct={metrics.totalQ > 0 ? (metrics.cat3 / metrics.totalQ) * 100 : 0} color="#f59e0b" />
            <QualityCell label="Déchets" value={metrics.waste} pct={metrics.totalQ > 0 ? (metrics.waste / metrics.totalQ) * 100 : 0} color="#ef4444" warn={metrics.wasteRate > 8} />
          </div>
        </div>

        {/* Stats opérationnelles */}
        <div className="grid grid-cols-3 gap-sm pt-sm border-t border-border">
          <MiniStat label="Production 30j" value={formatWeight(metrics.prod30)} trend={metrics.prodTrend} />
          <MiniStat label="Surface plantée" value={`${(metrics.totalPlantedArea / 10000).toFixed(2)} ha`} />
          <MiniStat label="Effectif" value={String(metrics.workersCount)} />
        </div>
      </div>
    </Card>
  )
}

function QualityCell({ label, value, pct, color, highlight, warn }: { label: string; value: number; pct: number; color: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={cn('rounded-md px-sm py-1.5 border', highlight ? 'border-success/40 bg-success/5' : warn ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-sunk/40')}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary leading-tight" style={{ color: highlight ? '#10b981' : warn ? '#ef4444' : undefined }}>
        {label}
      </div>
      <div className="font-display text-body-sm font-bold text-fg-primary leading-tight mt-0.5">
        {pct.toFixed(0)}%
      </div>
      <div className="font-mono text-[9px] text-fg-tertiary leading-tight">{formatWeight(value)}</div>
    </div>
  )
}

function MiniStat({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary leading-tight">{label}</div>
      <div className="font-display text-body font-bold text-fg-primary leading-tight mt-0.5">{value}</div>
      {trend !== undefined && trend !== 0 && (
        <div className={cn('text-[10px] font-mono mt-0.5', trend > 0 ? 'text-success' : 'text-danger')}>
          {trend > 0 ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

// ─── Top/Flop performers ─────────────────────────────────────────────
function PerformersCard({ kind, items }: { kind: 'top' | 'flop'; items: any[] }) {
  const isTop = kind === 'top'
  return (
    <Card animate delay={isTop ? 0.3 : 0.32} padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center gap-sm">
        {isTop ? <Award size={14} className="text-success" strokeWidth={2.4} /> : <AlertTriangle size={14} className="text-warning" strokeWidth={2.4} />}
        <span className="font-display text-heading-sm font-bold text-fg-primary">
          {isTop ? '🏆 Top serres' : '⚠ Sous-performance'}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="p-lg text-center text-caption text-fg-tertiary">Pas assez de données pour comparer.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((g, i) => {
            const ratioColor = g.ratio >= 95 ? '#10b981' : g.ratio >= 80 ? '#f59e0b' : '#ef4444'
            return (
              <div key={g.ghId} className="px-md py-sm flex items-center gap-sm">
                <div className="font-display text-display-sm font-extrabold w-6" style={{ color: isTop ? '#10b981' : '#ef4444' }}>
                  {isTop ? `#${i + 1}` : `↓${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-body-sm font-bold text-fg-primary truncate">{g.ghCode}</div>
                  <div className="text-caption text-fg-tertiary truncate">
                    {formatWeight(g.production)} / {formatWeight(g.targetProd)} cible
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-body font-bold tabular-nums" style={{ color: ratioColor }}>
                    {g.ratio.toFixed(0)}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Structure du CA ─────────────────────────────────────────────────
function RevenueStructureCard({ dispatchesCA, invoicedCA, margeBrute, totalCostsAll }: any) {
  const ca = dispatchesCA + invoicedCA
  const data = ca > 0 ? [
    { name: 'CA Dispatches', value: dispatchesCA, color: '#10b981' },
    { name: 'CA Factures', value: Math.max(invoicedCA, 0), color: '#3b82f6' },
  ] : []

  return (
    <Card animate delay={0.34} padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center gap-sm">
        <Banknote size={14} className="text-info" strokeWidth={2.4} />
        <span className="font-display text-heading-sm font-bold text-fg-primary">Structure du CA</span>
      </div>
      <div className="p-md">
        <div className="text-center mb-md">
          <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-1">CA total YTD</div>
          <div className="font-display text-display font-extrabold text-info">
            <MoneyDisplay value={ca} compact="auto" showCurrency={false} className="!text-current" />
          </div>
        </div>

        {data.length > 0 ? (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={32} outerRadius={56} paddingAngle={2}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <RTooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [formatMoney(v, { compact: 'auto' }), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-caption text-fg-tertiary">Aucune donnée</div>
        )}

        <div className="space-y-1 mt-md">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-caption">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-fg-secondary">{d.name}</span>
              </span>
              <span className="font-mono text-fg-primary font-semibold">
                <MoneyDisplay value={d.value} compact="auto" showCurrency={false} />
              </span>
            </div>
          ))}
        </div>

        <div className="mt-md pt-sm border-t border-border space-y-1">
          <div className="flex items-center justify-between text-caption">
            <span className="text-fg-secondary">Coûts engagés</span>
            <span className="font-mono text-warning"><MoneyDisplay value={-totalCostsAll} compact="auto" showCurrency={false} /></span>
          </div>
          <div className="flex items-center justify-between text-body-sm font-semibold">
            <span className="text-fg-primary">= Marge brute</span>
            <span className={cn('font-mono', margeBrute >= 0 ? 'text-success' : 'text-danger')}>
              <MoneyDisplay value={margeBrute} compact="auto" showCurrency={false} />
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── P&L Compact ─────────────────────────────────────────────────────
function PLCompactCard({ metrics }: { metrics: any }) {
  const ca = metrics.caTotal
  const chargesVar = toNumber(metrics.costsByType['charge_variable'])
  const chargesFix = toNumber(metrics.costsByType['charge_fixe'])
  const amort = toNumber(metrics.costsByType['amortissement'])
  const ebitda = ca - chargesVar - chargesFix
  const result = ebitda - amort

  const lines = [
    { label: 'Chiffre d\'affaires', value: ca, isPositive: true, color: '#3b82f6' },
    { label: '− Charges variables', value: -chargesVar, isPositive: false, color: '#f59e0b' },
    { label: '− Charges fixes', value: -chargesFix, isPositive: false, color: '#3b82f6' },
    { label: '= EBITDA', value: ebitda, isPositive: ebitda >= 0, color: ebitda >= 0 ? '#10b981' : '#ef4444', strong: true },
    { label: '− Amortissements', value: -amort, isPositive: false, color: '#a855f7' },
    { label: '= Résultat d\'exploitation', value: result, isPositive: result >= 0, color: result >= 0 ? '#10b981' : '#ef4444', strong: true, total: true },
  ]
  const maxAbs = Math.max(...lines.map(l => Math.abs(l.value))) || 1

  return (
    <Card animate delay={0.4} padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <LineIcon size={14} className="text-success" strokeWidth={2.4} />
          <span className="font-display text-heading-sm font-bold text-fg-primary">P&L exécutif YTD</span>
        </div>
        <Link href="/admin/compte-exploitation" className="text-caption text-brand hover:underline flex items-center gap-1">
          Détail complet <ArrowRight size={11} />
        </Link>
      </div>
      <div className="p-md space-y-2">
        {lines.map((l, i) => {
          const pct = (Math.abs(l.value) / maxAbs) * 100
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45 + i * 0.04 }}
              className={cn(
                'flex items-center gap-md py-1.5 px-md rounded-md',
                l.total && 'bg-surface-sunk border-t-2 border-border mt-2',
                l.strong && !l.total && 'bg-surface-sunk/50',
              )}
            >
              <div className={cn('flex-1 min-w-0', l.strong ? 'font-display text-body font-bold' : 'text-body-sm')}
                style={{ color: l.strong ? l.color : 'var(--tx-1)' }}>
                {l.label}
              </div>
              <div className="flex-1 max-w-[200px] h-1.5 rounded-full bg-surface-sunk overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.5 + i * 0.04 }}
                  className="h-full rounded-full"
                  style={{ background: l.color }}
                />
              </div>
              <div className={cn('font-mono tabular-nums text-right min-w-[110px]', l.strong ? 'text-body font-bold' : 'text-body-sm')}
                style={{ color: l.value >= 0 ? l.color : '#ef4444' }}>
                <MoneyDisplay value={l.value} compact="auto" showCurrency={false} />
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Skeleton de chargement ───────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-lg">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-72" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
      </div>
    </div>
  )
}

// ─── Helpers UI ───────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, color, children }: { icon: any; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-sm">
      <Icon size={14} style={{ color }} strokeWidth={2.4} />
      <span className="font-mono text-caption uppercase tracking-wider text-fg-tertiary font-bold">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
