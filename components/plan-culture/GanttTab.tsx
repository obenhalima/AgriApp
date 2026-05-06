'use client'
/**
 * Onglet VUE DOMAINE — Diagramme hiérarchique en cartes design.
 *
 *   ┌──────────── DOMAINE ────────────┐  ← carte sommet avec KPI globaux
 *           │                                  │
 *      ┌────┴────┐                        ┌────┴────┐
 *      ▼         ▼                        ▼         ▼
 *   FERME 1   FERME 2                  FERME 3   …      ← cartes fermes
 *      │
 *   ┌──┼──┬─────┐
 *   ▼  ▼  ▼     ▼
 *  [S1][S2][S3][S4] …                                   ← cartes serres
 *
 * Chaque carte affiche les chiffres clés (surface, volume, CA, % export…)
 * avec un design cohérent : gradient subtil, accent coloré par type/variété,
 * mini-timeline horizontale, badge de statut.
 *
 * Connecteurs SVG entre niveaux pour matérialiser la hiérarchie.
 */
import { useMemo, useState } from 'react'
import { PlantingRow } from '@/lib/plantingPlan'
import { MONTH_LABELS_FR } from '@/lib/budgets'

type Campaign = {
  id: string; name: string;
  preparation_start: string | null; planting_start: string | null
  harvest_start: string | null; harvest_end: string | null
  campaign_end: string | null
} | undefined
type Farm = { id: string; code: string; name: string }
type Greenhouse = { id: string; code: string; name: string; farm_id: string; total_area: number; type: string }

// Palette pour variétés
const VARIETY_PALETTE = [
  '#10b981', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899',
  '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#f97316',
]

const PHASE_COLORS = {
  preparation: '#3b82f6',
  growth:      '#22c55e',
  harvest:     '#f59e0b',
  post:        '#a855f7',
}

