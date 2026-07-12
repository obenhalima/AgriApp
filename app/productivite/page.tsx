'use client'
import { useEffect, useMemo, useState } from 'react'
import { Ruler, Sprout, Coins, Users, Info, AlertCircle, Gauge, Timer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonKPI } from '@/components/ui/Skeleton'
import { Select as TSelect } from '@/components/ui/Input'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, VolumeDisplay } from '@/components/display'
import { computeProductivite, type ProductiviteResult } from '@/lib/productivite'
import type { HarvestAgg } from '@/lib/coutRevient'

type Campaign = { id: string; code: string; name: string }

const MO_CODES = new Set(['MOD', 'MO_ADMIN', 'CHARGES_SOC'])
const num = (v: number | null, digits = 1) => v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: digits })

export default function ProductivitePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState<string>('')
  const [result, setResult] = useState<ProductiviteResult | null>(null)
  const [cueilletteHours, setCueilletteHours] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const { values: TASKS } = useReferenceList('labor_task')
  const harvestCodes = useMemo(() => {
    const codes = TASKS.filter((t: any) => t.metadata?.is_harvest).map(t => t.code)
    return codes.length ? codes : ['cueillette']
  }, [TASKS])

  useEffect(() => {
    supabase.from('campaigns').select('id, code, name').order('planting_start', { ascending: false })
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
        const pl = await supabase.from('campaign_plantings')
          .select('id, greenhouse_id, variety_id, planted_area, plant_count, linear_meters, price_per_kg_export, price_per_kg_local')
          .eq('campaign_id', campaignId)
        if (pl.error) throw pl.error
        const plantings = (pl.data ?? []) as any[]
        const plantingIds = plantings.map(p => p.id)
        const varietyIds = Array.from(new Set(plantings.map(p => p.variety_id)))

        let varieties: any[] = []
        if (varietyIds.length > 0) {
          const v = await supabase.from('varieties').select('id, commercial_name').in('id', varietyIds)
          if (v.error) throw v.error
          varieties = v.data ?? []
        }

        if (plantingIds.length === 0) {
          setResult({ parVariete: [], totals: { surface: 0, linearMeters: 0, plantCount: 0, productionKg: 0, coutTotal: 0, coutMO: 0, kgParMl: null, coutParMl: null, coutMOParMl: null, kgParPlant: null, rendementKgParM2: null }, hasLinearMeters: false })
          setLoading(false); return
        }

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

        const c = await supabase.from('cost_entries')
          .select('amount, greenhouse_id, variety_id, account_categories(code)')
          .eq('campaign_id', campaignId).eq('is_planned', false)
        if (c.error) throw c.error
        const allCosts = ((c.data ?? []) as any[]).map(r => ({
          amount: Number(r.amount) || 0, greenhouse_id: r.greenhouse_id, variety_id: r.variety_id,
          code: r.account_categories?.code ?? '',
        }))
        const costs = allCosts.map(({ amount, greenhouse_id, variety_id }) => ({ amount, greenhouse_id, variety_id }))
        const moCosts = allCosts.filter(x => MO_CODES.has(x.code)).map(({ amount, greenhouse_id, variety_id }) => ({ amount, greenhouse_id, variety_id }))

        setResult(computeProductivite({ plantings, varieties, harvestsByPlanting, costs, moCosts }))

        // Heures de cueillette pointées (Phase 2) → cueillette kg/heure
        const lab = await supabase.from('labor_entries')
          .select('person_hours').eq('campaign_id', campaignId).in('operation_type', harvestCodes)
        setCueilletteHours(((lab.data ?? []) as any[]).reduce((s, r) => s + (Number(r.person_hours) || 0), 0))
      } catch (e: any) { setError(e.message || String(e)) }
      finally { setLoading(false) }
    })()
  }, [campaignId, harvestCodes])

  const t = result?.totals

  return (
    <div>
      <PageHeader
        title="Productivité" subtitle="Production" icon={Gauge} iconColor="#8b5cf6"
        description="Rendement et coûts au mètre linéaire de culture — par variété"
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

      {!loading && result && !result.hasLinearMeters && result.parVariete.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-md text-body-sm text-fg-secondary flex items-start gap-2 mb-md">
          <AlertCircle size={16} className="text-warning flex-shrink-0 mt-0.5" />
          <div>Aucune plantation n'a de <b>mètres linéaires</b> renseignés — les indicateurs par mètre restent « — ». Renseigne le métrage dans <b>Plantations</b> (bloc « Surfaces &amp; densité ») pour activer kg/ml et coût/ml.</div>
        </div>
      )}

      {loading || !t ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-md mb-md">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-md mb-md">
          <KPICard label="Production" value={<VolumeDisplay value={t.productionKg} className="!text-current font-display !text-display-sm" />} sub={`${num(t.linearMeters, 0)} ml de culture`} icon={Sprout} accent="#10b981" variant="hero" delay={0} />
          <KPICard label="kg / mètre linéaire" value={<span className="font-display text-display-sm">{num(t.kgParMl, 1)}</span>} sub="rendement au ml" icon={Ruler} accent="#3b82f6" variant="hero" delay={0.05} />
          <KPICard label="Cueillette kg/h" value={<span className="font-display text-display-sm">{cueilletteHours > 0 ? num(t.productionKg / cueilletteHours, 1) : '—'}</span>} sub={cueilletteHours > 0 ? `sur ${num(cueilletteHours, 0)} h pointées` : 'pointe des heures'} icon={Timer} accent="#0ea5e9" variant="hero" delay={0.1} />
          <KPICard label="Coût / mètre linéaire" value={<span className="font-display text-display-sm">{num(t.coutParMl, 0)}</span>} sub="MAD/ml (tous coûts)" icon={Coins} accent="#f59e0b" variant="hero" delay={0.15} />
          <KPICard label="Coût MO / mètre" value={<span className="font-display text-display-sm">{num(t.coutMOParMl, 0)}</span>} sub="MAD/ml (main-d'œuvre)" icon={Users} accent="#8b5cf6" variant="hero" delay={0.2} />
        </div>
      )}

      <Card animate delay={0.2} padding="none" className="overflow-hidden mb-md">
        <div className="px-md py-sm border-b border-border">
          <div className="font-display text-heading-sm font-bold text-fg-primary">Productivité par culture — {result?.parVariete.length ?? 0} variété(s)</div>
        </div>
        {!result || result.parVariete.length === 0 ? (
          <EmptyState icon={Gauge} title="Aucune plantation sur cette campagne" />
        ) : (
          <div className="overflow-x-auto">
            <DataTable>
              <THead><TR>
                <TH>Variété</TH>
                <TH right>Mètres lin.</TH>
                <TH right>Production</TH>
                <TH right>kg/ml</TH>
                <TH right>Coût/ml</TH>
                <TH right>Coût MO/ml</TH>
                <TH right>kg/plant</TH>
                <TH right>Rdt kg/m²</TH>
              </TR></THead>
              <tbody>
                {result.parVariete.map((v, i) => (
                  <TR key={v.variety_id} animate delay={0.04 + i * 0.02}>
                    <TD className="font-display font-semibold text-fg-primary">{v.variety_name}</TD>
                    <TD right mono>{v.linearMeters > 0 ? `${num(v.linearMeters, 0)} m` : <span className="opacity-50">—</span>}</TD>
                    <TD right mono><VolumeDisplay value={v.productionKg} /></TD>
                    <TD right mono className="font-bold">{v.kgParMl == null ? <span className="opacity-50">—</span> : num(v.kgParMl, 1)}</TD>
                    <TD right mono>{v.coutParMl == null ? <span className="opacity-50">—</span> : <MoneyDisplay value={v.coutParMl} compact="auto" showCurrency={false} />}</TD>
                    <TD right mono>{v.coutMOParMl == null ? <span className="opacity-50">—</span> : <MoneyDisplay value={v.coutMOParMl} compact="auto" showCurrency={false} />}</TD>
                    <TD right mono>{num(v.kgParPlant, 2)}</TD>
                    <TD right mono>{num(v.rendementKgParM2, 1)}</TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Card>

      <Card variant="ghost" className="border-info/30 bg-info/5">
        <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
          <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div><b className="text-fg-primary">kg/ml</b> = production récoltée ÷ mètres linéaires. <b className="text-fg-primary">Coût/ml</b> et <b className="text-fg-primary">Coût MO/ml</b> = coûts imputés (cascade serre→variété) ÷ mètres linéaires.</div>
            <div className="text-caption opacity-80">Le coût MO provient de la paie répartie par surface (allocation, pas temps réel). La productivité horaire (kg/heure) nécessitera la saisie du temps de travail — à venir.</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
