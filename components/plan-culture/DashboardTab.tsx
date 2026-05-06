'use client'
/**
 * Onglet DASHBOARD du module Plan de culture.
 * Affiche les KPI agrégés calculés en live à partir des plantations filtrées.
 */
import { useMemo } from 'react'
import { computeKPIs, PlantingRow } from '@/lib/plantingPlan'

type Campaign = { id: string; name: string; preparation_start: string | null; campaign_end: string | null } | undefined

export function DashboardTab(props: {
  rows: PlantingRow[]
  greenhousesInScope: { id: string; total_area: number }[]
  campaign: Campaign
  loading: boolean
}) {
  const { rows, greenhousesInScope, campaign, loading } = props

  const k = useMemo(() => computeKPIs(rows, greenhousesInScope), [rows, greenhousesInScope])

  // Top 5 variétés par CA et par volume
  const topByCA = useMemo(() => {
    const map = new Map<string, { name: string; ca: number; vol: number }>()
    rows.forEach(r => {
      const e = map.get(r.variety_id) ?? { name: r.variety_name, ca: 0, vol: 0 }
      e.ca += r.ca_total
      e.vol += r.target_total_production
      map.set(r.variety_id, e)
    })
    return Array.from(map.values()).sort((a, b) => b.ca - a.ca).slice(0, 5)
  }, [rows])

  // Répartition export / local
  const totalRev = k.totalRevenue
  const exportPct = totalRev > 0 ? (k.exportRevenue / totalRev) * 100 : 0
  const localPct  = 100 - exportPct

  // Surface par ferme
  const surfaceByFarm = useMemo(() => {
    const m = new Map<string, { name: string; area: number; volume: number }>()
    rows.forEach(r => {
      const e = m.get(r.farm_id) ?? { name: r.farm_name, area: 0, volume: 0 }
      e.area += r.planted_area
      e.volume += r.target_total_production
      m.set(r.farm_id, e)
    })
    return Array.from(m.values()).sort((a, b) => b.area - a.area)
  }, [rows])

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>CHARGEMENT DES KPI…</div>
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div className="empty-icon">🌱</div>
        <div className="empty-title">Aucune plantation budgétisée</div>
        <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>
          Crée des plantations dans <strong>Campagnes</strong> pour voir les indicateurs.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ─── BANDE DE KPI PRINCIPAUX ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPICard
          label="SURFACE PLANTÉE"
          value={fmtArea(k.totalPlantedArea)}
          sub={`${k.totalGreenhouses} serre${k.totalGreenhouses > 1 ? 's' : ''} · ${k.totalFarms} ferme${k.totalFarms > 1 ? 's' : ''}`}
          color="#0ea5e9" icon="🏗️"
        />
        <KPICard
          label="VOLUME CIBLE"
          value={fmtVolume(k.totalVolumeKg)}
          sub={`Rdt moyen : ${k.avgYieldKgM2.toFixed(1)} kg/m²`}
          color="#a855f7" icon="📦"
        />
        <KPICard
          label="CA CIBLE"
          value={fmtMAD(k.totalRevenue)}
          sub={`Prix moyen : ${k.avgPricePerKg.toFixed(2)} MAD/kg`}
          color="#10b981" icon="💰"
        />
        <KPICard
          label="MARGE ESTIMÉE"
          value={k.totalEstimatedCost > 0 ? fmtMAD(k.estimatedMargin) : 'N/D'}
          sub={k.totalEstimatedCost > 0 ? `${k.estimatedMarginPct.toFixed(1)}% · Coûts ${fmtMAD(k.totalEstimatedCost)}` : 'Pas de coûts planifiés'}
          color={k.estimatedMargin >= 0 ? '#22c55e' : '#ef4444'}
          icon={k.estimatedMargin >= 0 ? '📈' : '📉'}
        />
      </div>

      {/* ─── BANDE SECONDAIRE ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <MiniKPI label="Plantations" value={String(k.totalPlantings)} icon="🌱" />
        <MiniKPI label="Variétés"     value={String(k.totalVarieties)} icon="🧬" />
        <MiniKPI label="Plants total" value={k.totalPlants > 0 ? k.totalPlants.toLocaleString('fr') : '—'} icon="🌿" />
        <MiniKPI label="Densité moy." value={k.avgDensity > 0 ? `${k.avgDensity.toFixed(1)} pl/m²` : '—'} icon="📐" />
        <MiniKPI
          label="Serres vides"
          value={String(k.totalGreenhousesUnused)}
          icon={k.totalGreenhousesUnused > 0 ? '⚠️' : '✓'}
          warn={k.totalGreenhousesUnused > 0}
        />
      </div>

      {/* ─── 2 COLONNES : RÉPARTITION + TOP VARIÉTÉS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>

        {/* Carte : Répartition Export / Local */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
            RÉPARTITION CA EXPORT / LOCAL
          </div>
          <BarSplit exportPct={exportPct} localPct={localPct} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>EXPORT</div>
              <div style={{ fontSize: 18, color: '#3b82f6', fontWeight: 700 }}>{fmtMAD(k.exportRevenue)}</div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>{exportPct.toFixed(1)}%</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>LOCAL</div>
              <div style={{ fontSize: 18, color: '#f59e0b', fontWeight: 700 }}>{fmtMAD(k.localRevenue)}</div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)' }}>{localPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Carte : Top 5 variétés par CA */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
            TOP 5 VARIÉTÉS — CA CIBLE
          </div>
          {topByCA.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Aucune donnée</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topByCA.map((v, i) => {
                const max = topByCA[0].ca || 1
                const w = (v.ca / max) * 100
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--tx-1)', fontWeight: 600 }}>{v.name || '—'}</span>
                      <span style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)' }}>
                        {fmtMAD(v.ca)} · {fmtVolume(v.vol)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bd-1)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${w}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Carte : Surface par ferme */}
        {surfaceByFarm.length > 1 && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
              RÉPARTITION PAR FERME
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {surfaceByFarm.map((f, i) => {
                const max = surfaceByFarm[0].area || 1
                const w = (f.area / max) * 100
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--tx-1)', fontWeight: 600 }}>{f.name}</span>
                      <span style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)' }}>
                        {fmtArea(f.area)} · {fmtVolume(f.volume)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bd-1)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${w}%`, height: '100%', background: '#a855f7', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Carte : Période de campagne */}
        {campaign && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
              FENÊTRE CAMPAGNE
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-1)', lineHeight: 1.8 }}>
              <div><span style={{ color: 'var(--tx-3)' }}>Préparation : </span><strong>{fmtDate(campaign.preparation_start)}</strong></div>
              <div><span style={{ color: 'var(--tx-3)' }}>Fin de campagne : </span><strong>{fmtDate(campaign.campaign_end)}</strong></div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx-3)' }}>
                {durationLabel(campaign.preparation_start, campaign.campaign_end)}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Composants atomiques ────────────────────────────────────────────────────
function KPICard(props: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `3px solid ${props.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
          {props.label}
        </div>
        <div style={{ fontSize: 18 }}>{props.icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: props.color, marginTop: 6, fontFamily: 'var(--font-display)' }}>
        {props.value}
      </div>
      {props.sub && <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{props.sub}</div>}
    </div>
  )
}

function MiniKPI(props: { label: string; value: string; icon: string; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 16 }}>{props.icon}</div>
      <div>
        <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: .8 }}>{props.label}</div>
        <div style={{ fontSize: 14, color: props.warn ? 'var(--amber)' : 'var(--tx-1)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{props.value}</div>
      </div>
    </div>
  )
}

function BarSplit(props: { exportPct: number; localPct: number }) {
  return (
    <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--bd-1)' }}>
      <div style={{ width: `${props.exportPct}%`, background: '#3b82f6' }} />
      <div style={{ width: `${props.localPct}%`,  background: '#f59e0b' }} />
    </div>
  )
}

// ─── Helpers de formatage ────────────────────────────────────────────────────
function fmtArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`
  return `${Math.round(m2).toLocaleString('fr')} m²`
}
function fmtVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  return `${Math.round(kg).toLocaleString('fr')} kg`
}
function fmtMAD(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M MAD`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)} k MAD`
  return `${Math.round(v).toLocaleString('fr')} MAD`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'short', year: '2-digit' })
}
function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const s = new Date(start), e = new Date(end)
  const days = Math.round((+e - +s) / (1000 * 60 * 60 * 24))
  if (days <= 0) return ''
  const months = Math.round(days / 30)
  return `Durée : ${months} mois (${days} jours)`
}
