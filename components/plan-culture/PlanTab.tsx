'use client'
/**
 * Onglet PLAN DE CULTURE — Table détaillée des plantations budgétisées.
 * Groupement par Serre / Variété / Ferme.
 * Export Excel formaté (couleurs + bordures).
 */
import { useMemo, useState } from 'react'
import { PlantingRow } from '@/lib/plantingPlan'
import {
  createWorkbook, applyTitleRow, styleHeaderRow,
  setColumnWidths, freezePanes, downloadWorkbook, NUM_FMT,
  thinBorder, XLS_COLORS,
} from '@/lib/exportExcel'

type Campaign = { id: string; name: string } | undefined
type GroupBy = 'greenhouse' | 'variety' | 'farm' | 'none'

export function PlanTab(props: { rows: PlantingRow[]; campaign: Campaign; loading: boolean }) {
  const { rows, campaign, loading } = props
  const [groupBy, setGroupBy] = useState<GroupBy>('greenhouse')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // ─── Filtrage status ───
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter(r => r.status === statusFilter)
  }, [rows, statusFilter])

  // ─── Groupement ───
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: PlantingRow[] }[] = []
    const map = new Map<string, { label: string; items: PlantingRow[] }>()

    if (groupBy === 'none') {
      return [{ key: 'all', label: '', items: filtered }]
    }

    filtered.forEach(r => {
      const { key, label } = groupKey(r, groupBy)
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(r)
    })

    map.forEach((v, k) => groups.push({ key: k, label: v.label, items: v.items }))
    return groups.sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered, groupBy])

  // ─── Totaux ───
  const totals = useMemo(() => {
    return {
      area: filtered.reduce((s, r) => s + r.planted_area, 0),
      plants: filtered.reduce((s, r) => s + (r.plant_count ?? 0), 0),
      volume: filtered.reduce((s, r) => s + r.target_total_production, 0),
      ca: filtered.reduce((s, r) => s + r.ca_total, 0),
      caExport: filtered.reduce((s, r) => s + r.ca_export_total, 0),
      caLocal: filtered.reduce((s, r) => s + r.ca_local_total, 0),
    }
  }, [filtered])

  // ─── Export Excel formaté ───
  const exportExcel = async () => {
    const wb = await createWorkbook()
    const ws = wb.addWorksheet('Plan de culture')

    const headers = [
      'Ferme', 'Serre', 'Code', 'Type', 'Variété', 'Type tomate',
      'Surface (m²)', 'Plants', 'Densité',
      'Date plantation', '1ère récolte', 'Dern. récolte',
      'Rdt cible (kg/m²)', 'Volume cible (kg)',
      '% Export', 'Prix Export', 'Prix Local',
      'CA Export', 'CA Local', 'CA Total', 'Statut',
    ]
    const totalCols = headers.length

    applyTitleRow(ws, `PLAN DE CULTURE — ${campaign?.name ?? 'Campagne'}`, totalCols, {
      subtitle: `${filtered.length} plantation${filtered.length > 1 ? 's' : ''}  ·  Généré le ${new Date().toLocaleDateString('fr')}`,
    })
    ws.getRow(3).height = 6

    const headerRowIdx = 4
    const r1 = ws.getRow(headerRowIdx)
    headers.forEach((h, i) => { r1.getCell(i + 1).value = h })
    styleHeaderRow(r1)

    let rowIdx = headerRowIdx + 1

    if (groupBy === 'none') {
      filtered.forEach(p => writePlantingRow(ws, rowIdx++, p))
    } else {
      grouped.forEach(g => {
        // Ligne d'entête de groupe
        const gh = ws.getRow(rowIdx)
        gh.getCell(1).value = g.label
        gh.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        gh.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } }
        gh.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
        ws.mergeCells(rowIdx, 1, rowIdx, totalCols)
        gh.height = 20
        rowIdx++
        g.items.forEach(p => writePlantingRow(ws, rowIdx++, p))
      })
    }

    // Ligne TOTAL en bas
    const totalRow = ws.getRow(rowIdx)
    totalRow.getCell(1).value = 'TOTAL'
    totalRow.getCell(7).value = totals.area
    totalRow.getCell(8).value = totals.plants
    totalRow.getCell(14).value = totals.volume
    totalRow.getCell(18).value = totals.caExport
    totalRow.getCell(19).value = totals.caLocal
    totalRow.getCell(20).value = totals.ca
    totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
      cell.alignment = col === 1 ? { vertical: 'middle', horizontal: 'left', indent: 1 } : { vertical: 'middle', horizontal: 'right' }
      cell.border = thinBorder
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    })
    totalRow.height = 22

    setColumnWidths(ws, [16, 18, 10, 14, 22, 12, 12, 10, 10, 14, 14, 14, 13, 16, 10, 12, 12, 14, 14, 14, 12])
    freezePanes(ws, { rows: headerRowIdx, cols: 2 })

    await downloadWorkbook(wb, `PlanCulture_${(campaign?.name ?? 'campagne').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>CHARGEMENT…</div>
  if (rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div className="empty-icon">🌱</div>
        <div className="empty-title">Aucune plantation</div>
      </div>
    )
  }

  return (
    <div>
      {/* ─── Toolbar ─── */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>GROUPER PAR :</div>
        {([
          { v: 'greenhouse' as GroupBy, l: 'Serre' },
          { v: 'variety' as GroupBy,    l: 'Variété' },
          { v: 'farm' as GroupBy,       l: 'Ferme' },
          { v: 'none' as GroupBy,       l: 'Aucun' },
        ]).map(o => (
          <button key={o.v} onClick={() => setGroupBy(o.v)}
            style={{
              padding: '6px 12px',
              border: `1px solid ${groupBy === o.v ? 'var(--neon)' : 'var(--bd-1)'}`,
              background: groupBy === o.v ? 'var(--neon-dim)' : 'transparent',
              color: groupBy === o.v ? 'var(--neon)' : 'var(--tx-2)',
              borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
            }}>
            {o.l}
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: 'var(--bd-1)', margin: '0 4px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11 }}>
          <option value="all">Tous statuts</option>
          <option value="planifie">Planifié</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminé</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>{filtered.length} plantation{filtered.length > 1 ? 's' : ''}</div>
          <button onClick={exportExcel}
            style={{ padding: '7px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            📥 EXPORT XLSX
          </button>
        </div>
      </div>

      {/* ─── Tableau ─── */}
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        <table className="tbl" style={{ minWidth: 1500 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr style={{ background: 'var(--bg-deep)' }}>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-deep)', zIndex: 6 }}>Ferme · Serre</th>
              <th>Variété</th>
              <th style={{ textAlign: 'right' }}>Surf. (m²)</th>
              <th style={{ textAlign: 'right' }}>Plants</th>
              <th style={{ textAlign: 'right' }}>Dens.</th>
              <th>Plant.</th>
              <th>1ère récolte</th>
              <th>Dern. récolte</th>
              <th style={{ textAlign: 'right' }}>Rdt kg/m²</th>
              <th style={{ textAlign: 'right' }}>Vol. (kg)</th>
              <th style={{ textAlign: 'right' }}>% Exp</th>
              <th style={{ textAlign: 'right' }}>Prix Exp</th>
              <th style={{ textAlign: 'right' }}>Prix Loc</th>
              <th style={{ textAlign: 'right' }}>CA Exp</th>
              <th style={{ textAlign: 'right' }}>CA Loc</th>
              <th style={{ textAlign: 'right' }}>CA Total</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(g => (
              <>
                {groupBy !== 'none' && (
                  <tr key={`grp-${g.key}`} style={{ background: 'color-mix(in srgb, #6366f1 8%, transparent)' }}>
                    <td colSpan={17} style={{ position: 'sticky', left: 0, background: 'color-mix(in srgb, #6366f1 8%, transparent)', padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6366f1', fontFamily: 'var(--font-mono)', letterSpacing: .5 }}>
                      {g.label} <span style={{ color: 'var(--tx-3)', fontWeight: 400, marginLeft: 8 }}>({g.items.length} ligne{g.items.length > 1 ? 's' : ''})</span>
                    </td>
                  </tr>
                )}
                {g.items.map(r => (
                  <tr key={r.planting_id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--bd-1)' }}>
                      <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>{r.farm_name}</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{r.greenhouse_code}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx-3)' }}>{r.greenhouse_name}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{r.variety_name}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx-3)' }}>{r.variety_type}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.planted_area.toLocaleString('fr')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.plant_count?.toLocaleString('fr') ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.density?.toFixed(1) ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fmtDate(r.planting_date)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fmtDate(r.harvest_start_date)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fmtDate(r.harvest_end_date)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.target_yield_per_m2?.toFixed(1) ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{r.target_total_production.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: r.export_share_pct > 50 ? '#3b82f6' : '#f59e0b' }}>{r.export_share_pct.toFixed(0)}%</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.effective_price_export.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.effective_price_local.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3b82f6' }}>{r.ca_export_total.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f59e0b' }}>{r.ca_local_total.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--neon)' }}>{r.ca_total.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
                    <td>
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)',
                        padding: '2px 6px', borderRadius: 3,
                        background: statusColor(r.status).bg, color: statusColor(r.status).fg,
                      }}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-deep)', fontWeight: 700 }}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--bg-deep)', borderRight: '1px solid var(--bd-1)', padding: '10px 12px', fontSize: 11, color: 'var(--tx-1)' }}>
                TOTAL ({filtered.length})
              </td>
              <td></td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{totals.area.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{totals.plants.toLocaleString('fr')}</td>
              <td colSpan={5}></td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon)' }}>{totals.volume.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
              <td colSpan={3}></td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3b82f6' }}>{totals.caExport.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f59e0b' }}>{totals.caLocal.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--neon)', fontWeight: 800 }}>{totals.ca.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function groupKey(r: PlantingRow, by: GroupBy): { key: string; label: string } {
  switch (by) {
    case 'greenhouse': return { key: r.greenhouse_id, label: `🏗️ ${r.greenhouse_code} · ${r.greenhouse_name} (${r.farm_name})` }
    case 'variety':    return { key: r.variety_id, label: `🧬 ${r.variety_name} (${r.variety_type})` }
    case 'farm':       return { key: r.farm_id, label: `🏠 ${r.farm_name}` }
    default:           return { key: 'all', label: '' }
  }
}

function writePlantingRow(ws: any, rowIdx: number, p: PlantingRow) {
  const r = ws.getRow(rowIdx)
  r.getCell(1).value  = p.farm_name
  r.getCell(2).value  = p.greenhouse_name
  r.getCell(3).value  = p.greenhouse_code
  r.getCell(4).value  = p.greenhouse_type
  r.getCell(5).value  = p.variety_name
  r.getCell(6).value  = p.variety_type
  r.getCell(7).value  = p.planted_area
  r.getCell(8).value  = p.plant_count ?? null
  r.getCell(9).value  = p.density ?? null
  r.getCell(10).value = p.planting_date ? new Date(p.planting_date) : null
  r.getCell(11).value = p.harvest_start_date ? new Date(p.harvest_start_date) : null
  r.getCell(12).value = p.harvest_end_date ? new Date(p.harvest_end_date) : null
  r.getCell(13).value = p.target_yield_per_m2 ?? null
  r.getCell(14).value = p.target_total_production
  r.getCell(15).value = p.export_share_pct / 100  // formaté en %
  r.getCell(16).value = p.effective_price_export
  r.getCell(17).value = p.effective_price_local
  r.getCell(18).value = p.ca_export_total
  r.getCell(19).value = p.ca_local_total
  r.getCell(20).value = p.ca_total
  r.getCell(21).value = p.status

  r.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
    cell.font = { name: 'Calibri', size: 10 }
    cell.border = thinBorder
    cell.alignment = col >= 7 && col <= 9 || col >= 13 ? { horizontal: 'right' } : { horizontal: 'left', indent: 1 }
    if (col >= 10 && col <= 12) cell.numFmt = 'dd/mm/yyyy'
    else if (col === 15) cell.numFmt = '0%'
    else if ((col >= 7 && col <= 9) || (col >= 13 && col <= 20)) cell.numFmt = NUM_FMT
  })
  // Bandeau alterné
  if (rowIdx % 2 === 0) {
    r.eachCell({ includeEmpty: true }, (cell: any) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_COLORS.rowEvenFill } }
    })
  }
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'short', year: '2-digit' })
}

function statusColor(status: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    planifie:   { bg: 'rgba(99,102,241,.15)', fg: '#6366f1' },
    en_cours:   { bg: 'rgba(34,197,94,.15)',  fg: '#22c55e' },
    termine:    { bg: 'rgba(100,116,139,.15)', fg: '#64748b' },
    annule:     { bg: 'rgba(239,68,68,.15)',   fg: '#ef4444' },
  }
  return map[status] ?? { bg: 'rgba(100,116,139,.15)', fg: '#64748b' }
}
