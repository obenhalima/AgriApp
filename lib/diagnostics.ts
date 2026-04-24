import { supabase } from './supabase'
import { ComparisonMonthly } from './actuals'

// ============================================================
// Diagnostics de qualité/complétude des données comptables pour un CPC.
// Utilisés par l'assistant IA pour produire une analyse type "revue comptable".
// ============================================================

export type Diagnostics = {
  // Fenêtre analysée
  campaignName: string
  today: string               // ISO date YYYY-MM-DD

  // ── Récoltes ──
  plantings: {
    total: number                         // nombre de plantations de la campagne
    withValidDates: number                // ont harvest_start + harvest_end
    withoutPrices: number                 // pas de prix export NI local
    withHarvestOverdue: Array<{           // récolte qui aurait dû démarrer mais aucune récolte enregistrée
      label: string
      greenhouseCode: string
      harvest_start_date: string
      days_overdue: number
      expected_total_kg: number
    }>
    underperforming: Array<{              // récoltes sous-performantes : volume récolté <<< attendu à date
      label: string
      greenhouseCode: string
      expected_kg_to_date: number         // attendu pro-rata de la période écoulée
      actual_kg_to_date: number
      gap_pct: number
    }>
  }

  // ── Gaps budgétaires (cat×mois avec budget mais réel=0 pour mois passés) ──
  budgetGaps: Array<{
    categoryLabel: string
    categoryType: string
    monthLabel: string                    // ex: "Aoû 25"
    budget: number
    gapAbs: number                        // = budget (puisque réel=0)
  }>

  // ── Coûts non catégorisés ──
  uncategorizedCostsCount: number
  uncategorizedCostsAmount: number

  // ── Gaps de saisie budget (catégories référencées par des coûts mais absentes du budget) ──
  categoriesInCostsNotInBudget: Array<{ categoryLabel: string; actual: number }>
}

