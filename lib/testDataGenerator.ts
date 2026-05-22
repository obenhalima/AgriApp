/**
 * testDataGenerator — Génération intelligente de jeux de récoltes pour démo.
 *
 * Algorithme :
 *   1. Pour chaque plantation active, on prend target_total_production
 *      (ou target_yield_per_m2 × planted_area si manquant).
 *   2. On distribue cette production sur la période [harvest_start, harvest_end]
 *      avec une courbe en cloche (Gaussienne) qui simule la phénologie réelle
 *      d'une tomate indéterminée : montée progressive, plateau, déclin.
 *   3. Pour chaque mois, on génère 8-12 récoltes (2-3 par semaine).
 *   4. Chaque récolte se voit attribuer une part de la production mensuelle,
 *      avec une variance configurable.
 *   5. Chaque récolte est splittée en 4 catégories (Cat 1/2/3/Déchets)
 *      avec un mix réaliste piloté par un preset qualité.
 *
 * Le résultat est inséré en batch dans la table `harvests`.
 */

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════
export type PlantingInput = {
  id: string
  greenhouse_code?: string | null
  variety_code?: string | null
  variety_name?: string | null
  planted_area: number
  target_yield_per_m2: number | null
  target_total_production: number | null
  harvest_start_date: string | null   // ISO 'YYYY-MM-DD'
  harvest_end_date: string | null
  planting_date?: string | null
}

export type VarianceLevel = 'low' | 'medium' | 'high'
export type QualityPreset = 'excellent' | 'good' | 'average' | 'poor'
export type HarvestFrequency = 'weekly' | 'biweekly' | 'triweekly' // 1, 2 ou 3 par semaine

export type GeneratorOptions = {
  variance: VarianceLevel
  quality: QualityPreset
  frequency: HarvestFrequency
  /** Si défini, ne génère que ces mois (format 'YYYY-MM'). Sinon, tout le calendrier. */
  monthsFilter?: string[]
  /** Si true, ne génère que pour les dates passées (jusqu'à aujourd'hui). */
  onlyPast?: boolean
  /** Méta-data pour la note */
  notePrefix?: string
}

export type GeneratedHarvest = {
  campaign_planting_id: string
  harvest_date: string             // 'YYYY-MM-DD'
  qty_category_1: number
  qty_category_2: number
  qty_category_3: number
  qty_waste: number
  avg_fruit_weight: number | null
  brix_measure: number | null
  lot_number: string
  notes: string
}

