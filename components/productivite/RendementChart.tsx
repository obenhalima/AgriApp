'use client'
// ============================================================
// Évolution du rendement jour après jour, par tâche.
//   • Tâche « récolte » (is_harvest) → rendement = kg récoltés / heures pointées
//   • Autres tâches (effeuillage…)   → rendement = quantité faite / heures pointées
// Permet de voir si le rendement se maintient, progresse ou se dégrade.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { unitLabel } from '@/lib/labor'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select as TSelect } from '@/components/ui/Input'

type Point = { date: string; label: string; rendement: number; hours: number; qty: number }

const TOOLTIP_STYLE = {
  contentStyle: { background: '#faf6ed', border: '1px solid #d8c9a8', borderRadius: 10, fontSize: 12, color: '#2c1f0e', boxShadow: '0 4px 12px rgba(44,31,14,0.12)' },
  labelStyle: { color: '#2c1f0e', fontWeight: 700 },
}

export function RendementChart({ campaignId }: { campaignId: string }) {
  const { values: TASKS } = useReferenceList('labor_task')
  const [taskCode, setTaskCode] = useState('')
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(false)

  // Tâche par défaut : la première ayant une unité de rendement
  useEffect(() => {
    if (taskCode || TASKS.length === 0) return
    const withUnit = TASKS.find((t: any) => t.metadata?.unit)
    setTaskCode(withUnit?.code ?? TASKS[0].code)
  }, [TASKS, taskCode])

  const task = useMemo(() => TASKS.find(t => t.code === taskCode) as any, [TASKS, taskCode])
  const unit: string | null = task?.metadata?.unit ?? null
  const isHarvest = !!task?.metadata?.is_harvest

  useEffect(() => {
    if (!campaignId || !taskCode) return
    setLoading(true)
    ;(async () => {
      try {
        const lab = await supabase.from('labor_entries')
          .select('work_date, person_hours, quantity_done')
          .eq('campaign_id', campaignId).eq('operation_type', taskCode)
        const byDate = new Map<string, { hours: number; qty: number }>()
        for (const r of (lab.data ?? []) as any[]) {
          const cur = byDate.get(r.work_date) ?? { hours: 0, qty: 0 }
          cur.hours += Number(r.person_hours) || 0
          cur.qty += Number(r.quantity_done) || 0
          byDate.set(r.work_date, cur)
        }

        // Récolte : la quantité vient des kg récoltés ce jour-là
        if (isHarvest && byDate.size > 0) {
          const h = await supabase.from('harvests')
            .select('harvest_date, total_qty, campaign_plantings!inner(campaign_id)')
            .eq('campaign_plantings.campaign_id', campaignId)
          const kgByDate = new Map<string, number>()
          for (const r of (h.data ?? []) as any[]) {
            kgByDate.set(r.harvest_date, (kgByDate.get(r.harvest_date) ?? 0) + (Number(r.total_qty) || 0))
          }
          for (const [d, v] of byDate) v.qty = kgByDate.get(d) ?? 0
        }

        const pts: Point[] = Array.from(byDate.entries())
          .filter(([, v]) => v.hours > 0 && v.qty > 0)
          .map(([date, v]) => ({
            date, label: date.slice(5), // MM-DD
            rendement: v.qty / v.hours, hours: v.hours, qty: v.qty,
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
        setPoints(pts)
      } finally { setLoading(false) }
    })()
  }, [campaignId, taskCode, isHarvest])

  const stats = useMemo(() => {
    if (points.length === 0) return null
    const vals = points.map(p => p.rendement)
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const first = vals[0], last = vals[vals.length - 1]
    const deltaPct = first > 0 ? ((last - first) / first) * 100 : 0
    return { avg, min: Math.min(...vals), max: Math.max(...vals), deltaPct, n: points.length }
  }, [points])

  const u = unitLabel(unit)
  const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-md py-sm border-b border-border flex items-center justify-between gap-md flex-wrap">
        <div className="font-display text-heading-sm font-bold text-fg-primary">Évolution du rendement — jour après jour</div>
        <TSelect value={taskCode} onChange={(e) => setTaskCode(e.target.value)} className="h-8 w-auto min-w-[180px]">
          {TASKS.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
        </TSelect>
      </div>

      {!unit ? (
        <EmptyState icon={Minus} title="Cette tâche n'a pas d'unité de rendement" description="Définis une unité pour cette tâche dans /admin/référentiels (liste « Tâches de main-d'œuvre »)." />
      ) : loading ? (
        <div className="p-lg text-body-sm text-fg-tertiary">Chargement…</div>
      ) : points.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Pas encore de données"
          description={isHarvest
            ? 'Pointe des heures de cueillette (le tonnage vient des récoltes) pour voir la courbe.'
            : `Pointe des heures sur cette tâche en indiquant le travail réalisé (en ${u}) pour voir la courbe.`} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md p-md border-b border-border">
            <div><div className="text-caption text-fg-tertiary">Moyenne</div><div className="font-display font-bold text-fg-primary">{fmt(stats!.avg)} {u}/h</div></div>
            <div><div className="text-caption text-fg-tertiary">Min</div><div className="font-mono text-fg-secondary">{fmt(stats!.min)}</div></div>
            <div><div className="text-caption text-fg-tertiary">Max</div><div className="font-mono text-fg-secondary">{fmt(stats!.max)}</div></div>
            <div>
              <div className="text-caption text-fg-tertiary">Tendance</div>
              <div className={`font-bold inline-flex items-center gap-1 ${stats!.deltaPct > 5 ? 'text-success' : stats!.deltaPct < -5 ? 'text-danger' : 'text-fg-secondary'}`}>
                {stats!.deltaPct > 5 ? <TrendingUp size={14} /> : stats!.deltaPct < -5 ? <TrendingDown size={14} /> : <Minus size={14} />}
                {stats!.deltaPct >= 0 ? '+' : ''}{fmt(stats!.deltaPct)}%
              </div>
            </div>
          </div>
          <div className="p-md">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8d9b8" />
                <XAxis dataKey="label" tick={{ fill: '#9b8a6e', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9b8a6e', fontSize: 10 }} />
                <Tooltip {...TOOLTIP_STYLE}
                  formatter={(v: number) => [`${fmt(v)} ${u}/h`, 'Rendement']}
                  labelFormatter={(l) => `Jour ${l}`} />
                <ReferenceLine y={stats!.avg} stroke="#c8882a" strokeDasharray="5 4" />
                <Line type="monotone" dataKey="rendement" name="Rendement" stroke="#5a7a35" strokeWidth={2.5} dot={{ r: 3, fill: '#5a7a35' }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-1 text-caption text-fg-tertiary text-center">
              {stats!.n} jour(s) pointé(s) · ligne pointillée = moyenne ({fmt(stats!.avg)} {u}/h)
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
