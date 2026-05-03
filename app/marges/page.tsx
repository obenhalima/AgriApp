'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Campaign = { id: string; code: string; name: string; farm_id: string | null }
type Variety = { id: string; code: string; commercial_name: string; type: string }

type DispatchRow = {
  id: string
  variety_id: string | null
  greenhouse_id: string | null
  market_id: string | null
  quantity_kg: number | null
  notes: string | null
  market_name: string | null
  market_currency: string | null
  variety_name: string | null
}

type CostRow = {
  amount: number
  account_category_id: string | null
  account_category_label: string | null
  account_category_type: string | null
  greenhouse_id: string | null
}

type Planting = { id: string; campaign_id: string; greenhouse_id: string; variety_id: string; planted_area: number }

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtK = (n: number) => `${(n / 1000).toFixed(0)} k`

const parseMeta = (s: string | null): any => { try { return JSON.parse(s || '{}') } catch { return {} } }

export default function MargesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState<string>('')
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [dispatches, setDispatches] = useState<DispatchRow[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [plantings, setPlantings] = useState<Planting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  // Charger les campagnes
  useEffect(() => {
    supabase.from('campaigns').select('id, code, name, farm_id').order('planting_start', { ascending: false })
      .then(({ data }) => {
        setCampaigns(data ?? [])
        if (!campaignId && data && data.length > 0) setCampaignId(data[0].id)
      })
  }, [])

  // Charger les données pour la campagne sélectionnée
  useEffect(() => {
    if (!campaignId) return
    setLoading(true); setError('')
    ;(async () => {
      try {
        // Plantations de la campagne (pour mapper greenhouse → variety + surface)
        const pl = await supabase.from('campaign_plantings')
          .select('id, campaign_id, greenhouse_id, variety_id, planted_area')
          .eq('campaign_id', campaignId)
        if (pl.error) throw pl.error
        const plantingsList: Planting[] = (pl.data ?? []) as any
        setPlantings(plantingsList)
        const plantingIds = plantingsList.map(p => p.id)

        // Variétés référencées
        const varietyIds = Array.from(new Set(plantingsList.map(p => p.variety_id)))
        if (varietyIds.length > 0) {
          const v = await supabase.from('varieties').select('id, code, commercial_name, type').in('id', varietyIds)
          setVarieties((v.data ?? []) as any)
        } else setVarieties([])

        // Dispatches confirmés (avec prix) pour ces plantations
        let disps: DispatchRow[] = []
        if (plantingIds.length > 0) {
          const d = await supabase.from('harvest_lots')
            .select('id, variety_id, greenhouse_id, market_id, quantity_kg, notes, varieties(commercial_name), markets(name, currency)')
            .in('campaign_planting_id', plantingIds)
            .eq('category', 'station_dispatch')
          if (d.error) throw d.error
          disps = ((d.data ?? []) as any[]).map(r => ({
            id: r.id,
            variety_id: r.variety_id,
            greenhouse_id: r.greenhouse_id,
            market_id: r.market_id,
            quantity_kg: r.quantity_kg,
            notes: r.notes,
            variety_name: r.varieties?.commercial_name ?? null,
            market_name: r.markets?.name ?? null,
            market_currency: r.markets?.currency ?? null,
          }))
        }
        setDispatches(disps)

        // Coûts de la campagne
        const c = await supabase.from('cost_entries')
          .select('amount, account_category_id, greenhouse_id, account_categories(label, type)')
          .eq('campaign_id', campaignId)
          .eq('is_planned', false)
        if (c.error) throw c.error
        const costsList: CostRow[] = ((c.data ?? []) as any[]).map(r => ({
          amount: Number(r.amount || 0),
          account_category_id: r.account_category_id,
          account_category_label: r.account_categories?.label ?? null,
          account_category_type: r.account_categories?.type ?? null,
          greenhouse_id: r.greenhouse_id,
        }))
        setCosts(costsList)
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [campaignId])

  // ── Calculs dérivés ───────────────────────────────────────
  const totalCA = useMemo(() => dispatches.reduce((s, d) => s + (parseMeta(d.notes).ca_amount ?? 0), 0), [dispatches])
  const totalCouts = useMemo(() => costs.reduce((s, c) => s + c.amount, 0), [costs])
  const margeBrute = totalCA - totalCouts
  const margePct = totalCA > 0 ? (margeBrute / totalCA) * 100 : 0

  // CA par variété
  const caParVariete = useMemo(() => {
    const m = new Map<string, { name: string; ca: number; kg: number }>()
    for (const d of dispatches) {
      const meta = parseMeta(d.notes)
      const ca = Number(meta.ca_amount) || 0
      const qa = Number(meta.qty_acceptee ?? d.quantity_kg) || 0
      const k = d.variety_id ?? 'unknown'
      const cur = m.get(k) ?? { name: d.variety_name ?? '—', ca: 0, kg: 0 }
      cur.ca += ca; cur.kg += qa
      m.set(k, cur)
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.ca - a.ca)
  }, [dispatches])

  // Coûts par variété (proxy : prorata des surfaces plantées)
  const totalSurface = useMemo(() => plantings.reduce((s, p) => s + (Number(p.planted_area) || 0), 0), [plantings])
  const coutsParVariete = useMemo(() => {
    const surfaceByVariety = new Map<string, number>()
    for (const p of plantings) {
      surfaceByVariety.set(p.variety_id, (surfaceByVariety.get(p.variety_id) ?? 0) + (Number(p.planted_area) || 0))
    }
    const result = new Map<string, number>()
    for (const [vid, surf] of surfaceByVariety) {
      result.set(vid, totalSurface > 0 ? totalCouts * (surf / totalSurface) : 0)
    }
    return result
  }, [plantings, totalSurface, totalCouts])

  // CA par marché
  const caParMarche = useMemo(() => {
    const m = new Map<string, { name: string; ca: number; kg: number; currency: string }>()
    for (const d of dispatches) {
      const meta = parseMeta(d.notes)
      const ca = Number(meta.ca_amount) || 0
      const qa = Number(meta.qty_acceptee ?? d.quantity_kg) || 0
      const k = d.market_id ?? 'none'
      const cur = m.get(k) ?? { name: d.market_name ?? '—', ca: 0, kg: 0, currency: d.market_currency ?? 'MAD' }
      cur.ca += ca; cur.kg += qa
      m.set(k, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.ca - a.ca)
  }, [dispatches])

  // Coûts par catégorie
  const coutsParCategorie = useMemo(() => {
    const m = new Map<string, { label: string; type: string; total: number }>()
    for (const c of costs) {
      const k = c.account_category_id ?? 'none'
      const cur = m.get(k) ?? { label: c.account_category_label ?? '—', type: c.account_category_type ?? '', total: 0 }
      cur.total += c.amount
      m.set(k, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [costs])

  if (loading && campaigns.length === 0) {
    return <div style={{ padding: 30, color: 'var(--text-sub)' }}>Chargement…</div>
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
            📈 Marges & Rentabilité
          </h1>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
            CA confirmé (dispatches avec prix validé) − Coûts réels = marge brute par campagne
          </div>
        </div>
        <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
          style={{ marginLeft: 'auto', padding: '7px 12px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12.5 }}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <KPI label="CA confirmé" value={`${fmtK(totalCA)} MAD`} sub={`${dispatches.filter(d => parseMeta(d.notes).ca_amount).length} dispatches avec prix`} color="#3b82f6" />
        <KPI label="Coûts réels" value={`${fmtK(totalCouts)} MAD`} sub={`${costs.length} entrées`} color="#f59e0b" />
        <KPI label="Marge brute" value={`${fmtK(margeBrute)} MAD`} sub="CA − Coûts" color={margeBrute >= 0 ? '#10b981' : '#ef4444'} />
        <KPI label="Marge %" value={`${margePct.toFixed(1)}%`} sub="rapport au CA" color={margePct >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      {/* Marge par variété */}
      <Card title={`Marge par variété — ${caParVariete.length} variété(s)`}>
        {caParVariete.length === 0 ? (
          <Empty msg="Aucun dispatch confirmé sur cette campagne" />
        ) : (
          <table style={tableStyle}>
            <thead><tr style={trHead}>
              {['Variété', 'Qté acceptée', 'CA', 'Coûts (prorata surface)', 'Marge', 'Marge %'].map(h =>
                <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {caParVariete.map(v => {
                const cout = coutsParVariete.get(v.id) ?? 0
                const marge = v.ca - cout
                const pct = v.ca > 0 ? (marge / v.ca) * 100 : 0
                return (
                  <tr key={v.id} style={tr}>
                    <td style={td}>{v.name}</td>
                    <td style={tdNum}>{fmt(v.kg)} kg</td>
                    <td style={tdNum}>{fmt(v.ca)}</td>
                    <td style={tdNum}>{fmt(cout)}</td>
                    <td style={{ ...tdNum, color: marge >= 0 ? 'var(--neon)' : 'var(--red)' }}>{fmt(marge)}</td>
                    <td style={{ ...tdNum, color: pct >= 0 ? 'var(--neon)' : 'var(--red)', fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        {/* CA par marché */}
        <Card title="CA par marché">
          {caParMarche.length === 0 ? (
            <Empty msg="Aucun dispatch" />
          ) : (
            <table style={tableStyle}>
              <thead><tr style={trHead}>
                {['Marché', 'Qté', 'CA'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {caParMarche.map((m, i) => (
                  <tr key={i} style={tr}>
                    <td style={td}>{m.name}</td>
                    <td style={tdNum}>{fmt(m.kg)} kg</td>
                    <td style={tdNum}>{fmt(m.ca)} {m.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Coûts par catégorie */}
        <Card title="Top coûts par catégorie">
          {coutsParCategorie.length === 0 ? (
            <Empty msg="Aucun coût enregistré" />
          ) : (
            <table style={tableStyle}>
              <thead><tr style={trHead}>
                {['Catégorie', 'Type', 'Total'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {coutsParCategorie.slice(0, 10).map((c, i) => (
                  <tr key={i} style={tr}>
                    <td style={td}>{c.label}</td>
                    <td style={{ ...td, fontSize: 10, color: 'var(--text-sub)' }}>{c.type}</td>
                    <td style={tdNum}>{fmt(c.total)} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16, padding: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        ⓘ Coûts par variété calculés au prorata des surfaces plantées (approximation). Pour un calcul exact, ventiler les coûts par serre+variété dans le module Coûts.
      </div>
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────
function KPI({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
      borderRadius: 10, borderTop: `2px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4, fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 3 }}>{sub}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{msg}</div>
}

const tableStyle: React.CSSProperties = { width: '100%', fontSize: 12, borderCollapse: 'collapse' }
const trHead: React.CSSProperties = { borderBottom: '1px solid var(--bd-1)' }
const tr: React.CSSProperties = { borderBottom: '1px solid var(--bd-1)' }
const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5 }
const td: React.CSSProperties = { padding: '7px 8px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '7px 8px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
