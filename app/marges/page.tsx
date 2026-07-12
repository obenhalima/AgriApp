'use client'
import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Coins, Calculator, Percent, Info, AlertCircle, Scale, Banknote } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonKPI } from '@/components/ui/Skeleton'
import { Select as TSelect } from '@/components/ui/Input'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, VolumeDisplay } from '@/components/display'
import { computeCoutRevient, type CoutRevientResult, type HarvestAgg } from '@/lib/coutRevient'

type Campaign = { id: string; code: string; name: string; farm_id: string | null }

export default function MargesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState<string>('')
  const [result, setResult] = useState<CoutRevientResult | null>(null)
  const [coutsParCategorie, setCoutsParCategorie] = useState<{ label: string; type: string; total: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    supabase.from('campaigns').select('id, code, name, farm_id').order('planting_start', { ascending: false })
      .then(({ data }) => {
        setCampaigns(data ?? [])
        if (data && data.length > 0) setCampaignId(prev => prev || data[0].id)
      })
  }, [])

  useEffect(() => {
    if (!campaignId) return
    setLoading(true); setError('')
    ;(async () => {
      try {
        // 1. Plantations (avec prix validés)
        const pl = await supabase.from('campaign_plantings')
          .select('id, greenhouse_id, variety_id, planted_area, price_per_kg_export, price_per_kg_local')
          .eq('campaign_id', campaignId)
        if (pl.error) throw pl.error
        const plantings = (pl.data ?? []) as any[]
        const plantingIds = plantings.map(p => p.id)
        const varietyIds = Array.from(new Set(plantings.map(p => p.variety_id)))

        // 2. Variétés (prix moyens de repli)
        let varieties: any[] = []
        if (varietyIds.length > 0) {
          const v = await supabase.from('varieties')
            .select('id, commercial_name, avg_price_export, avg_price_local').in('id', varietyIds)
          if (v.error) throw v.error
          varieties = v.data ?? []
        }

        if (plantingIds.length === 0) {
          setResult({ parVariete: [], totals: { surface: 0, productionKg: 0, couts: 0, caValorise: 0, caReel: 0, margeValorisee: 0, margeReelle: 0, margePctValorisee: null, margePctReelle: null, coutParKg: null } })
          setCoutsParCategorie([]); setLoading(false); return
        }

        // 3. Récoltes → agrégat par plantation
        const h = await supabase.from('harvests')
          .select('campaign_planting_id, qty_category_1, qty_category_2, qty_category_3, total_qty')
          .in('campaign_planting_id', plantingIds)
        if (h.error) throw h.error
        const harvestsByPlanting = new Map<string, HarvestAgg>()
        for (const r of (h.data ?? []) as any[]) {
          const k = r.campaign_planting_id
          const cur = harvestsByPlanting.get(k) ?? { qty_cat1: 0, qty_cat2: 0, qty_cat3: 0, total_qty: 0 }
          cur.qty_cat1 += Number(r.qty_category_1) || 0
          cur.qty_cat2 += Number(r.qty_category_2) || 0
          cur.qty_cat3 += Number(r.qty_category_3) || 0
          cur.total_qty += Number(r.total_qty) || 0
          harvestsByPlanting.set(k, cur)
        }

        // 4. CA réel station (colonnes typées, pas le JSON notes) par variété
        const d = await supabase.from('harvest_lots')
          .select('variety_id, ca_amount, qty_acceptee_kg')
          .in('campaign_planting_id', plantingIds).eq('category', 'station_dispatch')
        if (d.error) throw d.error
        const lots = (d.data ?? []) as any[]

        // 5. Coûts réels (inclut désormais les achats via le pont 060)
        const c = await supabase.from('cost_entries')
          .select('amount, greenhouse_id, variety_id, account_categories(label, type)')
          .eq('campaign_id', campaignId).eq('is_planned', false)
        if (c.error) throw c.error
        const costs = ((c.data ?? []) as any[]).map(r => ({
          amount: Number(r.amount) || 0, greenhouse_id: r.greenhouse_id, variety_id: r.variety_id,
          label: r.account_categories?.label ?? '—', type: r.account_categories?.type ?? '',
        }))

        // Top coûts par catégorie (indépendant du moteur)
        const catMap = new Map<string, { label: string; type: string; total: number }>()
        for (const co of costs) {
          const k = co.label
          const cur = catMap.get(k) ?? { label: co.label, type: co.type, total: 0 }
          cur.total += co.amount; catMap.set(k, cur)
        }
        setCoutsParCategorie(Array.from(catMap.values()).sort((a, b) => b.total - a.total))

        setResult(computeCoutRevient({
          plantings, varieties, harvestsByPlanting, lots,
          costs: costs.map(co => ({ amount: co.amount, greenhouse_id: co.greenhouse_id, variety_id: co.variety_id })),
        }))
      } catch (e: any) { setError(e.message || String(e)) }
      finally { setLoading(false) }
    })()
  }, [campaignId])

  const t = result?.totals
  const pct = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`

  return (
    <div>
      <PageHeader
        title="Coût de revient & Marges" subtitle="Finances" icon={TrendingUp} iconColor="#10b981"
        description="Coût de production par culture (achats + charges + MO répartis) → marge valorisée et marge réelle"
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

      {loading || !t ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
          <KPICard label="Coûts réels" value={<MoneyDisplay value={t.couts} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="achats + charges + MO + amort." icon={Coins} accent="#f59e0b" variant="hero" delay={0} />
          <KPICard label="Coût de revient /kg" value={<MoneyDisplay value={t.coutParKg ?? 0} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub={`sur ${(t.productionKg).toLocaleString('fr-FR')} kg produits`} icon={Scale} accent="#8b5cf6" variant="hero" delay={0.05} />
          <KPICard label="Marge valorisée" value={<MoneyDisplay value={t.margeValorisee} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub={`${pct(t.margePctValorisee)} · CA récoltes×prix`} icon={Calculator} accent={t.margeValorisee >= 0 ? '#10b981' : '#ef4444'} variant="hero" delay={0.1} />
          <KPICard label="Marge réelle" value={<MoneyDisplay value={t.margeReelle} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub={`${pct(t.margePctReelle)} · CA station tarifé`} icon={Banknote} accent={t.margeReelle >= 0 ? '#10b981' : '#ef4444'} variant="hero" delay={0.15} />
        </div>
      )}

      <Card animate delay={0.2} padding="none" className="overflow-hidden mb-md">
        <div className="px-md py-sm border-b border-border">
          <div className="font-display text-heading-sm font-bold text-fg-primary">Coût de revient par culture — {result?.parVariete.length ?? 0} variété(s)</div>
        </div>
        {!result || result.parVariete.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucune plantation sur cette campagne" />
        ) : (
          <div className="overflow-x-auto">
            <DataTable>
              <THead><TR>
                <TH>Variété</TH>
                <TH right>Production</TH>
                <TH right>Coûts</TH>
                <TH right>Coût/kg</TH>
                <TH right>Coût/m²</TH>
                <TH right>CA valorisé</TH>
                <TH right>Marge val.</TH>
                <TH right>CA réel</TH>
                <TH right>Marge réelle</TH>
              </TR></THead>
              <tbody>
                {result.parVariete.map((v, i) => (
                  <TR key={v.variety_id} animate delay={0.04 + i * 0.02}>
                    <TD className="font-display font-semibold text-fg-primary">{v.variety_name}</TD>
                    <TD right mono><VolumeDisplay value={v.productionKg} /></TD>
                    <TD right mono><MoneyDisplay value={v.couts} compact="auto" /></TD>
                    <TD right mono>{v.coutParKg == null ? '—' : <MoneyDisplay value={v.coutParKg} compact="auto" />}</TD>
                    <TD right mono>{v.coutParM2 == null ? '—' : <MoneyDisplay value={v.coutParM2} compact="auto" />}</TD>
                    <TD right mono><MoneyDisplay value={v.caValorise} compact="auto" /></TD>
                    <TD right mono className={v.margeValorisee >= 0 ? 'text-success font-bold' : 'text-danger font-bold'}>
                      <MoneyDisplay value={v.margeValorisee} compact="auto" /> <span className="text-caption opacity-70">{pct(v.margePctValorisee)}</span>
                    </TD>
                    <TD right mono>{v.caReel > 0 ? <MoneyDisplay value={v.caReel} compact="auto" /> : <span className="opacity-50">—</span>}</TD>
                    <TD right mono className={v.caReel > 0 ? (v.margeReelle >= 0 ? 'text-success font-bold' : 'text-danger font-bold') : 'opacity-50'}>
                      {v.caReel > 0 ? <><MoneyDisplay value={v.margeReelle} compact="auto" /> <span className="text-caption opacity-70">{pct(v.margePctReelle)}</span></> : '—'}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
        <Card animate delay={0.3} padding="none" className="overflow-hidden">
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

        <Card variant="ghost" className="border-info/30 bg-info/5">
          <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
            <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <div><b className="text-fg-primary">Méthode.</b> Les coûts sont imputés en cascade : d'abord au niveau serre+variété, sinon répartis par serre puis par campagne au prorata des surfaces plantées.</div>
              <div><b className="text-fg-primary">Marge valorisée</b> = CA récoltes × prix (export/local) − coûts. <b className="text-fg-primary">Marge réelle</b> = CA station réellement trié+tarifé − coûts (colonne « — » tant qu'un lot n'est pas tarifé).</div>
              <div className="text-caption opacity-80">Les achats reçus alimentent les coûts (pont automatique). Prix export/local sommés sans conversion de devise (convention app, cohérent avec le dashboard).</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