// ────────────────────────────────────────────────────────────
export async function computeDiagnostics(params: {
  campaignId: string
  campaignName: string
  versionId: string
  farmId?: string
  greenhouseId?: string | null
  comparisonRows: ComparisonMonthly[]   // lignes du comparatif déjà calculées
  months: { year: number; month: number }[]
  cutoffDate?: Date
}): Promise<Diagnostics> {
  const cutoff = params.cutoffDate ?? new Date()
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  // 1. Plantations de la campagne (avec prix et dates)
  let plantingsQ = supabase
    .from('v_planting_forecasts')
    .select('*')
    .eq('campaign_id', params.campaignId)
  const plantingsRes = await plantingsQ
  let plantings = (plantingsRes.data ?? []) as any[]

  // Filtre ferme/serre si fourni
  if (params.farmId) plantings = plantings.filter(p => p.farm_id === params.farmId)
  if (params.greenhouseId) plantings = plantings.filter(p => p.greenhouse_id === params.greenhouseId)

  const total = plantings.length
  const withValidDates = plantings.filter(p => p.harvest_start_date && p.harvest_end_date).length
  const withoutPrices = plantings.filter(p =>
    (!p.effective_price_export || Number(p.effective_price_export) === 0) &&
    (!p.effective_price_local || Number(p.effective_price_local) === 0)
  ).length

  // 2. Récoltes par plantation (somme des kg récoltés)
  const plantingIds = plantings.map(p => p.planting_id)
  let harvestsByPlanting = new Map<string, number>()
  if (plantingIds.length > 0) {
    const { data: harvests } = await supabase
      .from('harvests')
      .select('campaign_planting_id, qty_category_1, qty_category_2, qty_category_3')
      .in('campaign_planting_id', plantingIds)
    for (const h of (harvests ?? []) as any[]) {
      const total = Number(h.qty_category_1 || 0) + Number(h.qty_category_2 || 0) + Number(h.qty_category_3 || 0)
      harvestsByPlanting.set(h.campaign_planting_id,
        (harvestsByPlanting.get(h.campaign_planting_id) ?? 0) + total)
    }
  }

  // 3. Calcul des plantations "en retard" et "sous-performantes"
  const withHarvestOverdue: Diagnostics['plantings']['withHarvestOverdue'] = []
  const underperforming: Diagnostics['plantings']['underperforming'] = []
  for (const p of plantings) {
    if (!p.harvest_start_date) continue
    const hsd = new Date(p.harvest_start_date)
    if (isNaN(hsd.getTime()) || hsd > cutoff) continue

    const actual = harvestsByPlanting.get(p.planting_id) ?? 0
    const expectedTotal = Number(p.total_volume_kg || 0)
    const label = `${p.variety_name ?? '?'} (${p.greenhouse_code ?? '?'})`

    // En retard : date début passée mais 0 récolte
    if (actual === 0) {
      const daysOverdue = Math.floor((cutoff.getTime() - hsd.getTime()) / (1000 * 60 * 60 * 24))
      withHarvestOverdue.push({
        label,
        greenhouseCode: p.greenhouse_code ?? '?',
        harvest_start_date: p.harvest_start_date,
        days_overdue: daysOverdue,
        expected_total_kg: expectedTotal,
      })
      continue
    }

    // Sous-performance : calcul pro-rata attendu à date
    if (p.harvest_end_date && expectedTotal > 0) {
      const hed = new Date(p.harvest_end_date)
      const totalDays = Math.max(1, Math.floor((hed.getTime() - hsd.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const elapsedDays = Math.max(0, Math.min(totalDays, Math.floor((cutoff.getTime() - hsd.getTime()) / (1000 * 60 * 60 * 24)) + 1))
      const expectedToDate = expectedTotal * (elapsedDays / totalDays)
      if (expectedToDate > 0) {
        const gapPct = (actual - expectedToDate) / expectedToDate * 100
        if (gapPct < -20) {
          underperforming.push({
            label,
            greenhouseCode: p.greenhouse_code ?? '?',
            expected_kg_to_date: expectedToDate,
            actual_kg_to_date: actual,
            gap_pct: gapPct,
          })
        }
      }
    }
  }

  // 4. Gaps budgétaires : (catégorie × mois) où budget > 0 et réel = 0, mois passé
  const budgetGaps: Diagnostics['budgetGaps'] = []
  const MONTH_LABELS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  // Catégories feuilles uniquement (pas de parent dans le tree)
  const childIds = new Set(params.comparisonRows.filter(r => r.parent_id).map(r => r.parent_id))
  const leaves = params.comparisonRows.filter(r => !childIds.has(r.category_id))

  for (const leaf of leaves) {
    // Ignore CA (CA_EXPORT / CA_LOCAL) car traité via récoltes
    if (leaf.category_code === 'CA_EXPORT' || leaf.category_code === 'CA_LOCAL') continue
    for (const m of params.months) {
      const monthEnd = new Date(m.year, m.month, 0)
      if (monthEnd > cutoff) continue  // mois futur, règle de report appliquée
      const k = `${m.year}-${m.month}`
      const cell = leaf.byMonth[k]
      if (!cell) continue
      // Note : actual ici provient déjà de la règle "futur=budget" mais pour les mois passés c'est le vrai réel
      // On veut détecter les mois passés où budget > 0 et rien n'a été saisi.
      if (cell.budget > 0 && cell.actual === 0) {
        budgetGaps.push({
          categoryLabel: leaf.category_label,
          categoryType: leaf.category_type,
          monthLabel: `${MONTH_LABELS_FR[m.month - 1]} ${String(m.year).slice(-2)}`,
          budget: cell.budget,
          gapAbs: cell.budget,
        })
      }
    }
  }
  // Top 15 gaps par montant
  budgetGaps.sort((a, b) => b.gapAbs - a.gapAbs)

  // 5. Coûts non catégorisés dans la campagne
  let uncategorizedCostsCount = 0
  let uncategorizedCostsAmount = 0
  {
    const { data } = await supabase
      .from('cost_entries')
      .select('amount, account_category_id, greenhouses(farm_id)')
      .eq('campaign_id', params.campaignId)
      .is('account_category_id', null)
    for (const r of (data ?? []) as any[]) {
      if (params.farmId) {
        const ghFarm = r.greenhouses?.farm_id
        if (ghFarm && ghFarm !== params.farmId) continue
      }
      uncategorizedCostsCount++
      uncategorizedCostsAmount += Number(r.amount || 0)
    }
  }

  // 6. Catégories qui ont du réel mais pas de budget (oubli côté prévi)
  const categoriesInCostsNotInBudget = leaves
    .filter(l => l.actual > 0 && l.budget === 0 && l.category_type !== 'produit')
    .map(l => ({ categoryLabel: l.category_label, actual: l.actual }))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 10)

  return {
    campaignName: params.campaignName,
    today: cutoffIso,
    plantings: {
      total,
      withValidDates,
      withoutPrices,
      withHarvestOverdue: withHarvestOverdue.sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 15),
      underperforming: underperforming.sort((a, b) => a.gap_pct - b.gap_pct).slice(0, 10),
    },
    budgetGaps: budgetGaps.slice(0, 20),
    uncategorizedCostsCount,
    uncategorizedCostsAmount,
    categoriesInCostsNotInBudget,
  }
}
