/**
 * Couche de données pour le module Plan de culture.
 * Charge dynamiquement depuis Supabase :
 *   - les plantations budgétisées de la campagne (campaign_plantings + variety + greenhouse + farm)
 *   - dérive les volumes/CA mensualisés en répartissant linéairement sur la fenêtre de récolte
 *
 * Tout est calculé côté client à partir des données live, donc tout est réactif aux filtres.
 */
import { supabase } from './supabase'

// ─── Types domaine ───────────────────────────────────────────────────────────
export type PlantingRow = {
  planting_id: string
  campaign_id: string
  // Ferme
  farm_id: string
  farm_code: string
  farm_name: string
  // Serre
  greenhouse_id: string
  greenhouse_code: string
  greenhouse_name: string
  greenhouse_type: string
  greenhouse_area: number          // m² total de la serre
  // Variété
  variety_id: string
  variety_code: string
  variety_name: string
  variety_type: string             // ronde / grappe / cerise…
  // Plantation
  planted_area: number             // m²
  plant_count: number | null
  density: number | null           // plants/m²
  planting_date: string | null
  first_harvest_date: string | null
  last_harvest_date: string | null
  harvest_start_date: string | null  // priorité sur first_harvest_date
  harvest_end_date: string | null
  status: string
  // Cibles
  target_yield_per_m2: number | null   // kg/m²
  target_total_production: number      // kg total
  // Prix & CA
  export_share_pct: number             // 0..100
  effective_price_export: number       // MAD/kg
  effective_price_local: number        // MAD/kg
  ca_export_total: number              // MAD
  ca_local_total: number               // MAD
  ca_total: number                     // export + local
  // Coûts (planifiés)
  estimated_cost: number | null
}

export type CampaignWindow = {
  preparation_start: string | null
  planting_start: string | null
  harvest_start: string | null
  harvest_end: string | null
  campaign_end: string | null
}

// ─── Loader principal ────────────────────────────────────────────────────────
/**
 * Charge toutes les plantations d'une campagne (filtrable par ferme).
 * Utilise la vue v_planting_forecasts pour les CA déjà calculés.
 */
export async function loadPlantingPlan(opts: {
  campaignId: string
  farmId?: string | null
}): Promise<PlantingRow[]> {
  if (!opts.campaignId) return []

  // 1. Vue avec CA pré-calculés
  let q = supabase
    .from('v_planting_forecasts')
    .select(`
      planting_id, campaign_id,
      greenhouse_id, greenhouse_code, greenhouse_name, farm_id,
      variety_id, variety_name,
      planted_area, target_yield_per_m2, total_volume_kg,
      planting_date, harvest_start_date, harvest_end_date,
      export_share_pct, effective_price_export, effective_price_local,
      ca_export_total, ca_local_total
    `)
    .eq('campaign_id', opts.campaignId)
  if (opts.farmId) q = q.eq('farm_id', opts.farmId)
  const { data: forecastsData, error: forecastErr } = await q
  if (forecastErr) throw forecastErr
  const forecasts = (forecastsData ?? []) as any[]
  if (forecasts.length === 0) return []

  const plantingIds = forecasts.map(f => f.planting_id)
  const greenhouseIds = [...new Set(forecasts.map(f => f.greenhouse_id))]
  const farmIds       = [...new Set(forecasts.map(f => f.farm_id))]
  const varietyIds    = [...new Set(forecasts.map(f => f.variety_id))]

  // 2. Compléments : campaign_plantings (plant_count, density, dates, statut, estimated_cost)
  const [
    { data: cps },
    { data: ghs },
    { data: farms },
    { data: vars_ },
  ] = await Promise.all([
    supabase.from('campaign_plantings')
      .select('id, plant_count, actual_density, first_harvest_date, last_harvest_date, status, estimated_cost')
      .in('id', plantingIds),
    supabase.from('greenhouses')
      .select('id, code, name, type, total_area, farm_id')
      .in('id', greenhouseIds),
    supabase.from('farms')
      .select('id, code, name')
      .in('id', farmIds),
    supabase.from('varieties')
      .select('id, code, type')
      .in('id', varietyIds),
  ])

  const cpById   = new Map((cps ?? []).map((x: any) => [x.id, x]))
  const ghById   = new Map((ghs ?? []).map((x: any) => [x.id, x]))
  const farmById = new Map((farms ?? []).map((x: any) => [x.id, x]))
  const varById  = new Map((vars_ ?? []).map((x: any) => [x.id, x]))

  // 3. Assemblage final
  return forecasts.map(f => {
    const cp   = cpById.get(f.planting_id) ?? {}
    const gh   = ghById.get(f.greenhouse_id) ?? {}
    const farm = farmById.get(f.farm_id) ?? {}
    const v    = varById.get(f.variety_id) ?? {}
    return {
      planting_id: f.planting_id,
      campaign_id: f.campaign_id,
      farm_id: f.farm_id,
      farm_code: farm.code ?? '',
      farm_name: farm.name ?? '',
      greenhouse_id: f.greenhouse_id,
      greenhouse_code: f.greenhouse_code ?? gh.code ?? '',
      greenhouse_name: f.greenhouse_name ?? gh.name ?? '',
      greenhouse_type: gh.type ?? 'autre',
      greenhouse_area: Number(gh.total_area ?? 0),
      variety_id: f.variety_id,
      variety_code: v.code ?? '',
      variety_name: f.variety_name ?? '',
      variety_type: v.type ?? 'autre',
      planted_area: Number(f.planted_area ?? 0),
      plant_count:  cp.plant_count ?? null,
      density:      cp.actual_density ?? null,
      planting_date: f.planting_date ?? null,
      first_harvest_date: cp.first_harvest_date ?? null,
      last_harvest_date:  cp.last_harvest_date ?? null,
      harvest_start_date: f.harvest_start_date ?? cp.first_harvest_date ?? null,
      harvest_end_date:   f.harvest_end_date   ?? cp.last_harvest_date  ?? null,
      status: cp.status ?? 'planifie',
      target_yield_per_m2: f.target_yield_per_m2 ?? null,
      target_total_production: Number(f.total_volume_kg ?? 0),
      export_share_pct: Number(f.export_share_pct ?? 100),
      effective_price_export: Number(f.effective_price_export ?? 0),
      effective_price_local:  Number(f.effective_price_local ?? 0),
      ca_export_total: Number(f.ca_export_total ?? 0),
      ca_local_total:  Number(f.ca_local_total ?? 0),
      ca_total: Number(f.ca_export_total ?? 0) + Number(f.ca_local_total ?? 0),
      estimated_cost: cp.estimated_cost ?? null,
    } as PlantingRow
  })
}

