'use client'
/**
 * AIAssistantFAB — Bouton flottant d'assistant IA, accessible partout.
 *
 * Le CEO clique → un panneau s'ouvre avec :
 *   - Synthèse globale (oneLiner + insights critiques) calculée en local
 *   - Questions rapides pré-remplies (réponses instantanées, déterministes)
 *   - Top actions cliquables vers les modules concernés
 *
 * Pas d'appel réseau pour les réponses standard → instantané, pas de coût LLM.
 * Le CEO peut toujours aller dans /admin/compte-exploitation pour le chat IA
 * approfondi (Gemini/Claude).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, X, ArrowRight, ChevronRight, Loader2, Bot, MessageCircle,
  AlertTriangle, CheckCircle2, AlertCircle, Info, Lightbulb,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { formatMoney, formatWeight } from '@/lib/format'
import {
  buildGlobalInsight, answerQuestion, QUICK_QUESTIONS,
  type DashboardMetrics, type Insight, type InsightLevel,
} from '@/lib/aiInsights'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toNum = (v: any) => (typeof v === 'number' && !isNaN(v) ? v : 0)
const parseMeta = (s: string | null): any => { try { return JSON.parse(s || '{}') } catch { return {} } }
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const endOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
const daysAgo = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) }
const inRange = (d: string | null | undefined, from: string, to: string) => !!(d && d.slice(0, 10) >= from && d.slice(0, 10) <= to)
const diffDays = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

const LEVEL_COLOR: Record<InsightLevel, string> = {
  good: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  info: '#3b82f6',
}
const LEVEL_ICON: Record<InsightLevel, any> = {
  good: CheckCircle2,
  warning: AlertCircle,
  critical: AlertTriangle,
  info: Info,
}

// ════════════════════════════════════════════════════════════════════════════
// HOOK : récupère les métriques globales depuis Supabase (mêmes données que /)
// ════════════════════════════════════════════════════════════════════════════
function useGlobalMetrics(triggerLoad: boolean) {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!triggerLoad || !user) return
    let mounted = true
    async function load() {
      setLoading(true)
      const monthStart = startOfMonth()
      const monthEnd = endOfMonth()
      const last30 = daysAgo(30)
      const prev30Start = daysAgo(60)
      const prev30End = daysAgo(31)
      const fromStart = daysAgo(180)
      const today = new Date().toISOString().slice(0, 10)

      const [
        harvestsRes, plantingsRes, ghsRes, invoicesRes, supplierInvRes,
        costsRes, campaignsRes, dispatchesRes, stockRes, workersRes,
      ] = await Promise.all([
        supabase.from('harvests').select('id, harvest_date, total_qty, qty_category_1, qty_category_2, qty_category_3, qty_waste, campaign_planting_id').gte('harvest_date', fromStart).limit(300),
        supabase.from('campaign_plantings').select('id, greenhouse_id, planted_area, target_yield_per_m2, target_total_production'),
        supabase.from('greenhouses').select('id, code'),
        supabase.from('invoices').select('status, total_amount, paid_amount, invoice_date, due_date, clients(name)').gte('invoice_date', fromStart).limit(200),
        supabase.from('supplier_invoices').select('total_amount, paid_amount, invoice_date, due_date').gte('invoice_date', fromStart).limit(200),
        supabase.from('cost_entries').select('amount, is_planned, entry_date').gte('entry_date', fromStart).limit(500),
        supabase.from('campaigns').select('id, name, status, production_target_kg, preparation_start, campaign_end, budget_total').order('preparation_start', { ascending: false, nullsFirst: false }).limit(5),
        supabase.from('harvest_lots').select('id, quantity_kg, notes, created_at').eq('category', 'station_dispatch').gte('created_at', fromStart).limit(200),
        supabase.from('stock_items').select('id, name, current_qty, min_qty').eq('is_active', true).limit(200),
        supabase.from('workers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      if (!mounted) return

      const harvests = (harvestsRes.data ?? []) as any[]
      const plantings = (plantingsRes.data ?? []) as any[]
      const greenhouses = (ghsRes.data ?? []) as any[]
      const invoices = (invoicesRes.data ?? []) as any[]
      const supplierInvoices = (supplierInvRes.data ?? []) as any[]
      const costEntries = (costsRes.data ?? []) as any[]
      const campaigns = (campaignsRes.data ?? []) as any[]
      const dispatches = (dispatchesRes.data ?? []) as any[]
      const stockItems = (stockRes.data ?? []) as any[]
      const workersCount = workersRes.count ?? 0

      // Production ───────────
      const harvestsMonth = harvests.filter(h => inRange(h.harvest_date, monthStart, monthEnd))
      const harvests30    = harvests.filter(h => inRange(h.harvest_date, last30, today))
      const harvestsPrev30 = harvests.filter(h => inRange(h.harvest_date, prev30Start, prev30End))
      const prodMonth = harvestsMonth.reduce((s, h) => s + toNum(h.total_qty), 0)
      const prod30    = harvests30.reduce((s, h) => s + toNum(h.total_qty), 0)
      const prodPrev30 = harvestsPrev30.reduce((s, h) => s + toNum(h.total_qty), 0)
      const prodTrend = prodPrev30 > 0 ? ((prod30 - prodPrev30) / prodPrev30) * 100 : 0
      const cat1 = harvestsMonth.reduce((s, h) => s + toNum(h.qty_category_1), 0)
      const cat2 = harvestsMonth.reduce((s, h) => s + toNum(h.qty_category_2), 0)
      const cat3 = harvestsMonth.reduce((s, h) => s + toNum(h.qty_category_3), 0)
      const waste = harvestsMonth.reduce((s, h) => s + toNum(h.qty_waste), 0)
      const totalQ = cat1 + cat2 + cat3 + waste
      const premiumRate = totalQ > 0 ? (cat1 / totalQ) * 100 : 0
      const wasteRate = totalQ > 0 ? (waste / totalQ) * 100 : 0

      const activePlantings = plantings.filter(p => toNum(p.target_yield_per_m2) > 0 && toNum(p.planted_area) > 0)
      const totalPlantedArea = activePlantings.reduce((s, p) => s + toNum(p.planted_area), 0)
      const allHarvests = harvests.reduce((s, h) => s + toNum(h.total_qty), 0)
      const yieldKgM2 = totalPlantedArea > 0 ? allHarvests / totalPlantedArea : 0
      const targetYield = activePlantings.length > 0 && totalPlantedArea > 0
        ? activePlantings.reduce((s, p) => s + toNum(p.target_yield_per_m2) * toNum(p.planted_area), 0) / totalPlantedArea
        : 0
      const yieldRatio = targetYield > 0 ? (yieldKgM2 / targetYield) * 100 : 0

      // Commerce ────────────
      const caDispatches = dispatches.reduce((s, d) => s + toNum(parseMeta(d.notes).ca_amount), 0)
      const dispatchesNoPriceCount = dispatches.filter(d => !parseMeta(d.notes).ca_amount && toNum(d.quantity_kg) > 0).length

      // Factures ────────────
      const totalInvoiced = invoices.reduce((s, i) => s + toNum(i.total_amount), 0)
      const totalCollected = invoices.reduce((s, i) => s + toNum(i.paid_amount), 0)
      const totalReceivable = invoices.reduce((s, i) => s + Math.max(toNum(i.total_amount) - toNum(i.paid_amount), 0), 0)
      const overdueInvoices = invoices.filter(i => {
        const remain = toNum(i.total_amount) - toNum(i.paid_amount)
        const due = i.due_date?.slice(0, 10)
        return remain > 0 && due && due < today
      })
      const overdueAmount = overdueInvoices.reduce((s, i) => s + Math.max(toNum(i.total_amount) - toNum(i.paid_amount), 0), 0)

      // Top créance par client
      const recvByClient = new Map<string, number>()
      invoices.forEach(i => {
        const remain = Math.max(toNum(i.total_amount) - toNum(i.paid_amount), 0)
        if (remain > 0) {
          const name = i.clients?.name ?? '—'
          recvByClient.set(name, (recvByClient.get(name) ?? 0) + remain)
        }
      })
      const sortedRecv = Array.from(recvByClient.entries()).sort((a, b) => b[1] - a[1])
      const topReceivableName = sortedRecv[0]?.[0]
      const topReceivableAmount = sortedRecv[0]?.[1]

      // Coûts ────────────
      const totalCostsAll = costEntries.filter(c => !c.is_planned).reduce((s, c) => s + toNum(c.amount), 0)
      const totalPaidOut = supplierInvoices.reduce((s, i) => s + toNum(i.paid_amount), 0)
      const totalToPay = supplierInvoices.reduce((s, i) => s + Math.max(toNum(i.total_amount) - toNum(i.paid_amount), 0), 0)
      const cashPosition = totalCollected - totalPaidOut
      const caTotal = totalInvoiced + caDispatches
      const margeBrute = caTotal - totalCostsAll
      const margePct = caTotal > 0 ? (margeBrute / caTotal) * 100 : 0

      // Budget ────────────
      const activeCampaign = campaigns.find(c => c.status === 'en_cours') ?? campaigns[0]
      const budgetTotal = toNum(activeCampaign?.budget_total)
      let budgetProgressPct = 0
      if (activeCampaign?.preparation_start && activeCampaign?.campaign_end) {
        const totalDays = diffDays(activeCampaign.preparation_start, activeCampaign.campaign_end)
        const elapsedDays = Math.max(0, diffDays(activeCampaign.preparation_start, today))
        budgetProgressPct = totalDays > 0 ? Math.min(100, (elapsedDays / totalDays) * 100) : 0
      }
      const expectedCostsByNow = (budgetTotal * budgetProgressPct) / 100
      const costsVsBudgetPct = expectedCostsByNow > 0 ? ((totalCostsAll - expectedCostsByNow) / expectedCostsByNow) * 100 : 0

      // Performance par serre ────────────
      const ghMap = new Map(greenhouses.map(g => [g.id, g]))
      const plantingMap = new Map(plantings.map(p => [p.id, p]))
      const perfByGh = new Map<string, { code: string; production: number; target: number }>()
      harvests.forEach(h => {
        if (!h.campaign_planting_id) return
        const p = plantingMap.get(h.campaign_planting_id) as any
        if (!p?.greenhouse_id) return
        const gh = ghMap.get(p.greenhouse_id) as any
        if (!gh) return
        const cur = perfByGh.get(gh.id) ?? { code: gh.code ?? '?', production: 0, target: 0 }
        cur.production += toNum(h.total_qty)
        perfByGh.set(gh.id, cur)
      })
      plantings.forEach(p => {
        if (!p.greenhouse_id) return
        const gh = ghMap.get(p.greenhouse_id) as any
        if (!gh) return
        const cur = perfByGh.get(gh.id) ?? { code: gh.code ?? '?', production: 0, target: 0 }
        cur.target += toNum(p.target_total_production)
        perfByGh.set(gh.id, cur)
      })
      const perfList = Array.from(perfByGh.values())
        .filter(g => g.target > 0)
        .map(g => ({ ...g, ratio: (g.production / g.target) * 100 }))
        .sort((a, b) => b.ratio - a.ratio)
      const topGh = perfList[0]
      const flopGh = perfList[perfList.length - 1]

      const stockAlertsCount = stockItems.filter(s => toNum(s.min_qty) > 0 && toNum(s.current_qty) <= toNum(s.min_qty)).length

      setMetrics({
        margeBrute, margePct, caTotal,
        totalCostsAll, expectedCostsByNow, costsVsBudgetPct, budgetTotal, budgetProgressPct,
        cashPosition, totalCollected, totalPaidOut, totalToPay,
        totalReceivable, overdueAmount, overdueInvoicesCount: overdueInvoices.length,
        topReceivableName, topReceivableAmount,
        prodMonth, prod30, prodPrev30, prodTrend,
        yieldKgM2, targetYield, yieldRatio, premiumRate, wasteRate, totalQ,
        topGhCode: topGh?.code, topGhRatio: topGh?.ratio,
        flopGhCode: flopGh?.code, flopGhRatio: flopGh?.ratio,
        dispatchesNoPriceCount, caDispatches,
        stockAlertsCount, workersCount,
      })
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [triggerLoad, user])

  return { metrics, loading }
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export function AIAssistantFAB() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'home' | 'answer'>('home')
  const [activeQ, setActiveQ] = useState<typeof QUICK_QUESTIONS[number] | null>(null)
  const { metrics, loading } = useGlobalMetrics(open)
  const { user } = useAuth()

  // ESC pour fermer
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const global = useMemo(() => metrics ? buildGlobalInsight(metrics) : null, [metrics])
  const answer = useMemo(() => (metrics && activeQ) ? answerQuestion(activeQ.key, metrics) : null, [metrics, activeQ])

  // Ne pas afficher sur la page login
  if (typeof window !== 'undefined' && window.location.pathname === '/login') return null
  if (!user) return null

  return (
    <>
      {/* ───── FAB ───── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0, rotate: -90 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setOpen(true); setView('home'); setActiveQ(null) }}
            className="fixed z-[80] flex items-center justify-center group"
            style={{
              bottom: 22, right: 22,
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--neon), color-mix(in srgb, var(--neon) 70%, #6366f1))',
              boxShadow: '0 8px 30px color-mix(in srgb, var(--neon) 40%, transparent), 0 2px 8px rgba(0,0,0,0.18)',
              border: '2px solid color-mix(in srgb, var(--neon) 50%, white)',
              cursor: 'pointer',
            }}
            title="Assistant IA — Synthèse instantanée"
          >
            <Sparkles size={22} strokeWidth={2.4} color="white" />
            {/* Pulse halo */}
            <span aria-hidden className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                animation: 'ai-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                boxShadow: '0 0 0 0 color-mix(in srgb, var(--neon) 60%, transparent)',
              }} />
            {/* Tooltip */}
            <span className="hidden md:block absolute right-full mr-3 px-3 py-1.5 rounded-md bg-fg-primary text-bg-base text-caption font-semibold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
              IA · Comment ça va ?
            </span>
            <style>{`
              @keyframes ai-pulse {
                0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--neon) 60%, transparent); }
                50% { box-shadow: 0 0 0 14px color-mix(in srgb, var(--neon) 0%, transparent); }
              }
            `}</style>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ───── Panel ───── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[78]"
              style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' }}
            />
            {/* Panel */}
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="fixed z-[79] flex flex-col overflow-hidden"
              style={{
                bottom: 22, right: 22,
                width: 'min(420px, calc(100vw - 44px))',
                maxHeight: 'min(680px, calc(100vh - 88px))',
                borderRadius: 18,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)',
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-sm px-md py-sm border-b border-border"
                style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--neon) 8%, transparent), transparent)' }}>
                <div className="flex items-center justify-center rounded-full"
                  style={{
                    width: 32, height: 32,
                    background: 'linear-gradient(135deg, var(--neon), color-mix(in srgb, var(--neon) 60%, #6366f1))',
                  }}>
                  <Sparkles size={16} strokeWidth={2.4} color="white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-body text-fg-primary leading-tight">Assistant IA</div>
                  <div className="text-caption text-fg-tertiary leading-tight">Synthèse instantanée</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-fg-tertiary hover:text-fg-primary hover:bg-surface-hover transition-colors"
                  title="Fermer (Échap)"
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-md">
                {loading || !metrics || !global ? (
                  <div className="flex flex-col items-center justify-center py-12 text-fg-tertiary">
                    <Loader2 size={28} className="animate-spin mb-sm" />
                    <div className="text-body-sm">Analyse des données…</div>
                  </div>
                ) : view === 'home' ? (
                  <HomeView
                    global={global}
                    metrics={metrics}
                    onPickQuestion={(q) => { setActiveQ(q); setView('answer') }}
                  />
                ) : (
                  <AnswerView
                    answer={answer!}
                    onBack={() => { setView('home'); setActiveQ(null) }}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-md py-2 border-t border-border bg-surface-sunk/40 flex items-center justify-between gap-sm">
                <div className="text-[10px] font-mono text-fg-tertiary uppercase tracking-wider">
                  Analyse locale · Pas d'effort
                </div>
                <Link
                  href="/admin/compte-exploitation"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-caption font-semibold text-brand hover:underline"
                >
                  Chat IA approfondi <ArrowRight size={11} />
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VUE HOME — synthèse + questions rapides
// ════════════════════════════════════════════════════════════════════════════
function HomeView({ global, metrics, onPickQuestion }: {
  global: ReturnType<typeof buildGlobalInsight>
  metrics: DashboardMetrics
  onPickQuestion: (q: typeof QUICK_QUESTIONS[number]) => void
}) {
  const color = LEVEL_COLOR[global.health === 'good' ? 'good' : global.health]
  const Icon = LEVEL_ICON[global.health === 'good' ? 'good' : global.health]

  return (
    <div className="space-y-md">
      {/* Synthèse santé globale */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border-l-[3px] p-md"
        style={{
          borderLeftColor: color,
          background: `color-mix(in srgb, ${color} 7%, transparent)`,
        }}
      >
        <div className="flex items-start gap-sm mb-sm">
          <div className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 28, height: 28, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
            <Icon size={15} strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-body-sm text-fg-primary leading-snug">
              {global.oneLiner}
            </div>
          </div>
        </div>

        {global.bullets.length > 0 && (
          <ul className="space-y-1.5 mt-sm">
            {global.bullets.map((b, i) => (
              <li key={i} className="text-caption text-fg-secondary leading-relaxed pl-1">
                {b}
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Top actions */}
      {global.topActions.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-2 px-1">
            🎯 Actions à fort impact
          </div>
          <div className="space-y-1.5">
            {global.topActions.slice(0, 4).map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="flex items-center gap-sm px-md py-2 rounded-md bg-surface-sunk hover:bg-surface-hover border border-border hover:border-border-strong transition-all duration-150 group"
              >
                <Lightbulb size={14} className="text-warning flex-shrink-0" strokeWidth={2.2} />
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-semibold text-fg-primary truncate">{a.label}</div>
                  {a.impact && <div className="text-caption font-mono text-fg-tertiary">{a.impact}</div>}
                </div>
                <ChevronRight size={13} className="text-fg-tertiary group-hover:text-fg-primary group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Questions rapides */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-2 px-1">
          💬 Questions fréquentes
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q.key}
              onClick={() => onPickQuestion(q)}
              className="text-left px-sm py-2 rounded-md border border-border bg-surface-raised hover:border-brand hover:bg-brand/5 hover:-translate-y-0.5 transition-all duration-150 group"
            >
              <div className="text-base mb-0.5">{q.emoji}</div>
              <div className="text-caption font-semibold text-fg-secondary group-hover:text-fg-primary leading-tight">
                {q.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VUE ANSWER — réponse à une question rapide
// ════════════════════════════════════════════════════════════════════════════
function AnswerView({ answer, onBack }: {
  answer: ReturnType<typeof answerQuestion>
  onBack: () => void
}) {
  const color = LEVEL_COLOR[answer.level]
  const Icon = LEVEL_ICON[answer.level]
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-md"
    >
      {/* Question */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-caption text-fg-tertiary hover:text-fg-primary transition-colors"
      >
        <ChevronRight size={11} className="rotate-180" />
        <span>Retour</span>
      </button>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-1">Vous demandez</div>
        <div className="font-display font-bold text-heading text-fg-primary leading-snug">
          {answer.question}
        </div>
      </div>

      {/* Réponse */}
      <div className="rounded-lg border-l-[3px] p-md"
        style={{
          borderLeftColor: color,
          background: `color-mix(in srgb, ${color} 6%, transparent)`,
        }}
      >
        <div className="flex items-start gap-sm">
          <div className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 26, height: 26, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
            <Icon size={14} strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0 text-body-sm text-fg-secondary leading-relaxed whitespace-pre-wrap">
            {answer.answer}
          </div>
        </div>
      </div>

      {answer.cta && (
        <Link
          href={answer.cta.href}
          className="inline-flex items-center gap-1.5 px-md py-2 rounded-md text-white font-semibold text-caption uppercase tracking-wider transition-all hover:-translate-y-0.5 hover:brightness-110"
          style={{ background: 'var(--neon)', boxShadow: '0 4px 14px var(--neon-dim)' }}
        >
          {answer.cta.label}
          <ArrowRight size={12} strokeWidth={2.4} />
        </Link>
      )}
    </motion.div>
  )
}