export type GenerationPreview = {
  totalPlantings: number
  totalHarvests: number
  totalKg: number
  byMonth: Array<{ month: string; harvests: number; kg: number }>
  byPlanting: Array<{ plantingId: string; label: string; harvests: number; kg: number }>
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

/** Gaussian aléatoire (Box-Muller). */
function gaussian(mean: number, sigma: number): number {
  const u1 = Math.max(1e-9, Math.random())
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * sigma
}

function toDate(s: string): Date { return new Date(s + 'T00:00:00') }
function fromDate(d: Date): string { return d.toISOString().slice(0, 10) }
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function round2(n: number): number { return Math.round(n * 100) / 100 }

// ════════════════════════════════════════════════════════════════════════════
// VARIANCE & QUALITY CONFIG
// ════════════════════════════════════════════════════════════════════════════

const VARIANCE_AMPLITUDE: Record<VarianceLevel, number> = {
  low: 0.08,     // ±8%
  medium: 0.18,  // ±18%
  high: 0.30,    // ±30%
}

const QUALITY_PRESETS: Record<QualityPreset, { cat1: number; cat2: number; cat3: number; waste: number; varCat: number }> = {
  excellent: { cat1: 0.72, cat2: 0.20, cat3: 0.05, waste: 0.03, varCat: 0.04 },
  good:      { cat1: 0.60, cat2: 0.25, cat3: 0.10, waste: 0.05, varCat: 0.06 },
  average:   { cat1: 0.48, cat2: 0.30, cat3: 0.15, waste: 0.07, varCat: 0.08 },
  poor:      { cat1: 0.35, cat2: 0.30, cat3: 0.22, waste: 0.13, varCat: 0.10 },
}

const HARVESTS_PER_WEEK: Record<HarvestFrequency, number> = {
  weekly: 1,
  biweekly: 2,
  triweekly: 3,
}

// ════════════════════════════════════════════════════════════════════════════
// COURBE EN CLOCHE — phénologie tomate indéterminée
// ════════════════════════════════════════════════════════════════════════════

/**
 * Poids relatif de production sur une journée donnée du cycle.
 * Modèle : Gaussienne centrée au milieu de la période, sigma = 1/4 de la durée.
 * Cela donne ~95% de la production dans [start, end] et un beau plateau central.
 */
function harvestWeight(dayOffset: number, totalDays: number): number {
  const peak = totalDays / 2
  const sigma = Math.max(totalDays / 4, 7)
  return Math.exp(-Math.pow((dayOffset - peak) / sigma, 2))
}

// ════════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export function generateHarvestsForPlanting(
  planting: PlantingInput,
  options: GeneratorOptions
): GeneratedHarvest[] {
  if (!planting.harvest_start_date || !planting.harvest_end_date) return []
  const start = toDate(planting.harvest_start_date)
  const end = toDate(planting.harvest_end_date)
  if (end <= start) return []

  // 1. Total production cible
  const targetProd = planting.target_total_production
    ?? (planting.target_yield_per_m2 ?? 0) * planting.planted_area
  if (targetProd <= 0) return []

  // 2. Cadence (1, 2 ou 3 récoltes par semaine)
  const perWeek = HARVESTS_PER_WEEK[options.frequency]
  const totalDays = daysBetween(start, end)
  const harvestCount = Math.max(4, Math.floor((totalDays / 7) * perWeek))

  // 3. Dates des récoltes : réparties uniformément avec un petit jitter
  const dates: Date[] = []
  for (let i = 0; i < harvestCount; i++) {
    const dayOffset = (i / (harvestCount - 1)) * totalDays + (Math.random() - 0.5) * 1.5
    dates.push(addDays(start, Math.max(0, Math.min(totalDays, dayOffset))))
  }

  // 4. Filtrer par mois ou par "passé seulement"
  const today = new Date()
  let filteredDates = dates.filter(d => {
    if (options.onlyPast && d > today) return false
    if (options.monthsFilter && !options.monthsFilter.includes(monthKey(d))) return false
    return true
  })

  // 5. Poids gaussien par récolte
  const weights = filteredDates.map(d => harvestWeight(daysBetween(start, d), totalDays))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight === 0) return []

  // 6. Total à distribuer = part de la prod cible correspondant aux récoltes filtrées
  const allWeights = dates.map(d => harvestWeight(daysBetween(start, d), totalDays))
  const totalAllWeights = allWeights.reduce((s, w) => s + w, 0)
  const totalToDistribute = targetProd * (totalWeight / totalAllWeights)

  // 7. Génération avec variance + split qualité
  const varianceAmp = VARIANCE_AMPLITUDE[options.variance]
  const qPreset = QUALITY_PRESETS[options.quality]
  const noteBase = options.notePrefix ?? '🎲 Donnée de test générée automatiquement'

  return filteredDates.map((date, i) => {
    const baseQty = (weights[i] / totalWeight) * totalToDistribute
    // Variance autour de la base
    const jitter = 1 + (Math.random() - 0.5) * 2 * varianceAmp
    const qty = Math.max(0, baseQty * jitter)

    // Split qualité avec variance
    let cat1 = Math.max(0.05, gaussian(qPreset.cat1, qPreset.varCat))
    let cat2 = Math.max(0.05, gaussian(qPreset.cat2, qPreset.varCat))
    let cat3 = Math.max(0.02, gaussian(qPreset.cat3, qPreset.varCat / 2))
    let waste = Math.max(0.01, gaussian(qPreset.waste, qPreset.varCat / 2))
    const sum = cat1 + cat2 + cat3 + waste
    cat1 /= sum; cat2 /= sum; cat3 /= sum; waste /= sum

    const dateStr = fromDate(date)
    const lotSuffix = String(date.getTime()).slice(-5) + String(i).padStart(2, '0')
    const lotNumber = `LOT-${dateStr.replace(/-/g, '')}-${lotSuffix}`

    return {
      campaign_planting_id: planting.id,
      harvest_date: dateStr,
      qty_category_1: round2(qty * cat1),
      qty_category_2: round2(qty * cat2),
      qty_category_3: round2(qty * cat3),
      qty_waste: round2(qty * waste),
      avg_fruit_weight: round2(gaussian(150, 12)),   // poids moyen en g (très typique tomate ronde)
      brix_measure: round2(gaussian(5.2, 0.4)),       // °Brix moyen
      lot_number: lotNumber,
      notes: `${noteBase}\nSerre : ${planting.greenhouse_code ?? '?'} · Variété : ${planting.variety_name ?? planting.variety_code ?? '?'}`,
    }
  })
}

