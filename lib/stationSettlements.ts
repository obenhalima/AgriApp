// ============================================================
// lib/stationSettlements.ts
//
// Helpers pour la gestion des Bordereaux station (settlements).
//
// Workflow type :
//   1. listSettlements() — affiche tous les bordereaux (brouillon + validés)
//   2. createSettlement(periodStart, periodEnd) — crée un brouillon
//   3. loadPricingMatrix(settlementId) — construit le tableau editable
//      (market × variety × farm) avec qty et prix par défaut
//   4. saveSettlementLines() — upsert des lignes en bulk
//   5. validateSettlement(id) — appelle la RPC FIFO
//   6. unvalidateSettlement(id) — annule la validation
// ============================================================

import { supabase } from './supabase'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export type SettlementStatus = 'brouillon' | 'valide'

export interface Settlement {
  id: string
  code: string
  period_start: string
  period_end: string
  received_date: string
  expected_payment_date?: string | null
  invoice_id?: string | null
  status: SettlementStatus
  total_amount: number
  total_qty_kg: number
  notes?: string | null
  validated_at?: string | null
  validated_by?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface SettlementLine {
  id: string
  settlement_id: string
  farm_id: string | null
  market_id: string
  variety_id: string
  qty_kg: number
  price_per_kg: number
  amount: number
  notes?: string | null
  created_at: string
}

export interface SettlementAllocation {
  id: string
  settlement_line_id: string
  harvest_lot_id: string
  qty_allocated_kg: number
  price_per_kg: number
  amount_allocated: number
  created_at: string
}

export interface UnpricedLotSummary {
  market_id: string
  market_name: string
  variety_id: string
  variety_name: string
  farm_id: string | null
  farm_name: string | null
  total_qty_kg: number  // somme des (qty_acceptee_kg - qty_priced_kg)
  lots_count: number
}

// ───────────────────────────────────────────────────────────
// Helpers semaine ISO
// ───────────────────────────────────────────────────────────

/**
 * Retourne le lundi et le dimanche de la semaine ISO d'une date.
 */
export function getIsoWeekRange(date: Date = new Date()): { monday: Date; sunday: Date } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7  // dimanche=0 → 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1))  // recule au lundi
  const monday = new Date(d)
  const sunday = new Date(d)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  return { monday, sunday }
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Convertit une chaîne ISO week 'YYYY-Www' (format de `<input type="week">`)
 * vers le lundi et dimanche correspondants.
 *
 * Exemple : '2026-W23' → { monday: 2026-06-01, sunday: 2026-06-07, year: 2026, week: 23 }
 */
export function isoWeekStringToRange(isoWeek: string): {
  monday: Date
  sunday: Date
  year: number
  week: number
} | null {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(isoWeek.trim())
  if (!m) return null
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  if (week < 1 || week > 53) return null

  // ISO 8601 : la semaine 1 est celle qui contient le 4 janvier.
  // Donc le lundi de la semaine N = lundi de la semaine du 4 jan + (N-1)*7 jours
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7  // dim=0 → 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))

  const monday = new Date(week1Monday)
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  return { monday, sunday, year, week }
}

/**
 * Format inverse : Date → 'YYYY-Www' (compatible avec <input type="week">)
 */
export function dateToIsoWeekString(date: Date): string {
  const { year, week } = getIsoWeekNumber(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Numéro de semaine ISO (1-53)
 */
export function getIsoWeekNumber(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

// ───────────────────────────────────────────────────────────
// Listing & lecture
// ───────────────────────────────────────────────────────────

export async function listSettlements(limit = 50): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from('station_settlements')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Settlement[]
}

export async function getSettlement(id: string): Promise<Settlement | null> {
  const { data, error } = await supabase
    .from('station_settlements')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Settlement
}

export async function getSettlementLines(settlementId: string): Promise<SettlementLine[]> {
  const { data, error } = await supabase
    .from('station_settlement_lines')
    .select('*')
    .eq('settlement_id', settlementId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as SettlementLine[]
}

export async function getSettlementAllocations(settlementId: string): Promise<SettlementAllocation[]> {
  const { data, error } = await supabase
    .from('station_settlement_allocations')
    .select('*, station_settlement_lines!inner(settlement_id)')
    .eq('station_settlement_lines.settlement_id', settlementId)
  if (error) throw error
  return (data ?? []) as SettlementAllocation[]
}

// ───────────────────────────────────────────────────────────
// Stock disponible (lots triés non encore tarifés)
// ───────────────────────────────────────────────────────────

/**
 * Récupère le stock de lots triés non tarifés, agrégé par (market × variety × farm).
 * Utilisé pour pré-remplir la matrice de saisie du bordereau.
 */
export async function getUnpricedLotsSummary(): Promise<UnpricedLotSummary[]> {
  const { data, error } = await supabase
    .from('harvest_lots')
    .select(`
      id,
      qty_acceptee_kg,
      qty_priced_kg,
      market_id,
      variety_id,
      greenhouse_id,
      markets ( name ),
      varieties ( commercial_name ),
      greenhouses ( farm_id, farms ( name ) )
    `)
    .eq('tri_status', 'tried')
    .eq('category', 'station_dispatch')

  if (error) throw error

  // Agrégation côté client (groupe par market × variety × farm)
  const buckets = new Map<string, UnpricedLotSummary>()
  for (const row of (data ?? []) as any[]) {
    const remaining = Number(row.qty_acceptee_kg ?? 0) - Number(row.qty_priced_kg ?? 0)
    if (remaining <= 0) continue

    const farmId: string | null = row.greenhouses?.farm_id ?? null
    const farmName: string | null = row.greenhouses?.farms?.name ?? null
    const key = `${row.market_id}::${row.variety_id}::${farmId ?? 'null'}`

    const existing = buckets.get(key)
    if (existing) {
      existing.total_qty_kg += remaining
      existing.lots_count += 1
    } else {
      buckets.set(key, {
        market_id: row.market_id,
        market_name: row.markets?.name ?? '(marché ?)',
        variety_id: row.variety_id,
        variety_name: row.varieties?.commercial_name ?? '(variété ?)',
        farm_id: farmId,
        farm_name: farmName,
        total_qty_kg: remaining,
        lots_count: 1,
      })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => {
    const c1 = a.market_name.localeCompare(b.market_name)
    if (c1 !== 0) return c1
    return a.variety_name.localeCompare(b.variety_name)
  })
}

// ───────────────────────────────────────────────────────────
// Création / édition
// ───────────────────────────────────────────────────────────

export async function createSettlement(params: {
  period_start: string
  period_end: string
  received_date?: string
  notes?: string
}): Promise<Settlement> {
  const { data, error } = await supabase
    .from('station_settlements')
    .insert({
      period_start: params.period_start,
      period_end: params.period_end,
      received_date: params.received_date ?? new Date().toISOString().slice(0, 10),
      notes: params.notes,
      status: 'brouillon',
      // code laissé NULL : auto-généré par trigger trg_settlement_gen_code
    })
    .select()
    .single()
  if (error) throw error
  return data as Settlement
}

/**
 * Crée le bordereau d'une semaine ISO arbitraire (lundi → dimanche), idempotent :
 * si un bordereau existe déjà pour cette semaine, le retourne directement.
 *
 * Accepte soit une chaîne ISO 'YYYY-Www', soit une Date quelconque
 * (sera arrondie au lundi de sa semaine ISO).
 */
export async function createSettlementForWeek(input: string | Date): Promise<Settlement> {
  let monday: Date
  let sunday: Date

  if (typeof input === 'string') {
    const r = isoWeekStringToRange(input)
    if (!r) throw new Error(`Semaine invalide : "${input}" — attendu format YYYY-Www`)
    monday = r.monday
    sunday = r.sunday
  } else {
    const r = getIsoWeekRange(input)
    monday = r.monday
    sunday = r.sunday
  }

  const ps = formatDateOnly(monday)
  const pe = formatDateOnly(sunday)

  // Cherche un existant pour cette semaine
  const { data: existing } = await supabase
    .from('station_settlements')
    .select('*')
    .eq('period_start', ps)
    .eq('period_end', pe)
    .maybeSingle()

  if (existing) return existing as Settlement

  return createSettlement({ period_start: ps, period_end: pe })
}

/**
 * Raccourci pour la semaine courante.
 */
export async function createCurrentWeekSettlement(): Promise<Settlement> {
  return createSettlementForWeek(new Date())
}

export interface LineInput {
  farm_id: string | null
  market_id: string
  variety_id: string
  qty_kg: number
  price_per_kg: number
  notes?: string
}

/**
 * Upsert en bulk des lignes du bordereau.
 * On supprime celles dont qty_kg <= 0, on upsert les autres
 * (sur la clé UNIQUE settlement_id, farm_id, market_id, variety_id).
 *
 * Note : Postgres UNIQUE traite NULL comme distinct, donc on doit gérer
 * manuellement les lignes farm_id=NULL (on les efface puis on insère).
 */
export async function saveSettlementLines(
  settlementId: string,
  lines: LineInput[],
): Promise<void> {
  // 1. Efface tout pour repartir propre — simple et atomique côté UI
  const { error: delErr } = await supabase
    .from('station_settlement_lines')
    .delete()
    .eq('settlement_id', settlementId)
  if (delErr) throw delErr

  // 2. Insère uniquement les lignes avec qty_kg > 0
  const toInsert = lines
    .filter((l) => Number(l.qty_kg) > 0 && Number(l.price_per_kg) >= 0)
    .map((l) => ({
      settlement_id: settlementId,
      farm_id: l.farm_id,
      market_id: l.market_id,
      variety_id: l.variety_id,
      qty_kg: l.qty_kg,
      price_per_kg: l.price_per_kg,
      notes: l.notes ?? null,
    }))

  if (toInsert.length === 0) return

  const { error: insErr } = await supabase
    .from('station_settlement_lines')
    .insert(toInsert)
  if (insErr) throw insErr
}

export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabase
    .from('station_settlements')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ───────────────────────────────────────────────────────────
// Validation FIFO (RPC)
// ───────────────────────────────────────────────────────────

export interface ValidationResult {
  success: boolean
  settlement_id: string
  settlement_code: string
  allocations_created: number
  lots_fully_priced: number
}

export interface UnvalidationResult {
  success: boolean
  settlement_id: string
  settlement_code: string
  allocations_removed: number
}

export async function validateSettlement(id: string): Promise<ValidationResult> {
  const { data, error } = await supabase.rpc('admin_validate_station_settlement', {
    p_settlement_id: id,
  })
  if (error) {
    // Détection RPC manquante (PGRST202 ou message)
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /does not exist/i.test(error.message ?? '')
    ) {
      throw new Error(
        "La RPC admin_validate_station_settlement n'est pas déployée. " +
        "Appliquer la migration 041_admin_validate_settlement.sql sur Supabase.",
      )
    }
    throw error
  }
  return data as ValidationResult
}

export async function unvalidateSettlement(id: string): Promise<UnvalidationResult> {
  const { data, error } = await supabase.rpc('admin_unvalidate_station_settlement', {
    p_settlement_id: id,
  })
  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /does not exist/i.test(error.message ?? '')
    ) {
      throw new Error(
        "La RPC admin_unvalidate_station_settlement n'est pas déployée. " +
        "Appliquer la migration 041_admin_validate_settlement.sql sur Supabase.",
      )
    }
    throw error
  }
  return data as UnvalidationResult
}

// ───────────────────────────────────────────────────────────
// Construction matrice pour saisie
// ───────────────────────────────────────────────────────────

export interface MatrixRow {
  key: string  // market_id::variety_id::farm_id (ou 'null')
  market_id: string
  market_name: string
  variety_id: string
  variety_name: string
  farm_id: string | null
  farm_name: string | null
  available_kg: number     // stock dispo (somme des lots non tarifés)
  qty_kg: number           // saisi par l'utilisateur
  price_per_kg: number     // saisi par l'utilisateur
  amount: number           // qty × price (calculé live)
  existing_line_id?: string
}

/**
 * Construit la matrice de saisie en croisant :
 *   - le stock disponible (UnpricedLotsSummary)
 *   - les lignes déjà saisies dans le bordereau (si édition)
 */
export async function buildMatrix(settlementId: string | null): Promise<MatrixRow[]> {
  const [stock, lines] = await Promise.all([
    getUnpricedLotsSummary(),
    settlementId ? getSettlementLines(settlementId) : Promise.resolve([] as SettlementLine[]),
  ])

  // Map des lignes existantes par clé
  const lineByKey = new Map<string, SettlementLine>()
  for (const l of lines) {
    const key = `${l.market_id}::${l.variety_id}::${l.farm_id ?? 'null'}`
    lineByKey.set(key, l)
  }

  // Base : on part du stock dispo
  const rows: MatrixRow[] = stock.map((s) => {
    const key = `${s.market_id}::${s.variety_id}::${s.farm_id ?? 'null'}`
    const line = lineByKey.get(key)
    return {
      key,
      market_id: s.market_id,
      market_name: s.market_name,
      variety_id: s.variety_id,
      variety_name: s.variety_name,
      farm_id: s.farm_id,
      farm_name: s.farm_name,
      available_kg: s.total_qty_kg,
      qty_kg: line ? Number(line.qty_kg) : 0,
      price_per_kg: line ? Number(line.price_per_kg) : 0,
      amount: line ? Number(line.amount) : 0,
      existing_line_id: line?.id,
    }
  })

  // Ajoute les lignes existantes qui n'ont plus de stock (ex: déjà tout consommé)
  // — utile pour affichage seul en mode validé
  for (const l of lines) {
    const key = `${l.market_id}::${l.variety_id}::${l.farm_id ?? 'null'}`
    if (!rows.find((r) => r.key === key)) {
      rows.push({
        key,
        market_id: l.market_id,
        market_name: '(marché)',
        variety_id: l.variety_id,
        variety_name: '(variété)',
        farm_id: l.farm_id,
        farm_name: null,
        available_kg: 0,
        qty_kg: Number(l.qty_kg),
        price_per_kg: Number(l.price_per_kg),
        amount: Number(l.amount),
        existing_line_id: l.id,
      })
    }
  }

  return rows
}

// ───────────────────────────────────────────────────────────
// Date prévue d'encaissement + facture
// ───────────────────────────────────────────────────────────

/**
 * Calcule la date prévue d'encaissement à partir des lignes d'un bordereau.
 * On prend le MAX des `payment_terms_days` des marchés impliqués (worst case
 * = on n'optimise pas, on est prudent sur le cashflow).
 *
 * Si aucun marché n'a `payment_terms_days` paramétré, on retombe sur 30 jours.
 */
export async function computeExpectedPaymentDate(
  settlementId: string,
  receivedDate: string,
): Promise<{ date: string; maxDays: number; perMarket: Array<{ market_id: string; market_name: string; days: number }> }> {
  const { data, error } = await supabase
    .from('station_settlement_lines')
    .select(`
      market_id,
      markets ( name, payment_terms_days )
    `)
    .eq('settlement_id', settlementId)
  if (error) throw error

  const perMarket = new Map<string, { market_id: string; market_name: string; days: number }>()
  for (const row of (data ?? []) as any[]) {
    const days = Number(row.markets?.payment_terms_days ?? 30) || 30
    perMarket.set(row.market_id, {
      market_id: row.market_id,
      market_name: row.markets?.name ?? '(?)',
      days,
    })
  }

  const list = Array.from(perMarket.values())
  const maxDays = list.length > 0 ? Math.max(...list.map(m => m.days)) : 30

  const base = new Date(receivedDate)
  base.setDate(base.getDate() + maxDays)
  const date = base.toISOString().slice(0, 10)

  return { date, maxDays, perMarket: list }
}

/**
 * Met à jour partiellement un bordereau (date prévue, notes, received_date…).
 * Limité aux bordereaux brouillon — un valide ne devrait pas changer.
 */
export async function updateSettlement(
  id: string,
  patch: Partial<Pick<Settlement, 'expected_payment_date' | 'received_date' | 'notes'>>,
): Promise<Settlement> {
  const { data, error } = await supabase
    .from('station_settlements')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Settlement
}

/**
 * Génère une facture (table invoices) à partir d'un bordereau validé.
 * Appelle la RPC `admin_generate_settlement_invoice`.
 * Idempotente : si la facture existe déjà, retourne son ID.
 */
export interface InvoiceGenResult {
  success: boolean
  created: boolean
  invoice_id: string
  invoice_number?: string
  settlement_code: string
  due_date?: string
  amount?: number
  message?: string
}

export async function generateSettlementInvoice(id: string): Promise<InvoiceGenResult> {
  const { data, error } = await supabase.rpc('admin_generate_settlement_invoice', {
    p_settlement_id: id,
  })
  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /does not exist/i.test(error.message ?? '')
    ) {
      throw new Error(
        "La RPC admin_generate_settlement_invoice n'est pas déployée. " +
        "Appliquer la migration 044_bordereau_payment_invoice.sql sur Supabase.",
      )
    }
    throw error
  }
  return data as InvoiceGenResult
}

