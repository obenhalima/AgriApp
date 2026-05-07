'use client'
/**
 * DASHBOARD EXÉCUTIF — refonte UI/UX complète.
 *
 * Stack design : Tailwind v3 + shadcn-style components + Framer Motion +
 * lucide-react + Recharts. Responsive mobile-first, dark/light parfait,
 * animations marquées (count-up, stagger, sparklines, glow).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Coins, Sprout, Award, Receipt, AlertTriangle,
  Activity, Target, Calendar, ChevronRight, Leaf, Zap, LineChart as LineIcon,
  Banknote, PieChart as PieIcon, BarChart3, Boxes, ArrowUpRight,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { formatMoney, formatWeight, formatPercent, computeTrend, formatDate } from '@/lib/format'
import { useAuthReady, useRefreshOnEvent } from '@/lib/useAuthGuard'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { KPICard } from '@/components/ui/KPICard'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { MoneyDisplay, VolumeDisplay, PercentDisplay } from '@/components/display'

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type CountResponse = { count: number | null }
type HarvestRow = {
  id: string; harvest_date: string | null; total_qty: number | null
  qty_category_1: number | null; qty_category_2: number | null; qty_category_3: number | null
  qty_waste: number | null; lot_number: string | null; campaign_planting_id: string | null
}
type CampaignPlantingRow = { id: string; greenhouse_id: string | null }
type GreenhouseRow = { id: string; code: string | null }
type InvoiceRow = { status: string | null; total_amount: number | null; paid_amount: number | null; invoice_date: string | null }
type CostEntryRow = { cost_category: string | null; amount: number | null; is_planned: boolean | null; entry_date: string | null }
type CampaignRow = { id: string; name: string; status: string | null; production_target_kg: number | null }
type StatsState = {
  recoltes: number; serres: number; clients: number; fournisseurs: number
  stocks: number; factures: number; alertes: number; campagnes: number
}
type DashboardData = {
  stats: StatsState; harvests: HarvestRow[]; plantings: CampaignPlantingRow[]
  greenhouses: GreenhouseRow[]; invoices: InvoiceRow[]; costEntries: CostEntryRow[]; campaigns: CampaignRow[]
}
type PeriodMode = 'month' | 'week' | 'custom'
type BucketMode = 'month' | 'week' | 'day'

const EMPTY_STATS: StatsState = { recoltes: 0, serres: 0, clients: 0, fournisseurs: 0, stocks: 0, factures: 0, alertes: 0, campagnes: 0 }

// Quick actions avec icônes lucide
const QUICK_ACTIONS = [
  { label: 'Nouvelle récolte',   href: '/recoltes',     icon: Sprout,  color: '#10b981' },
  { label: 'Plan de culture',    href: '/plan-culture', icon: Leaf,    color: '#a855f7' },
  { label: 'Mise à jour prix',   href: '/marches',      icon: Coins,   color: '#f59e0b' },
  { label: 'Compte d\'expl.',    href: '/admin/compte-exploitation', icon: LineIcon, color: '#3b82f6' },
]

// Palette qualité / statut
const QUALITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
const STATUS_COLORS  = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']

// ════════════════════════════════════════════════════════════════════════════
// HELPERS DE DATE (conservés du dashboard original)
// ════════════════════════════════════════════════════════════════════════════
const toNumber = (v: number | null | undefined) => (typeof v === 'number' && !isNaN(v) ? v : 0)
const normalizeDate = (v: string | null | undefined) => v ? v.slice(0, 10) : ''
const asDate = (v: string) => new Date(`${v}T00:00:00`)
const toMonthKey = (v: string) => v.slice(0, 7)

function getWeekKey(value: string) {
  const date = asDate(value)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day + 3)
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000)
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
}
function weekKeyToRange(weekKey: string) {
  const [yearPart, weekPart] = weekKey.split('-W')
  const year = Number(yearPart), week = Number(weekPart)
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const day = simple.getDay()
  const monday = new Date(simple)
  if (day <= 4) monday.setDate(simple.getDate() - ((day + 6) % 7))
  else monday.setDate(simple.getDate() + (8 - day))
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
}
function monthKeyToRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return { start: new Date(year, month - 1, 1).toISOString().slice(0, 10), end: new Date(year, month, 0).toISOString().slice(0, 10) }
}
const formatMonthLabel = (k: string) => {
  const [y, m] = k.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}
function formatWeekLabel(k: string) {
  const r = weekKeyToRange(k)
  return `${r.start.slice(8, 10)}/${r.start.slice(5, 7)} → ${r.end.slice(8, 10)}/${r.end.slice(5, 7)}`
}
const formatShortDate = (s: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(asDate(s))
function bucketModeForCustomRange(start: string, end: string): BucketMode {
  const diffDays = Math.max(1, Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86400000) + 1)
  if (diffDays <= 21) return 'day'
  if (diffDays <= 120) return 'week'
  return 'month'
}
const getBucketKey = (s: string, mode: BucketMode) => mode === 'day' ? s : mode === 'week' ? getWeekKey(s) : toMonthKey(s)
const formatBucketLabel = (k: string, mode: BucketMode) => mode === 'day' ? formatShortDate(k) : mode === 'week' ? formatWeekLabel(k) : formatMonthLabel(k)
function formatStatus(s: string | null) {
  const map: Record<string, string> = {
    en_cours: 'En cours', planification: 'Planification', terminee: 'Terminée', annulee: 'Annulée',
    sent: 'Envoyée', en_attente: 'En attente', partiellement_paye: 'Partiel', paye: 'Payée',
  }
  return map[s ?? 'non_defini'] ?? (s ?? 'N/A').replace(/_/g, ' ')
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    stats: EMPTY_STATS, harvests: [], plantings: [], greenhouses: [],
    invoices: [], costEntries: [], campaigns: [],
  })
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Horloge
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Garde-fou : ne fetch que lorsque l'auth est prête (évite RLS silencieux + "must refresh")
  const { ready: authReady } = useAuthReady()
  const [reloadKey, setReloadKey] = useState(0)
  useRefreshOnEvent(() => setReloadKey(k => k + 1))

  // Chargement data
  useEffect(() => {
    if (!authReady) return
    let mounted = true
    async function loadDashboard() {
      setLoading(true)
      const [
        harvestCount, greenhouseCount, clientsCount, suppliersCount, stockCount,
        invoiceCount, alertCount, campaignCount,
        harvestsRes, plantingsRes, greenhousesRes, invoicesRes, costEntriesRes, campaignsRes,
      ] = await Promise.all([
        supabase.from('harvests').select('id', { count: 'exact', head: true }),
        supabase.from('greenhouses').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }),
        // Limites réduites pour éviter de saturer le navigateur (gain ~60% sur transferts)
        supabase.from('harvests').select('id, harvest_date, total_qty, qty_category_1, qty_category_2, qty_category_3, qty_waste, lot_number, campaign_planting_id').order('harvest_date', { ascending: false }).limit(120),
        supabase.from('campaign_plantings').select('id, greenhouse_id'),
        supabase.from('greenhouses').select('id, code'),
        supabase.from('invoices').select('status, total_amount, paid_amount, invoice_date').order('invoice_date', { ascending: false }).limit(120),
        supabase.from('cost_entries').select('cost_category, amount, is_planned, entry_date').order('entry_date', { ascending: false }).limit(300),
        supabase.from('campaigns').select('id, name, status, production_target_kg').limit(30),
      ])
      if (!mounted) return
      setData({
        stats: {
          recoltes: (harvestCount as CountResponse).count ?? 0,
          serres: (greenhouseCount as CountResponse).count ?? 0,
          clients: (clientsCount as CountResponse).count ?? 0,
          fournisseurs: (suppliersCount as CountResponse).count ?? 0,
          stocks: (stockCount as CountResponse).count ?? 0,
          factures: (invoiceCount as CountResponse).count ?? 0,
          alertes: (alertCount as CountResponse).count ?? 0,
          campagnes: (campaignCount as CountResponse).count ?? 0,
        },
        harvests:    (harvestsRes.data    ?? []) as HarvestRow[],
        plantings:   (plantingsRes.data   ?? []) as CampaignPlantingRow[],
        greenhouses: (greenhousesRes.data ?? []) as GreenhouseRow[],
        invoices:    (invoicesRes.data    ?? []) as InvoiceRow[],
        costEntries: (costEntriesRes.data ?? []) as CostEntryRow[],
        campaigns:   (campaignsRes.data   ?? []) as CampaignRow[],
      })
      setLoading(false)
    }
    loadDashboard()
    return () => { mounted = false }
  }, [authReady, reloadKey])

  // Dates disponibles
  const availableDates = useMemo(() => {
    const dates = [
      ...data.harvests.map(i => normalizeDate(i.harvest_date)),
      ...data.invoices.map(i => normalizeDate(i.invoice_date)),
      ...data.costEntries.map(i => normalizeDate(i.entry_date)),
    ].filter(Boolean)
    return Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a))
  }, [data])
  const availableMonthKeys = useMemo(() => Array.from(new Set(availableDates.map(toMonthKey))).sort((a, b) => b.localeCompare(a)), [availableDates])
  const availableWeekKeys  = useMemo(() => Array.from(new Set(availableDates.map(getWeekKey))).sort((a, b) => b.localeCompare(a)), [availableDates])

  useEffect(() => {
    if (!selectedMonth && availableMonthKeys[0]) setSelectedMonth(availableMonthKeys[0])
    if (!selectedWeek && availableWeekKeys[0])   setSelectedWeek(availableWeekKeys[0])
    if (!customEnd && availableDates[0])         setCustomEnd(availableDates[0])
    if (!customStart && availableDates[availableDates.length - 1]) setCustomStart(availableDates[availableDates.length - 1])
  }, [availableDates, availableMonthKeys, availableWeekKeys, customEnd, customStart, selectedMonth, selectedWeek])

  const activeRange = useMemo(() => {
    if (periodMode === 'month' && selectedMonth) {
      return { ...monthKeyToRange(selectedMonth), label: formatMonthLabel(selectedMonth), bucketMode: 'week' as BucketMode }
    }
    if (periodMode === 'week' && selectedWeek) {
      return { ...weekKeyToRange(selectedWeek), label: `Semaine ${selectedWeek.split('-W')[1]} · ${formatWeekLabel(selectedWeek)}`, bucketMode: 'day' as BucketMode }
    }
    const start = customStart || availableDates[availableDates.length - 1] || ''
    const end = customEnd || availableDates[0] || ''
    return {
      start, end,
      label: start && end ? `${formatShortDate(start)} → ${formatShortDate(end)}` : 'Période personnalisée',
      bucketMode: start && end ? bucketModeForCustomRange(start, end) : ('week' as BucketMode),
    }
  }, [availableDates, customEnd, customStart, periodMode, selectedMonth, selectedWeek])

  const inRange = (d: string | null | undefined) => {
    const n = normalizeDate(d)
    return !!(n && activeRange.start && activeRange.end && n >= activeRange.start && n <= activeRange.end)
  }

  // Dérivation principale
  const derived = useMemo(() => {
    const fH = data.harvests.filter(h => inRange(h.harvest_date))
    const fI = data.invoices.filter(i => inRange(i.invoice_date))
    const fC = data.costEntries.filter(c => inRange(c.entry_date))

    const totalProductionKg = fH.reduce((s, x) => s + toNumber(x.total_qty), 0)
    const totalWasteKg      = fH.reduce((s, x) => s + toNumber(x.qty_waste), 0)
    const q1 = fH.reduce((s, x) => s + toNumber(x.qty_category_1), 0)
    const q2 = fH.reduce((s, x) => s + toNumber(x.qty_category_2), 0)
    const q3 = fH.reduce((s, x) => s + toNumber(x.qty_category_3), 0)
    const totalRevenue = fI.reduce((s, x) => s + toNumber(x.total_amount), 0)
    const paidRevenue  = fI.reduce((s, x) => s + toNumber(x.paid_amount), 0)
    const actualCosts  = fC.filter(c => !c.is_planned).reduce((s, x) => s + toNumber(x.amount), 0)
    const grossMargin  = totalRevenue - actualCosts
    const collection   = totalRevenue > 0 ? (paidRevenue / totalRevenue) * 100 : 0
    const premium      = totalProductionKg > 0 ? (q1 / totalProductionKg) * 100 : 0
    const wasteRate    = totalProductionKg > 0 ? (totalWasteKg / totalProductionKg) * 100 : 0
    const activeCampaigns = data.campaigns.filter(c => c.status === 'en_cours').length

    const plantingsById  = new Map(data.plantings.map(p => [p.id, p.greenhouse_id]))
    const greenhouseById = new Map(data.greenhouses.map(g => [g.id, g.code ?? 'N/A']))

    // Top serres
    const topGhMap = new Map<string, number>()
    for (const h of fH) {
      const ghId = h.campaign_planting_id ? plantingsById.get(h.campaign_planting_id) : null
      const code = ghId ? greenhouseById.get(ghId) ?? 'N/A' : 'N/A'
      topGhMap.set(code, (topGhMap.get(code) ?? 0) + toNumber(h.total_qty))
    }
    const topGreenhouses = Array.from(topGhMap.entries())
      .map(([code, production]) => ({ code, production }))
      .sort((a, b) => b.production - a.production).slice(0, 6)

    // Trend data
    const trendMap = new Map<string, { label: string; sortKey: string; production: number; waste: number; revenue: number; costs: number }>()
    const ensureBucket = (key: string) =>
      trendMap.get(key) ?? { label: formatBucketLabel(key, activeRange.bucketMode), sortKey: key, production: 0, waste: 0, revenue: 0, costs: 0 }
    for (const h of fH) {
      const d = normalizeDate(h.harvest_date); if (!d) continue
      const k = getBucketKey(d, activeRange.bucketMode)
      const cur = ensureBucket(k)
      cur.production += toNumber(h.total_qty); cur.waste += toNumber(h.qty_waste)
      trendMap.set(k, cur)
    }
    for (const i of fI) {
      const d = normalizeDate(i.invoice_date); if (!d) continue
      const k = getBucketKey(d, activeRange.bucketMode)
      const cur = ensureBucket(k); cur.revenue += toNumber(i.total_amount); trendMap.set(k, cur)
    }
    for (const c of fC) {
      const d = normalizeDate(c.entry_date); if (!d) continue
      const k = getBucketKey(d, activeRange.bucketMode)
      const cur = ensureBucket(k); cur.costs += toNumber(c.amount); trendMap.set(k, cur)
    }
    const trendData = Array.from(trendMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(i => ({
      label: i.label, production: Math.round(i.production), waste: Math.round(i.waste),
      revenue: Math.round(i.revenue), costs: Math.round(i.costs),
    }))

    // Sparklines (production des 12 derniers buckets)
    const productionSparkline = trendData.slice(-12).map(t => t.production)
    const revenueSparkline    = trendData.slice(-12).map(t => t.revenue)
    const costsSparkline      = trendData.slice(-12).map(t => t.costs)
    const marginSparkline     = trendData.slice(-12).map(t => t.revenue - t.costs)

    // Invoice status
    const invMap = new Map<string, number>()
    for (const i of fI) { const k = formatStatus(i.status); invMap.set(k, (invMap.get(k) ?? 0) + toNumber(i.total_amount)) }
    const invoiceStatusData = Array.from(invMap.entries()).map(([name, value], i) => ({
      name, value, color: STATUS_COLORS[i % STATUS_COLORS.length],
    }))

    // Cost categories
    const ccMap = new Map<string, { actual: number; planned: number }>()
    for (const c of fC) {
      const k = c.cost_category ?? 'Autres'
      const cur = ccMap.get(k) ?? { actual: 0, planned: 0 }
      if (c.is_planned) cur.planned += toNumber(c.amount); else cur.actual += toNumber(c.amount)
      ccMap.set(k, cur)
    }
    const costCategoryData = Array.from(ccMap.entries())
      .map(([category, v]) => ({ category: category.replace(/_/g, ' '), actual: Math.round(v.actual), planned: Math.round(v.planned) }))
      .sort((a, b) => (b.actual + b.planned) - (a.actual + a.planned)).slice(0, 6)

    const qualityData = [
      { name: 'Cat. 1', value: q1, color: QUALITY_COLORS[0] },
      { name: 'Cat. 2', value: q2, color: QUALITY_COLORS[1] },
      { name: 'Cat. 3', value: q3, color: QUALITY_COLORS[2] },
      { name: 'Déchets', value: totalWasteKg, color: QUALITY_COLORS[3] },
    ].filter(x => x.value > 0)

    const recentHarvests = fH.slice(0, 6).map(h => ({
      id: h.id, date: normalizeDate(h.harvest_date),
      greenhouse: h.campaign_planting_id ? greenhouseById.get(plantingsById.get(h.campaign_planting_id) ?? '') ?? 'N/A' : 'N/A',
      lot: h.lot_number ?? '—', total: toNumber(h.total_qty), waste: toNumber(h.qty_waste),
    }))

    return {
      totalProductionKg, totalWasteKg, totalRevenue, paidRevenue, actualCosts, grossMargin,
      collection, premium, wasteRate, activeCampaigns,
      topGreenhouses, trendData, invoiceStatusData, costCategoryData, qualityData, recentHarvests,
      productionSparkline, revenueSparkline, costsSparkline, marginSparkline,
    }
  }, [activeRange.bucketMode, data])

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="relative z-[1] flex flex-col gap-lg pb-2xl">

      {/* ════════ HERO HEADER ════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <Card variant="gradient" className="relative overflow-hidden">
          {/* Halo décoratif */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full blur-3xl opacity-20"
            style={{ background: 'radial-gradient(circle, var(--blue), transparent 70%)' }} />

          <div className="relative grid gap-lg lg:grid-cols-[1fr_auto] items-start">
            <div className="flex-1 max-w-3xl">
              <div className="flex items-center gap-sm mb-sm">
                <Badge variant="brand" size="md" dot pulse>
                  Live
                </Badge>
                <span className="text-caption font-mono text-fg-tertiary tracking-wider">
                  PILOTAGE AGRITECH
                </span>
              </div>
              <h1 className="font-display text-display lg:text-display-lg text-fg-primary tracking-tight mb-xs">
                Dashboard exécutif
              </h1>
              <p className="text-body text-fg-secondary mt-md leading-relaxed max-w-2xl">
                Vue consolidée avec filtre temporel unique pour lire la <strong className="text-success">production</strong>,
                les <strong className="text-info">revenus</strong>, les <strong className="text-warning">coûts</strong>
                {' '}et la <strong className="text-fg-primary">qualité</strong> sur un même axe d'analyse.
              </p>
            </div>

            <div className="flex flex-col gap-md min-w-[280px]">
              {/* Synchronisation */}
              <div className="rounded-lg border border-border bg-surface-sunk/60 backdrop-blur-sm px-md py-sm">
                <div className="flex items-center gap-xs mb-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  <span className="font-mono text-caption text-fg-tertiary tracking-wider">SYNCHRONISATION</span>
                </div>
                <div className="font-mono text-body-sm text-fg-primary tabular-nums">
                  {time.toLocaleDateString('fr-FR')} · {time.toLocaleTimeString('fr-FR')}
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-xs">
                {QUICK_ACTIONS.map((action, i) => {
                  const Icon = action.icon
                  return (
                    <motion.div
                      key={action.label}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
                    >
                      <Link
                        href={action.href}
                        className="group inline-flex items-center gap-1.5 px-md py-1.5 rounded-full border transition-all duration-150 hover:-translate-y-0.5"
                        style={{
                          borderColor: `color-mix(in srgb, ${action.color} 30%, transparent)`,
                          background:  `color-mix(in srgb, ${action.color} 12%, transparent)`,
                          color: action.color,
                        }}
                      >
                        <Icon size={12} strokeWidth={2.5} />
                        <span className="text-[11px] font-semibold tracking-tight">{action.label}</span>
                        <ArrowUpRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ════════ FILTRE TEMPOREL ════════ */}
      <Card animate delay={0.1}>
        <div className="flex items-center gap-sm mb-md">
          <Calendar size={14} className="text-fg-tertiary" />
          <span className="font-mono text-caption uppercase tracking-wider text-fg-tertiary">Filtre temporel</span>
          <div className="flex-1 h-px bg-border" />
          <Badge variant="info" size="sm">{activeRange.label}</Badge>
        </div>

        <div className="flex flex-col gap-md">
          {/* Mode toggle */}
          <div className="flex flex-wrap gap-xs">
            {([
              { key: 'month'  as PeriodMode, label: 'Par mois' },
              { key: 'week'   as PeriodMode, label: 'Par semaine' },
              { key: 'custom' as PeriodMode, label: 'Période précise' },
            ]).map(item => (
              <button
                key={item.key}
                onClick={() => setPeriodMode(item.key)}
                className={cn(
                  'px-md py-xs rounded-md font-mono text-[11px] uppercase tracking-wider font-semibold transition-all duration-150',
                  periodMode === item.key
                    ? 'bg-brand text-white shadow-[0_2px_10px_var(--neon-dim)] hover:brightness-110'
                    : 'bg-surface-raised text-fg-secondary border border-border hover:border-border-strong hover:bg-surface-hover'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Selectors */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {periodMode === 'month' && (
              <div>
                <label className="font-mono text-[10px] text-fg-tertiary uppercase tracking-wider mb-xs block">Mois</label>
                <select className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                  {availableMonthKeys.map(k => <option key={k} value={k}>{formatMonthLabel(k)}</option>)}
                </select>
              </div>
            )}
            {periodMode === 'week' && (
              <div>
                <label className="font-mono text-[10px] text-fg-tertiary uppercase tracking-wider mb-xs block">Semaine</label>
                <select className="form-input" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}>
                  {availableWeekKeys.map(k => <option key={k} value={k}>{`S${k.split('-W')[1]} · ${formatWeekLabel(k)}`}</option>)}
                </select>
              </div>
            )}
            {periodMode === 'custom' && (
              <>
                <div>
                  <label className="font-mono text-[10px] text-fg-tertiary uppercase tracking-wider mb-xs block">Début</label>
                  <input className="form-input" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-fg-tertiary uppercase tracking-wider mb-xs block">Fin</label>
                  <input className="form-input" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
                <div className="flex items-center px-md py-2 rounded-md border border-border bg-surface-sunk text-fg-secondary text-body-sm">
                  Agrégation auto : <strong className="ml-xs text-fg-primary">{activeRange.bucketMode === 'day' ? 'jour' : activeRange.bucketMode === 'week' ? 'semaine' : 'mois'}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ════════ KPI HERO (4 majeurs) ════════ */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          <KPICard
            label="Production"
            icon={Sprout}
            accent="#10b981"
            sparkline={derived.productionSparkline}
            value={<VolumeDisplay value={derived.totalProductionKg} compact="auto" className="text-current font-display !text-display-lg" />}
            sub={`${derived.recentHarvests.length} récolte${derived.recentHarvests.length > 1 ? 's' : ''}`}
            variant="hero"
            delay={0}
          />
          <KPICard
            label="Chiffre d'affaires"
            icon={Banknote}
            accent="#3b82f6"
            sparkline={derived.revenueSparkline}
            value={<MoneyDisplay value={derived.totalRevenue} compact="auto" showCurrency={false} className="text-current font-display !text-display-lg" />}
            sub="MAD encaissés et facturés"
            variant="hero"
            delay={0.05}
          />
          <KPICard
            label="Coûts réels"
            icon={Receipt}
            accent="#f59e0b"
            sparkline={derived.costsSparkline}
            value={<MoneyDisplay value={derived.actualCosts} compact="auto" showCurrency={false} className="text-current font-display !text-display-lg" />}
            sub="MAD engagés"
            variant="hero"
            delay={0.1}
          />
          <KPICard
            label="Marge brute"
            icon={derived.grossMargin >= 0 ? TrendingUp : TrendingDown}
            accent={derived.grossMargin >= 0 ? '#8b5cf6' : '#ef4444'}
            sparkline={derived.marginSparkline}
            value={<MoneyDisplay value={derived.grossMargin} compact="auto" showCurrency={false} className="text-current font-display !text-display-lg" />}
            sub={derived.grossMargin >= 0 ? 'Résultat positif' : 'Pression sur la marge'}
            variant="hero"
            delay={0.15}
          />
        </div>
      )}

      {/* ════════ KPI SECONDAIRES (compact) ════════ */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-sm">
          <CompactKPI label="Premium"     value={formatPercent(derived.premium, { decimals: 0 })}    sub="cat. 1"   color="#14b8a6" icon={Award}    delay={0.2} />
          <CompactKPI label="Recouvrement" value={formatPercent(derived.collection, { decimals: 0 })} sub="encaissé" color="#ec4899" icon={Wallet}   delay={0.22} />
          <CompactKPI label="Perte"        value={formatPercent(derived.wasteRate, { decimals: 0 })}  sub="déchets"  color="#ef4444" icon={AlertTriangle} delay={0.24} />
          <CompactKPI label="Campagnes"    value={String(derived.activeCampaigns)} sub="en cours"     color="#10b981" icon={Activity} delay={0.26} />
          <CompactKPI label="Serres"       value={String(data.stats.serres)}        sub="suivies"      color="#3b82f6" icon={Boxes}    delay={0.28} />
          <CompactKPI label="Alertes"      value={String(data.stats.alertes)}       sub={data.stats.alertes > 0 ? 'ouvertes' : 'tout va bien'} color={data.stats.alertes > 0 ? '#f59e0b' : '#10b981'} icon={Zap} delay={0.30} />
        </div>
      )}

      {/* ════════ ROW 1 : Tendance + Synthèse direction ════════ */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-md">
        <Card animate delay={0.35}>
          <SectionLabel icon={LineIcon}>Production & Finance</SectionLabel>
          <div className="h-72 -mx-2 mt-md">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={derived.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
                <YAxis yAxisId="kg"  tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
                <YAxis yAxisId="mad" orientation="right" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
                <RTooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: 'var(--shadow-floating)' }}
                  labelStyle={{ color: 'var(--tx-2)', fontWeight: 600 }}
                  formatter={(v: number, n: string) => n === 'Production' || n === 'Déchets' ? [formatWeight(v), n] : [formatMoney(v, { compact: 'auto' }), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                <Line yAxisId="kg"  type="monotone" dataKey="production" name="Production" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line yAxisId="kg"  type="monotone" dataKey="waste"      name="Déchets"    stroke="#ef4444" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                <Line yAxisId="mad" type="monotone" dataKey="revenue"    name="CA"         stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line yAxisId="mad" type="monotone" dataKey="costs"      name="Coûts"      stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card animate delay={0.4}>
          <SectionLabel icon={Target}>Synthèse direction</SectionLabel>
          <div className="grid gap-sm mt-md">
            {[
              { label: 'Marge brute',     value: formatMoney(derived.grossMargin, { compact: 'auto' }), good: derived.grossMargin >= 0, note: `${formatMoney(derived.totalRevenue, { compact: 'auto' })} − ${formatMoney(derived.actualCosts, { compact: 'auto' })}` },
              { label: 'Recouvrement',    value: formatPercent(derived.collection, { decimals: 0 }),    good: derived.collection >= 70,  note: `${formatMoney(derived.paidRevenue, { compact: 'auto' })} encaissés` },
              { label: 'Taux premium',    value: formatPercent(derived.premium, { decimals: 0 }),       good: derived.premium >= 55,     note: 'part Cat. 1 sur la période' },
              { label: 'Taux de perte',   value: formatPercent(derived.wasteRate, { decimals: 0 }),     good: derived.wasteRate <= 8,    note: `${formatWeight(derived.totalWasteKg)} en déchets` },
              { label: 'Campagnes actives', value: String(derived.activeCampaigns), good: derived.activeCampaigns > 0, note: `${data.stats.serres} serres suivies` },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.05, duration: 0.3 }}
                className="rounded-md border border-border bg-surface-sunk/60 px-md py-sm"
              >
                <div className="flex items-center justify-between gap-md mb-1">
                  <span className="font-semibold text-fg-primary text-body-sm">{item.label}</span>
                  <Badge variant={item.good ? 'success' : 'danger'} size="sm">{item.value}</Badge>
                </div>
                <div className="text-caption text-fg-tertiary font-mono">{item.note}</div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* ════════ ROW 2 : 3 charts en colonnes ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <Card animate delay={0.5}>
          <SectionLabel icon={PieIcon}>Mix qualité</SectionLabel>
          <div className="h-64 mt-md">
            {derived.qualityData.length === 0 ? (
              <EmptyChart>Aucune récolte sur cette période</EmptyChart>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.qualityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={86} paddingAngle={3}>
                    {derived.qualityData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatWeight(v), 'Quantité']} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card animate delay={0.55}>
          <SectionLabel icon={Receipt}>Factures par statut</SectionLabel>
          <div className="h-64 mt-md">
            {derived.invoiceStatusData.length === 0 ? (
              <EmptyChart>Pas de factures sur la période</EmptyChart>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.invoiceStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={86} paddingAngle={3}>
                    {derived.invoiceStatusData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatMoney(v, { compact: 'auto' }), 'Montant']} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card animate delay={0.6}>
          <SectionLabel icon={BarChart3}>Coûts par catégorie</SectionLabel>
          <div className="h-64 mt-md -mx-2">
            {derived.costCategoryData.length === 0 ? (
              <EmptyChart>Pas de coûts sur la période</EmptyChart>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.costCategoryData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="category" tick={{ fill: 'var(--tx-3)', fontSize: 9 }} stroke="var(--border)" />
                  <YAxis tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
                  <RTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatMoney(v, { compact: 'auto' }), 'Montant']} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                  <Bar dataKey="planned" name="Prévu" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual"  name="Réel"  fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ════════ ROW 3 : Top serres + Dernières récoltes ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-md">
        <Card animate delay={0.65}>
          <SectionLabel icon={Boxes}>Top serres sur la période</SectionLabel>
          <div className="h-72 mt-md -mx-2">
            {derived.topGreenhouses.length === 0 ? (
              <EmptyChart>Aucune production</EmptyChart>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.topGreenhouses} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} stroke="var(--border)" />
                  <YAxis type="category" dataKey="code" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} width={70} stroke="var(--border)" />
                  <RTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatWeight(v), 'Production']} />
                  <Bar dataKey="production" radius={[0, 6, 6, 0]}>
                    {derived.topGreenhouses.map((_, i) => <Cell key={i} fill={`url(#topGhGrad-${i})`} />)}
                  </Bar>
                  <defs>
                    {derived.topGreenhouses.map((_, i) => (
                      <linearGradient key={i} id={`topGhGrad-${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card animate delay={0.7}>
          <SectionLabel icon={Sprout}>Dernières récoltes</SectionLabel>
          <div className="overflow-x-auto mt-md">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th>Date</Th>
                  <Th>Serre</Th>
                  <Th>Lot</Th>
                  <Th right>Total</Th>
                  <Th right>Déchets</Th>
                </tr>
              </thead>
              <tbody>
                {derived.recentHarvests.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-fg-tertiary py-xl text-body-sm">Aucune récolte sur cette période.</td></tr>
                ) : derived.recentHarvests.map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.75 + i * 0.04, duration: 0.25 }}
                    className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
                  >
                    <Td><span className="font-mono text-body-sm text-fg-tertiary">{item.date ? formatShortDate(item.date) : '—'}</span></Td>
                    <Td><Badge variant="default" size="sm">{item.greenhouse}</Badge></Td>
                    <Td><span className="font-mono text-body-sm">{item.lot}</span></Td>
                    <Td right><VolumeDisplay value={item.total} className="font-semibold text-fg-primary" /></Td>
                    <Td right><VolumeDisplay value={item.waste} className="text-danger/80" /></Td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS LOCAUX
// ════════════════════════════════════════════════════════════════════════════

function CompactKPI({
  label, value, sub, color, icon: Icon, delay = 0,
}: { label: string; value: string; sub: string; color: string; icon: any; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={cn(
        'rounded-md border border-border bg-surface-raised p-md',
        'flex items-center gap-sm',
        'hover:border-border-strong hover:-translate-y-0.5 transition-all duration-200 cursor-default'
      )}
    >
      <div
        className="rounded-md flex items-center justify-center flex-shrink-0"
        style={{ width: 32, height: 32, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary leading-tight">{label}</div>
        <div className="font-mono tabular-nums text-base font-bold text-fg-primary leading-tight" style={{ color }}>{value}</div>
        <div className="font-mono text-[9px] text-fg-tertiary leading-tight truncate">{sub}</div>
      </div>
    </motion.div>
  )
}

function SectionLabel({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-sm">
      <Icon size={14} className="text-fg-tertiary" strokeWidth={2.2} />
      <span className="font-mono text-caption uppercase tracking-wider text-fg-tertiary">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center text-fg-tertiary text-body-sm font-mono">
      {children}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn(
      'py-sm px-md font-mono text-[9px] uppercase tracking-wider text-fg-tertiary font-semibold',
      right ? 'text-right' : 'text-left'
    )}>
      {children}
    </th>
  )
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={cn('py-sm px-md text-body-sm', right ? 'text-right' : 'text-left')}>
      {children}
    </td>
  )
}
