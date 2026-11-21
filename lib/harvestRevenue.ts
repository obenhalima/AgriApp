import {pricedDispatch} from './pricedDispatches'

export type HarvestRevenueEntry = {
  id: string; dispatch_id: string; dispatch_date: string | null; recognition_date: string | null
  harvest_id: string | null; harvest: any; planting: any; source_kg: number | null
  qty: number; amount: number; price: number; share: number
  issue: 'missing_source' | 'missing_date' | 'invalid_quantity' | null
  lot: any; pricing: NonNullable<ReturnType<typeof pricedDispatch>>
}
const one = (value: any) => Array.isArray(value) ? value.length === 1 ? value[0] : null : value
function harvestDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}
function splitCents(amount: number, weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0), cents = Math.round(amount * 100)
  const parts = weights.map((weight, index) => {const raw = cents * weight / total; return {index, cents: Math.floor(raw), fraction: raw - Math.floor(raw)}})
  let rest = cents - parts.reduce((sum, part) => sum + part.cents, 0)
  for (const part of [...parts].sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {if (rest-- <= 0) break; part.cents++}
  return parts.map(part => part.cents / 100)
}

// An envoi's date stays a logistics date. Only the source harvest establishes
// the revenue date. Keep undated amounts visible as issues, never backdate them
// to dispatch, invoice, settlement or payment dates.
export function allocateHarvestRevenue(lot: any, allSources: any[], allocations: any[]): HarvestRevenueEntry[] {
  const pricing = pricedDispatch(lot, allocations)
  if (!pricing) return []
  const sources = allSources.filter(source => source.harvest_lot_id === lot.id).sort((a, b) => String(a.harvest_id || a.id).localeCompare(String(b.harvest_id || b.id)))
  const base = {dispatch_id: lot.id, dispatch_date: lot.harvest_date || null, price: pricing.price, lot, pricing}
  const unresolved = (issue: HarvestRevenueEntry['issue']): HarvestRevenueEntry[] => [{...base, id: `${lot.id}:unassigned`, recognition_date: null,
    harvest_id: null, harvest: null, planting: lot.campaign_plantings || null, source_kg: null, qty: pricing.qty, amount: Math.round(pricing.amount * 100) / 100, share: 1, issue}]
  const owned = (harvest: any) => harvest && (!lot.domain_id || harvest.domain_id === lot.domain_id) ? harvest : null
  if (!sources.length) {
    const harvest = owned(one(lot.harvests))
    if (!harvest || !lot.harvest_id || harvest.id !== lot.harvest_id) return unresolved('missing_source')
    const date = harvestDate(harvest.harvest_date)
    return [{...base, id: `${lot.id}:${harvest.id}`, recognition_date: date, harvest_id: harvest.id, harvest,
      planting: harvest.campaign_plantings || lot.campaign_plantings || null, source_kg: null, qty: pricing.qty,
      amount: Math.round(pricing.amount * 100) / 100, share: 1, issue: date ? null : 'missing_date'}]
  }
  const weights = sources.map(source => Number(source.qty_contributed_kg))
  if (weights.some(weight => !Number.isFinite(weight) || weight <= 0)) return unresolved('invalid_quantity')
  const total = weights.reduce((sum, value) => sum + value, 0)
  const amounts = splitCents(pricing.amount, weights)
  return sources.map((source, index) => {
    const harvest = owned(one(source.harvests)), date = harvestDate(harvest?.harvest_date)
    return {...base, id: `${lot.id}:${source.id || source.harvest_id}`, recognition_date: date,
      harvest_id: source.harvest_id || harvest?.id || null, harvest, planting: harvest?.campaign_plantings || null,
      source_kg: weights[index], qty: pricing.qty * weights[index] / total, amount: amounts[index], share: weights[index] / total,
      issue: !harvest ? 'missing_source' : date ? null : 'missing_date'}
  })
}
