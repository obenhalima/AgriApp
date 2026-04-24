import { supabase } from './supabase'

// ============================================================
// Moteur de génération automatique du CA budget à partir des
// plantations (campaign_plantings enrichies).
//
// Flux :
//   1. Lire v_planting_forecasts pour la campagne
//   2. Pour chaque plantation : distribuer le volume total sur les mois
//      selon (harvest_start_date, harvest_end_date) au prorata des jours
//   3. Appliquer le split export/local et les prix → CA par mois
//   4. Upsert dans budget_lines (catégories CA_EXPORT + CA_LOCAL, niveau serre)
// ============================================================

export type PlantingForecast = {
  planting_id: string
  campaign_id: string
  greenhouse_id: string
  variety_id: string
  planted_area: number
  target_yield_per_m2: number
  total_volume_kg: number
  planting_date: string | null
  harvest_start_date: string | null
  harvest_end_date: string | null
  export_share_pct: number
  effective_price_export: number
  effective_price_local: number
  farm_id: string
  greenhouse_code: string
  greenhouse_name: string
  variety_name: string
  ca_export_total: number
  ca_local_total: number
}

export type GeneratedLine = {
  farm_id: string
  greenhouse_id: string
  account_category_id: string
  period_year: number
  period_month: number
  amount: number
  // contexte pour la prévisualisation
  planting_id: string
  variety_name: string
  greenhouse_code: string
  qty_kg: number
  price_per_kg: number
  category_code: 'CA_EXPORT' | 'CA_LOCAL'
}

export type GenerationReport = {
  lines: GeneratedLine[]
  issues: { plantingId: string; severity: 'error' | 'warning'; message: string; context?: string }[]
  totalsByCategory: { CA_EXPORT: number; CA_LOCAL: number; TOTAL: number }
  plantingsProcessed: number
  plantingsSkipped: number
}

/** Récupère les plantations enrichies pour une campagne donnée. */
export async function getPlantingForecasts(campaignId: string): Promise<PlantingForecast[]> {
  const { data, error } = await supabase
    .from('v_planting_forecasts')
    .select('*')
    .eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []) as PlantingForecast[]
}

/** Récupère les IDs des catégories CA_EXPORT et CA_LOCAL. */
async function getCARevenueCategoryIds(): Promise<{ exportId: string; localId: string }> {
  const { data, error } = await supabase
    .from('account_categories')
    .select('id, code')
    .in('code', ['CA_EXPORT', 'CA_LOCAL'])
  if (error) throw error
  const exportId = data?.find(c => c.code === 'CA_EXPORT')?.id
  const localId  = data?.find(c => c.code === 'CA_LOCAL')?.id
  if (!exportId || !localId) {
    throw new Error('Catégories comptables CA_EXPORT / CA_LOCAL introuvables — applique la migration 009')
  }
  return { exportId, localId }
}

// ============================================================
// DISTRIBUTION : donne la part (0-1) du volume total qui tombe
// dans chaque (year, month) pour une fenêtre de récolte donnée.
// Distribution linéaire par jour : qty_mois = total × (jours_mois_dans_fenêtre / jours_total_fenêtre)
// ============================================================
export function distributeByMonth(
  harvestStart: string,
  harvestEnd: string
): { year: number; month: number; share: number }[] {
  const start = new Date(harvestStart)
  const end = new Date(harvestEnd)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return []

  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (totalDays <= 0) return []

  const out: { year: number; month: number; share: number }[] = []
  // Itère mois par mois
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    const monthStart = new Date(cursor)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) // dernier jour du mois
    // Intersection avec la fenêtre
    const a = monthStart < start ? start : monthStart
    const b = monthEnd > end ? end : monthEnd
    const days = Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
    if (days > 0) {
      out.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        share: days / totalDays,
      })
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return out
}

