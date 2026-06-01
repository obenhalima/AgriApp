// ============================================================
// lib/appSettings.ts
//
// Accès aux paramètres globaux de l'application stockés dans
// la table `app_settings` (key-value JSONB).
//
// Convention : chaque clé a un type TypeScript correspondant.
// ============================================================

import { supabase } from './supabase'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export interface OrganizationSettings {
  name: string
  tagline?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  tax_id?: string | null
  logo_url?: string | null
}

export interface CurrentCampaignSetting {
  /** ID explicite de la campagne live, ou NULL = auto-détection via status=en_cours */
  id: string | null
}

// Valeurs par défaut (utilisées si la table n'a pas encore été migrée)
const DEFAULT_ORG: OrganizationSettings = {
  name: 'Domaine BENHALIMA',
  tagline: 'Production maraîchère',
  country: 'Maroc',
}

// ───────────────────────────────────────────────────────────
// Lecture
// ───────────────────────────────────────────────────────────

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  // Si la table n'existe pas encore (PGRST205) ou pas de ligne → fallback
  if (error || !data) return fallback
  return (data.value as T) ?? fallback
}

export async function getOrganization(): Promise<OrganizationSettings> {
  return getSetting<OrganizationSettings>('organization', DEFAULT_ORG)
}

export async function getCurrentCampaignId(): Promise<string | null> {
  const setting = await getSetting<CurrentCampaignSetting>('current_campaign_id', { id: null })
  return setting.id
}

/**
 * Résout la campagne "live" :
 *   1. Si l'admin a explicitement choisi une campagne (current_campaign_id.id) → la retourne
 *   2. Sinon, prend la première campagne `status='en_cours'`
 *   3. Sinon → null
 */
export async function getLiveCampaign(): Promise<{
  id: string
  code: string
  name: string
  source: 'manual' | 'auto'
} | null> {
  const explicitId = await getCurrentCampaignId()

  if (explicitId) {
    const { data } = await supabase
      .from('campaigns')
      .select('id, code, name')
      .eq('id', explicitId)
      .maybeSingle()
    if (data) return { ...data, source: 'manual' }
  }

  // Auto : prend la première en_cours (ou la plus récente preparation_start)
  const { data } = await supabase
    .from('campaigns')
    .select('id, code, name')
    .eq('status', 'en_cours')
    .order('preparation_start', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return data ? { ...data, source: 'auto' } : null
}

// ───────────────────────────────────────────────────────────
// Écriture (admin uniquement, géré par RLS)
// ───────────────────────────────────────────────────────────

export async function updateOrganization(patch: Partial<OrganizationSettings>): Promise<OrganizationSettings> {
  const current = await getOrganization()
  const next = { ...current, ...patch }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'organization', value: next }, { onConflict: 'key' })
  if (error) throw error
  return next
}

export async function setCurrentCampaignId(id: string | null): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'current_campaign_id', value: { id } },
      { onConflict: 'key' },
    )
  if (error) throw error
}
