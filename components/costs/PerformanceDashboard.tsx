'use client'
import { useMemo, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts'
import { Wheat, Gauge, Coins, TrendingUp, Wallet, Scale } from 'lucide-react'
import { KPICard } from '@/components/ui/KPICard'
import { formatPlanNumber } from '@/lib/farmLayout'
import { performanceValue, type PerformanceData, type PerformanceRow, type RevenueBasis, type PerformanceMetric } from '@/lib/farmPerformance'
import { performanceTimeline } from '@/lib/performanceTimeline'

const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899']
const fmt = (n: number | null) => n == null ? 'Non calculable' : n !== 0 && Math.abs(n) < .005 ? (n < 0 ? '> −0,01' : '< 0,01') : formatPlanNumber(n)
const ticks = (n: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const tooltip = { background: 'var(--bg-card)', border: '1px solid var(--bd-1)', borderRadius: 8, color: 'var(--tx-1)', fontSize: 12 }
const axis = { fontSize: 10, fill: 'var(--tx-3)' }

export function PerformanceDashboard({ data, rows, ranked, basis, metric, metricLabel, partialPeriod, onSelect }: {
  data: PerformanceData; rows: PerformanceRow[]; ranked: PerformanceRow[]; basis: RevenueBasis; metric: PerformanceMetric; metricLabel: string; partialPeriod: boolean; onSelect: (id: string) => void
}) {
  const [grain, setGrain] = useState<'week' | 'month'>('month')
  const [cumulative, setCumulative] = useState(true)
  const timeline = useMemo(() => performanceTimeline(data, rows.flatMap(r => r.plantingIds), grain), [data, rows, grain])
  const kg = rows.reduce((s, r) => s + r.kg, 0), area = rows.reduce((s, r) => s + r.area, 0), cost = rows.reduce((s, r) => s + r.direct + r.shared, 0)
  const incomplete = rows.some(r => r.costMissing || r.provisional) || data.pending_movements.length > 0
  const revenue = rows.length && rows.every(r => performanceValue(r, 'revenue', basis) != null) ? rows.reduce((s, r) => s + performanceValue(r, 'revenue', basis)!, 0) : null
  const margin = rows.length && rows.every(r => performanceValue(r, 'margin', basis) != null) ? rows.reduce((s, r) => s + performanceValue(r, 'margin', basis)!, 0) : null
  const target = rows.reduce((s, r) => s + r.target, 0), targetKnown = !partialPeriod && rows.length > 0 && rows.every(r => !r.targetMissing)
  const categories = Object.entries(rows.reduce((all, r) => { for (const [name, value] of Object.entries(r.categories)) all[name] = (all[name] || 0) + value; return all }, {} as Record<string, number>)).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const comparison = ranked.slice(0, 8).map(r => ({ id: r.id, name: r.name, value: performanceValue(r, metric, basis)! }))
  const kpis = [
    { label: 'Production récoltée', value: `${fmt(kg)} kg`, sub: targetKnown ? `${fmt(100 * kg / target)} % de l’objectif de ${fmt(target)} kg` : 'Toutes catégories récoltées, déchets inclus', icon: Wheat, accent: colors[0] },
    { label: 'Rendement réel', value: `${fmt(area > 0 ? kg / area : null)} kg/m²`, sub: `${fmt(area)} m² plantés · ratio pondéré`, icon: Gauge, accent: colors[1] },
    { label: 'Coût de production / kg', value: `${fmt(kg > 0 && !rows.some(r => r.costMissing) ? cost / kg : null)} DH`, sub: incomplete ? 'Provisoire · charges à compléter / contrôler' : 'Charges enregistrées ÷ kg récoltés', icon: Scale, accent: colors[3] },
    { label: 'Charges imputées', value: `${fmt(cost)} DH`, sub: 'Consommations et charges réparties · hors budget', icon: Coins, accent: colors[4] },
    ...(data.revenue_available ? [
      { label: basis === 'estimate' ? 'CA estimé des récoltes' : 'CA saisi en station', value: `${fmt(revenue)} DH`, sub: revenue == null ? 'Prix ou tarification à compléter' : basis === 'estimate' ? 'Récoltes × prix export / local' : 'Montants des lots · non assimilés aux encaissements', icon: Wallet, accent: colors[2] },
      { label: 'Marge sur charges saisies', value: `${fmt(margin)} DH`, sub: incomplete ? 'Provisoire · coûts incomplets' : 'CA sélectionné − charges imputées', icon: TrendingUp, accent: margin != null && margin < 0 ? '#ef4444' : colors[2] },
    ] : []),
  ]
  return <div className="space-y-4">
    <div aria-label="Synthèse du périmètre filtré" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{kpis.map(k => <KPICard key={k.label} {...k} variant="compact" />)}</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card min-w-0 p-4" aria-label="Progression des récoltes">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Progression des récoltes</h2><p className="text-xs" style={{ color: 'var(--tx-3)' }}>Volumes {cumulative ? 'cumulés depuis le début du périmètre' : 'par période'} · kg</p></div>
          <div className="flex flex-wrap gap-2"><select aria-label="Granularité des courbes" className="input" style={{ width: 'auto' }} value={grain} onChange={e => setGrain(e.target.value as typeof grain)}><option value="month">Mensuelle</option><option value="week">Hebdomadaire</option></select><button className="btn btn-secondary" aria-pressed={cumulative} onClick={() => setCumulative(v => !v)}>{cumulative ? 'Cumulé' : 'Par période'}</button></div>
        </div>
        {timeline.length ? <><div className="mt-4" style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}><defs><linearGradient id="performanceHarvestFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity={.3}/><stop offset="100%" stopColor="#06b6d4" stopOpacity={.02}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--bd-1)" strokeDasharray="3 3"/><XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false}/><YAxis tick={axis} tickFormatter={ticks} axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltip} formatter={(v: number) => [`${fmt(v)} kg`, cumulative ? 'Récolte cumulée' : 'Récolte de la période']}/><Area type="linear" dataKey={cumulative ? 'cumulative' : 'kg'} stroke="#06b6d4" strokeWidth={3} fill="url(#performanceHarvestFill)" dot={{ r: 3 }} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><details className="mt-2 text-xs"><summary>Données de la courbe</summary><div className="max-h-40 overflow-auto"><table className="w-full"><tbody>{timeline.map(p => <tr key={p.date}><th className="text-left">{p.label}</th><td>{fmt(p.kg)} kg / période</td><td>{fmt(p.cumulative)} kg cumulés</td></tr>)}</tbody></table></div></details></> : <p className="py-20 text-center text-sm">Aucune récolte dans le périmètre filtré.</p>}
      </section>
      <section className="card min-w-0 p-4" aria-label="Classement graphique"><h2 className="font-semibold">Comparaison des performances</h2><p className="text-xs" style={{ color: 'var(--tx-3)' }}>{metricLabel} · 8 premiers éligibles · cliquez sur une barre pour le détail</p>
        {comparison.length ? <div style={{ height: Math.max(260, comparison.length * 40) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={comparison} layout="vertical" margin={{ top: 20, right: 22, left: 0, bottom: 5 }}><CartesianGrid horizontal={false} stroke="var(--bd-1)"/><XAxis type="number" tick={axis} tickFormatter={ticks}/><YAxis type="category" dataKey="name" width={120} tick={{ ...axis, fontSize: 10 }} tickFormatter={(s: string) => s.length > 22 ? s.slice(0, 21) + '…' : s}/><Tooltip contentStyle={tooltip} formatter={(v: number) => [fmt(v), metricLabel]}/><Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24} onClick={entry => onSelect(entry.id)} cursor="pointer" isAnimationActive={false}>{comparison.map((r, i) => <Cell key={r.id} fill={colors[i % colors.length]}/>)}</Bar></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm">Aucun classement fiable pour ce critère. Vérifiez les coûts, les récoltes ou incluez les cycles en cours.</p>}
        {ranked.length > 0 && <button className="mt-2 text-left text-sm" onClick={() => onSelect(ranked[0].id)} style={{ color: 'var(--neon)' }}>Meilleur résultat observé — provisoire : <strong>{ranked[0].name}</strong> · {fmt(performanceValue(ranked[0], metric, basis))}</button>}
      </section>
    </div>
    <section className="card p-4"><h2 className="font-semibold">Où vont les charges ?</h2><p className="mb-4 text-xs" style={{ color: 'var(--tx-3)' }}>Répartition des charges réelles imputées au périmètre filtré · DH</p><div className="grid gap-x-8 gap-y-3 md:grid-cols-2">{categories.map((c, i) => <div key={c.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{c.name}</span><strong>{fmt(c.value)} DH</strong></div><div style={{ height: 6, background: 'var(--bd-1)', borderRadius: 4 }}><div style={{ height: '100%', width: `${Math.min(100, Math.abs(c.value) / Math.max(1, ...categories.map(x => Math.abs(x.value))) * 100)}%`, background: colors[i % colors.length], borderRadius: 4 }}/></div></div>)}</div>{!categories.length && <p className="text-sm">Aucune charge imputée ; un coût nul ne signifie pas une production gratuite.</p>}</section>
  </div>
}
