// ============================================================
// lib/referenceData.ts
//
// Accès aux référentiels dynamiques (no-code) : listes déroulantes
// paramétrables stockées dans reference_lists / reference_values.
//
// Helpers de lecture + CRUD admin (utilisés par /admin/referentiels).
// Le hook React useReferenceList() est dans useReferenceList.ts.
// ============================================================

import { supabase } from './supabase'

export interface ReferenceList {
  key: string
  label: string
  description?: string | null
  is_system?: boolean
  // calculé côté client
  value_count?: number
}

export interface ReferenceValue {
  id: string
  list_key: string
  code: string
  label: string
  color?: string | null
  icon?: string | null
  metadata?: any
  order_idx: number
  is_active: boolean
  is_default: boolean
}

// ───────────────────────────────────────────────────────────
// Lecture
// ───────────────────────────────────────────────────────────

export async function listReferenceLists(): Promise<ReferenceList[]> {
  const [listsRes, valuesRes] = await Promise.all([
    supabase.from('reference_lists').select('*').order('label'),
    supabase.from('reference_values').select('list_key'),
  ])
  if (listsRes.error) throw listsRes.error

  // Compte les valeurs par liste
  const counts = new Map<string, number>()
  for (const v of (valuesRes.data ?? []) as any[]) {
    counts.set(v.list_key, (counts.get(v.list_key) ?? 0) + 1)
  }

  return (listsRes.data ?? []).map((l: any) => ({
    ...l,
    value_count: counts.get(l.key) ?? 0,
  }))
}

export async function listReferenceValues(listKey: string): Promise<ReferenceValue[]> {
  const { data, error } = await supabase
    .from('reference_values')
    .select('*')
    .eq('list_key', listKey)
    .order('order_idx')
  if (error) throw error
  return (data ?? []) as ReferenceValue[]
}

// ───────────────────────────────────────────────────────────
// CRUD valeurs (admin)
// ───────────────────────────────────────────────────────────

