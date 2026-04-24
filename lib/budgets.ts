import { supabase } from './supabase'

export type BudgetStatus = 'brouillon' | 'valide' | 'fige'

export type BudgetVersion = {
  id: string
  campaign_id: string
  code: string
  name: string
  description: string | null
  status: BudgetStatus
  is_active: boolean
  validated_at: string | null
  frozen_at: string | null
  created_at: string
}

export type BudgetLine = {
  id: string
  version_id: string
  farm_id: string
  greenhouse_id: string | null
  account_category_id: string
  period_year: number
  period_month: number
  amount: number
  quantity: number | null
  unit_price: number | null
  notes: string | null
}

/**
 * Campagne typique : juillet N → juin N+1.
 * Produit la liste ordonnée des 12 (year, month) à partir d'une date de début.
 */
export function campaignMonths(startIso: string | null | undefined): { year: number; month: number }[] {
  const start = startIso ? new Date(startIso) : new Date(new Date().getFullYear(), 6, 1)
  // Si la date est invalide, fallback sur juillet de l'année en cours
  const y0 = isNaN(start.getTime()) ? new Date().getFullYear() : start.getFullYear()
  const m0 = isNaN(start.getTime()) ? 6 : start.getMonth()           // 0-indexé
  const out: { year: number; month: number }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(y0, m0 + i, 1)
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 })     // month 1-12
  }
  return out
}

export const MONTH_LABELS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ──────────────────────────────────────────────────────────────
// VERSIONS
// ──────────────────────────────────────────────────────────────
export async function listBudgetVersions(campaignId?: string): Promise<BudgetVersion[]> {
  let q = supabase.from('budget_versions').select('*').eq('is_active', true).order('created_at', { ascending: false })
  if (campaignId) q = q.eq('campaign_id', campaignId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as BudgetVersion[]
}

export async function createBudgetVersion(input: {
  campaign_id: string
  code: string
  name: string
  description?: string
}): Promise<BudgetVersion> {
  const { data, error } = await supabase.from('budget_versions').insert({
    campaign_id: input.campaign_id,
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    status: 'brouillon',
  }).select().single()
  if (error) throw error
  return data as BudgetVersion
}

export async function updateBudgetVersion(id: string, patch: Partial<{
  name: string
  description: string | null
  is_active: boolean
}>) {
  const dbPatch: any = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.is_active !== undefined) dbPatch.is_active = patch.is_active
  const { data, error } = await supabase.from('budget_versions').update(dbPatch).eq('id', id).select().single()
  if (error) throw error
  return data as BudgetVersion
}

