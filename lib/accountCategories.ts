import { supabase } from './supabase'

export type AccountCategoryType = 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'

export type AccountCategory = {
  id: string
  parent_id: string | null
  code: string
  label: string
  description: string | null
  type: AccountCategoryType
  level: number
  display_order: number
  default_depreciation_years: number | null
  is_active: boolean
}

export type AccountCategoryNode = AccountCategory & {
  children: AccountCategoryNode[]
}

export const TYPE_LABELS: Record<AccountCategoryType, string> = {
  produit: 'Produit',
  charge_variable: 'Charge variable',
  charge_fixe: 'Charge fixe',
  amortissement: 'Amortissement',
}

export const TYPE_COLORS: Record<AccountCategoryType, string> = {
  produit: 'var(--neon)',
  charge_variable: 'var(--amber)',
  charge_fixe: 'var(--blue)',
  amortissement: 'var(--purple)',
}

/** Liste plate triée : niveau 1 → 2 → 3, par display_order. */
export async function listAccountCategories(): Promise<AccountCategory[]> {
  const { data, error } = await supabase
    .from('account_categories')
    .select('*')
    .order('level').order('display_order')
  if (error) throw error
  return (data ?? []) as AccountCategory[]
}

/** Arbre hiérarchique construit côté client à partir de la liste plate. */
export function buildTree(flat: AccountCategory[]): AccountCategoryNode[] {
  const map = new Map<string, AccountCategoryNode>()
  flat.forEach(c => map.set(c.id, { ...c, children: [] }))
  const roots: AccountCategoryNode[] = []
  flat.forEach(c => {
    const node = map.get(c.id)!
    if (c.parent_id) map.get(c.parent_id)?.children.push(node)
    else roots.push(node)
  })
  // Tri récursif par display_order
  const sortRec = (nodes: AccountCategoryNode[]) => {
    nodes.sort((a, b) => a.display_order - b.display_order)
    nodes.forEach(n => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

export async function getAccountCategoriesTree(): Promise<AccountCategoryNode[]> {
  return buildTree(await listAccountCategories())
}

/** Uniquement les feuilles actives (utilisables pour imputer un coût). */
export async function getLeafCategories(typeFilter?: AccountCategoryType): Promise<AccountCategory[]> {
  const flat = await listAccountCategories()
  const hasChildren = new Set(flat.filter(c => c.parent_id).map(c => c.parent_id))
  return flat.filter(c =>
    c.is_active &&
    !hasChildren.has(c.id) &&
    (!typeFilter || c.type === typeFilter)
  )
}

export async function createAccountCategory(input: {
  parent_id: string | null
  code: string
  label: string
  description?: string
  type: AccountCategoryType
  display_order?: number
  default_depreciation_years?: number | null
}): Promise<AccountCategory> {
  // level = parent.level + 1, ou 1 si racine
  let level = 1
  if (input.parent_id) {
    const { data: parent } = await supabase
      .from('account_categories')
      .select('level')
      .eq('id', input.parent_id)
      .maybeSingle()
    if (parent) level = Math.min((parent.level ?? 1) + 1, 3)
  }
  const { data, error } = await supabase.from('account_categories').insert({
    parent_id: input.parent_id,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    description: input.description ?? null,
    type: input.type,
    level,
    display_order: input.display_order ?? 99,
    default_depreciation_years: input.type === 'amortissement'
      ? (input.default_depreciation_years ?? null)
      : null,
    is_active: true,
  }).select().single()
  if (error) throw error
  return data as AccountCategory
}

export async function updateAccountCategory(id: string, patch: Partial<{
  label: string
  description: string | null
  display_order: number
  default_depreciation_years: number | null
  is_active: boolean
}>): Promise<AccountCategory> {
  const dbPatch: any = { updated_at: new Date().toISOString() }
  if (patch.label !== undefined) dbPatch.label = patch.label.trim()
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.display_order !== undefined) dbPatch.display_order = patch.display_order
  if (patch.default_depreciation_years !== undefined) dbPatch.default_depreciation_years = patch.default_depreciation_years
  if (patch.is_active !== undefined) dbPatch.is_active = patch.is_active

  const { data, error } = await supabase
    .from('account_categories').update(dbPatch).eq('id', id).select().single()
  if (error) throw error
  return data as AccountCategory
}

export async function toggleAccountCategoryActive(id: string, isActive: boolean) {
  return updateAccountCategory(id, { is_active: isActive })
}

export async function deleteAccountCategory(id: string) {
  // Contrainte ON DELETE RESTRICT empêchera la suppression s'il y a des enfants ou des cost_entries liées.
  const { error } = await supabase.from('account_categories').delete().eq('id', id)
  if (error) throw error
}
