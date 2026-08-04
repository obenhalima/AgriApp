'use client'
/**
 * DemoSetupWizard — Wizard "From Zero to Demo" en 4 étapes.
 *
 *  Étape 1 : Fermes (nombre + nom + ville)
 *  Étape 2 : Serres par ferme (nombre + surface m² + type)
 *  Étape 3 : Variétés à utiliser (créer ou réutiliser) + Campagne (dates, objectifs)
 *  Étape 4 : Aperçu récapitulatif + Génération en cascade
 *
 *  À la fin : crée farms → greenhouses → varieties → campaign → plantings.
 *  Les plantings sont distribués en assignant des variétés aux serres
 *  selon la sélection (rotation déterministe).
 */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Building2, Sprout, Calendar, Dna, ChevronLeft, ChevronRight, Check,
  Plus, Minus, Loader2, AlertTriangle, Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

type FarmDraft = {
  name: string
  code: string
  city: string
  greenhouseCount: number
  ghSurfaceM2: number  // surface moyenne par serre
  ghType: 'venlo' | 'tunnel' | 'chapelle' | 'multispan' | 'solaire' | 'autre'
}

type VarietyDraft = {
  code: string
  name: string
  type: 'ronde' | 'grappe' | 'cerise' | 'allongee' | 'cocktail' | 'beef' | 'olivette'
  yieldPerM2: number      // kg/m²
  cyclesDays: number
  pricePerKg: number       // prix marché local (MAD/kg)
  priceExportEur?: number  // prix export (EUR/kg)
  exportSharePct?: number  // % export (vs local)
}

type CampaignDraft = {
  code: string
  name: string
  preparation_start: string
  planting_start: string
  harvest_start: string
  harvest_end: string
  campaign_end: string
  budget_total: number
  generatePlannedCosts: boolean  // génère aussi les cost_entries prévisionnels
  distributeChargesPerGreenhouse: boolean  // ventile les charges par serre (prorata surface)
}

// Répartition typique d'un budget de ferme tomate (somme = 100%)
const COST_RATIOS: Array<{ code: string; ratio: number; type: 'variable' | 'fixe' }> = [
  // Charges variables (50% total)
  { code: 'SEMENCES',          ratio: 0.03, type: 'variable' },
  { code: 'PLANTS',            ratio: 0.04, type: 'variable' },
  { code: 'ENGRAIS',           ratio: 0.10, type: 'variable' },
  { code: 'PHYTOS',            ratio: 0.06, type: 'variable' },
  { code: 'INSECTES_AUX',      ratio: 0.02, type: 'variable' },
  { code: 'ELECTRICITE',       ratio: 0.06, type: 'variable' },
  { code: 'EAU',               ratio: 0.05, type: 'variable' },
  { code: 'TRANSPORT_VENTES',  ratio: 0.08, type: 'variable' },
  { code: 'AUTRES_FOURNI',     ratio: 0.06, type: 'variable' },
  // Charges fixes (50% total)
  { code: 'MOD',               ratio: 0.28, type: 'fixe' },
  { code: 'MO_ADMIN',          ratio: 0.05, type: 'fixe' },
  { code: 'LOYER_FERMES',      ratio: 0.04, type: 'fixe' },
  { code: 'ENTRETIEN',         ratio: 0.06, type: 'fixe' },
  { code: 'PRESTATIONS',       ratio: 0.03, type: 'fixe' },
  { code: 'AUTRES_FG',         ratio: 0.04, type: 'fixe' },
]

// prix MAD/kg local + EUR/kg export · % export typique des fermes au Maroc
const DEFAULT_VARIETIES: VarietyDraft[] = [
  { code: 'MARQ', name: 'Marquise',  type: 'ronde',    yieldPerM2: 25, cyclesDays: 280, pricePerKg:  8.5, priceExportEur: 1.2, exportSharePct: 70 },
  { code: 'CHRY', name: 'Cherry F1', type: 'cerise',   yieldPerM2: 22, cyclesDays: 270, pricePerKg: 14.0, priceExportEur: 2.5, exportSharePct: 80 },
  { code: 'ROMA', name: 'Roma',      type: 'allongee', yieldPerM2: 28, cyclesDays: 290, pricePerKg:  7.0, priceExportEur: 0.9, exportSharePct: 60 },
  { code: 'COCK', name: 'Cocktail',  type: 'cocktail', yieldPerM2: 20, cyclesDays: 260, pricePerKg: 12.0, priceExportEur: 2.0, exportSharePct: 75 },
  { code: 'GRAP', name: 'Grappe',    type: 'grappe',   yieldPerM2: 26, cyclesDays: 285, pricePerKg:  9.5, priceExportEur: 1.4, exportSharePct: 70 },
]