export async function createReferenceValue(input: {
  list_key: string
  code: string
  label: string
  color?: string | null
  icon?: string | null
  order_idx?: number
  is_default?: boolean
}): Promise<ReferenceValue> {
  // Si is_default, on retire le défaut des autres valeurs de la même liste
  if (input.is_default) {
    await supabase.from('reference_values')
      .update({ is_default: false })
      .eq('list_key', input.list_key)
  }
  const { data, error } = await supabase
    .from('reference_values')
    .insert({
      list_key: input.list_key,
      code: input.code.trim(),
      label: input.label.trim(),
      color: input.color || null,
      icon: input.icon || null,
      order_idx: input.order_idx ?? 0,
      is_default: input.is_default ?? false,
      is_active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data as ReferenceValue
}

export async function updateReferenceValue(
  id: string,
  patch: Partial<Pick<ReferenceValue, 'label' | 'color' | 'icon' | 'order_idx' | 'is_active' | 'is_default'>>,
): Promise<void> {
  // Si on passe is_default=true, retire le défaut des autres
  if (patch.is_default === true) {
    const { data: row } = await supabase.from('reference_values').select('list_key').eq('id', id).single()
    if (row?.list_key) {
      await supabase.from('reference_values').update({ is_default: false }).eq('list_key', row.list_key)
    }
  }
  const { error } = await supabase.from('reference_values').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteReferenceValue(id: string): Promise<void> {
  // On désactive plutôt que supprimer (les données existantes peuvent référencer ce code)
  const { error } = await supabase.from('reference_values').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

/**
 * Suppression dure (réservée aux cas où la valeur n'a jamais été utilisée).
 * À utiliser avec précaution.
 */
export async function hardDeleteReferenceValue(id: string): Promise<void> {
  const { error } = await supabase.from('reference_values').delete().eq('id', id)
  if (error) throw error
}

// ───────────────────────────────────────────────────────────
// CRUD listes (admin) — création de nouvelles catégories
// ───────────────────────────────────────────────────────────

export async function createReferenceList(input: {
  key: string
  label: string
  description?: string
}): Promise<ReferenceList> {
  const { data, error } = await supabase
    .from('reference_lists')
    .insert({
      key: input.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      label: input.label.trim(),
      description: input.description?.trim() || null,
    })
    .select()
    .single()
  if (error) throw error
  return { ...(data as ReferenceList), value_count: 0 }
}

// ───────────────────────────────────────────────────────────
// P4 — Garde-fou : comptage des usages d'une valeur
// ───────────────────────────────────────────────────────────

/**
 * Mapping list_key → tables/colonnes qui stockent ce code.
 * Sert à compter combien de lignes utilisent une valeur avant de la désactiver.
 * Une liste absente de ce mapping → pas de garde-fou (désactivation directe).
 */
const USAGE_MAP: Record<string, { table: string; column: string }[]> = {
  client_type:         [{ table: 'clients', column: 'type' }],
  market_type:         [{ table: 'markets', column: 'type' }],
  supplier_category:   [{ table: 'suppliers', column: 'category' }],
  variety_type:        [{ table: 'varieties', column: 'type' }],
  variety_destination: [{ table: 'varieties', column: 'destination' }],
  stock_category:      [{ table: 'stock_items', column: 'category' }],
  unit:                [{ table: 'stock_items', column: 'unit' }],
  operation_type:      [{ table: 'cultural_operations', column: 'operation_type' }],
  currency:            [{ table: 'markets', column: 'currency' }],
  worker_category:     [{ table: 'workers', column: 'category' }],
  family_status:       [{ table: 'workers', column: 'family_status' }],
  contract_type:       [{ table: 'workers', column: 'contract_type' }],
  payment_method:      [{ table: 'workers', column: 'payment_method' }],
}

/**
 * Compte combien de lignes (toutes tables confondues) utilisent ce code.
 * Robuste : une table/colonne inexistante est ignorée (compte partiel).
 * Retourne -1 si la liste n'a aucun mapping connu (= garde-fou non applicable).
 */
export async function countUsage(listKey: string, code: string): Promise<number> {
  const targets = USAGE_MAP[listKey]
  if (!targets || targets.length === 0) return -1
  let total = 0
  for (const t of targets) {
    try {
      const { count, error } = await supabase
        .from(t.table)
        .select('*', { count: 'exact', head: true })
        .eq(t.column, code)
      if (!error && typeof count === 'number') total += count
    } catch {
      /* table/colonne absente → ignore */
    }
  }
  return total
}

// ───────────────────────────────────────────────────────────
// P4 — Export / Import de la configuration des référentiels
// ───────────────────────────────────────────────────────────

export interface ReferentielExport {
  version: 1
  exported_at: string
  lists: { key: string; label: string; description?: string | null }[]
  values: Omit<ReferenceValue, 'id'>[]
}

/** Exporte toutes les listes + valeurs dans un objet sérialisable. */
export async function exportReferentiels(exportedAt: string): Promise<ReferentielExport> {
  const [listsRes, valuesRes] = await Promise.all([
    supabase.from('reference_lists').select('key, label, description').order('label'),
    supabase.from('reference_values').select('list_key, code, label, color, icon, metadata, order_idx, is_active, is_default').order('list_key').order('order_idx'),
  ])
  if (listsRes.error) throw listsRes.error
  if (valuesRes.error) throw valuesRes.error
  return {
    version: 1,
    exported_at: exportedAt,
    lists: (listsRes.data ?? []) as any,
    values: (valuesRes.data ?? []) as any,
  }
}

/**
 * Importe une config exportée (upsert idempotent).
 * Les listes/valeurs existantes sont mises à jour, les nouvelles créées.
 * Ne supprime jamais de valeur existante (sécurité).
 */
export async function importReferentiels(payload: ReferentielExport): Promise<{ lists: number; values: number }> {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.lists) || !Array.isArray(payload.values)) {
    throw new Error('Format de fichier invalide (version 1 attendue avec lists[] et values[]).')
  }
  // 1. Upsert des listes
  if (payload.lists.length > 0) {
    const { error } = await supabase
      .from('reference_lists')
      .upsert(payload.lists.map(l => ({ key: l.key, label: l.label, description: l.description ?? null })), { onConflict: 'key' })
    if (error) throw error
  }
  // 2. Upsert des valeurs (clé naturelle = list_key + code)
  if (payload.values.length > 0) {
    const { error } = await supabase
      .from('reference_values')
      .upsert(payload.values.map(v => ({
        list_key: v.list_key, code: v.code, label: v.label,
        color: v.color ?? null, icon: v.icon ?? null, metadata: v.metadata ?? {},
        order_idx: v.order_idx ?? 0, is_active: v.is_active ?? true, is_default: v.is_default ?? false,
      })), { onConflict: 'list_key,code' })
    if (error) throw error
  }
  return { lists: payload.lists.length, values: payload.values.length }
}
