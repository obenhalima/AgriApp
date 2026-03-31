'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'

type CountResponse = {
  count: number | null
}

type HarvestRow = {
  id: string
  harvest_date: string | null
  total_qty: number | null
  qty_category_1: number | null
  qty_category_2: number | null
  qty_category_3: number | null
  qty_waste: number | null
  lot_number: string | null
  campaign_planting_id: string | null
}

type CampaignPlantingRow = {
  id: string
  greenhouse_id: string | null
}

type GreenhouseRow = {
  id: string
  code: string | null
}

type InvoiceRow = {
  status: string | null
  total_amount: number | null
  paid_amount: number | null
  invoice_date: string | null
}

type CostEntryRow = {
  cost_category: string | null
  amount: number | null
  is_planned: boolean | null
  entry_date: string | null
}

type CampaignRow = {
  id: string
  name: string
  status: string | null
  production_target_kg: number | null
}

type StatsState = {
  recoltes: number
  serres: number
  clients: number
  fournisseurs: number
  stocks: number
  factures: number
  alertes: number
  campagnes: number
}

type DashboardData = {
  stats: StatsState
  harvests: HarvestRow[]
  plantings: CampaignPlantingRow[]
  greenhouses: GreenhouseRow[]
  invoices: InvoiceRow[]
  costEntries: CostEntryRow[]
  campaigns: CampaignRow[]
}

type PeriodMode = 'month' | 'week' | 'custom'
type BucketMode = 'month' | 'week' | 'day'

const EMPTY_STATS: StatsState = {
  recoltes: 0,
  serres: 0,
  clients: 0,
  fournisseurs: 0,
  stocks: 0,
  factures: 0,
  alertes: 0,
  campagnes: 0,
}

const QUICK_ACTIONS = [
  { label: 'Nouvelle recolte', href: '/recoltes', color: '#10b981' },
  { label: 'Suivre les serres', href: '/serres', color: '#3b82f6' },
  { label: 'Mettre a jour les prix', href: '/marches', color: '#f59e0b' },
  { label: 'Verifier les marges', href: '/marges', color: '#8b5cf6' },
]

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--tx-1)',
    fontSize: 12,
    boxShadow: 'var(--shadow-card)',
  },
  labelStyle: {
    color: 'var(--tx-2)',
    fontWeight: 600,
  },
}

const QUALITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
const STATUS_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444']

function toNumber(value: number | null | undefined) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