// ─── Distribution mensuelle linéaire (volume / CA) ───────────────────────────
/**
 * Réplique la logique de répartition mensuelle :
 *   volume mensuel = volume_total / nb_mois_actifs  (intersection [harvest_start, harvest_end])
 * Retourne une map mensuelle par planting (ou agrégée).
 */
export type MonthlyMap = Record<string, number>  // "YYYY-MM" → kg ou MAD

export function monthsBetween(start: Date, end: Date): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    out.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

export const monthKey = (y: number, m: number) => `${y}-${m}`

/**
 * Distribue un total (kg ou MAD) uniformément sur les mois entre start et end.
 * Si dates manquantes ou invalides → tout va sur le 1er mois disponible (ou map vide).
 */
export function distributeMonthly(total: number, start: string | null, end: string | null): MonthlyMap {
  if (!start || !end || total === 0) return {}
  const sd = new Date(start), ed = new Date(end)
  if (isNaN(+sd) || isNaN(+ed) || ed < sd) return {}
  const months = monthsBetween(sd, ed)
  if (months.length === 0) return {}
  const per = total / months.length
  const out: MonthlyMap = {}
  months.forEach(m => { out[monthKey(m.year, m.month)] = per })
  return out
}

/** Cumule plusieurs MonthlyMap dans une seule. */
export function mergeMonthlyMaps(maps: MonthlyMap[]): MonthlyMap {
  const out: MonthlyMap = {}
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = (out[k] ?? 0) + v
    }
  }
  return out
}

// ─── Agrégations dashboard ───────────────────────────────────────────────────
export type DashboardKPIs = {
  // Volumétrie
  totalPlantedArea: number          // m²
  totalGreenhouses: number          // serres planifiées
  totalGreenhousesUnused: number    // serres SANS plantation (alerte)
  totalFarms: number                // fermes concernées
  totalVarieties: number            // variétés distinctes
  totalPlantings: number            // lignes campaign_plantings
  // Production
  totalVolumeKg: number             // kg target
  avgYieldKgM2: number              // kg/m² moyen pondéré
  // CA
  totalRevenue: number              // MAD CA total cible
  exportRevenue: number
  localRevenue: number
  exportShareWeightedPct: number    // % export pondéré par CA
  // Coûts
  totalEstimatedCost: number        // MAD coûts planifiés (si renseignés)
  // Marges
  estimatedMargin: number           // CA - coûts
  estimatedMarginPct: number
  // Density / weight
  totalPlants: number
  avgDensity: number                // plants/m² moyen
  avgPricePerKg: number             // MAD/kg moyen pondéré
}