export function GanttTab(props: {
  rows: PlantingRow[]
  greenhousesInScope: Greenhouse[]
  farms: Farm[]
  campaign: Campaign
  loading: boolean
}) {
  const { rows, greenhousesInScope, farms, campaign, loading } = props
  const [expandedFarms, setExpandedFarms] = useState<Set<string>>(new Set())  // toutes ouvertes par défaut via tout()
  const [selectedGh, setSelectedGh] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(true)

  // ─── Couleur par variété ───
  const varietyColor = useMemo(() => {
    const m = new Map<string, string>()
    let idx = 0
    rows.forEach(r => {
      if (!m.has(r.variety_id)) {
        m.set(r.variety_id, VARIETY_PALETTE[idx % VARIETY_PALETTE.length])
        idx++
      }
    })
    return m
  }, [rows])

  // ─── Construction de l'arbre Domaine → Fermes → Serres ───
  const tree = useMemo(() => {
    const byGh = new Map<string, PlantingRow[]>()
    rows.forEach(r => {
      if (!byGh.has(r.greenhouse_id)) byGh.set(r.greenhouse_id, [])
      byGh.get(r.greenhouse_id)!.push(r)
    })

    const byFarm = new Map<string, { farm: Farm; greenhouses: { gh: Greenhouse; plantings: PlantingRow[]; stats: GhStats }[] }>()
    greenhousesInScope.forEach(gh => {
      const farm = farms.find(f => f.id === gh.farm_id)
      if (!farm) return
      const ps = byGh.get(gh.id) ?? []
      const stats = computeGhStats(gh, ps)
      if (!byFarm.has(farm.id)) byFarm.set(farm.id, { farm, greenhouses: [] })
      byFarm.get(farm.id)!.greenhouses.push({ gh, plantings: ps, stats })
    })
    byFarm.forEach(g => g.greenhouses.sort((a, b) => a.gh.code.localeCompare(b.gh.code)))
    return Array.from(byFarm.values()).sort((a, b) => a.farm.name.localeCompare(b.farm.name))
  }, [rows, greenhousesInScope, farms])

  // Init : tout déplié
  useMemo(() => {
    if (expandedFarms.size === 0 && tree.length > 0) {
      setExpandedFarms(new Set(tree.map(t => t.farm.id)))
    }
  }, [tree])

  // ─── Stats globales (Domaine) ───
  const domainStats = useMemo(() => computeDomainStats(tree, greenhousesInScope, varietyColor.size), [tree, greenhousesInScope, varietyColor])

  // ─── Stats par ferme ───
  const farmStats = useMemo(() => {
    const m = new Map<string, FarmStats>()
    tree.forEach(({ farm, greenhouses }) => {
      const allPs = greenhouses.flatMap(g => g.plantings)
      m.set(farm.id, computeFarmStats(farm, greenhouses, allPs))
    })
    return m
  }, [tree])

  if (loading) return <div style={{ padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>CHARGEMENT…</div>

  if (rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div className="empty-icon">🌐</div>
        <div className="empty-title">Aucune plantation à visualiser</div>
      </div>
    )
  }

  const toggleFarm = (farmId: string) => {
    const next = new Set(expandedFarms)
    if (next.has(farmId)) next.delete(farmId); else next.add(farmId)
    setExpandedFarms(next)
  }
  const expandAll = () => setExpandedFarms(new Set(tree.map(t => t.farm.id)))
  const collapseAll = () => setExpandedFarms(new Set())

  return (
    <div>
      {/* ─── Toolbar ─── */}
      <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>VUE :</div>
        <button onClick={() => setShowTimeline(v => !v)}
          style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
            border: `1px solid ${showTimeline ? 'var(--neon)' : 'var(--bd-1)'}`,
            background: showTimeline ? 'var(--neon-dim)' : 'transparent',
            color: showTimeline ? 'var(--neon)' : 'var(--tx-2)',
            cursor: 'pointer',
          }}>
          {showTimeline ? '✓' : '○'} Mini-timeline
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--bd-1)', margin: '0 4px' }} />
        <button onClick={expandAll}
          style={{ padding: '6px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          ⇓ Tout déplier
        </button>
        <button onClick={collapseAll}
          style={{ padding: '6px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          ⇑ Tout replier
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
          {Object.entries(PHASE_COLORS).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 6, background: v, borderRadius: 2 }} />
              {labelPhase(k)}
            </span>
          ))}
        </div>
      </div>

      {/* ─── DOMAINE (carte sommet) ─── */}
      <DomainCard stats={domainStats} campaign={campaign} />

      {/* ─── Connecteurs vers fermes ─── */}
      {tree.length > 0 && (
        <ConnectorRow count={tree.length} color="var(--neon)" />
      )}

      {/* ─── FERMES ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: tree.length === 1 ? '1fr' : `repeat(${Math.min(tree.length, 3)}, 1fr)`,
        gap: 14,
        marginBottom: 14,
      }}>
        {tree.map(({ farm, greenhouses }) => {
          const fs = farmStats.get(farm.id)!
          const isOpen = expandedFarms.has(farm.id)
          return (
            <FarmCard
              key={farm.id}
              farm={farm} stats={fs}
              isOpen={isOpen}
              onToggle={() => toggleFarm(farm.id)}
              greenhouseCount={greenhouses.length}
            />
          )
        })}
      </div>

      {/* ─── Pour chaque ferme ouverte : grille de serres ─── */}
      {tree.map(({ farm, greenhouses }) => {
        if (!expandedFarms.has(farm.id)) return null
        return (
          <div key={`gh-${farm.id}`} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 10,
              background: 'color-mix(in srgb, #6366f1 5%, transparent)',
              borderLeft: '3px solid #6366f1', borderRadius: 4,
              fontSize: 11, fontFamily: 'var(--font-mono)', color: '#6366f1', letterSpacing: 1, fontWeight: 700,
            }}>
              <span>↳ {farm.name.toUpperCase()} · {greenhouses.length} SERRE{greenhouses.length > 1 ? 'S' : ''}</span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}>
              {greenhouses.map(({ gh, plantings, stats }) => (
                <GreenhouseCard
                  key={gh.id}
                  gh={gh} plantings={plantings} stats={stats}
                  campaign={campaign}
                  varietyColor={varietyColor}
                  showTimeline={showTimeline}
                  onClick={() => setSelectedGh(selectedGh === gh.id ? null : gh.id)}
                  selected={selectedGh === gh.id}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* ─── Drawer détail serre ─── */}
      {selectedGh && (() => {
        const gh = greenhousesInScope.find(g => g.id === selectedGh)
        if (!gh) return null
        const ps = rows.filter(r => r.greenhouse_id === selectedGh)
        return (
          <div className="card" style={{ marginTop: 14, padding: 18, borderTop: '3px solid var(--neon)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx-1)' }}>🏗️ {gh.code} · {gh.name}</div>
                <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {gh.type} · {Math.round(gh.total_area)} m² · {ps.length} plantation{ps.length > 1 ? 's' : ''}
                </div>
              </div>
              <button onClick={() => setSelectedGh(null)}
                style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--bd-1)', borderRadius: 6, color: 'var(--tx-3)', cursor: 'pointer', fontSize: 11 }}>
                ✕ Fermer
              </button>
            </div>
            {ps.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--amber)' }}>⚠ Cette serre n'a aucune plantation budgétisée pour la campagne.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {ps.map(p => (
                  <div key={p.planting_id} style={{
                    padding: 12, borderRadius: 8,
                    background: `color-mix(in srgb, ${varietyColor.get(p.variety_id) ?? '#64748b'} 6%, var(--bg-card))`,
                    border: `1px solid color-mix(in srgb, ${varietyColor.get(p.variety_id) ?? '#64748b'} 25%, transparent)`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: varietyColor.get(p.variety_id) }} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{p.variety_name}</span>
                    </div>
                    <KVRow label="Surface"  value={`${p.planted_area.toLocaleString('fr')} m²`} />
                    <KVRow label="Volume"   value={`${p.target_total_production.toLocaleString('fr', { maximumFractionDigits: 0 })} kg`} />
                    <KVRow label="CA Total" value={`${p.ca_total.toLocaleString('fr', { maximumFractionDigits: 0 })} MAD`} accent="var(--neon)" />
                    <KVRow label="% Export" value={`${p.export_share_pct.toFixed(0)}%`} />
                    <KVRow label="Plantation"  value={fmtDate(p.planting_date)} />
                    <KVRow label="Récolte"     value={`${fmtDate(p.harvest_start_date)} → ${fmtDate(p.harvest_end_date)}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CARTE DOMAINE
// ════════════════════════════════════════════════════════════════════════════
function DomainCard(props: { stats: DomainStats; campaign: Campaign }) {
  const { stats, campaign } = props
  return (
    <div className="card" style={{
      padding: 18,
      marginBottom: 0,
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--neon) 8%, var(--bg-card)), color-mix(in srgb, #3b82f6 5%, var(--bg-card)))',
      border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)',
      borderRadius: 12,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Halo décoratif */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 200, height: 200,
        background: 'radial-gradient(circle, color-mix(in srgb, var(--neon) 12%, transparent), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, position: 'relative' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'color-mix(in srgb, var(--neon) 15%, transparent)',
          border: '1px solid color-mix(in srgb, var(--neon) 35%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>🏭</div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>DOMAINE</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx-1)', fontFamily: 'var(--font-display)' }}>BENHALIMA</div>
        </div>
        {campaign && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>CAMPAGNE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)' }}>{campaign.name}</div>
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        position: 'relative',
      }}>
        <BigKPI label="SURFACE" value={fmtArea(stats.totalArea)} sub={`${stats.usedGh}/${stats.totalGh} serres`} color="#0ea5e9" />
        <BigKPI label="FERMES"   value={String(stats.farmsCount)} sub={`${stats.varieties} variété${stats.varieties > 1 ? 's' : ''}`} color="#6366f1" />
        <BigKPI label="VOLUME CIBLE" value={fmtVol(stats.totalVolumeKg)} sub={`Rdt ${stats.avgYield.toFixed(1)} kg/m²`} color="#a855f7" />
        <BigKPI label="CA CIBLE"     value={fmtMAD(stats.totalRevenue)} sub={`${stats.exportSharePct.toFixed(0)}% export`} color="#10b981" highlight />
        {stats.emptyGh > 0 && (
          <BigKPI label="SERRES VIDES" value={String(stats.emptyGh)} sub="à planifier" color="#f59e0b" warn />
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CARTE FERME
// ════════════════════════════════════════════════════════════════════════════
function FarmCard(props: {
  farm: Farm; stats: FarmStats; isOpen: boolean; onToggle: () => void; greenhouseCount: number
}) {
  const { farm, stats, isOpen, onToggle, greenhouseCount } = props
  return (
    <div className="card" onClick={onToggle} style={{
      padding: 14, cursor: 'pointer',
      borderTop: '3px solid #6366f1',
      transition: 'all .2s',
      background: isOpen
        ? 'color-mix(in srgb, #6366f1 4%, var(--bg-card))'
        : 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'color-mix(in srgb, #6366f1 14%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>🏠</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#6366f1', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>FERME</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)' }}>{farm.name}</div>
        </div>
        <div style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--tx-3)', fontSize: 14, transition: 'transform .2s',
          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>▾</div>
      </div>

      {/* Mini KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
        <KPILine label="Surface" value={fmtArea(stats.totalArea)} icon="📐" />
        <KPILine label="Serres"  value={`${stats.usedGh}/${greenhouseCount}`} icon="🏗️" warn={stats.usedGh < greenhouseCount} />
        <KPILine label="Volume"  value={fmtVol(stats.totalVolumeKg)} icon="📦" />
        <KPILine label="CA"      value={fmtMAD(stats.totalRevenue)} icon="💰" accent />
      </div>

      {/* Mini barre export/local */}
      {stats.totalRevenue > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--bd-1)' }}>
            <div style={{ width: `${stats.exportSharePct}%`, background: '#3b82f6' }} />
            <div style={{ flex: 1, background: '#f59e0b' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
            <span>Exp {stats.exportSharePct.toFixed(0)}%</span>
            <span>Loc {(100 - stats.exportSharePct).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CARTE SERRE
// ════════════════════════════════════════════════════════════════════════════
function GreenhouseCard(props: {
  gh: Greenhouse
  plantings: PlantingRow[]
  stats: GhStats
  campaign: Campaign
  varietyColor: Map<string, string>
  showTimeline: boolean
  onClick: () => void
  selected: boolean
}) {
  const { gh, plantings, stats, campaign, varietyColor, showTimeline, onClick, selected } = props
  const isEmpty = plantings.length === 0

  // Couleur dominante = couleur de la variété principale (par volume)
  const dominantColor = useMemo(() => {
    if (plantings.length === 0) return '#64748b'
    const top = [...plantings].sort((a, b) => b.target_total_production - a.target_total_production)[0]
    return varietyColor.get(top.variety_id) ?? '#64748b'
  }, [plantings, varietyColor])

  // Variétés présentes (couleurs)
  const varietyDots = useMemo(() => {
    const seen = new Set<string>()
    return plantings.filter(p => {
      if (seen.has(p.variety_id)) return false
      seen.add(p.variety_id); return true
    }).map(p => ({ name: p.variety_name, color: varietyColor.get(p.variety_id) ?? '#64748b' }))
  }, [plantings, varietyColor])

  return (
    <div onClick={onClick} className="card" style={{
      padding: 0, overflow: 'hidden', cursor: 'pointer',
      transition: 'all .2s',
      transform: selected ? 'translateY(-2px)' : 'none',
      boxShadow: selected ? `0 8px 24px color-mix(in srgb, ${dominantColor} 25%, transparent)` : undefined,
      border: selected ? `1px solid ${dominantColor}` : '1px solid var(--bd-1)',
      background: isEmpty
        ? 'color-mix(in srgb, var(--amber) 3%, var(--bg-card))'
        : 'var(--bg-card)',
    }}>
      {/* Bandeau coloré (couleur variété dominante) */}
      <div style={{
        height: 4,
        background: isEmpty
          ? 'repeating-linear-gradient(45deg, var(--amber) 0 8px, transparent 8px 16px)'
          : `linear-gradient(90deg, ${dominantColor}, color-mix(in srgb, ${dominantColor} 50%, transparent))`,
      }} />

      <div style={{ padding: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 14 }}>🏗️</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{gh.code}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>{gh.name}</div>
            <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {gh.type} · {Math.round(gh.total_area).toLocaleString('fr')} m²
            </div>
          </div>
          {isEmpty ? (
            <span style={{
              padding: '3px 8px', borderRadius: 4,
              background: 'color-mix(in srgb, var(--amber) 18%, transparent)',
              color: 'var(--amber)',
              fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: .5,
            }}>⚠ VIDE</span>
          ) : (
            <span style={{
              padding: '3px 8px', borderRadius: 4,
              background: `color-mix(in srgb, ${dominantColor} 14%, transparent)`,
              color: dominantColor,
              fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: .5,
            }}>✓ ACTIVE</span>
          )}
        </div>

        {!isEmpty && (
          <>
            {/* Big KPI : Volume cible */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 2 }}>
                VOLUME CIBLE
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: dominantColor, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                {fmtVol(stats.totalVolumeKg)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                Rdt {stats.avgYield.toFixed(1)} kg/m² · CA {fmtMAD(stats.totalRevenue)}
              </div>
            </div>

            {/* Mini KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, marginBottom: 10 }}>
              <MiniStat label="Plantée" value={`${Math.round(stats.totalPlanted).toLocaleString('fr')} m²`} />
              <MiniStat label="Plants"  value={stats.totalPlants > 0 ? stats.totalPlants.toLocaleString('fr') : '—'} />
              <MiniStat label="Variétés" value={String(stats.varietiesCount)} />
              <MiniStat label="% Export" value={`${stats.exportSharePct.toFixed(0)}%`} />
            </div>

            {/* Pastilles variétés */}
            {varietyDots.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {varietyDots.map((v, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 6px', borderRadius: 10,
                    background: `color-mix(in srgb, ${v.color} 12%, transparent)`,
                    fontSize: 9, color: v.color, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.color }} />
                    {v.name}
                  </span>
                ))}
              </div>
            )}

            {/* Mini timeline horizontale */}
            {showTimeline && campaign && (
              <MiniTimeline plantings={plantings} campaign={campaign} />
            )}
          </>
        )}

        {isEmpty && (
          <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--tx-3)', fontSize: 11 }}>
            Aucune plantation budgétisée
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mini timeline horizontale dans la carte serre (4 phases sur 1 barre)
// ────────────────────────────────────────────────────────────────────────────
function MiniTimeline(props: { plantings: PlantingRow[]; campaign: NonNullable<Campaign> }) {
  const { plantings, campaign } = props
  if (!campaign.preparation_start || !campaign.campaign_end) return null
  const start = +new Date(campaign.preparation_start)
  const end = +new Date(campaign.campaign_end)
  if (end <= start) return null
  const dur = end - start
  const pct = (d: string | null): number | null => {
    if (!d) return null
    const t = +new Date(d)
    if (isNaN(t)) return null
    return Math.max(0, Math.min(100, ((t - start) / dur) * 100))
  }

  // On prend la plantation principale (plus gros volume) pour les phases
  const top = [...plantings].sort((a, b) => b.target_total_production - a.target_total_production)[0]
  if (!top) return null

  const prepP = pct(campaign.preparation_start)
  const plantP = pct(top.planting_date ?? campaign.planting_start ?? null)
  const harStart = pct(top.harvest_start_date ?? campaign.harvest_start ?? null)
  const harEnd = pct(top.harvest_end_date ?? campaign.harvest_end ?? null)
  const endP = pct(campaign.campaign_end)

  // "Aujourd'hui" pour curseur
  const today = pct(new Date().toISOString())

  return (
    <div>
      <div style={{ position: 'relative', height: 18, background: 'var(--bd-1)', borderRadius: 4, overflow: 'hidden' }}>
        {prepP !== null && plantP !== null && plantP > prepP && (
          <div style={{ position: 'absolute', left: `${prepP}%`, width: `${plantP - prepP}%`, top: 0, bottom: 0, background: PHASE_COLORS.preparation, opacity: .6 }} />
        )}
        {plantP !== null && harStart !== null && harStart > plantP && (
          <div style={{ position: 'absolute', left: `${plantP}%`, width: `${harStart - plantP}%`, top: 0, bottom: 0, background: PHASE_COLORS.growth, opacity: .7 }} />
        )}
        {harStart !== null && harEnd !== null && harEnd > harStart && (
          <div style={{ position: 'absolute', left: `${harStart}%`, width: `${harEnd - harStart}%`, top: 0, bottom: 0, background: PHASE_COLORS.harvest }} />
        )}
        {harEnd !== null && endP !== null && endP > harEnd && (
          <div style={{ position: 'absolute', left: `${harEnd}%`, width: `${endP - harEnd}%`, top: 0, bottom: 0, background: PHASE_COLORS.post, opacity: .4 }} />
        )}
        {/* Curseur "aujourd'hui" */}
        {today !== null && today >= 0 && today <= 100 && (
          <div style={{ position: 'absolute', left: `${today}%`, top: -2, bottom: -2, width: 2, background: 'var(--neon)', boxShadow: '0 0 6px var(--neon)' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 8, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
        <span>{shortDate(campaign.preparation_start)}</span>
        <span>{shortDate(campaign.campaign_end)}</span>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// CONNECTEURS SVG (lignes entre niveaux)
// ────────────────────────────────────────────────────────────────────────────
function ConnectorRow(props: { count: number; color: string }) {
  // Une ligne verticale qui descend puis se ramifie en N branches
  const { count, color } = props
  const W = 600 // viewBox virtuel
  const branches = Array.from({ length: count }, (_, i) => {
    if (count === 1) return W / 2
    return (i / (count - 1)) * (W - 100) + 50
  })
  return (
    <div style={{ height: 28, marginTop: 0, marginBottom: 8 }}>
      <svg width="100%" height="28" viewBox={`0 0 ${W} 28`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Ligne verticale centrale */}
        <line x1={W / 2} y1={0} x2={W / 2} y2={12}
          stroke={color} strokeWidth={1.5} strokeOpacity={.6} />
        {/* Ligne horizontale de jonction (uniquement si > 1) */}
        {count > 1 && (
          <line x1={branches[0]} y1={12} x2={branches[branches.length - 1]} y2={12}
            stroke={color} strokeWidth={1.5} strokeOpacity={.5} />
        )}
        {/* Branches verticales descendantes */}
        {branches.map((x, i) => (
          <line key={i} x1={x} y1={12} x2={x} y2={28}
            stroke={color} strokeWidth={1.5} strokeOpacity={.5} />
        ))}
      </svg>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANTS ATOMIQUES
// ════════════════════════════════════════════════════════════════════════════
function BigKPI(props: { label: string; value: string; sub?: string; color: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: props.highlight
        ? `color-mix(in srgb, ${props.color} 14%, transparent)`
        : 'color-mix(in srgb, var(--bg-deep) 50%, transparent)',
      border: `1px solid color-mix(in srgb, ${props.color} ${props.highlight ? 40 : 20}%, transparent)`,
    }}>
      <div style={{ fontSize: 8, color: props.warn ? 'var(--amber)' : 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 3 }}>
        {props.label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: props.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
        {props.value}
      </div>
      {props.sub && (
        <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
          {props.sub}
        </div>
      )}
    </div>
  )
}

function KPILine(props: { label: string; value: string; icon: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, opacity: .8 }}>{props.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 8, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: .8 }}>{props.label}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: props.warn ? 'var(--amber)' : (props.accent ? 'var(--neon)' : 'var(--tx-1)'), fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {props.value}
        </div>
      </div>
    </div>
  )
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: .8 }}>{props.label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{props.value}</div>
    </div>
  )
}

function KVRow(props: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
      <span style={{ color: 'var(--tx-3)' }}>{props.label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: props.accent ?? 'var(--tx-1)', fontWeight: props.accent ? 700 : 500 }}>{props.value}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// STATS COMPUTATIONS
// ════════════════════════════════════════════════════════════════════════════
type GhStats = {
  totalPlanted: number; totalVolumeKg: number; totalRevenue: number; totalPlants: number
  avgYield: number; exportSharePct: number; varietiesCount: number
}
function computeGhStats(gh: Greenhouse, plantings: PlantingRow[]): GhStats {
  const totalPlanted = plantings.reduce((s, p) => s + p.planted_area, 0)
  const totalVolumeKg = plantings.reduce((s, p) => s + p.target_total_production, 0)
  const totalRevenue = plantings.reduce((s, p) => s + p.ca_total, 0)
  const totalExport = plantings.reduce((s, p) => s + p.ca_export_total, 0)
  const totalPlants = plantings.reduce((s, p) => s + (p.plant_count ?? 0), 0)
  const avgYield = totalPlanted > 0 ? totalVolumeKg / totalPlanted : 0
  const exportSharePct = totalRevenue > 0 ? (totalExport / totalRevenue) * 100 : 0
  const varietiesCount = new Set(plantings.map(p => p.variety_id)).size
  return { totalPlanted, totalVolumeKg, totalRevenue, totalPlants, avgYield, exportSharePct, varietiesCount }
}

type FarmStats = {
  totalArea: number; totalVolumeKg: number; totalRevenue: number
  exportSharePct: number; usedGh: number
}
function computeFarmStats(farm: Farm, ghs: { gh: Greenhouse }[], plantings: PlantingRow[]): FarmStats {
  const totalArea = ghs.reduce((s, x) => s + x.gh.total_area, 0)
  const totalVolumeKg = plantings.reduce((s, p) => s + p.target_total_production, 0)
  const totalRevenue = plantings.reduce((s, p) => s + p.ca_total, 0)
  const totalExport = plantings.reduce((s, p) => s + p.ca_export_total, 0)
  const exportSharePct = totalRevenue > 0 ? (totalExport / totalRevenue) * 100 : 0
  const usedGh = new Set(plantings.map(p => p.greenhouse_id)).size
  return { totalArea, totalVolumeKg, totalRevenue, exportSharePct, usedGh }
}

type DomainStats = {
  totalArea: number; totalGh: number; usedGh: number; emptyGh: number
  farmsCount: number; varieties: number
  totalVolumeKg: number; totalRevenue: number; avgYield: number
  exportSharePct: number; totalPlanted: number
}
function computeDomainStats(tree: { farm: Farm; greenhouses: { gh: Greenhouse; plantings: PlantingRow[] }[] }[],
                            allGhs: Greenhouse[], varietiesCount: number): DomainStats {
  const totalArea = allGhs.reduce((s, g) => s + g.total_area, 0)
  const totalGh = allGhs.length
  const allPlantings = tree.flatMap(t => t.greenhouses.flatMap(g => g.plantings))
  const usedGh = new Set(allPlantings.map(p => p.greenhouse_id)).size
  const totalVolumeKg = allPlantings.reduce((s, p) => s + p.target_total_production, 0)
  const totalPlanted = allPlantings.reduce((s, p) => s + p.planted_area, 0)
  const totalRevenue = allPlantings.reduce((s, p) => s + p.ca_total, 0)
  const totalExport = allPlantings.reduce((s, p) => s + p.ca_export_total, 0)
  const avgYield = totalPlanted > 0 ? totalVolumeKg / totalPlanted : 0
  const exportSharePct = totalRevenue > 0 ? (totalExport / totalRevenue) * 100 : 0
  return {
    totalArea, totalGh, usedGh, emptyGh: totalGh - usedGh,
    farmsCount: tree.length, varieties: varietiesCount,
    totalVolumeKg, totalRevenue, avgYield, exportSharePct, totalPlanted,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
function fmtArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`
  return `${Math.round(m2).toLocaleString('fr')} m²`
}
function fmtVol(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  if (kg === 0) return '—'
  return `${Math.round(kg).toLocaleString('fr')} kg`
}
function fmtMAD(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)} k`
  if (v === 0) return '—'
  return `${Math.round(v).toLocaleString('fr')}`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'short', year: '2-digit' })
}
function shortDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr', { month: 'short', year: '2-digit' })
}
function labelPhase(k: string): string {
  return ({ preparation: 'Prép.', growth: 'Croiss.', harvest: 'Récolte', post: 'Post' } as Record<string, string>)[k] ?? k
}
