import { supabase } from './supabase'

// ============================================================
// Génération automatique des lignes de CHARGES dans budget_lines
// à partir des cost_entries marquées is_planned=true (budget prévisionnel).
//
// Flux :
//   1. Lire cost_entries avec is_planned=true pour la campagne
//   2. Dériver farm_id : depuis greenhouse.farm_id, sinon depuis campaign.farm_id
//   3. Groupby (farm_id, greenhouse_id, account_category_id, year, month) → somme
//   4. Supprimer les lignes existantes correspondantes (catégories de type charge_*)
//      pour cette version dans le périmètre des fermes concernées
//   5. Insérer les nouvelles lignes agrégées
// ============================================================

export type GeneratedChargeLine = {
  farm_id: string
  greenhouse_id: string | null
  account_category_id: string
  period_year: number
  period_month: number
  amount: number
  // contexte pour la prévisualisation
  farm_code: string
  greenhouse_code: string | null
  category_code: string
  category_label: string
  category_type: 'charge_variable' | 'charge_fixe' | 'amortissement'
  source_entries: number  // nombre de cost_entries agrégées
}

export type ChargeGenerationReport = {
  lines: GeneratedChargeLine[]
  issues: { costEntryId: string; severity: 'error' | 'warning'; message: string }[]
  totalsByType: {
    charge_variable: number
    charge_fixe: number
    amortissement: number
    TOTAL: number
  }
  costsProcessed: number
  costsSkipped: number
}

export async function generateChargeLinesFromCosts(campaignId: string): Promise<ChargeGenerationReport> {
  // 1. Charger la campagne pour récupérer la ferme par défaut
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, farm_id')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) throw new Error('Campagne introuvable')

  // 2. Charger tous les cost_entries prévisionnels de cette campagne
  const { data: entries, error: ee } = await supabase
    .from('cost_entries')
    .select(`
      id, campaign_id, greenhouse_id, account_category_id,
      amount, entry_date, description,
      greenhouses(code, farm_id, farms(code, name)),
      account_categories(code, label, type)
    `)
    .eq('campaign_id', campaignId)
    .eq('is_planned', true)
  if (ee) throw ee

  const rawEntries = (entries ?? []) as any[]
  const issues: ChargeGenerationReport['issues'] = []

  // 3. Grouper par clef naturelle : (farm, greenhouse, category, year, month)
  type GroupKey = string
  const groups = new Map<GroupKey, {
    farm_id: string
    greenhouse_id: string | null
    account_category_id: string
    period_year: number
    period_month: number
    amount: number
    farm_code: string
    greenhouse_code: string | null
    category_code: string
    category_label: string
    category_type: 'charge_variable' | 'charge_fixe' | 'amortissement'
    source_entries: number
  }>()

  // On a aussi besoin du code de la ferme quand elle est déduite de la campagne (pas de greenhouse).
  // Charger toutes les fermes une fois pour mapper id → code.
  const { data: farms } = await supabase.from('farms').select('id, code, name')
  const farmById = new Map<string, { code: string; name: string }>()
  farms?.forEach((f: any) => farmById.set(f.id, { code: f.code, name: f.name }))

  let processed = 0
  let skipped = 0

  for (const e of rawEntries) {
    if (!e.account_category_id) {
      issues.push({ costEntryId: e.id, severity: 'warning', message: 'Entrée non catégorisée (account_category_id manquant) — ignorée' })
      skipped++
      continue
    }
    const cat = e.account_categories
    if (!cat) {
      issues.push({ costEntryId: e.id, severity: 'warning', message: 'Catégorie comptable introuvable — ignorée' })
      skipped++
      continue
    }
    // Ne traite que les types charges (produits sont gérés par la génération CA)
    if (!['charge_variable', 'charge_fixe', 'amortissement'].includes(cat.type)) {
      issues.push({ costEntryId: e.id, severity: 'warning', message: `Catégorie "${cat.label}" de type "${cat.type}" — ignorée (seules les charges sont traitées)` })
      skipped++
      continue
    }

    // Déduire farm_id
    let farm_id: string
    let farm_code: string
    if (e.greenhouses?.farm_id) {
      farm_id = e.greenhouses.farm_id
      farm_code = e.greenhouses.farms?.code ?? farmById.get(farm_id)?.code ?? '?'
    } else {
      farm_id = campaign.farm_id
      farm_code = farmById.get(farm_id)?.code ?? '?'
    }
    if (!farm_id) {
      issues.push({ costEntryId: e.id, severity: 'error', message: 'Impossible de déterminer la ferme — ignorée' })
      skipped++
      continue
    }

    // Extraire year / month
    const d = new Date(e.entry_date)
    if (isNaN(d.getTime())) {
      issues.push({ costEntryId: e.id, severity: 'error', message: `Date invalide : ${e.entry_date}` })
      skipped++
      continue
    }
    const year = d.getFullYear()
    const month = d.getMonth() + 1

    const gh_id = e.greenhouse_id ?? null
    const gh_code = e.greenhouses?.code ?? null
    const key = `${farm_id}|${gh_id ?? '∅'}|${e.account_category_id}|${year}|${month}`

    const existing = groups.get(key)
    if (existing) {
      existing.amount += Number(e.amount || 0)
      existing.source_entries += 1
    } else {
      groups.set(key, {
        farm_id,
        greenhouse_id: gh_id,
        account_category_id: e.account_category_id,
        period_year: year,
        period_month: month,
        amount: Number(e.amount || 0),
        farm_code,
        greenhouse_code: gh_code,
        category_code: cat.code,
        category_label: cat.label,
        category_type: cat.type,
        source_entries: 1,
      })
    }
    processed++
  }

  const lines: GeneratedChargeLine[] = Array.from(groups.values())
    .map(l => ({ ...l, amount: Math.round(l.amount * 100) / 100 }))
    .filter(l => l.amount !== 0)

  const totalsByType = {
    charge_variable: lines.filter(l => l.category_type === 'charge_variable').reduce((s, l) => s + l.amount, 0),
    charge_fixe:     lines.filter(l => l.category_type === 'charge_fixe').reduce((s, l) => s + l.amount, 0),
    amortissement:   lines.filter(l => l.category_type === 'amortissement').reduce((s, l) => s + l.amount, 0),
    TOTAL: 0,
  }
  totalsByType.TOTAL = totalsByType.charge_variable + totalsByType.charge_fixe + totalsByType.amortissement

  return { lines, issues, totalsByType, costsProcessed: processed, costsSkipped: skipped }
}