export function computeKPIs(rows: PlantingRow[], allGreenhouses: { id: string; total_area: number }[] = []): DashboardKPIs {
  const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)

  const totalPlantedArea = sum(rows.map(r => r.planted_area))
  const totalVolumeKg    = sum(rows.map(r => r.target_total_production))
  const exportRevenue    = sum(rows.map(r => r.ca_export_total))
  const localRevenue     = sum(rows.map(r => r.ca_local_total))
  const totalRevenue     = exportRevenue + localRevenue
  const totalCost        = sum(rows.map(r => r.estimated_cost ?? 0))
  const totalPlants      = sum(rows.map(r => r.plant_count ?? 0))

  const usedGhs = new Set(rows.map(r => r.greenhouse_id))
  const allFarms = new Set(rows.map(r => r.farm_id))
  const allVars  = new Set(rows.map(r => r.variety_id))

  const avgYield   = totalPlantedArea > 0 ? totalVolumeKg / totalPlantedArea : 0
  const avgPrice   = totalVolumeKg > 0 ? totalRevenue / totalVolumeKg : 0
  const avgDensity = totalPlantedArea > 0 && totalPlants > 0 ? totalPlants / totalPlantedArea : 0
  const exportShare = totalRevenue > 0 ? (exportRevenue / totalRevenue) * 100 : 0
  const margin = totalRevenue - totalCost
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0

  return {
    totalPlantedArea,
    totalGreenhouses: usedGhs.size,
    totalGreenhousesUnused: Math.max(0, allGreenhouses.length - usedGhs.size),
    totalFarms: allFarms.size,
    totalVarieties: allVars.size,
    totalPlantings: rows.length,
    totalVolumeKg,
    avgYieldKgM2: avgYield,
    totalRevenue,
    exportRevenue,
    localRevenue,
    exportShareWeightedPct: exportShare,
    totalEstimatedCost: totalCost,
    estimatedMargin: margin,
    estimatedMarginPct: marginPct,
    totalPlants,
    avgDensity,
    avgPricePerKg: avgPrice,
  }
}

// ─── Pivot multi-axes pour onglet Volumes ────────────────────────────────────
export type PivotAxis = 'farm' | 'greenhouse' | 'variety' | 'tomato_type'
export type PivotMetric = 'volume_kg' | 'volume_t' | 'ca_mad' | 'ca_kmad'
export type PivotChannel = 'all' | 'export' | 'local'

export type PivotRow = {
  axisKey: string         // id (farm_id ou greenhouse_id…)
  axisLabel: string       // label affiché
  byMonth: MonthlyMap     // mois → valeur (kg ou MAD selon metric)
  total: number
}

export function buildPivot(rows: PlantingRow[], opts: {
  axis: PivotAxis
  metric: PivotMetric
  channel: PivotChannel
}): PivotRow[] {
  const axisKey = (r: PlantingRow): { key: string; label: string } => {
    switch (opts.axis) {
      case 'farm':        return { key: r.farm_id, label: r.farm_name || r.farm_code }
      case 'greenhouse':  return { key: r.greenhouse_id, label: `${r.greenhouse_code} · ${r.greenhouse_name}` }
      case 'variety':     return { key: r.variety_id, label: r.variety_name || r.variety_code }
      case 'tomato_type': return { key: r.variety_type, label: r.variety_type }
    }
  }

  // Valeur "totale" par planting selon metric × channel
  const totalForRow = (r: PlantingRow): number => {
    if (opts.metric === 'volume_kg' || opts.metric === 'volume_t') {
      const exp = r.target_total_production * (r.export_share_pct / 100)
      const loc = r.target_total_production - exp
      const v = opts.channel === 'export' ? exp : opts.channel === 'local' ? loc : (exp + loc)
      return opts.metric === 'volume_t' ? v / 1000 : v
    } else {
      const v = opts.channel === 'export' ? r.ca_export_total
              : opts.channel === 'local'  ? r.ca_local_total
              : r.ca_total
      return opts.metric === 'ca_kmad' ? v / 1000 : v
    }
  }

  // Regrouper par axe puis distribuer mensuellement
  const grouped = new Map<string, { label: string; rows: PlantingRow[] }>()
  rows.forEach(r => {
    const { key, label } = axisKey(r)
    if (!grouped.has(key)) grouped.set(key, { label, rows: [] })
    grouped.get(key)!.rows.push(r)
  })

  const out: PivotRow[] = []
  grouped.forEach((grp, key) => {
    const monthlyMaps: MonthlyMap[] = []
    let total = 0
    grp.rows.forEach(r => {
      const t = totalForRow(r)
      total += t
      monthlyMaps.push(distributeMonthly(t, r.harvest_start_date, r.harvest_end_date))
    })
    out.push({
      axisKey: key,
      axisLabel: grp.label,
      byMonth: mergeMonthlyMaps(monthlyMaps),
      total,
    })
  })

  return out.sort((a, b) => b.total - a.total)
}

// ─── Charge la liste complète des serres pour le calcul "serres vides" ───────
export async function loadAllGreenhouses(farmId?: string | null): Promise<{ id: string; code: string; name: string; total_area: number; farm_id: string; type: string }[]> {
  let q = supabase.from('greenhouses').select('id, code, name, total_area, farm_id, type')
  if (farmId) q = q.eq('farm_id', farmId)
  const { data, error } = await q.order('code')
  if (error) throw error
  return (data ?? []) as any[]
}
