'use client'
/**
 * Onglet VOLUMES — Pivot multi-axes (Ferme/Serre/Variété/Type) × (Total/Mensuel)
 * en kg ou MAD, par canal Export/Local/Total.
 */
import { useMemo, useState } from 'react'
import {
  PlantingRow, PivotAxis, PivotMetric, PivotChannel,
  buildPivot, monthsBetween, monthKey,
} from '@/lib/plantingPlan'
import { MONTH_LABELS_FR } from '@/lib/budgets'
import {
  createWorkbook, applyTitleRow, styleHeaderRow,
  setColumnWidths, freezePanes, downloadWorkbook, NUM_FMT, thinBorder, XLS_COLORS,
} from '@/lib/exportExcel'

type Campaign = { id: string; name: string; preparation_start: string | null; campaign_end: string | null } | undefined

export function VolumesTab(props: { rows: PlantingRow[]; campaign: Campaign; loading: boolean }) {
  const { rows, campaign, loading } = props

  const [axis, setAxis] = useState<PivotAxis>('variety')
  const [metric, setMetric] = useState<PivotMetric>('volume_kg')
  const [channel, setChannel] = useState<PivotChannel>('all')
  const [viewMode, setViewMode] = useState<'total' | 'monthly'>('monthly')

  // ─── Mois de la campagne ───
  const months = useMemo(() => {
    if (!campaign?.preparation_start || !campaign?.campaign_end) return []
    return monthsBetween(new Date(campaign.preparation_start), new Date(campaign.campaign_end))
  }, [campaign])

  // ─── Pivot ───
  const pivot = useMemo(() => buildPivot(rows, { axis, metric, channel }), [rows, axis, metric, channel])

  // ─── Total général ───
  const grandTotal = useMemo(() => pivot.reduce((s, r) => s + r.total, 0), [pivot])
  const monthlyTotals = useMemo(() => {
    const out: Record<string, number> = {}
    pivot.forEach(r => {
      Object.entries(r.byMonth).forEach(([k, v]) => { out[k] = (out[k] ?? 0) + v })
    })
    return out
  }, [pivot])

  const fmt = (v: number): string => {
    if (v === 0) return '—'
    if (metric === 'volume_t' || metric === 'ca_kmad') return v.toLocaleString('fr', { maximumFractionDigits: 1 })
    return v.toLocaleString('fr', { maximumFractionDigits: 0 })
  }

  // ─── Export Excel formaté ───
  const exportExcel = async () => {
    const wb = await createWorkbook()
    const ws = wb.addWorksheet('Volumes')

    const axisLabel = AXIS_LABELS[axis]
    const metricLabel = METRIC_LABELS[metric]
    const channelLabel = CHANNEL_LABELS[channel]

    const headers: string[] = [axisLabel]
    if (viewMode === 'monthly') {
      months.forEach(m => headers.push(`${MONTH_LABELS_FR[m.month - 1]} ${String(m.year).slice(-2)}`))
    }
    headers.push('TOTAL')

    const totalCols = headers.length

    applyTitleRow(ws, `BUDGET VOLUMES — ${campaign?.name ?? 'Campagne'}`, totalCols, {
      subtitle: `Axe : ${axisLabel}  ·  Métrique : ${metricLabel}  ·  Canal : ${channelLabel}  ·  Vue : ${viewMode === 'monthly' ? 'Mensuelle' : 'Total'}`,
    })
    ws.getRow(3).height = 6

    const headerRowIdx = 4
    const r1 = ws.getRow(headerRowIdx)
    headers.forEach((h, i) => { r1.getCell(i + 1).value = h })
    styleHeaderRow(r1)

    let rowIdx = headerRowIdx + 1
    pivot.forEach((p, i) => {
      const r = ws.getRow(rowIdx++)
      r.getCell(1).value = p.axisLabel
      let col = 2
      if (viewMode === 'monthly') {
        months.forEach(m => {
          const k = monthKey(m.year, m.month)
          r.getCell(col++).value = p.byMonth[k] ?? 0
        })
      }
      r.getCell(col).value = p.total
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        cell.alignment = c === 1 ? { horizontal: 'left', indent: 1 } : { horizontal: 'right' }
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
      })
      if (i % 2 === 0) {
        r.eachCell({ includeEmpty: true }, (cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_COLORS.rowEvenFill } }
        })
      }
    })

    // Ligne TOTAL
    const tr = ws.getRow(rowIdx++)
    tr.getCell(1).value = 'TOTAL'
    let col = 2
    if (viewMode === 'monthly') {
      months.forEach(m => {
        const k = monthKey(m.year, m.month)
        tr.getCell(col++).value = monthlyTotals[k] ?? 0
      })
    }
    tr.getCell(col).value = grandTotal
    tr.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
      cell.border = thinBorder
      cell.alignment = c === 1 ? { horizontal: 'left', indent: 1 } : { horizontal: 'right' }
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    })
    tr.height = 22

    const widths: number[] = [28]
    if (viewMode === 'monthly') months.forEach(() => widths.push(11))
    widths.push(14)
    setColumnWidths(ws, widths)
    freezePanes(ws, { rows: headerRowIdx, cols: 1 })

    await downloadWorkbook(wb, `Volumes_${(campaign?.name ?? 'campagne').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>CHARGEMENT…</div>
  if (rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div className="empty-icon">📦</div>
        <div className="empty-title">Pas de volumes à afficher</div>
      </div>
    )
  }

  return (
    <div>
      {/* ─── Toolbar ─── */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Selector label="AXE" value={axis} onChange={setAxis as any} options={[
          { v: 'farm', l: 'Ferme' },
          { v: 'greenhouse', l: 'Serre' },
          { v: 'variety', l: 'Variété' },
          { v: 'tomato_type', l: 'Type tomate' },
        ]} />
        <Selector label="MÉTRIQUE" value={metric} onChange={setMetric as any} options={[
          { v: 'volume_kg', l: 'Volume (kg)' },
          { v: 'volume_t',  l: 'Volume (t)' },
          { v: 'ca_mad',    l: 'CA (MAD)' },
          { v: 'ca_kmad',   l: 'CA (kMAD)' },
        ]} />
        <Selector label="CANAL" value={channel} onChange={setChannel as any} options={[
          { v: 'all',    l: 'Total' },
          { v: 'export', l: 'Export' },
          { v: 'local',  l: 'Local' },
        ]} />
        <Selector label="VUE" value={viewMode} onChange={setViewMode as any} options={[
          { v: 'total',   l: 'Total' },
          { v: 'monthly', l: 'Mensuel' },
        ]} />

        <div style={{ marginLeft: 'auto' }}>
          <button onClick={exportExcel}
            style={{ padding: '7px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            📥 EXPORT XLSX
          </button>
        </div>
      </div>

      {/* ─── Pivot table ─── */}
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        <table className="tbl" style={{ minWidth: viewMode === 'monthly' ? Math.max(800, 220 + months.length * 80) : 600 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr style={{ background: 'var(--bg-deep)' }}>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-deep)', zIndex: 6, minWidth: 220 }}>{AXIS_LABELS[axis]}</th>
              {viewMode === 'monthly' && months.map(m => (
                <th key={`${m.year}-${m.month}`} style={{ textAlign: 'right', minWidth: 80, fontSize: 10 }}>
                  {MONTH_LABELS_FR[m.month - 1]} {String(m.year).slice(-2)}
                </th>
              ))}
              <th style={{ textAlign: 'right', minWidth: 100, background: 'var(--bg-deep)' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {pivot.map((p, i) => (
              <tr key={p.axisKey} style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-deep) 30%, transparent)' }}>
                <td style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? 'var(--bg-card)' : 'color-mix(in srgb, var(--bg-deep) 30%, var(--bg-card))', borderRight: '1px solid var(--bd-1)', padding: '8px 12px', fontSize: 11, fontWeight: 600 }}>
                  {p.axisLabel}
                </td>
                {viewMode === 'monthly' && months.map(m => {
                  const k = monthKey(m.year, m.month)
                  const v = p.byMonth[k] ?? 0
                  return (
                    <td key={k} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: v ? 'var(--tx-1)' : 'var(--tx-3)' }}>
                      {fmt(v)}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--neon)' }}>
                  {fmt(p.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-deep)' }}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--bg-deep)', borderRight: '1px solid var(--bd-1)', padding: '10px 12px', fontWeight: 700, fontSize: 11, color: 'var(--tx-1)' }}>
                TOTAL
              </td>
              {viewMode === 'monthly' && months.map(m => {
                const k = monthKey(m.year, m.month)
                const v = monthlyTotals[k] ?? 0
                return (
                  <td key={k} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-1)' }}>
                    {fmt(v)}
                  </td>
                )
              })}
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--neon)' }}>
                {fmt(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
        Note : volumes/CA répartis linéairement sur la fenêtre de récolte (harvest_start_date → harvest_end_date)
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AXIS_LABELS: Record<PivotAxis, string> = {
  farm: 'Ferme',
  greenhouse: 'Serre',
  variety: 'Variété',
  tomato_type: 'Type tomate',
}
const METRIC_LABELS: Record<PivotMetric, string> = {
  volume_kg: 'Volume (kg)',
  volume_t: 'Volume (t)',
  ca_mad: 'CA (MAD)',
  ca_kmad: 'CA (kMAD)',
}
const CHANNEL_LABELS: Record<PivotChannel, string> = {
  all: 'Total',
  export: 'Export',
  local: 'Local',
}

function Selector<T extends string>(props: { label: string; value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>{props.label} :</span>
      <div style={{ display: 'flex', border: '1px solid var(--bd-1)', borderRadius: 6, overflow: 'hidden' }}>
        {props.options.map(o => (
          <button key={o.v} onClick={() => props.onChange(o.v)}
            style={{
              padding: '5px 10px',
              background: props.value === o.v ? 'var(--bg-deep)' : 'transparent',
              color: props.value === o.v ? 'var(--neon)' : 'var(--tx-3)',
              border: 'none', cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--font-mono)',
            }}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}
