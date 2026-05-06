'use client'
/**
 * MODULE PLAN DE CULTURE — Vue unifiée à 4 onglets, 100% dynamique.
 *
 *   1. Dashboard       — KPI agrégés (surface, volume, CA, marge, etc.)
 *   2. Plan de culture — Table détaillée (variété × serre × dates × volume × CA)
 *   3. Volumes         — Pivot multi-axes (par ferme/serre/variété × mensuel)
 *   4. Vue Domaine     — Diagramme Gantt SVG (domaine → fermes → serres + planning)
 *
 * Tout est calculé en live à partir de campaign_plantings + varieties + greenhouses
 * via lib/plantingPlan.ts. Filtres globaux : Campagne, Ferme, Variété.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  loadPlantingPlan, loadAllGreenhouses, computeKPIs,
  buildPivot, distributeMonthly, mergeMonthlyMaps,
  PlantingRow, PivotAxis, PivotMetric, PivotChannel, monthsBetween, monthKey,
} from '@/lib/plantingPlan'
import { MONTH_LABELS_FR } from '@/lib/budgets'

// Tabs
import { DashboardTab } from '@/components/plan-culture/DashboardTab'
import { PlanTab } from '@/components/plan-culture/PlanTab'
import { VolumesTab } from '@/components/plan-culture/VolumesTab'
import { GanttTab } from '@/components/plan-culture/GanttTab'

type Campaign = {
  id: string; name: string; code: string; farm_id: string
  preparation_start: string | null; planting_start: string | null
  harvest_start: string | null; harvest_end: string | null
  campaign_end: string | null
}
type Farm = { id: string; code: string; name: string }
type Variety = { id: string; code: string; commercial_name: string; type: string }
type Greenhouse = { id: string; code: string; name: string; farm_id: string; total_area: number; type: string }

type Tab = 'dashboard' | 'plan' | 'volumes' | 'gantt'

export default function PlanCulturePage() {
  // ─── Référentiels ───
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [allGreenhouses, setAllGreenhouses] = useState<Greenhouse[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  // ─── Filtres globaux ───
  const [campaignId, setCampaignId] = useState('')
  const [farmFilter, setFarmFilter] = useState<string>('all')        // 'all' ou farm_id
  const [varietyFilter, setVarietyFilter] = useState<string>('all')  // 'all' ou variety_id

  // ─── Données dynamiques ───
  const [rows, setRows] = useState<PlantingRow[]>([])
  const [loading, setLoading] = useState(false)

  // ─── Onglet actif ───
  const [tab, setTab] = useState<Tab>('dashboard')

  // ─── Chargement référentiels ───
  useEffect(() => {
    (async () => {
      const [c, f, v, g] = await Promise.all([
        supabase.from('campaigns')
          .select('id, name, code, farm_id, preparation_start, planting_start, harvest_start, harvest_end, campaign_end')
          .order('preparation_start', { ascending: false, nullsFirst: false }),
        supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
        supabase.from('varieties').select('id, code, commercial_name, type').eq('is_active', true).order('commercial_name'),
        loadAllGreenhouses(),
      ])
      const camps = (c.data ?? []) as Campaign[]
      setCampaigns(camps)
      setFarms((f.data ?? []) as Farm[])
      setVarieties((v.data ?? []) as Variety[])
      setAllGreenhouses(g)
      if (camps.length > 0) setCampaignId(camps[0].id)
      setLoadingRefs(false)
    })()
  }, [])

  // ─── Chargement plan de culture (réactif aux filtres campagne+ferme) ───
  useEffect(() => {
    if (!campaignId) { setRows([]); return }
    (async () => {
      setLoading(true)
      try {
        const data = await loadPlantingPlan({
          campaignId,
          farmId: farmFilter === 'all' ? null : farmFilter,
        })
        setRows(data)
      } catch (e: any) {
        alert('Erreur : ' + e.message)
      } finally { setLoading(false) }
    })()
  }, [campaignId, farmFilter])

  // ─── Filtrage variété (côté client, immédiat) ───
  const filteredRows = useMemo(() => {
    if (varietyFilter === 'all') return rows
    return rows.filter(r => r.variety_id === varietyFilter)
  }, [rows, varietyFilter])

  // ─── Greenhouses pertinentes pour le calcul "serres vides" ───
  const greenhousesInScope = useMemo(() => {
    if (farmFilter === 'all') return allGreenhouses
    return allGreenhouses.filter(g => g.farm_id === farmFilter)
  }, [allGreenhouses, farmFilter])

  const campaign = useMemo(() => campaigns.find(c => c.id === campaignId), [campaigns, campaignId])

  // ─── Realtime : écoute les modifs de campaign_plantings pour recharger ───
  useEffect(() => {
    if (!campaignId) return
    const ch = supabase
      .channel(`plan-culture-${campaignId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_plantings', filter: `campaign_id=eq.${campaignId}` },
        async () => {
          const data = await loadPlantingPlan({ campaignId, farmId: farmFilter === 'all' ? null : farmFilter })
          setRows(data)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [campaignId, farmFilter])

  if (loadingRefs) {
    return <div style={{ padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>CHARGEMENT...</div>
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      {/* ─── HEADER STICKY ─── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg-base)', paddingTop: 8, paddingBottom: 10,
        borderBottom: '1px solid var(--bd-1)', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="page-title">PLAN DE CULTURE</div>
            <div className="page-sub">
              Plantations budgétisées · Volumes & CA cibles · Vue domaine
              {loading && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>· Chargement…</span>}
            </div>
          </div>
        </div>

        {/* ─── FILTRES GLOBAUX ─── */}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>CAMPAGNE</div>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
              style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>FERME</div>
            <select value={farmFilter} onChange={e => setFarmFilter(e.target.value)}
              style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
              <option value="all">Toutes les fermes</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>VARIÉTÉ</div>
            <select value={varietyFilter} onChange={e => setVarietyFilter(e.target.value)}
              style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
              <option value="all">Toutes les variétés</option>
              {varieties.map(v => <option key={v.id} value={v.id}>{v.commercial_name}</option>)}
            </select>
          </div>
        </div>

        {/* ─── ONGLETS ─── */}
        <div style={{ marginTop: 12, display: 'flex', gap: 4, borderBottom: '1px solid var(--bd-1)' }}>
          {([
            { v: 'dashboard', l: '📊 Dashboard',     col: '#10b981' },
            { v: 'plan',      l: '🌱 Plan de culture', col: '#a855f7' },
            { v: 'volumes',   l: '📦 Volumes',       col: '#3b82f6' },
            { v: 'gantt',     l: '🗓️ Vue Domaine',   col: '#f59e0b' },
          ] as const).map(t => {
            const active = tab === t.v
            return (
              <button key={t.v} onClick={() => setTab(t.v)}
                style={{
                  padding: '10px 16px',
                  background: active ? `color-mix(in srgb, ${t.col} 12%, transparent)` : 'transparent',
                  color: active ? t.col : 'var(--tx-3)',
                  border: 'none',
                  borderBottom: active ? `2px solid ${t.col}` : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: .5,
                }}>
                {t.l}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── CONTENU DE L'ONGLET ─── */}
      {tab === 'dashboard' && (
        <DashboardTab
          rows={filteredRows}
          greenhousesInScope={greenhousesInScope}
          campaign={campaign}
          loading={loading}
        />
      )}
      {tab === 'plan' && (
        <PlanTab
          rows={filteredRows}
          campaign={campaign}
          loading={loading}
        />
      )}
      {tab === 'volumes' && (
        <VolumesTab
          rows={filteredRows}
          campaign={campaign}
          loading={loading}
        />
      )}
      {tab === 'gantt' && (
        <GanttTab
          rows={filteredRows}
          greenhousesInScope={greenhousesInScope}
          farms={farms}
          campaign={campaign}
          loading={loading}
        />
      )}
    </div>
  )
}
