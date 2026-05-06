'use client'
import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Banknote, Coins, Calculator, Percent, Info, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { Select as TSelect } from '@/components/ui/Input'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, VolumeDisplay } from '@/components/display'

type Campaign = { id: string; code: string; name: string; farm_id: string | null }
type Variety = { id: string; code: string; commercial_name: string; type: string }
type DispatchRow = { id: string; variety_id: string | null; greenhouse_id: string | null; market_id: string | null; quantity_kg: number | null; notes: string | null; market_name: string | null; market_currency: string | null; variety_name: string | null }
type CostRow = { amount: number; account_category_id: string | null; account_category_label: string | null; account_category_type: string | null; greenhouse_id: string | null }
type Planting = { id: string; campaign_id: string; greenhouse_id: string; variety_id: string; planted_area: number }

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

  useEffect(() => {
    supabase.from('campaigns').select('id, code, name, farm_id').order('planting_start', { ascending: false })
      .then(({ data }) => {
        setCampaigns(data ?? [])
        if (!campaignId && data && data.length > 0) setCampaignId(data[0].id)
      })
  }, [])

  useEffect(() => {
    if (!campaignId) return
    setLoading(true); setError('')
    ;(async () => {
      try {
        const pl = await supabase.from('campaign_plantings').select('id, campaign_id, greenhouse_id, variety_id, planted_area').eq('campaign_id', campaignId)
        if (pl.error) throw pl.error
        const plantingsList = (pl.data ?? []) as Planting[]
        setPlantings(plantingsList)
        const plantingIds = plantingsList.map(p => p.id)
        const varietyIds = Array.from(new Set(plantingsList.map(p => p.variety_id)))
        if (varietyIds.length > 0) {
          const v = await supabase.from('varieties').select('id, code, commercial_name, type').in('id', varietyIds)
          setVarieties((v.data ?? []) as any)
        } else setVarieties([])

        let disps: DispatchRow[] = []
        if (plantingIds.length > 0) {
          const d = await supabase.from('harvest_lots')
            .select('id, variety_id, greenhouse_id, market_id, quantity_kg, notes, varieties(commercial_name), markets(name, currency)')
            .in('campaign_planting_id', plantingIds).eq('category', 'station_dispatch')
          if (d.error) throw d.error
          disps = ((d.data ?? []) as any[]).map(r => ({
            id: r.id, variety_id: r.variety_id, greenhouse_id: r.greenhouse_id, market_id: r.market_id,
            quantity_kg: r.quantity_kg, notes: r.notes,
            variety_name: r.varieties?.commercial_name ?? null,
            market_name: r.markets?.name ?? null, market_currency: r.markets?.currency ?? null,
          }))
        }
        setDispatches(disps)

        const c = await supabase.from('cost_entries').select('amount, account_category_id, greenhouse_id, account_categories(label, type)').eq('campaign_id', campaignId).eq('is_planned', false)
        if (c.error) throw c.error
        const costsList: CostRow[] = ((c.data ?? []) as any[]).map(r => ({
          amount: Number(r.amount || 0), account_category_id: r.account_category_id,
          account_category_label: r.account_categories?.label ?? null,
          account_category_type: r.account_categories?.type ?? null,
          greenhouse_id: r.greenhouse_id,
        }))
        setCosts(costsList)
      } catch (e: any) { setError(e.message || String(e)) }
      finally { setLoading(false) }
    })()
  }, [campaignId])

  const totalCA = useMemo(() => dispatches.reduce((s, d) => s + (parseMeta(d.notes).ca_amount ?? 0), 0), [dispatches])
  const totalCouts = useMemo(() => costs.reduce((s, c) => s + c.amount, 0), [costs])
  const margeBrute = totalCA - totalCouts
  const margePct = totalCA > 0 ? (margeBrute / totalCA) * 100 : 0

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
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.ca - a.ca)
  }, [dispatches])

  const totalSurface = useMemo(() => plantings.reduce((s, p) => s + (Number(p.planted_area) || 0), 0), [plantings])
  const coutsParVariete = useMemo(() => {
    const surfaceByVariety = new Map<string, number>()
    for (const p of plantings) surfaceByVariety.set(p.variety_id, (surfaceByVariety.get(p.variety_id) ?? 0) + (Number(p.planted_area) || 0))
    const result = new Map<string, number>()
    for (const [vid, surf] of surfaceByVariety) result.set(vid, totalSurface > 0 ? totalCouts * (surf / totalSurface) : 0)
    return result
  }, [plantings, totalSurface, totalCouts])

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

  return (
    <div>
      <PageHeader
        title="Marges & Rentabilité" subtitle="Finances" icon={TrendingUp} iconColor="#10b981"
        description="CA confirmé (dispatches avec prix) − Coûts réels = marge brute par campagne"
        actions={
          <TSelect value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 w-auto min-w-[260px]">
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </TSelect>
        }
      />

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm flex items-center gap-2 mb-md">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
          <KPICard label="CA confirmé" value={<MoneyDisplay value={totalCA} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub={`${dispatches.filter(d => parseMeta(d.notes).ca_amount).length} dispatches avec prix`} icon={Banknote} accent="#3b82f6" variant="hero" delay={0} />
          <KPICard label="Coûts réels" value={<MoneyDisplay value={totalCouts} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub={`${costs.length} entrées`} icon={Coins} accent="#f59e0b" variant="hero" delay={0.05} />
          <KPICard label="Marge brute" value={<MoneyDisplay value={margeBrute} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="CA − Coûts" icon={Calculator} accent={margeBrute >= 0 ? '#10b981' : '#ef4444'} variant="hero" delay={0.1} />
          <KPICard label="Marge %" value={`${margePct.toFixed(1)}%`} sub="rapport au CA" icon={Percent} accent={margePct >= 0 ? '#10b981' : '#ef4444'} variant="hero" delay={0.15} />
        </div>
      )}

      <Card animate delay={0.2} padding="none" className="overflow-hidden mb-md">
        <div className="px-md py-sm border-b border-border">
          <div className="font-display text-heading-sm font-bold text-fg-primary">Marge par variété — {caParVariete.length} variété(s)</div>
        </div>
        {caParVariete.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucun dispatch confirmé sur cette campagne" />
        ) : (
          <DataTable>
            <THead><TR><TH>Variété</TH><TH right>Qté acceptée</TH><TH right>CA</TH><TH right>Coûts (prorata)</TH><TH right>Marge</TH><TH right>Marge %</TH></TR></THead>
            <tbody>
              {caParVariete.map((v, i) => {
                const cout = coutsParVariete.get(v.id) ?? 0
                const marge = v.ca - cout
                const pct = v.ca > 0 ? (marge / v.ca) * 100 : 0
                return (
                  <TR key={v.id} animate delay={0.04 + i * 0.02}>
                    <TD className="font-display font-semibold text-fg-primary">{v.name}</TD>
                    <TD right mono><VolumeDisplay value={v.kg} /></TD>
                    <TD right mono><MoneyDisplay value={v.ca} compact="auto" /></TD>
                    <TD right mono><MoneyDisplay value={cout} compact="auto" /></TD>
                    <TD right mono className={marge >= 0 ? 'text-success font-bold' : 'text-danger font-bold'}><MoneyDisplay value={marge} compact="auto" /></TD>
                    <TD right mono className={pct >= 0 ? 'text-success font-bold' : 'text-danger font-bold'}>{pct.toFixed(1)}%</TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
        <Card animate delay={0.3} padding="none" className="overflow-hidden">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary">CA par marché</div>
          </div>
          {caParMarche.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Aucun dispatch" />
          ) : (
            <DataTable>
              <THead><TR><TH>Marché</TH><TH right>Qté</TH><TH right>CA</TH></TR></THead>
              <tbody>
                {caParMarche.map((m, i) => (
                  <TR key={i} animate delay={0.04 + i * 0.02}>
                    <TD className="font-semibold">{m.name}</TD>
                    <TD right mono><VolumeDisplay value={m.kg} /></TD>
                    <TD right mono><MoneyDisplay value={m.ca} compact="auto" showCurrency={false} /> {m.currency}</TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        <Card animate delay={0.35} padding="none" className="overflow-hidden">
          <div className="px-md py-sm border-b border-border">
            <div className="font-display text-heading-sm font-bold text-fg-primary">Top coûts par catégorie</div>
          </div>
          {coutsParCategorie.length === 0 ? (
            <EmptyState icon={Coins} title="Aucun coût enregistré" />
          ) : (
            <DataTable>
              <THead><TR><TH>Catégorie</TH><TH>Type</TH><TH right>Total</TH></TR></THead>
              <tbody>
                {coutsParCategorie.slice(0, 10).map((c, i) => (
                  <TR key={i} animate delay={0.04 + i * 0.02}>
                    <TD>{c.label}</TD>
                    <TD><Badge variant="default" size="xs">{c.type}</Badge></TD>
                    <TD right mono><MoneyDisplay value={c.total} compact="auto" /></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>

      <Card variant="ghost" className="mt-md border-info/30 bg-info/5">
        <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
          <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
          <div>Coûts par variété calculés au prorata des surfaces plantées (approximation). Pour un calcul exact, ventiler les coûts par serre+variété dans le module Coûts.</div>
        </div>
      </Card>
    </div>
  )
}