/**
 * Génère un preview avant insertion : compte, total, par mois, par plantation.
 */
export function buildPreview(
  plantings: PlantingInput[],
  options: GeneratorOptions
): GenerationPreview {
  const all: Array<GeneratedHarvest & { plantingId: string; label: string }> = []
  const byPlanting = new Map<string, { plantingId: string; label: string; harvests: number; kg: number }>()

  for (const p of plantings) {
    const harvests = generateHarvestsForPlanting(p, options)
    const label = `${p.greenhouse_code ?? '?'} · ${p.variety_name ?? p.variety_code ?? '?'}`
    const totalKg = harvests.reduce((s, h) => s + h.qty_category_1 + h.qty_category_2 + h.qty_category_3 + h.qty_waste, 0)
    byPlanting.set(p.id, { plantingId: p.id, label, harvests: harvests.length, kg: totalKg })
    harvests.forEach(h => all.push({ ...h, plantingId: p.id, label }))
  }

  const byMonth = new Map<string, { harvests: number; kg: number }>()
  for (const h of all) {
    const m = h.harvest_date.slice(0, 7)
    const cur = byMonth.get(m) ?? { harvests: 0, kg: 0 }
    cur.harvests++
    cur.kg += h.qty_category_1 + h.qty_category_2 + h.qty_category_3 + h.qty_waste
    byMonth.set(m, cur)
  }

  return {
    totalPlantings: plantings.length,
    totalHarvests: all.length,
    totalKg: all.reduce((s, h) => s + h.qty_category_1 + h.qty_category_2 + h.qty_category_3 + h.qty_waste, 0),
    byMonth: Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byPlanting: Array.from(byPlanting.values()).sort((a, b) => b.kg - a.kg),
  }
}

/** Génère TOUS les harvests pour la liste de plantings + options. */
export function generateAll(
  plantings: PlantingInput[],
  options: GeneratorOptions
): GeneratedHarvest[] {
  const out: GeneratedHarvest[] = []
  for (const p of plantings) {
    out.push(...generateHarvestsForPlanting(p, options))
  }
  return out
}

/** Liste les mois disponibles pour les filtres UI (basé sur la période globale). */
export function listAvailableMonths(plantings: PlantingInput[]): string[] {
  const months = new Set<string>()
  for (const p of plantings) {
    if (!p.harvest_start_date || !p.harvest_end_date) continue
    const start = toDate(p.harvest_start_date)
    const end = toDate(p.harvest_end_date)
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      months.add(monthKey(cur))
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  return Array.from(months).sort()
}