export async function setBudgetVersionStatus(id: string, status: BudgetStatus): Promise<BudgetVersion> {
  const patch: any = { status, updated_at: new Date().toISOString() }
  if (status === 'valide') patch.validated_at = new Date().toISOString()
  if (status === 'fige')   patch.frozen_at    = new Date().toISOString()
  const { data, error } = await supabase.from('budget_versions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as BudgetVersion
}

/**
 * Duplique une version figée vers un nouveau brouillon (pour amendement).
 * Copie toutes les lignes associées.
 */
export async function duplicateBudgetVersion(sourceId: string, input: { code: string; name: string }): Promise<BudgetVersion> {
  const { data: src, error: se } = await supabase.from('budget_versions').select('*').eq('id', sourceId).single()
  if (se) throw se

  const { data: newVersion, error: ve } = await supabase.from('budget_versions').insert({
    campaign_id: src.campaign_id,
    code: input.code.trim(),
    name: input.name.trim(),
    description: `Dupliqué depuis ${src.code}`,
    status: 'brouillon',
  }).select().single()
  if (ve) throw ve

  // Copie des lignes
  const { data: lines } = await supabase.from('budget_lines').select('*').eq('version_id', sourceId)
  if (lines && lines.length > 0) {
    const copies = lines.map(l => ({
      version_id: newVersion.id,
      farm_id: l.farm_id,
      greenhouse_id: l.greenhouse_id,
      account_category_id: l.account_category_id,
      period_year: l.period_year,
      period_month: l.period_month,
      amount: l.amount,
      quantity: l.quantity,
      unit_price: l.unit_price,
      notes: l.notes,
    }))
    const { error: lle } = await supabase.from('budget_lines').insert(copies)
    if (lle) throw lle
  }
  return newVersion as BudgetVersion
}

// ──────────────────────────────────────────────────────────────
// LIGNES
// ──────────────────────────────────────────────────────────────
export async function listBudgetLines(params: {
  versionId: string
  farmId?: string
  greenhouseId?: string | null   // undefined = peu importe, null = filtrer IS NULL, 'xxx' = filtrer sur cette serre
}): Promise<BudgetLine[]> {
  let q = supabase.from('budget_lines').select('*').eq('version_id', params.versionId)
  if (params.farmId) q = q.eq('farm_id', params.farmId)
  if (params.greenhouseId === null) q = q.is('greenhouse_id', null)
  else if (params.greenhouseId) q = q.eq('greenhouse_id', params.greenhouseId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as BudgetLine[]
}

/**
 * Upsert d'une ligne budgétaire.
 * Si amount = 0 et qty/unit_price/notes tous vides, supprime la ligne à la place.
 */
export async function setBudgetCell(input: {
  version_id: string
  farm_id: string
  greenhouse_id: string | null
  account_category_id: string
  period_year: number
  period_month: number
  amount: number
  quantity?: number | null
  unit_price?: number | null
  notes?: string | null
}): Promise<BudgetLine | null> {
  const empty = (input.amount === 0 || input.amount === null)
    && (input.quantity === null || input.quantity === undefined)
    && (input.unit_price === null || input.unit_price === undefined)
    && !input.notes

  // Cherche une ligne existante
  let q = supabase.from('budget_lines')
    .select('id')
    .eq('version_id', input.version_id)
    .eq('farm_id', input.farm_id)
    .eq('account_category_id', input.account_category_id)
    .eq('period_year', input.period_year)
    .eq('period_month', input.period_month)
  if (input.greenhouse_id === null) q = q.is('greenhouse_id', null)
  else q = q.eq('greenhouse_id', input.greenhouse_id)

  const { data: existing } = await q.maybeSingle()

  if (empty) {
    if (existing) await supabase.from('budget_lines').delete().eq('id', existing.id)
    return null
  }

  if (existing) {
    const { data, error } = await supabase.from('budget_lines').update({
      amount: input.amount,
      quantity: input.quantity ?? null,
      unit_price: input.unit_price ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select().single()
    if (error) throw error
    return data as BudgetLine
  } else {
    const { data, error } = await supabase.from('budget_lines').insert({
      version_id: input.version_id,
      farm_id: input.farm_id,
      greenhouse_id: input.greenhouse_id,
      account_category_id: input.account_category_id,
      period_year: input.period_year,
      period_month: input.period_month,
      amount: input.amount,
      quantity: input.quantity ?? null,
      unit_price: input.unit_price ?? null,
      notes: input.notes ?? null,
    }).select().single()
    if (error) throw error
    return data as BudgetLine
  }
}

// ──────────────────────────────────────────────────────────────
// GRILLE : helper pour l'UI (catégorie × mois)
// ──────────────────────────────────────────────────────────────
export type BudgetGrid = {
  /** Clé `${categoryId}|${year}|${month}` → montant */
  amounts: Record<string, number>
  /** Total par catégorie */
  totalByCategory: Record<string, number>
  /** Total par (year, month) */
  totalByMonth: Record<string, number>
  /** Grand total */
  grandTotal: number
}

export function gridKey(categoryId: string, year: number, month: number): string {
  return `${categoryId}|${year}|${month}`
}

export function monthKey(year: number, month: number): string {
  return `${year}|${month}`
}

export function computeGrid(
  lines: BudgetLine[],
  months: { year: number; month: number }[]
): BudgetGrid {
  const amounts: Record<string, number> = {}
  const totalByCategory: Record<string, number> = {}
  const totalByMonth: Record<string, number> = {}
  let grandTotal = 0

  for (const l of lines) {
    const key = gridKey(l.account_category_id, l.period_year, l.period_month)
    amounts[key] = (amounts[key] ?? 0) + Number(l.amount || 0)
    totalByCategory[l.account_category_id] = (totalByCategory[l.account_category_id] ?? 0) + Number(l.amount || 0)
    const mk = monthKey(l.period_year, l.period_month)
    totalByMonth[mk] = (totalByMonth[mk] ?? 0) + Number(l.amount || 0)
    grandTotal += Number(l.amount || 0)
  }
  return { amounts, totalByCategory, totalByMonth, grandTotal }
}
