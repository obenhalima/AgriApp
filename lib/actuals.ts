import { supabase } from './supabase'

// ============================================================
// Agrégation du RÉEL + Budget pour le Compte d'exploitation.
//
// - Charges réelles : cost_entries is_planned=false, groupé par (catégorie, mois)
// - CA réel         : invoices type 'vente' sur la fenêtre campagne,
//                     split Export/Local via clients.markets.type, par mois
// - Budget          : budget_lines, groupé par (catégorie, mois)
//
// Règle "mois futurs = budget" : pour chaque (cat, mois), si le mois est
// strictement après le mois courant, on remplace le réel par le budget.
// Permet d'obtenir une projection « actuals-to-date + budget-forward ».
// ============================================================

export type MonthKey = string // "YYYY-M"
export const monthKey = (year: number, month: number): MonthKey => `${year}-${month}`

export type ComparisonMonthly = {
  category_id: string
  category_code: string
  category_label: string
  category_type: 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'
  parent_id: string | null
  level: number
  display_order: number
  // Totaux (déjà mois futurs extrapolés pour `actual`)
  budget: number
  actual: number
  // Détail mensuel : uniquement valeurs directement associées à cette feuille
  // (l'agrégation des parents se fait côté UI)
  byMonth: Record<MonthKey, { budget: number; actual: number }>
}

