// ============================================================
// lib/crops.ts
//
// Cultures (crops) + catalogue de variétés suggérées.
// Une variété appartient à une culture (varieties.crop_id).
// ============================================================

import { supabase } from './supabase'
import { requireReferenceDomain, requireClientReferenceWrite, clientReferenceIsolationEnabled } from './clientReferenceScope'
import { assertClientReferenceIsolation } from './clientReferenceReadiness'

export interface Crop {
  id: string
  code: string
  name: string
  family: string | null
  icon: string | null
  color: string | null
  cycle_days_first_harvest: number | null
  harvest_duration_days: number | null
  default_unit: string
  brix_relevant: boolean
  default_markets: string[]
  variety_segments: string[]
  is_active: boolean
  order_idx: number
  notes: string | null
}

export interface CatalogVariety {
  id: string
  crop_code: string
  name: string
  segment: string | null
  breeder: string | null
  traits: string | null
  verified: boolean
  order_idx: number
}

export async function listCrops(domainId: string, opts?: { activeOnly?: boolean }): Promise<Crop[]> {
  const domain = requireReferenceDomain(domainId)
  let q = supabase.from('crops').select('*').order('order_idx')
  if (clientReferenceIsolationEnabled()) q = q.eq('domain_id', domain)
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Crop[]
}

export async function updateCrop(id: string, patch: Partial<Crop>, domainId: string): Promise<void> {
  requireClientReferenceWrite(domainId)
  if ('domain_id' in patch || 'id' in patch) throw new Error('Le propriétaire et l’identifiant d’une culture ne peuvent pas être modifiés.')
  const domain = await assertClientReferenceIsolation(domainId, supabase)
  const { data, error } = await supabase.from('crops').update(patch).eq('id', id).eq('domain_id', domain).select('id').single()
  if (error) throw error
  if (!data) throw new Error('Culture inaccessible pour ce client.')
}

export async function toggleCropActive(id: string, isActive: boolean, domainId: string): Promise<void> {
  await updateCrop(id, { is_active: isActive }, domainId)
}

export async function listCatalog(cropCode: string, domainId: string): Promise<CatalogVariety[]> {
  const domain = requireReferenceDomain(domainId)
  let query = supabase
    .from('crop_variety_catalog')
    .select('*')
    .eq('crop_code', cropCode)
    .order('order_idx')
  if (clientReferenceIsolationEnabled()) query = query.eq('domain_id', domain)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CatalogVariety[]
}

function slugCode(cropCode: string, name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  return `${cropCode.slice(0, 3).toUpperCase()}-${base}`
}

/**
 * Importe des variétés du catalogue vers la table varieties (1-clic).
 * Crée une variété par item ; ignore les codes déjà présents.
 * Retourne { created, skipped }.
 */
export async function importCatalogVarieties(
  crop: Pick<Crop, 'id' | 'code'>,
  items: CatalogVariety[],
  domainId: string,
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const domain = await assertClientReferenceIsolation(domainId, supabase)
  const { data: ownedCrop, error: cropError } = await supabase.from('crops').select('id').eq('id', crop.id).eq('domain_id', domain).single()
  if (cropError || !ownedCrop) throw new Error('Culture inaccessible pour ce client.')
  // Codes existants pour éviter les collisions
  const { data: existing, error: existingError } = await supabase.from('varieties').select('code').eq('domain_id', domain)
  if (existingError) throw existingError
  const taken = new Set((existing ?? []).map((v: any) => v.code))

  let created = 0, skipped = 0
  const errors: string[] = []

  for (const it of items) {
    let code = slugCode(crop.code, it.name)
    if (taken.has(code)) { skipped++; continue }
    // collision improbable mais on suffixe si besoin
    let n = 1
    while (taken.has(code)) { code = `${slugCode(crop.code, it.name)}-${n++}` }
    const { error } = await supabase.from('varieties').insert({
      domain_id: domain,
      code,
      commercial_name: it.name,
      type: it.segment ?? 'autre',
      destination: 'mixte',
      crop_id: crop.id,
      technical_notes: [it.breeder, it.traits].filter(Boolean).join(' — ') || null,
    })
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) skipped++
      else errors.push(`${it.name}: ${error.message}`)
    } else {
      taken.add(code); created++
    }
  }
  return { created, skipped, errors }
}
