// ============================================================
// lib/exchangeRates.ts
//
// Taux de change historisés vers MAD (table exchange_rates).
// Le taux courant d'une paire = la ligne la plus récente (valid_from max).
// ============================================================

import { supabase } from './supabase'

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  valid_from: string
  notes?: string | null
  created_at?: string
}

// Cache des taux courants : 'EUR→MAD' → 11.0
const rateCache = new Map<string, number>()

/**
 * Charge tous les taux courants (le plus récent par paire) et remplit le cache.
 * À appeler une fois au démarrage d'un traitement qui convertit beaucoup.
 */
export async function loadCurrentRates(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('exchange_rates')
    .select('from_currency, to_currency, rate, valid_from')
    .order('valid_from', { ascending: false })

  rateCache.clear()
  for (const r of (data ?? []) as any[]) {
    const key = `${r.from_currency}→${r.to_currency}`
    // On garde seulement le premier (= le plus récent grâce au tri DESC)
    if (!rateCache.has(key)) rateCache.set(key, Number(r.rate))
  }
  return rateCache
}

/**
 * Taux courant d'une devise vers MAD. Utilise le cache si chargé.
 * Fallback : taux fixes connus (EUR 11, USD 10, GBP 12.5), sinon 1.
 */
export function rateToMAD(currency: string): number {
  if (currency === 'MAD') return 1
  const cached = rateCache.get(`${currency}→MAD`)
  if (cached) return cached
  // Fallback hardcodé (si cache pas chargé ou devise inconnue)
  const fallback: Record<string, number> = { EUR: 11, USD: 10, GBP: 12.5 }
  return fallback[currency] ?? 1
}

/**
 * Convertit un montant d'une devise vers MAD (cache requis pour précision).
 */
export function convertToMAD(amount: number, currency: string): number {
  return amount * rateToMAD(currency)
}

// ───────────────────────────────────────────────────────────
// CRUD (admin)
// ───────────────────────────────────────────────────────────

/** Liste les taux courants (1 par paire, le plus récent). */
export async function listCurrentRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .order('from_currency')
    .order('valid_from', { ascending: false })
  if (error) throw error
  // Dédup : garde la ligne la plus récente par paire
  const seen = new Set<string>()
  const out: ExchangeRate[] = []
  for (const r of (data ?? []) as ExchangeRate[]) {
    const key = `${r.from_currency}→${r.to_currency}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Liste l'historique complet d'une paire (pour audit). */
export async function listRateHistory(fromCurrency: string, toCurrency = 'MAD'): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .order('valid_from', { ascending: false })
  if (error) throw error
  return (data ?? []) as ExchangeRate[]
}

/**
 * Définit un nouveau taux (crée une nouvelle ligne datée d'aujourd'hui).
 * Si une ligne existe déjà pour aujourd'hui, elle est mise à jour (upsert).
 */
export async function setRate(input: {
  from_currency: string
  rate: number
  to_currency?: string
  valid_from?: string
  notes?: string
}): Promise<void> {
  const { error } = await supabase
    .from('exchange_rates')
    .upsert({
      from_currency: input.from_currency,
      to_currency: input.to_currency ?? 'MAD',
      rate: input.rate,
      valid_from: input.valid_from ?? new Date().toISOString().slice(0, 10),
      notes: input.notes ?? null,
    }, { onConflict: 'from_currency,to_currency,valid_from' })
  if (error) throw error
  rateCache.set(`${input.from_currency}→${input.to_currency ?? 'MAD'}`, input.rate)
}
