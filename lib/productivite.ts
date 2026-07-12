// ============================================================
// Moteur "Productivité au mètre linéaire" — par culture (variété) sur une
// campagne. Réutilise l'allocation des coûts en cascade de coutRevient.
//
//  • kg / mètre linéaire      = production récoltée ÷ mètres linéaires
//  • coût total / mètre       = coûts imputés ÷ mètres linéaires
//  • coût MO / mètre          = coûts main-d'œuvre (MOD+MO_ADMIN+CHARGES_SOC) ÷ ml
//  • kg / plant               = production ÷ nombre de plants
//  • rendement kg/m²          = production ÷ surface plantée
//
// ⚠️ Le coût MO/serre issu de la paie est une allocation surfacique (pas un
// temps réel par serre). Le coût MO/ml est donc un ratio d'imputation, utile
// pour comparer les cultures, pas une mesure du temps réellement passé
// (ça viendra avec la saisie du temps — Phase 2).
// ============================================================

import { allocateCostsToPlantings, type PlantingInput, type CostInput, type HarvestAgg } from './coutRevient'

export type ProdPlanting = PlantingInput & {
  plant_count: number | null
  linear_meters: number | null
}
export type ProdVariety = { id: string; commercial_name: string }

export type ProdVarieteRow = {
  variety_id: string
  variety_name: string
  surface: number
  linearMeters: number
  plantCount: number
  productionKg: number
  coutTotal: number
  coutMO: number
  kgParMl: number | null
  coutParMl: number | null
  coutMOParMl: number | null
  kgParPlant: number | null
  rendementKgParM2: number | null
}

export type ProductiviteTotals = Omit<ProdVarieteRow, 'variety_id' | 'variety_name'>

export type ProductiviteResult = {
  parVariete: ProdVarieteRow[]
  totals: ProductiviteTotals
  hasLinearMeters: boolean   // au moins une plantation a un métrage renseigné
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null)

export function computeProductivite(input: {
  plantings: ProdPlanting[]
  varieties: ProdVariety[]
  harvestsByPlanting: Map<string, HarvestAgg>
  costs: CostInput[]     // tous les coûts réels de la campagne
  moCosts: CostInput[]   // sous-ensemble MO (MOD / MO_ADMIN / CHARGES_SOC)
}): ProductiviteResult {
  const { plantings, varieties, harvestsByPlanting, costs, moCosts } = input
  const varName = new Map(varieties.map(v => [v.id, v.commercial_name]))

  const totalByPlanting = allocateCostsToPlantings(plantings, costs)
  const moByPlanting = allocateCostsToPlantings(plantings, moCosts)

  const byVar = new Map<string, ProdVarieteRow>()
  for (const p of plantings) {
    let row = byVar.get(p.variety_id)
    if (!row) {
      row = {
        variety_id: p.variety_id, variety_name: varName.get(p.variety_id) ?? '—',
        surface: 0, linearMeters: 0, plantCount: 0, productionKg: 0, coutTotal: 0, coutMO: 0,
        kgParMl: null, coutParMl: null, coutMOParMl: null, kgParPlant: null, rendementKgParM2: null,
      }
      byVar.set(p.variety_id, row)
    }
    row.surface += Number(p.planted_area) || 0
    row.linearMeters += Number(p.linear_meters) || 0
    row.plantCount += Number(p.plant_count) || 0
    row.productionKg += Number(harvestsByPlanting.get(p.id)?.total_qty) || 0
    row.coutTotal += totalByPlanting.get(p.id) ?? 0
    row.coutMO += moByPlanting.get(p.id) ?? 0
  }

  const finalize = (r: { surface: number; linearMeters: number; plantCount: number; productionKg: number; coutTotal: number; coutMO: number }) => ({
    kgParMl: ratio(r.productionKg, r.linearMeters),
    coutParMl: ratio(r.coutTotal, r.linearMeters),
    coutMOParMl: ratio(r.coutMO, r.linearMeters),
    kgParPlant: ratio(r.productionKg, r.plantCount),
    rendementKgParM2: ratio(r.productionKg, r.surface),
  })

  for (const row of byVar.values()) Object.assign(row, finalize(row))

  const parVariete = Array.from(byVar.values())
    .sort((a, b) => (b.kgParMl ?? -1) - (a.kgParMl ?? -1))

  const totalsBase = parVariete.reduce((t, r) => {
    t.surface += r.surface; t.linearMeters += r.linearMeters; t.plantCount += r.plantCount
    t.productionKg += r.productionKg; t.coutTotal += r.coutTotal; t.coutMO += r.coutMO
    return t
  }, { surface: 0, linearMeters: 0, plantCount: 0, productionKg: 0, coutTotal: 0, coutMO: 0 })

  const totals: ProductiviteTotals = { ...totalsBase, ...finalize(totalsBase) }

  return { parVariete, totals, hasLinearMeters: parVariete.some(r => r.linearMeters > 0) }
}
