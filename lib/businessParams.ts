// ============================================================
// lib/businessParams.ts
//
// Paramètres métier paramétrables (app_settings clé 'business_params') :
//   • coefficients saisonniers des prix (par mois)
//   • freinte / écart par défaut (export & local)
//
// Utilisés par le générateur de commerce et le modal de tri (/recoltes).
// ============================================================

import { supabase } from './supabase'

export interface BusinessParams {
  seasonal_coefficients: Record<string, number> // '1'..'12' → coefficient
  default_freinte_export: number
  default_freinte_local: number
  default_ecart_export: number
  default_ecart_local: number
  freinte_max_pct: number
  ecart_max_pct: number
}

const DEFAULTS: BusinessParams = {
  seasonal_coefficients: {
    '1': 1.20, '2': 1.20, '3': 1.05, '4': 1.05,
    '5': 0.85, '6': 0.85, '7': 1.00, '8': 1.00,
    '9': 1.00, '10': 1.00, '11': 1.05, '12': 1.20,
  },
  default_freinte_export: 2.0,
  default_freinte_local: 1.5,
  default_ecart_export: 3.5,
  default_ecart_local: 2.5,
  freinte_max_pct: 5.0,
  ecart_max_pct: 8.0,
}

let _cache: BusinessParams | null = null

export async function getBusinessParams(): Promise<BusinessParams> {
  if (_cache) return _cache
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'business_params')
    .maybeSingle()
  if (error || !data) { _cache = DEFAULTS; return _cache }
  // Merge avec les defaults pour combler les clés manquantes
  const v = (data.value ?? {}) as Partial<BusinessParams>
  _cache = {
    ...DEFAULTS,
    ...v,
    seasonal_coefficients: { ...DEFAULTS.seasonal_coefficients, ...(v.seasonal_coefficients ?? {}) },
  }
  return _cache
}

export async function updateBusinessParams(patch: Partial<BusinessParams>): Promise<BusinessParams> {
  const current = await getBusinessParams()
  const next: BusinessParams = {
    ...current,
    ...patch,
    seasonal_coefficients: { ...current.seasonal_coefficients, ...(patch.seasonal_coefficients ?? {}) },
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'business_params', value: next }, { onConflict: 'key' })
  if (error) throw error
  _cache = next
  return next
}

/** Coefficient saisonnier d'un mois (1-12). Fallback 1.0. Synchrone (cache requis). */
export function seasonCoeffOf(month: number, params?: BusinessParams): number {
  const p = params ?? _cache ?? DEFAULTS
  return p.seasonal_coefficients[String(month)] ?? 1.0
}