function formatKg(value: number) {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)} kg`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPct(value: number) {
  return `${Math.round(value)}%`
}

function formatStatus(status: string | null) {
  const normalized = status ?? 'non_defini'
  switch (normalized) {
    case 'en_cours':
      return 'En cours'
    case 'planification':
      return 'Planification'
    case 'terminee':
      return 'Terminee'
    case 'annulee':
      return 'Annulee'
    case 'sent':
      return 'Envoyee'
    case 'en_attente':
      return 'En attente'
    case 'partiellement_paye':
      return 'Partiel'
    case 'paye':
      return 'Payee'
    default:
      return normalized.replace(/_/g, ' ')
  }
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function toMonthKey(value: string) {
  return value.slice(0, 7)
}

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
  const year = Number(yearPart)
  const week = Number(weekPart)
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const day = simple.getDay()
  const monday = new Date(simple)
  if (day <= 4) monday.setDate(simple.getDate() - ((day + 6) % 7))
  else monday.setDate(simple.getDate() + (8 - day))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function monthKeyToRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function formatWeekLabel(weekKey: string) {
  const range = weekKeyToRange(weekKey)
  return `${range.start.slice(8, 10)}/${range.start.slice(5, 7)} - ${range.end.slice(8, 10)}/${range.end.slice(5, 7)}`
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(asDate(dateString))
}

function bucketModeForCustomRange(start: string, end: string): BucketMode {
  const diffDays = Math.max(1, Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86400000) + 1)
  if (diffDays <= 21) return 'day'
  if (diffDays <= 120) return 'week'
  return 'month'
}

function getBucketKey(dateString: string, bucketMode: BucketMode) {
  if (bucketMode === 'day') return dateString
  if (bucketMode === 'week') return getWeekKey(dateString)
  return toMonthKey(dateString)
}

function formatBucketLabel(bucketKey: string, bucketMode: BucketMode) {
  if (bucketMode === 'day') return formatShortDate(bucketKey)
  if (bucketMode === 'week') return formatWeekLabel(bucketKey)
  return formatMonthLabel(bucketKey)
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    stats: EMPTY_STATS,
    harvests: [],
    plantings: [],
    greenhouses: [],
    invoices: [],
    costEntries: [],
    campaigns: [],
  })
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setLoading(true)

      const [
        harvestCount,
        greenhouseCount,
        clientsCount,
        suppliersCount,
        stockCount,
        invoiceCount,
        alertCount,
        campaignCount,
        harvestsRes,
        plantingsRes,
        greenhousesRes,
        invoicesRes,
        costEntriesRes,
        campaignsRes,
      ] = await Promise.all([
        supabase.from('harvests').select('id', { count: 'exact', head: true }),
        supabase.from('greenhouses').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }),
        supabase
          .from('harvests')
          .select('id, harvest_date, total_qty, qty_category_1, qty_category_2, qty_category_3, qty_waste, lot_number, campaign_planting_id')
          .order('harvest_date', { ascending: false })
          .limit(240),
        supabase.from('campaign_plantings').select('id, greenhouse_id'),
        supabase.from('greenhouses').select('id, code'),
        supabase.from('invoices').select('status, total_amount, paid_amount, invoice_date').limit(240),
        supabase.from('cost_entries').select('cost_category, amount, is_planned, entry_date').limit(600),
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
        harvests: (harvestsRes.data ?? []) as HarvestRow[],
        plantings: (plantingsRes.data ?? []) as CampaignPlantingRow[],
        greenhouses: (greenhousesRes.data ?? []) as GreenhouseRow[],
        invoices: (invoicesRes.data ?? []) as InvoiceRow[],
        costEntries: (costEntriesRes.data ?? []) as CostEntryRow[],
        campaigns: (campaignsRes.data ?? []) as CampaignRow[],
      })
      setLoading(false)
    }

    loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  const availableDates = useMemo(() => {
    const dates = [
      ...data.harvests.map((item) => normalizeDate(item.harvest_date)),
      ...data.invoices.map((item) => normalizeDate(item.invoice_date)),
      ...data.costEntries.map((item) => normalizeDate(item.entry_date)),
    ].filter(Boolean)

    return Array.from(new Set(dates)).sort((left, right) => right.localeCompare(left))
  }, [data])

  const availableMonthKeys = useMemo(
    () => Array.from(new Set(availableDates.map((date) => toMonthKey(date)))).sort((left, right) => right.localeCompare(left)),
    [availableDates],
  )

  const availableWeekKeys = useMemo(
    () => Array.from(new Set(availableDates.map((date) => getWeekKey(date)))).sort((left, right) => right.localeCompare(left)),
    [availableDates],
  )

  useEffect(() => {
    if (!selectedMonth && availableMonthKeys[0]) setSelectedMonth(availableMonthKeys[0])
    if (!selectedWeek && availableWeekKeys[0]) setSelectedWeek(availableWeekKeys[0])
    if (!customEnd && availableDates[0]) setCustomEnd(availableDates[0])
    if (!customStart && availableDates[availableDates.length - 1]) setCustomStart(availableDates[availableDates.length - 1])
  }, [availableDates, availableMonthKeys, availableWeekKeys, customEnd, customStart, selectedMonth, selectedWeek])

  const activeRange = useMemo(() => {
    if (periodMode === 'month' && selectedMonth) {
      return {
        ...monthKeyToRange(selectedMonth),
        label: formatMonthLabel(selectedMonth),
        bucketMode: 'week' as BucketMode,
      }
    }

    if (periodMode === 'week' && selectedWeek) {
      return {
        ...weekKeyToRange(selectedWeek),
        label: `Semaine ${selectedWeek.split('-W')[1]} · ${formatWeekLabel(selectedWeek)}`,
        bucketMode: 'day' as BucketMode,
      }
    }

    const start = customStart || availableDates[availableDates.length - 1] || ''
    const end = customEnd || availableDates[0] || ''
    return {
      start,
      end,
      label: start && end ? `${formatShortDate(start)} -> ${formatShortDate(end)}` : 'Periode personnalisee',
      bucketMode: start && end ? bucketModeForCustomRange(start, end) : ('week' as BucketMode),
    }
  }, [availableDates, customEnd, customStart, periodMode, selectedMonth, selectedWeek])

  const inRange = (dateString: string | null | undefined) => {
    const normalized = normalizeDate(dateString)
    if (!normalized || !activeRange.start || !activeRange.end) return false
    return normalized >= activeRange.start && normalized <= activeRange.end
  }

  const derived = useMemo(() => {
    const filteredHarvests = data.harvests.filter((item) => inRange(item.harvest_date))
    const filteredInvoices = data.invoices.filter((item) => inRange(item.invoice_date))
    const filteredCosts = data.costEntries.filter((item) => inRange(item.entry_date))

    const totalProductionKg = filteredHarvests.reduce((sum, item) => sum + toNumber(item.total_qty), 0)
    const totalWasteKg = filteredHarvests.reduce((sum, item) => sum + toNumber(item.qty_waste), 0)
    const qualityOneKg = filteredHarvests.reduce((sum, item) => sum + toNumber(item.qty_category_1), 0)
    const qualityTwoKg = filteredHarvests.reduce((sum, item) => sum + toNumber(item.qty_category_2), 0)
    const qualityThreeKg = filteredHarvests.reduce((sum, item) => sum + toNumber(item.qty_category_3), 0)
    const totalRevenue = filteredInvoices.reduce((sum, item) => sum + toNumber(item.total_amount), 0)
    const paidRevenue = filteredInvoices.reduce((sum, item) => sum + toNumber(item.paid_amount), 0)
    const actualCosts = filteredCosts.filter((item) => !item.is_planned).reduce((sum, item) => sum + toNumber(item.amount), 0)
    const grossMargin = totalRevenue - actualCosts
    const invoiceCollectionRate = totalRevenue > 0 ? (paidRevenue / totalRevenue) * 100 : 0
    const premiumRate = totalProductionKg > 0 ? (qualityOneKg / totalProductionKg) * 100 : 0
    const wasteRate = totalProductionKg > 0 ? (totalWasteKg / totalProductionKg) * 100 : 0
    const activeCampaigns = data.campaigns.filter((item) => item.status === 'en_cours').length

    const plantingsById = new Map(data.plantings.map((item) => [item.id, item.greenhouse_id]))
    const greenhouseById = new Map(data.greenhouses.map((item) => [item.id, item.code ?? 'N/A']))
    const topGreenhouseMap = new Map<string, number>()

    for (const harvest of filteredHarvests) {
      const greenhouseId = harvest.campaign_planting_id ? plantingsById.get(harvest.campaign_planting_id) : null
      const greenhouseCode = greenhouseId ? greenhouseById.get(greenhouseId) ?? 'N/A' : 'N/A'
      topGreenhouseMap.set(greenhouseCode, (topGreenhouseMap.get(greenhouseCode) ?? 0) + toNumber(harvest.total_qty))
    }

    const topGreenhouses = Array.from(topGreenhouseMap.entries())
      .map(([code, production]) => ({ code, production }))
      .sort((left, right) => right.production - left.production)
      .slice(0, 6)

    const trendMap = new Map<string, { label: string; sortKey: string; production: number; waste: number; revenue: number; costs: number }>()

    for (const harvest of filteredHarvests) {
      const date = normalizeDate(harvest.harvest_date)
      if (!date) continue
      const key = getBucketKey(date, activeRange.bucketMode)
      const current = trendMap.get(key) ?? { label: formatBucketLabel(key, activeRange.bucketMode), sortKey: key, production: 0, waste: 0, revenue: 0, costs: 0 }
      current.production += toNumber(harvest.total_qty)
      current.waste += toNumber(harvest.qty_waste)
      trendMap.set(key, current)
    }

    for (const invoice of filteredInvoices) {
      const date = normalizeDate(invoice.invoice_date)
      if (!date) continue
      const key = getBucketKey(date, activeRange.bucketMode)
      const current = trendMap.get(key) ?? { label: formatBucketLabel(key, activeRange.bucketMode), sortKey: key, production: 0, waste: 0, revenue: 0, costs: 0 }
      current.revenue += toNumber(invoice.total_amount)
      trendMap.set(key, current)
    }

    for (const cost of filteredCosts) {
      const date = normalizeDate(cost.entry_date)
      if (!date) continue
      const key = getBucketKey(date, activeRange.bucketMode)
      const current = trendMap.get(key) ?? { label: formatBucketLabel(key, activeRange.bucketMode), sortKey: key, production: 0, waste: 0, revenue: 0, costs: 0 }
      current.costs += toNumber(cost.amount)
      trendMap.set(key, current)
    }

    const trendData = Array.from(trendMap.values())
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map((item) => ({ label: item.label, production: Math.round(item.production), waste: Math.round(item.waste), revenue: Math.round(item.revenue), costs: Math.round(item.costs) }))

    const invoiceStatusMap = new Map<string, number>()
    for (const invoice of filteredInvoices) {
      const key = formatStatus(invoice.status)
      invoiceStatusMap.set(key, (invoiceStatusMap.get(key) ?? 0) + toNumber(invoice.total_amount))
    }

    const invoiceStatusData = Array.from(invoiceStatusMap.entries()).map(([name, value], index) => ({
      name,
      value,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }))

    const costCategoryMap = new Map<string, { actual: number; planned: number }>()
    for (const item of filteredCosts) {
      const key = item.cost_category ?? 'Autres'
      const current = costCategoryMap.get(key) ?? { actual: 0, planned: 0 }
      if (item.is_planned) current.planned += toNumber(item.amount)
      else current.actual += toNumber(item.amount)
      costCategoryMap.set(key, current)
    }

    const costCategoryData = Array.from(costCategoryMap.entries())
      .map(([category, value]) => ({ category: category.replace(/_/g, ' '), actual: Math.round(value.actual), planned: Math.round(value.planned) }))
      .sort((left, right) => right.actual + right.planned - (left.actual + left.planned))
      .slice(0, 6)

    const qualityData = [
      { name: 'Categorie 1', value: qualityOneKg, color: QUALITY_COLORS[0] },
      { name: 'Categorie 2', value: qualityTwoKg, color: QUALITY_COLORS[1] },
      { name: 'Categorie 3', value: qualityThreeKg, color: QUALITY_COLORS[2] },
      { name: 'Dechets', value: totalWasteKg, color: QUALITY_COLORS[3] },
    ].filter((item) => item.value > 0)

    const recentHarvests = filteredHarvests.slice(0, 6).map((item) => ({
      id: item.id,
      date: normalizeDate(item.harvest_date),
      greenhouse: item.campaign_planting_id ? greenhouseById.get(plantingsById.get(item.campaign_planting_id) ?? '') ?? 'N/A' : 'N/A',
      lot: item.lot_number ?? '-',
      total: toNumber(item.total_qty),
      waste: toNumber(item.qty_waste),
    }))

    return { totalProductionKg, totalWasteKg, totalRevenue, paidRevenue, actualCosts, grossMargin, invoiceCollectionRate, premiumRate, wasteRate, activeCampaigns, topGreenhouses, trendData, invoiceStatusData, costCategoryData, qualityData, recentHarvests }
  }, [activeRange.bucketMode, data])

  const kpis = [
    { label: 'Production filtree', value: loading ? '...' : formatCompactNumber(derived.totalProductionKg), sub: activeRange.label, color: '#10b981' },
    { label: 'CA filtre', value: loading ? '...' : formatCompactNumber(derived.totalRevenue), sub: 'factures sur la periode', color: '#3b82f6' },
    { label: 'Couts reels', value: loading ? '...' : formatCompactNumber(derived.actualCosts), sub: 'charges engagees', color: '#f59e0b' },
    { label: 'Marge brute', value: loading ? '...' : formatCompactNumber(derived.grossMargin), sub: derived.grossMargin >= 0 ? 'resultat positif' : 'pression marge', color: derived.grossMargin >= 0 ? '#8b5cf6' : '#ef4444' },
    { label: 'Premium', value: loading ? '...' : formatPct(derived.premiumRate), sub: 'categorie 1', color: '#14b8a6' },
    { label: 'Recouvrement', value: loading ? '...' : formatPct(derived.invoiceCollectionRate), sub: 'encaissement', color: '#ec4899' },
  ]

  return (
    <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 18 }}>
      <div
        className="card"
        style={{
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--neon) 14%, var(--bg-card)) 0%, var(--bg-card) 48%, color-mix(in srgb, var(--blue) 12%, var(--bg-card)) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 720 }}>
            <div className="page-title">Dashboard executif</div>
            <div className="page-sub">PILOTAGE AGRITECH · PRODUCTION · FINANCE · QUALITE</div>
            <p style={{ marginTop: 10, color: 'var(--tx-2)', fontSize: 13.5, lineHeight: 1.6 }}>
              Vue consolidee avec filtre temporel unique pour lire la production, les revenus, les couts et la qualite sur un meme axe d'analyse.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 10, minWidth: 280 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-card2) 84%, transparent)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', letterSpacing: 1 }}>SYNCHRONISATION</div>
              <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--tx-1)' }}>{time.toLocaleDateString('fr-FR')} · {time.toLocaleTimeString('fr-FR')}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.label} href={action.href} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid color-mix(in srgb, ${action.color} 28%, transparent)`, background: `color-mix(in srgb, ${action.color} 14%, transparent)`, color: action.color, fontSize: 11, fontWeight: 600 }}>
                    {action.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Filtre temporel</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { key: 'month', label: 'Par mois' },
              { key: 'week', label: 'Par semaine' },
              { key: 'custom', label: 'Periode precise' },
            ].map((item) => (
              <button key={item.key} className={periodMode === item.key ? 'btn-primary' : 'btn-ghost'} onClick={() => setPeriodMode(item.key as PeriodMode)} style={{ fontSize: 11 }}>
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {periodMode === 'month' && (
              <div>
                <label className="form-label">Mois</label>
                <select className="form-input" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {availableMonthKeys.map((item) => <option key={item} value={item}>{formatMonthLabel(item)}</option>)}
                </select>
              </div>
            )}
            {periodMode === 'week' && (
              <div>
                <label className="form-label">Semaine</label>
                <select className="form-input" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
                  {availableWeekKeys.map((item) => <option key={item} value={item}>{`S${item.split('-W')[1]} · ${formatWeekLabel(item)}`}</option>)}
                </select>
              </div>
            )}
            {periodMode === 'custom' && (
              <>
                <div>
                  <label className="form-label">Debut</label>
                  <input className="form-input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Fin</label>
                  <input className="form-input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card2)', display: 'flex', alignItems: 'center', color: 'var(--tx-2)', fontSize: 12 }}>
                  Aggregation auto: {activeRange.bucketMode === 'day' ? 'jour' : activeRange.bucketMode === 'week' ? 'semaine' : 'mois'}
                </div>
              </>
            )}
          </div>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)', letterSpacing: 1 }}>PERIODE ACTIVE · {activeRange.label || 'Selectionnez une periode'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi" style={{ '--accent': kpi.color, '--progress': '78%' } as never}>
            <div className="kpi-label"><span>{kpi.label}</span><span style={{ color: kpi.color }}>●</span></div>
            <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div style={{ marginTop: 8, color: 'var(--tx-2)', fontSize: 12 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14 }}>
        <div className="card">
          <div className="section-label">Production et finance</div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={derived.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <YAxis yAxisId="kg" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <YAxis yAxisId="mad" orientation="right" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => {
                    if (name === 'Production' || name === 'Dechets') return [formatKg(value), name]
                    return [formatCurrency(value), name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                <Line yAxisId="kg" type="monotone" dataKey="production" name="Production" stroke="#10b981" strokeWidth={3} />
                <Line yAxisId="kg" type="monotone" dataKey="waste" name="Dechets" stroke="#ef4444" strokeDasharray="5 4" strokeWidth={2} />
                <Line yAxisId="mad" type="monotone" dataKey="revenue" name="CA" stroke="#3b82f6" strokeWidth={2.5} />
                <Line yAxisId="mad" type="monotone" dataKey="costs" name="Couts" stroke="#f59e0b" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-label">Synthese direction</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { label: 'Marge brute', value: formatCurrency(derived.grossMargin), tone: derived.grossMargin >= 0 ? 'tag-green' : 'tag-red', note: `${formatCurrency(derived.totalRevenue)} revenus pour ${formatCurrency(derived.actualCosts)} couts reels` },
              { label: 'Recouvrement', value: formatPct(derived.invoiceCollectionRate), tone: derived.invoiceCollectionRate >= 70 ? 'tag-green' : 'tag-amber', note: `${formatCurrency(derived.paidRevenue)} encaisses` },
              { label: 'Taux premium', value: formatPct(derived.premiumRate), tone: derived.premiumRate >= 55 ? 'tag-green' : 'tag-amber', note: 'part categorie 1 sur la periode' },
              { label: 'Taux de perte', value: formatPct(derived.wasteRate), tone: derived.wasteRate <= 8 ? 'tag-green' : 'tag-red', note: `${formatKg(derived.totalWasteKg)} en dechets` },
              { label: 'Campagnes actives', value: String(derived.activeCampaigns), tone: derived.activeCampaigns > 0 ? 'tag-blue' : 'tag-amber', note: `${data.stats.serres} serres suivies` },
            ].map((item) => (
              <div key={item.label} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--tx-1)' }}>{item.label}</div>
                  <span className={`tag ${item.tone}`}>{item.value}</span>
                </div>
                <div style={{ marginTop: 6, color: 'var(--tx-2)', fontSize: 12.5 }}>{item.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
        <div className="card">
          <div className="section-label">Mix qualite</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={derived.qualityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={90} paddingAngle={3}>
                  {derived.qualityData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [formatKg(value), 'Quantite']} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-label">Factures par statut</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={derived.invoiceStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={90} paddingAngle={3}>
                  {derived.invoiceStatusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [formatCurrency(value), 'Montant']} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-label">Couts par categorie</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={derived.costCategoryData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="category" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [formatCurrency(value), 'Montant']} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tx-2)' }} />
                <Bar dataKey="planned" name="Prevu" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Reel" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 14 }}>
        <div className="card">
          <div className="section-label">Top serres sur la periode</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={derived.topGreenhouses} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} />
                <YAxis type="category" dataKey="code" tick={{ fill: 'var(--tx-3)', fontSize: 10 }} width={70} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [formatKg(value), 'Production']} />
                <Bar dataKey="production" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-label">Dernieres recoltes filtrees</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Serre</th>
                  <th>Lot</th>
                  <th>Total</th>
                  <th>Dechets</th>
                </tr>
              </thead>
              <tbody>
                {derived.recentHarvests.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx-3)', padding: 24 }}>
                      Aucune recolte sur cette periode.
                    </td>
                  </tr>
                ) : (
                  derived.recentHarvests.map((item) => (
                    <tr key={item.id}>
                      <td>{item.date ? formatShortDate(item.date) : '-'}</td>
                      <td>{item.greenhouse}</td>
                      <td>{item.lot}</td>
                      <td>{formatKg(item.total)}</td>
                      <td>{formatKg(item.waste)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