// ============================================================
// GÉNÉRATION : produit les lignes budgétaires à partir des plantations
// sans encore les persister (dry-run)
// ============================================================
export async function generateSalesBudgetLines(campaignId: string): Promise<GenerationReport> {
  const plantings = await getPlantingForecasts(campaignId)
  const { exportId, localId } = await getCARevenueCategoryIds()

  const lines: GeneratedLine[] = []
  const issues: GenerationReport['issues'] = []
  let processed = 0
  let skipped = 0

  for (const p of plantings) {
    const label = `${p.variety_name} / ${p.greenhouse_code}`

    if (!p.harvest_start_date || !p.harvest_end_date) {
      issues.push({
        plantingId: p.planting_id,
        severity: 'warning',
        message: `${label} — dates de récolte manquantes, plantation ignorée`,
      })
      skipped++
      continue
    }
    if (!p.total_volume_kg || p.total_volume_kg <= 0) {
      issues.push({
        plantingId: p.planting_id,
        severity: 'warning',
        message: `${label} — volume total nul (vérifie surface × rendement), plantation ignorée`,
      })
      skipped++
      continue
    }

    const distribution = distributeByMonth(p.harvest_start_date, p.harvest_end_date)
    if (distribution.length === 0) {
      issues.push({
        plantingId: p.planting_id,
        severity: 'warning',
        message: `${label} — période de récolte invalide`,
      })
      skipped++
      continue
    }

    const exportPct = Math.max(0, Math.min(100, Number(p.export_share_pct) || 0))
    const priceExport = Number(p.effective_price_export) || 0
    const priceLocal  = Number(p.effective_price_local)  || 0

    if (exportPct > 0 && priceExport <= 0) {
      issues.push({
        plantingId: p.planting_id,
        severity: 'warning',
        message: `${label} — part export ${exportPct}% mais prix export = 0`,
      })
    }
    if (exportPct < 100 && priceLocal <= 0) {
      issues.push({
        plantingId: p.planting_id,
        severity: 'warning',
        message: `${label} — part locale ${100 - exportPct}% mais prix local = 0`,
      })
    }

    for (const d of distribution) {
      const qty = p.total_volume_kg * d.share
      const qtyExport = qty * exportPct / 100
      const qtyLocal  = qty - qtyExport
      const amountExport = Math.round(qtyExport * priceExport * 100) / 100
      const amountLocal  = Math.round(qtyLocal  * priceLocal  * 100) / 100

      if (amountExport > 0) {
        lines.push({
          farm_id: p.farm_id,
          greenhouse_id: p.greenhouse_id,
          account_category_id: exportId,
          period_year: d.year,
          period_month: d.month,
          amount: amountExport,
          planting_id: p.planting_id,
          variety_name: p.variety_name,
          greenhouse_code: p.greenhouse_code,
          qty_kg: qtyExport,
          price_per_kg: priceExport,
          category_code: 'CA_EXPORT',
        })
      }
      if (amountLocal > 0) {
        lines.push({
          farm_id: p.farm_id,
          greenhouse_id: p.greenhouse_id,
          account_category_id: localId,
          period_year: d.year,
          period_month: d.month,
          amount: amountLocal,
          planting_id: p.planting_id,
          variety_name: p.variety_name,
          greenhouse_code: p.greenhouse_code,
          qty_kg: qtyLocal,
          price_per_kg: priceLocal,
          category_code: 'CA_LOCAL',
        })
      }
    }
    processed++
  }

  const totalsByCategory = {
    CA_EXPORT: lines.filter(l => l.category_code === 'CA_EXPORT').reduce((s, l) => s + l.amount, 0),
    CA_LOCAL:  lines.filter(l => l.category_code === 'CA_LOCAL').reduce((s, l) => s + l.amount, 0),
    TOTAL: 0,
  }
  totalsByCategory.TOTAL = totalsByCategory.CA_EXPORT + totalsByCategory.CA_LOCAL

  return { lines, issues, totalsByCategory, plantingsProcessed: processed, plantingsSkipped: skipped }
}

// ============================================================
// COMMIT : applique les lignes générées dans une version de budget
// Stratégie : supprime les lignes CA_EXPORT / CA_LOCAL existantes pour
// les plantations concernées avant d'insérer les nouvelles.
// ============================================================
export async function commitSalesBudget(versionId: string, lines: GeneratedLine[]): Promise<{
  inserted: number
  deleted: number
}> {
  if (lines.length === 0) return { inserted: 0, deleted: 0 }
  const { exportId, localId } = await getCARevenueCategoryIds()

  // Supprime toutes les lignes existantes pour CA_EXPORT / CA_LOCAL sur les serres concernées
  // (niveau serre uniquement — on n'écrase pas d'éventuelles lignes niveau ferme)
  const ghIds = Array.from(new Set(lines.map(l => l.greenhouse_id)))
  const { data: del, error: de } = await supabase.from('budget_lines').delete()
    .eq('version_id', versionId)
    .in('greenhouse_id', ghIds)
    .in('account_category_id', [exportId, localId])
    .select('id')
  if (de) throw de
  const deleted = del?.length ?? 0

  // Insère les nouvelles lignes en batch
  const toInsert = lines.map(l => ({
    version_id: versionId,
    farm_id: l.farm_id,
    greenhouse_id: l.greenhouse_id,
    account_category_id: l.account_category_id,
    period_year: l.period_year,
    period_month: l.period_month,
    amount: l.amount,
    quantity: Math.round(l.qty_kg * 100) / 100,
    unit_price: l.price_per_kg,
    notes: `Auto-généré depuis plantation (${l.variety_name} / ${l.greenhouse_code})`,
  }))

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('budget_lines').insert(slice)
    if (error) throw error
    inserted += slice.length
  }

  return { inserted, deleted }
}