// ============================================================
// COMMIT : applique les charges dans une version de budget
// Stratégie : supprime les lignes existantes de catégories "charge"
// pour cette version, sur les fermes concernées → insère les nouvelles.
// ============================================================
export async function commitChargeBudget(versionId: string, lines: GeneratedChargeLine[]): Promise<{
  inserted: number
  deleted: number
}> {
  if (lines.length === 0) return { inserted: 0, deleted: 0 }

  // Récupérer l'ensemble des catégories de charges (pour le delete)
  const { data: chargeCats } = await supabase
    .from('account_categories')
    .select('id')
    .in('type', ['charge_variable', 'charge_fixe', 'amortissement'])
  const chargeCategoryIds = (chargeCats ?? []).map((c: any) => c.id)
  if (chargeCategoryIds.length === 0) throw new Error('Aucune catégorie de charge définie dans le plan comptable')

  const farmIds = Array.from(new Set(lines.map(l => l.farm_id)))

  // Supprime les lignes existantes pour ces fermes / catégories de charge dans cette version
  const { data: del, error: de } = await supabase.from('budget_lines').delete()
    .eq('version_id', versionId)
    .in('farm_id', farmIds)
    .in('account_category_id', chargeCategoryIds)
    .select('id')
  if (de) throw de
  const deleted = del?.length ?? 0

  // Insère les nouvelles lignes
  const toInsert = lines.map(l => ({
    version_id: versionId,
    farm_id: l.farm_id,
    greenhouse_id: l.greenhouse_id,
    account_category_id: l.account_category_id,
    period_year: l.period_year,
    period_month: l.period_month,
    amount: l.amount,
    notes: `Auto-agrégé depuis ${l.source_entries} coût(s) prévisionnel(s)`,
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
