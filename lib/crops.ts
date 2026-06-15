// ============================================================
// lib/crops.ts
//
// Cultures (crops) + catalogue de variétés suggérées.
// Une variété appartient à une culture (varieties.crop_id).
// ============================================================

import { supabase } from './supabase'

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

export async function listCrops(opts?: { activeOnly?: boolean }): Promise<Crop[]> {
  let q = supabase.from('crops').select('*').order('order_idx')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Crop[]
}

export async function updateCrop(id: string, patch: Partial<Crop>): Promise<void> {
  const { error } = await supabase.from('crops').update(patch).eq('id', id)
  if (error) throw error
}

export async function toggleCropActive(id: string, isActive: boolean): Promise<void> {
  await updateCrop(id, { is_active: isActive })
}

export async function listCatalog(cropCode: string): Promise<CatalogVariety[]> {
  const { data, error } = await supabase
    .from('crop_variety_catalog')
    .select('*')
    .eq('crop_code', cropCode)
    .order('order_idx')
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
): Promise<{ created: number; skipped: number; errors: string[] }> {
  // Codes existants pour éviter les collisions
  const { data: existing } = await supabase.from('varieties').select('code')
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
      code,
      commercial_name: it.name,
      type: it.segment ?? 'autre',
      destination: 'mixte',
      crop_id: crop.id,
      notes: [it.breeder, it.traits].filter(Boolean).join(' — ') || null,
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