const REGIONS_MAROC = ['Souss-Massa', 'Casablanca-Settat', 'Marrakech-Safi', 'Tanger-Tétouan-Al Hoceima', 'Rabat-Salé-Kénitra']

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function slugCode(s: string, fallback: string): string {
  const v = s.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
  return v || fallback
}

function todayPlus(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Récupère une liste de codes existants en DB et renvoie une fonction
 * qui suffixe un code candidat pour le rendre unique (ex: FS → FS-2 → FS-3).
 * Maintient un Set interne pour éviter les conflits intra-batch.
 */
function makeUniqueCodeResolver(existing: Set<string>) {
  const used = new Set(existing)
  return (baseCode: string): string => {
    const base = baseCode.toUpperCase().trim() || 'F'
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let i = 2
    while (used.has(`${base}-${i}`)) i++
    const final = `${base}-${i}`
    used.add(final)
    return final
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ────────────────────────────────────────────────────────────────────────────

export function DemoSetupWizard({ onClose, onComplete }: {
  onClose: () => void
  onComplete?: (campaignId: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [farms, setFarms] = useState<FarmDraft[]>([
    { name: 'Ferme Sud', code: 'FS', city: 'Agadir', greenhouseCount: 4, ghSurfaceM2: 8000, ghType: 'multispan' },
  ])
  const [varieties, setVarieties] = useState<VarietyDraft[]>([DEFAULT_VARIETIES[0], DEFAULT_VARIETIES[1]])
  const [campaign, setCampaign] = useState<CampaignDraft>({
    code: `C-${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    name: `Campagne ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    preparation_start: todayPlus(-2),
    planting_start: todayPlus(-1),
    harvest_start: todayPlus(0),
    harvest_end: todayPlus(8),
    campaign_end: todayPlus(9),
    budget_total: 0,
    generatePlannedCosts: true,
    distributeChargesPerGreenhouse: true,
  })

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ step: '', done: 0, total: 0 })

  // ─── Récap calculé ──────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalGh = farms.reduce((s, f) => s + f.greenhouseCount, 0)
    const totalSurface = farms.reduce((s, f) => s + f.greenhouseCount * f.ghSurfaceM2, 0)
    // Distribution variétés sur les serres : round-robin
    const totalPlantings = totalGh
    const avgYield = varieties.length > 0
      ? varieties.reduce((s, v) => s + v.yieldPerM2, 0) / varieties.length
      : 0
    const expectedProd = totalSurface * avgYield
    const avgPrice = varieties.length > 0
      ? varieties.reduce((s, v) => s + v.pricePerKg, 0) / varieties.length
      : 0
    const expectedCA = expectedProd * avgPrice
    return { totalGh, totalSurface, totalPlantings, expectedProd, expectedCA, avgYield, avgPrice }
  }, [farms, varieties])

  // ─── Step 1 : Fermes ────────────────────────────────────────────────────
  const updateFarm = (i: number, patch: Partial<FarmDraft>) => {
    setFarms(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }
  const addFarm = () => {
    const i = farms.length + 1
    setFarms([...farms, {
      name: `Ferme ${i}`, code: `F${i}`, city: 'Agadir',
      greenhouseCount: 4, ghSurfaceM2: 8000, ghType: 'multispan',
    }])
  }
  const removeFarm = (i: number) => {
    if (farms.length === 1) return
    setFarms(farms.filter((_, idx) => idx !== i))
  }

  // ─── Step 3 : Variétés ──────────────────────────────────────────────────
  const toggleVariety = (v: VarietyDraft) => {
    const exists = varieties.find(x => x.code === v.code)
    if (exists) setVarieties(varieties.filter(x => x.code !== v.code))
    else setVarieties([...varieties, v])
  }

  // ─── Validation par étape ───────────────────────────────────────────────
  const canNext = (): boolean => {
    if (step === 1) {
      return farms.length > 0 && farms.every(f => f.name.trim() && f.code.trim() && f.greenhouseCount > 0 && f.ghSurfaceM2 > 0)
    }
    if (step === 2) return true
    if (step === 3) {
      return varieties.length > 0 && campaign.code.trim() !== '' && campaign.name.trim() !== '' && !!campaign.harvest_start && !!campaign.harvest_end
    }
    return true
  }

  // ─── Génération finale ──────────────────────────────────────────────────
  const generateAll = async () => {
    setGenerating(true)
    setProgress({ step: 'Création des fermes', done: 0, total: 0 })

    try {
      // ─── 0. Précharge les codes existants (farms + campaigns) ─────────
      const totalSteps = 5 + farms.length + summary.totalGh + varieties.length
      let stepCount = 0
      setProgress({ step: 'Vérification codes existants', done: stepCount, total: totalSteps })

      const [existingFarmsRes, existingCampaignsRes] = await Promise.all([
        supabase.from('farms').select('code'),
        supabase.from('campaigns').select('code'),
      ])
      const existingFarmCodes = new Set((existingFarmsRes.data ?? []).map((f: any) => f.code))
      const existingCampaignCodes = new Set((existingCampaignsRes.data ?? []).map((c: any) => c.code))
      const farmCodeResolver = makeUniqueCodeResolver(existingFarmCodes)
      const campaignCodeResolver = makeUniqueCodeResolver(existingCampaignCodes)
      stepCount += 1
      setProgress({ step: 'Codes vérifiés', done: stepCount, total: totalSteps })

      // ─── 1. Insère les fermes (codes auto-résolus si conflit) ─────────
      // Map ferme draft → code final unique
      const farmCodeMap = new Map<number, string>()
      farms.forEach((f, idx) => {
        const baseCode = (f.code.trim() || `F${idx + 1}`).toUpperCase()
        farmCodeMap.set(idx, farmCodeResolver(baseCode))
      })

      const farmInserts = farms.map((f, idx) => ({
        code: farmCodeMap.get(idx)!,
        name: f.name.trim(),
        city: f.city.trim() || 'Agadir',
        region: REGIONS_MAROC[0],
        country: 'Maroc',
        total_area: (f.greenhouseCount * f.ghSurfaceM2) / 10000,  // en hectares
        is_active: true,
      }))
      const { data: insertedFarms, error: fErr } = await supabase
        .from('farms').insert(farmInserts).select('id, code, name')
      if (fErr) throw fErr
      stepCount += farms.length

      // Si on a renommé des codes, le signaler à l'utilisateur
      const renamed: string[] = []
      farms.forEach((f, idx) => {
        const original = (f.code.trim() || `F${idx + 1}`).toUpperCase()
        const final = farmCodeMap.get(idx)!
        if (original !== final) renamed.push(`${original} → ${final}`)
      })
      if (renamed.length > 0) {
        toast(`Codes ferme renommés pour éviter conflits : ${renamed.join(', ')}`, { duration: 6000 })
      }
      setProgress({ step: `${insertedFarms!.length} fermes créées`, done: stepCount, total: totalSteps })

      // ─── 2. Crée les serres pour chaque ferme ─────────────────────────
      const greenhouseInserts: any[] = []
      farms.forEach((f, fIdx) => {
        const finalCode = farmCodeMap.get(fIdx)!
        const farmId = insertedFarms!.find(x => x.code === finalCode)!.id
        for (let i = 1; i <= f.greenhouseCount; i++) {
          const code = `S${String(i).padStart(2, '0')}`
          greenhouseInserts.push({
            farm_id: farmId,
            code,
            name: `${finalCode}-${code}`,
            type: f.ghType,
            status: 'active',
            total_area: f.ghSurfaceM2,
            exploitable_area: Math.round(f.ghSurfaceM2 * 0.92),  // 92% exploitable
            length: Math.round(Math.sqrt(f.ghSurfaceM2) * 1.3 * 10) / 10,
            width:  Math.round(Math.sqrt(f.ghSurfaceM2) * 0.77 * 10) / 10,
            height: 4.5,
            irrigation_type: 'goutte_a_goutte',
            climate_control: f.ghType === 'venlo' || f.ghType === 'multispan',
          })
        }
      })
      const { data: insertedGhs, error: ghErr } = await supabase
        .from('greenhouses').insert(greenhouseInserts).select('id, farm_id, code, exploitable_area')
      if (ghErr) throw ghErr
      stepCount += summary.totalGh
      setProgress({ step: `${insertedGhs!.length} serres créées`, done: stepCount, total: totalSteps })

      // ─── 3. Crée les variétés ─────────────────────────────────────────
      // On essaie un upsert sur le code, sinon insert
      const varietyInserts = varieties.map(v => ({
        code: v.code,
        commercial_name: v.name,
        type: v.type,
        destination: 'mixte',
        estimated_cycle_days: v.cyclesDays,
        theoretical_yield_per_m2: v.yieldPerM2,
        avg_price_local: v.pricePerKg,                  // MAD/kg
        avg_price_export: v.priceExportEur ?? 1.2,      // EUR/kg
        avg_fruit_weight: 150,
        brix_degree: 5.2,
        planting_density: 2.5,
        is_active: true,
      }))
      const { data: insertedVarieties, error: vErr } = await supabase
        .from('varieties')
        .upsert(varietyInserts, { onConflict: 'code' })
        .select('id, code')
      if (vErr) throw vErr
      stepCount += varieties.length
      setProgress({ step: `${insertedVarieties!.length} variétés prêtes`, done: stepCount, total: totalSteps })

      // ─── 4. Crée la campagne (sur la 1ère ferme) ──────────────────────
      const firstFarmId = insertedFarms![0].id
      const budgetCalculated = campaign.budget_total > 0 ? campaign.budget_total
                                                          : Math.round(summary.totalSurface * 50)  // 50 MAD/m² par défaut
      // Résout le code campagne pour éviter les conflits
      const finalCampaignCode = campaignCodeResolver(campaign.code.trim())
      if (finalCampaignCode !== campaign.code.trim().toUpperCase()) {
        toast(`Code campagne renommé : ${campaign.code} → ${finalCampaignCode}`, { duration: 5000 })
      }

      const { data: insertedCampaign, error: cErr } = await supabase
        .from('campaigns').insert({
          code: finalCampaignCode,
          name: campaign.name,
          farm_id: firstFarmId,
          status: 'en_cours',
          preparation_start: campaign.preparation_start || null,
          planting_start: campaign.planting_start || null,
          harvest_start: campaign.harvest_start || null,
          harvest_end: campaign.harvest_end || null,
          campaign_end: campaign.campaign_end || null,
          budget_total: budgetCalculated,
          production_target_kg: Math.round(summary.expectedProd),
          revenue_target: Math.round(summary.expectedCA),
        }).select('id, name').single()
      if (cErr) throw cErr
      stepCount += 1
      setProgress({ step: `Campagne "${insertedCampaign!.name}" créée`, done: stepCount, total: totalSteps })

      // ─── 5. Crée les plantations (1 par serre, variété round-robin) ───
      const plantingInserts: any[] = []
      insertedGhs!.forEach((gh, idx) => {
        const variety = insertedVarieties![idx % insertedVarieties!.length]
        const varSpec = varieties[idx % varieties.length]
        const ghSpec = greenhouseInserts.find(g => g.code === gh.code && g.farm_id === gh.farm_id)
        const surface = (ghSpec?.exploitable_area as number) ?? 7000
        plantingInserts.push({
          campaign_id: insertedCampaign!.id,
          greenhouse_id: gh.id,
          variety_id: variety.id,
          planted_area: surface,
          plant_count: Math.round(surface * 2.5),
          actual_density: 2.5,
          planting_date: campaign.planting_start || null,
          // Anciennes colonnes (initial schema)
          first_harvest_date: campaign.harvest_start || null,
          last_harvest_date: campaign.harvest_end || null,
          // Nouvelles colonnes (migration 013) — utilisées par v_planting_forecasts
          harvest_start_date: campaign.harvest_start || null,
          harvest_end_date: campaign.harvest_end || null,
          export_share_pct: varSpec.exportSharePct ?? 70,
          target_yield_per_m2: varSpec.yieldPerM2,
          target_total_production: surface * varSpec.yieldPerM2,
          status: 'en_cours',
        })
      })
      const { data: insertedPlantings, error: pErr } = await supabase
        .from('campaign_plantings').insert(plantingInserts).select('id')
      if (pErr) throw pErr
      stepCount += 3
      setProgress({ step: `${insertedPlantings!.length} plantations créées`, done: stepCount, total: totalSteps })

      // ─── 6. (Optionnel) Génère les cost_entries prévisionnels ─────────
      let insertedCosts = 0
      if (campaign.generatePlannedCosts && budgetCalculated > 0) {
        setProgress({ step: 'Génération des coûts prévisionnels', done: stepCount, total: totalSteps })
        try {
          // Récupère les catégories feuilles (level 3) ou (level 2) pertinentes
          const { data: cats, error: catErr } = await supabase
            .from('account_categories')
            .select('id, code')
            .in('code', COST_RATIOS.map(r => r.code))
          if (catErr) throw catErr
          const catMap = new Map((cats ?? []).map((c: any) => [c.code, c.id]))

          // Distribue le budget total sur les mois de la campagne
          const startDate = new Date((campaign.preparation_start || campaign.harvest_start) + 'T00:00:00')
          const endDate   = new Date((campaign.campaign_end       || campaign.harvest_end)  + 'T00:00:00')
          const months: Array<{ year: number; month: number; date: string }> = []
          const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
          while (cur <= endDate) {
            const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
            const mid = new Date(cur.getFullYear(), cur.getMonth(), Math.min(15, lastDay.getDate()))
            months.push({
              year: cur.getFullYear(),
              month: cur.getMonth() + 1,
              date: mid.toISOString().slice(0, 10),
            })
            cur.setMonth(cur.getMonth() + 1)
          }

          if (months.length === 0) months.push({
            year: new Date().getFullYear(), month: new Date().getMonth() + 1,
            date: new Date().toISOString().slice(0, 10),
          })

          // Génère les cost_entries par (catégorie × mois), ventilés PAR SERRE
          // (prorata surface + variance par serre) si l'option est activée,
          // sinon au niveau campagne (greenhouse_id = null).
          const ghList = (insertedGhs ?? []) as any[]
          const totalGhArea = ghList.reduce((s, g) => s + (Number(g.exploitable_area) || 0), 0)
          const perGreenhouse = campaign.distributeChargesPerGreenhouse && ghList.length > 0 && totalGhArea > 0

          const costInserts: any[] = []
          for (const ratio of COST_RATIOS) {
            const catId = catMap.get(ratio.code)
            if (!catId) continue
            const totalForCategory = budgetCalculated * ratio.ratio
            const perMonth = totalForCategory / months.length
            for (const m of months) {
              if (perGreenhouse) {
                for (const g of ghList) {
                  const share = (Number(g.exploitable_area) || 0) / totalGhArea
                  const jitter = 1 + (Math.random() - 0.5) * 0.2  // variance ±10% par serre
                  const amount = Math.round(perMonth * share * jitter)
                  if (amount <= 0) continue
                  costInserts.push({
                    campaign_id: insertedCampaign!.id,
                    greenhouse_id: g.id,
                    account_category_id: catId,
                    cost_category: ratio.code.toLowerCase(),
                    amount,
                    entry_date: m.date,
                    is_planned: true,
                    description: `Prévisionnel auto-généré — ${ratio.code} [${g.code}]`,
                  })
                }
              } else {
                const jitter = 1 + (Math.random() - 0.5) * 0.2
                costInserts.push({
                  campaign_id: insertedCampaign!.id,
                  greenhouse_id: null,
                  account_category_id: catId,
                  cost_category: ratio.code.toLowerCase(),
                  amount: Math.round(perMonth * jitter),
                  entry_date: m.date,
                  is_planned: true,
                  description: `Prévisionnel auto-généré — ${ratio.code}`,
                })
              }
            }
          }

          // Insertion par batches
          const BATCH = 100
          for (let i = 0; i < costInserts.length; i += BATCH) {
            const slice = costInserts.slice(i, i + BATCH)
            const { error } = await supabase.from('cost_entries').insert(slice)
            if (error) throw error
            insertedCosts += slice.length
          }
        } catch (e: any) {
          console.warn('[wizard] erreur génération cost_entries:', e)
          toast(`⚠ Coûts non générés : ${e.message}`)
        }
      }

      setProgress({ step: 'Terminé', done: totalSteps, total: totalSteps })

      const summaryMsg = [
        `${farms.length} ferme(s)`,
        `${summary.totalGh} serre(s)`,
        `${insertedPlantings!.length} plantation(s)`,
        insertedCosts > 0 ? `${insertedCosts} coût(s) prévisionnel(s)` : null,
      ].filter(Boolean).join(' · ')
      toast.success(`✅ Démo créée : ${summaryMsg}`, { duration: 6000 })
      onComplete?.(insertedCampaign!.id)
      onClose()
    } catch (e: any) {
      console.error('[demo-setup]', e)
      toast.error('Erreur : ' + (e?.message ?? 'inconnue'))
    }
    setGenerating(false)
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <Modal
      title={`🧙 Setup démo complète — Étape ${step}/4`}
      onClose={generating ? () => {} : onClose}
      size="lg"
    >
      {/* Stepper visuel */}
      <div className="flex items-center gap-2 mb-md">
        {[
          { n: 1, label: 'Fermes', icon: Building2 },
          { n: 2, label: 'Serres', icon: Sprout },
          { n: 3, label: 'Variétés & Campagne', icon: Dna },
          { n: 4, label: 'Récap & Générer', icon: Sparkles },
        ].map((s, i) => {
          const Icon = s.icon
          const active = step === s.n
          const done = step > s.n
          return (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center gap-2 px-md py-1.5 rounded-full text-caption font-semibold transition-colors flex-1 ${
                  done ? 'bg-success/15 text-success' :
                  active ? 'bg-brand/15 text-brand' :
                  'bg-surface-sunk text-fg-tertiary'
                }`}
              >
                {done ? <Check size={12} /> : <Icon size={12} />}
                <span className="truncate">{s.label}</span>
              </div>
              {i < 3 && <div className={`h-0.5 w-3 ${done ? 'bg-success' : 'bg-border'}`} />}
            </div>
          )
        })}
      </div>

      {/* Progression (prominent, en haut — visible pendant toute la génération) */}
      {generating && (
        <div className="rounded-lg bg-brand/10 border border-brand/40 p-lg mb-md">
          <div className="flex items-center gap-sm mb-sm">
            <Loader2 size={22} className="animate-spin text-brand flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-body font-bold text-fg-primary">Génération en cours…</div>
              <div className="text-body-sm text-fg-secondary truncate">{progress.step}</div>
            </div>
            <div className="font-display text-heading font-extrabold text-brand tabular-nums">
              {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-surface-sunk overflow-hidden">
            <div className="h-full bg-brand transition-all duration-300 rounded-full"
              style={{ width: `${progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 4}%` }} />
          </div>
          <div className="mt-sm text-caption text-fg-tertiary">Quelques secondes — ne ferme pas la fenêtre.</div>
        </div>
      )}

      {/* Step 1 : Fermes */}
      {step === 1 && (
        <div className="space-y-md">
          <div className="text-body-sm text-fg-secondary leading-relaxed">
            Combien de fermes veux-tu créer ? Pour chaque ferme, on définit ici son nom et son code.
          </div>

          <div className="space-y-2">
            {farms.map((f, i) => (
              <div key={i} className="rounded-md border border-border bg-surface-sunk p-md">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <Field label="Nom de la ferme" required>
                      <TInput value={f.name}
                        onChange={(e) => updateFarm(i, { name: e.target.value, code: slugCode(e.target.value, `F${i+1}`) })}
                        placeholder="Ferme Sud" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Code">
                      <TInput value={f.code}
                        onChange={(e) => updateFarm(i, { code: e.target.value.toUpperCase().slice(0, 8) })}
                        placeholder="FS" />
                    </Field>
                  </div>
                  <div className="col-span-3">
                    <Field label="Ville">
                      <TInput value={f.city}
                        onChange={(e) => updateFarm(i, { city: e.target.value })}
                        placeholder="Agadir" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Serres prévues">
                      <TInput type="number" min="1" max="50" value={String(f.greenhouseCount)}
                        onChange={(e) => updateFarm(i, { greenhouseCount: Math.max(1, Number(e.target.value)) })} />
                    </Field>
                  </div>
                  <div className="col-span-1 flex items-end justify-end h-full pt-5">
                    {farms.length > 1 && (
                      <button onClick={() => removeFarm(i)}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                        title="Supprimer cette ferme">
                        <Minus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={addFarm} variant="secondary" size="sm">
            <Plus size={13} /> Ajouter une ferme
          </Button>
        </div>
      )}

      {/* Step 2 : Serres */}
      {step === 2 && (
        <div className="space-y-md">
          <div className="text-body-sm text-fg-secondary leading-relaxed">
            Pour chaque ferme, configure le type et la surface moyenne de ses serres. Toutes les serres d'une même ferme auront ces caractéristiques (variant ±5%).
          </div>

          <div className="space-y-2">
            {farms.map((f, i) => (
              <div key={i} className="rounded-md border border-border bg-surface-sunk p-md">
                <div className="flex items-center gap-2 mb-sm">
                  <Building2 size={14} className="text-brand" />
                  <span className="font-display font-bold text-fg-primary">{f.name}</span>
                  <Badge variant="brand" size="xs">{f.greenhouseCount} serres</Badge>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Field label="Type de serre">
                      <TSelect value={f.ghType} onChange={(e) => updateFarm(i, { ghType: e.target.value as any })}>
                        <option value="multispan">Multispan</option>
                        <option value="chapelle">Chapelle</option>
                        <option value="tunnel">Tunnel</option>
                        <option value="venlo">Venlo (verre)</option>
                        <option value="solaire">Solaire</option>
                        <option value="autre">Autre</option>
                      </TSelect>
                    </Field>
                  </div>
                  <div className="col-span-4">
                    <Field label="Surface moyenne (m²)">
                      <TInput type="number" min="500" step="100" value={String(f.ghSurfaceM2)}
                        onChange={(e) => updateFarm(i, { ghSurfaceM2: Math.max(500, Number(e.target.value)) })} />
                    </Field>
                  </div>
                  <div className="col-span-3">
                    <div className="text-caption text-fg-tertiary pt-5">
                      Total : <strong className="text-fg-primary">{(f.greenhouseCount * f.ghSurfaceM2).toLocaleString('fr-FR')} m²</strong>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-info/5 border border-info/30 p-sm text-caption text-fg-secondary">
            <strong>Total domaine :</strong> {summary.totalGh} serres · {summary.totalSurface.toLocaleString('fr-FR')} m² · {(summary.totalSurface / 10000).toFixed(2)} ha
          </div>
        </div>
      )}

      {/* Step 3 : Variétés + Campagne */}
      {step === 3 && (
        <div className="space-y-md">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold mb-sm">
              🧬 Variétés à utiliser ({varieties.length} sélectionnées)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_VARIETIES.map(v => {
                const selected = varieties.some(x => x.code === v.code)
                return (
                  <button key={v.code}
                    onClick={() => toggleVariety(v)}
                    className={`text-left p-sm rounded-md border-2 transition-all ${
                      selected ? 'border-brand bg-brand/5' : 'border-border bg-surface-sunk hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-fg-primary text-body-sm">{v.name}</span>
                      {selected && <Check size={14} className="text-brand" />}
                    </div>
                    <div className="text-[10px] text-fg-tertiary font-mono">
                      {v.type} · {v.yieldPerM2} kg/m² · {v.pricePerKg} MAD/kg
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-border pt-md">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold mb-sm">
              📅 Configuration de la campagne
            </div>
            <div className="grid grid-cols-2 gap-md">
              <Field label="Code">
                <TInput value={campaign.code} onChange={(e) => setCampaign(c => ({ ...c, code: e.target.value }))} />
              </Field>
              <Field label="Nom">
                <TInput value={campaign.name} onChange={(e) => setCampaign(c => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Préparation">
                <TInput type="date" value={campaign.preparation_start} onChange={(e) => setCampaign(c => ({ ...c, preparation_start: e.target.value }))} />
              </Field>
              <Field label="Plantation">
                <TInput type="date" value={campaign.planting_start} onChange={(e) => setCampaign(c => ({ ...c, planting_start: e.target.value }))} />
              </Field>
              <Field label="Début récolte">
                <TInput type="date" value={campaign.harvest_start} onChange={(e) => setCampaign(c => ({ ...c, harvest_start: e.target.value }))} />
              </Field>
              <Field label="Fin récolte">
                <TInput type="date" value={campaign.harvest_end} onChange={(e) => setCampaign(c => ({ ...c, harvest_end: e.target.value }))} />
              </Field>
              <Field label="Fin campagne">
                <TInput type="date" value={campaign.campaign_end} onChange={(e) => setCampaign(c => ({ ...c, campaign_end: e.target.value }))} />
              </Field>
              <Field label="Budget total (MAD, optionnel)">
                <TInput type="number" value={String(campaign.budget_total || '')}
                  onChange={(e) => setCampaign(c => ({ ...c, budget_total: Number(e.target.value) || 0 }))}
                  placeholder={`Auto : ${Math.round(summary.totalSurface * 50).toLocaleString('fr-FR')}`} />
              </Field>
            </div>

            {/* Toggle génération coûts prévisionnels */}
            <div className="mt-md rounded-md border border-border bg-surface-sunk p-md">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={campaign.generatePlannedCosts}
                  onChange={(e) => setCampaign(c => ({ ...c, generatePlannedCosts: e.target.checked }))}
                  className="w-4 h-4 accent-brand mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-display font-bold text-body-sm text-fg-primary">
                    💰 Générer aussi les coûts prévisionnels (recommandé)
                  </div>
                  <div className="text-caption text-fg-tertiary leading-relaxed mt-1">
                    Crée automatiquement des <code>cost_entries</code> mensuels en distribuant le budget total sur les catégories réalistes (intrants, énergie, main d'œuvre, entretien…). Indispensable pour que <strong>"Générer budget"</strong> produise des charges en plus du CA.
                  </div>
                </div>
              </label>

              {campaign.generatePlannedCosts && (
                <label className="flex items-start gap-2 cursor-pointer mt-sm pt-sm border-t border-border">
                  <input
                    type="checkbox"
                    checked={campaign.distributeChargesPerGreenhouse}
                    onChange={(e) => setCampaign(c => ({ ...c, distributeChargesPerGreenhouse: e.target.checked }))}
                    className="w-4 h-4 accent-brand mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-display font-bold text-body-sm text-fg-primary">
                      🏠 Ventiler les charges par serre (recommandé)
                    </div>
                    <div className="text-caption text-fg-tertiary leading-relaxed mt-1">
                      Répartit les coûts sur <strong>chaque serre</strong> (prorata surface + variance par serre) au lieu de les laisser au niveau campagne. Nécessaire pour tester le <strong>coût de revient</strong> et la <strong>productivité par serre</strong>.
                    </div>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4 : Récap */}
      {step === 4 && (
        <div className="space-y-md">
          <div className="text-body-sm text-fg-secondary">
            Vérifie l'aperçu, puis clique <strong className="text-brand">GÉNÉRER</strong> pour créer tout en cascade :
          </div>

          {/* Récap chiffres */}
          <div className="grid grid-cols-3 gap-md">
            <div className="rounded-md bg-success/5 border border-success/30 p-sm">
              <div className="text-caption text-fg-tertiary">Fermes</div>
              <div className="font-display text-heading font-bold text-success">{farms.length}</div>
            </div>
            <div className="rounded-md bg-brand/5 border border-brand/30 p-sm">
              <div className="text-caption text-fg-tertiary">Serres totales</div>
              <div className="font-display text-heading font-bold text-brand">{summary.totalGh}</div>
            </div>
            <div className="rounded-md bg-info/5 border border-info/30 p-sm">
              <div className="text-caption text-fg-tertiary">Surface (ha)</div>
              <div className="font-display text-heading font-bold text-info">{(summary.totalSurface / 10000).toFixed(2)}</div>
            </div>
            <div className="rounded-md bg-warning/5 border border-warning/30 p-sm">
              <div className="text-caption text-fg-tertiary">Variétés</div>
              <div className="font-display text-heading font-bold text-warning">{varieties.length}</div>
            </div>
            <div className="rounded-md bg-success/5 border border-success/30 p-sm">
              <div className="text-caption text-fg-tertiary">Prod. cible</div>
              <div className="font-display text-heading font-bold text-success">
                {(summary.expectedProd / 1000).toFixed(0)} t
              </div>
            </div>
            <div className="rounded-md bg-brand/5 border border-brand/30 p-sm">
              <div className="text-caption text-fg-tertiary">CA estimé</div>
              <div className="font-display text-heading font-bold text-brand">
                {(summary.expectedCA / 1000000).toFixed(2)} M MAD
              </div>
            </div>
          </div>

          {/* Détail par ferme */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold mb-sm">Détail</div>
            <div className="space-y-1">
              {farms.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-caption px-sm py-1 rounded bg-surface-sunk">
                  <span className="font-mono text-fg-primary">{f.code}</span>
                  <span className="text-fg-secondary">{f.name} · {f.city}</span>
                  <span className="text-fg-tertiary">{f.greenhouseCount} × {f.ghSurfaceM2.toLocaleString('fr-FR')} m² = {(f.greenhouseCount * f.ghSurfaceM2).toLocaleString('fr-FR')} m²</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-sm">
              {varieties.map(v => (
                <span key={v.code} className="px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-caption text-brand">
                  {v.name} ({v.yieldPerM2}kg/m²)
                </span>
              ))}
            </div>
          </div>

          {/* Avertissement */}
          <div className="rounded-md bg-warning/5 border border-warning/30 p-sm">
            <div className="flex items-start gap-sm text-caption text-fg-secondary">
              <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
              <div>
                <strong>Note :</strong> ne génère <strong>pas</strong> les récoltes. Une fois ce wizard terminé, utilise <strong>"Générer jeu de récoltes"</strong> sur la même page pour remplir avec des récoltes réalistes.
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center mt-md pt-md border-t border-border">
        <Button
          onClick={() => setStep(s => Math.max(1, s - 1) as any)}
          variant="secondary"
          disabled={step === 1 || generating}
        >
          <ChevronLeft size={13} /> Retour
        </Button>

        <div className="flex gap-sm">
          <Button onClick={onClose} variant="ghost" disabled={generating}>Annuler</Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(s => Math.min(4, s + 1) as any)}
              variant="primary"
              disabled={!canNext()}
            >
              Suivant <ChevronRight size={13} />
            </Button>
          ) : (
            <Button onClick={generateAll} variant="primary" loading={generating} disabled={generating}>
              <Sparkles size={13} /> {generating ? 'Génération…' : 'GÉNÉRER LA DÉMO'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