// ────────────────────────────────────────────────────────────
// Lecture budget (monthly)
// ────────────────────────────────────────────────────────────
async function getBudgetMonthly(params: {
  versionId: string
  farmId?: string
  greenhouseId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  let q = supabase.from('budget_lines')
    .select('account_category_id, amount, period_year, period_month, farm_id, greenhouse_id')
    .eq('version_id', params.versionId)
  if (params.farmId) q = q.eq('farm_id', params.farmId)
  if (params.greenhouseId === null) q = q.is('greenhouse_id', null)
  else if (params.greenhouseId) q = q.eq('greenhouse_id', params.greenhouseId)

  const { data, error } = await q
  if (error) throw error

  const out: Record<string, Record<MonthKey, number>> = {}
  for (const r of (data ?? []) as any[]) {
    const catId = r.account_category_id
    if (!catId) continue
    const mk = monthKey(r.period_year, r.period_month)
    out[catId] ??= {}
    out[catId][mk] = (out[catId][mk] ?? 0) + Number(r.amount || 0)
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Lecture charges réelles (monthly)
// ────────────────────────────────────────────────────────────
async function getActualChargesMonthly(params: {
  campaignId: string
  farmId?: string
  greenhouseId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  let q = supabase.from('cost_entries')
    .select('account_category_id, amount, entry_date, greenhouse_id, greenhouses(farm_id)')
    .eq('campaign_id', params.campaignId)
    .eq('is_planned', false)
  if (params.greenhouseId === null) q = q.is('greenhouse_id', null)
  else if (params.greenhouseId) q = q.eq('greenhouse_id', params.greenhouseId)

  const { data, error } = await q
  if (error) throw error

  const out: Record<string, Record<MonthKey, number>> = {}
  for (const r of (data ?? []) as any[]) {
    const catId = r.account_category_id
    if (!catId) continue
    // Filtre ferme (via serre ou via la campagne si pas de serre)
    if (params.farmId) {
      const ghFarm = r.greenhouses?.farm_id
      if (ghFarm && ghFarm !== params.farmId) continue
    }
    const d = new Date(r.entry_date)
    if (isNaN(d.getTime())) continue
    const mk = monthKey(d.getFullYear(), d.getMonth() + 1)
    out[catId] ??= {}
    out[catId][mk] = (out[catId][mk] ?? 0) + Number(r.amount || 0)
  }
  return out
}

// ────────────────────────────────────────────────────────────
// CA réel (monthly) — basé sur les RÉCOLTES × prix validé
//   qty_category_1 (export) × prix_export
//   qty_category_2 + qty_category_3 (local) × prix_local
// Prix validé = price_per_kg_export/local sur la plantation si défini,
// sinon avg_price_export/local de la variété.
// ────────────────────────────────────────────────────────────
async function getActualRevenuesMonthly(params: {
  campaignId: string
  farmId?: string
  greenhouseId?: string | null
  caExportCatId?: string | null
  caLocalCatId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  const { data: harvests, error } = await supabase
    .from('harvests')
    .select(`
      qty_category_1, qty_category_2, qty_category_3, harvest_date,
      campaign_plantings!inner(
        id, campaign_id, greenhouse_id,
        price_per_kg_export, price_per_kg_local,
        varieties(avg_price_export, avg_price_local),
        greenhouses(farm_id)
      )
    `)
    .eq('campaign_plantings.campaign_id', params.campaignId)

  if (error) throw error

  const out: Record<string, Record<MonthKey, number>> = {}
  const addTo = (catId: string, mk: MonthKey, amount: number) => {
    out[catId] ??= {}
    out[catId][mk] = (out[catId][mk] ?? 0) + amount
  }

  for (const h of (harvests ?? []) as any[]) {
    const cp = h.campaign_plantings
    if (!cp) continue

    // Filtres serre / ferme
    if (params.greenhouseId === null) {
      // On ne filtre rien de spécifique au niveau ferme pour les récoltes (elles sont toujours liées à une serre)
    } else if (params.greenhouseId && cp.greenhouse_id !== params.greenhouseId) continue
    if (params.farmId && cp.greenhouses?.farm_id !== params.farmId) continue

    const d = new Date(h.harvest_date)
    if (isNaN(d.getTime())) continue
    const mk = monthKey(d.getFullYear(), d.getMonth() + 1)

    const priceExport = Number(cp.price_per_kg_export ?? cp.varieties?.avg_price_export ?? 0)
    const priceLocal  = Number(cp.price_per_kg_local  ?? cp.varieties?.avg_price_local  ?? 0)

    const qtyExport = Number(h.qty_category_1 || 0)
    const qtyLocal  = Number(h.qty_category_2 || 0) + Number(h.qty_category_3 || 0)

    if (qtyExport > 0 && priceExport > 0 && params.caExportCatId) {
      addTo(params.caExportCatId, mk, qtyExport * priceExport)
    }
    if (qtyLocal > 0 && priceLocal > 0 && params.caLocalCatId) {
      addTo(params.caLocalCatId, mk, qtyLocal * priceLocal)
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Construction du rapport complet
// ────────────────────────────────────────────────────────────
export async function buildComparison(params: {
  campaignId: string
  versionId: string
  farmId?: string
  greenhouseId?: string | null
  months: { year: number; month: number }[]   // liste ordonnée des 12 mois à considérer
  cutoffDate?: Date                             // défaut : aujourd'hui
}): Promise<ComparisonMonthly[]> {
  const cutoff = params.cutoffDate ?? new Date()
  const cutoffYear = cutoff.getFullYear()
  const cutoffMonth = cutoff.getMonth() + 1

  // Charge les catégories pour identifier les codes CA
  const { data: allCats } = await supabase.from('account_categories').select('*').eq('is_active', true)
  const categories = (allCats ?? []) as any[]
  const caExportCatId = categories.find(c => c.code === 'CA_EXPORT')?.id ?? null
  const caLocalCatId  = categories.find(c => c.code === 'CA_LOCAL')?.id  ?? null

  const [budgetMonthly, actualChargesMonthly, actualRevenuesMonthly] = await Promise.all([
    getBudgetMonthly({ versionId: params.versionId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualChargesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualRevenuesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId, caExportCatId, caLocalCatId }),
  ])

  // Fusion actuel = charges + revenues
  const actualMonthly: Record<string, Record<MonthKey, number>> = {}
  const addFromMap = (src: Record<string, Record<MonthKey, number>>) => {
    for (const [catId, monthsObj] of Object.entries(src)) {
      actualMonthly[catId] ??= {}
      for (const [mk, val] of Object.entries(monthsObj)) {
        actualMonthly[catId][mk] = (actualMonthly[catId][mk] ?? 0) + val
      }
    }
  }
  addFromMap(actualChargesMonthly)
  addFromMap(actualRevenuesMonthly)

  // Construit les lignes pour CHAQUE catégorie et CHAQUE mois de la fenêtre
  const isFuture = (year: number, month: number) =>
    year > cutoffYear || (year === cutoffYear && month > cutoffMonth)

  const result: ComparisonMonthly[] = categories.map(c => {
    const byMonth: Record<MonthKey, { budget: number; actual: number }> = {}
    let totalBudget = 0
    let totalActual = 0

    for (const m of params.months) {
      const mk = monthKey(m.year, m.month)
      const b = budgetMonthly[c.id]?.[mk] ?? 0
      const rawActual = actualMonthly[c.id]?.[mk] ?? 0
      // Règle : mois futurs → on prend le budget comme "réel" projeté
      const a = isFuture(m.year, m.month) ? b : rawActual
      byMonth[mk] = { budget: b, actual: a }
      totalBudget += b
      totalActual += a
    }

    return {
      category_id: c.id,
      category_code: c.code,
      category_label: c.label,
      category_type: c.type,
      parent_id: c.parent_id,
      level: c.level,
      display_order: c.display_order,
      budget: totalBudget,
      actual: totalActual,
      byMonth,
    }
  })

  return result
}
