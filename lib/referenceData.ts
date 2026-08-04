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
  metadata?: any
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
      metadata: input.metadata ?? {},
    })
    .select()
    .single()
  if (error) throw error
  return data as ReferenceValue
}

export async function updateReferenceValue(
  id: string,
  patch: Partial<Pick<ReferenceValue, 'label' | 'color' | 'icon' | 'order_idx' | 'is_active' | 'is_default' | 'metadata'>>,
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
  pay_frequency:       [{ table: 'workers', column: 'pay_frequency' }],
  purchase_category:   [{ table: 'purchase_orders', column: 'cost_category' }],
  leave_type:          [{ table: 'leave_requests', column: 'type' }],
  tray_type:           [{ table: 'harvest_tray_lines', column: 'tray_type_code' }],
  labor_task:          [{ table: 'labor_entries', column: 'operation_type' }],
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
// P4 — Export / Import Excel (.xlsx) de la configuration
//
// Format pensé pour des utilisateurs NON techniques :
//   1 feuille « Référentiels » avec colonnes lisibles. Ils éditent dans
//   Excel (libellés, ordre, ajout de lignes) puis ré-importent le fichier.
// ───────────────────────────────────────────────────────────

const XLSX_HEADERS = ['Clé liste', 'Liste', 'Code', 'Libellé', 'Couleur', 'Ordre', 'Par défaut', 'Actif'] as const

/** Génère le classeur Excel (.xlsx) de toute la config. Retourne un ArrayBuffer. */
export async function exportReferentielsXlsx(): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx')
  const [listsRes, valuesRes] = await Promise.all([
    supabase.from('reference_lists').select('key, label').order('label'),
    supabase.from('reference_values').select('list_key, code, label, color, order_idx, is_active, is_default').order('list_key').order('order_idx'),
  ])
  if (listsRes.error) throw listsRes.error
  if (valuesRes.error) throw valuesRes.error

  const labelByKey = new Map<string, string>()
  for (const l of (listsRes.data ?? []) as any[]) labelByKey.set(l.key, l.label)

  const rows = ((valuesRes.data ?? []) as any[]).map(v => ({
    'Clé liste': v.list_key,
    'Liste': labelByKey.get(v.list_key) ?? v.list_key,
    'Code': v.code,
    'Libellé': v.label,
    'Couleur': v.color ?? '',
    'Ordre': v.order_idx ?? 0,
    'Par défaut': v.is_default ? 'Oui' : '',
    'Actif': v.is_active ? 'Oui' : 'Non',
  }))

  const ws = XLSX.utils.json_to_sheet(rows, { header: XLSX_HEADERS as unknown as string[] })
  // Largeurs de colonnes lisibles
  ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 7 }, { wch: 10 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Référentiels')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

// Lecture tolérante d'une cellule par en-tête (insensible accents/casse/espaces)
function norm(s: string): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function cellByHeader(row: Record<string, any>, candidates: string[]): any {
  const keys = Object.keys(row)
  for (const cand of candidates) {
    const hit = keys.find(k => norm(k) === norm(cand))
    if (hit !== undefined) return row[hit]
  }
  return undefined
}
function parseBool(v: any, fallback: boolean): boolean {
  if (v === undefined || v === null || String(v).trim() === '') return fallback
  return ['oui', 'yes', 'true', 'vrai', '1', 'x', '✓', 'o'].includes(norm(String(v)))
}

/**
 * Importe un classeur Excel exporté (ou édité). Upsert idempotent
 * (clé naturelle list_key + code). Ne supprime jamais de valeur existante.
 */
export async function importReferentielsXlsx(file: File): Promise<{ lists: number; values: number; skipped: number }> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('Le fichier ne contient aucune feuille.')
  const raw = XLSX.utils.sheet_to_json(ws) as Record<string, any>[]
  if (raw.length === 0) throw new Error('La feuille est vide.')

  const listLabels = new Map<string, string>()   // key → label
  const values: any[] = []
  let skipped = 0

  raw.forEach((row, idx) => {
    const listKey = String(cellByHeader(row, ['Clé liste', 'cle liste', 'list_key', 'liste_cle']) ?? '').trim()
    const code = String(cellByHeader(row, ['Code', 'code']) ?? '').trim()
    if (!listKey || !code) { skipped++; return }  // ligne incomplète ignorée

    const listLabel = String(cellByHeader(row, ['Liste', 'nom liste', 'label']) ?? listKey).trim()
    if (!listLabels.has(listKey)) listLabels.set(listKey, listLabel)

    const ordreRaw = cellByHeader(row, ['Ordre', 'order', 'order_idx'])
    values.push({
      list_key: listKey,
      code: code.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      label: String(cellByHeader(row, ['Libellé', 'libelle', 'label']) ?? code).trim(),
      color: (() => { const c = cellByHeader(row, ['Couleur', 'color']); return c ? String(c).trim() : null })(),
      order_idx: Number.isFinite(Number(ordreRaw)) && String(ordreRaw).trim() !== '' ? Number(ordreRaw) : idx + 1,
      is_default: parseBool(cellByHeader(row, ['Par défaut', 'par defaut', 'defaut', 'default', 'is_default']), false),
      is_active: parseBool(cellByHeader(row, ['Actif', 'active', 'is_active']), true),
    })
  })

  if (values.length === 0) throw new Error('Aucune ligne valide (colonnes « Clé liste » et « Code » requises).')

  // 1. Upsert des listes (key + label ; description préservée car non fournie)
  const lists = Array.from(listLabels.entries()).map(([key, label]) => ({ key, label }))
  const { error: lErr } = await supabase.from('reference_lists').upsert(lists, { onConflict: 'key' })
  if (lErr) throw lErr

  // 2. Upsert des valeurs
  const { error: vErr } = await supabase.from('reference_values').upsert(values, { onConflict: 'list_key,code' })
  if (vErr) throw vErr

  return { lists: lists.length, values: values.length, skipped }
}
