import {supabase} from './supabase'
import {allocateHarvestRevenue} from './harvestRevenue'

export async function readHarvestRevenue(domain: string, options: {plantingSelect?: string; marketSelect?: string; lotExtras?: string; settlementExtras?: string; signal?: AbortSignal; includeTrays?: boolean} = {}) {
  const planting = options.plantingSelect || 'id,campaign_id,greenhouse_id,variety_id,greenhouses(farm_id),varieties!campaign_plantings_variety_id_fkey(commercial_name)'
  const harvest = `id,domain_id,lot_number,harvest_date,campaign_planting_id,campaign_plantings(${planting})`
  async function pages(make: () => any) {
    const rows: any[] = []
    for (let offset = 0; ; offset += 500) {
      let query = make().order('id').range(offset, offset + 499)
      if (options.signal) query = query.abortSignal(options.signal)
      const {data, error} = await query
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < 500) return rows
    }
  }
  const [lots, allocations, sources, trayLines] = await Promise.all([
    pages(() => supabase.from('harvest_lots').select(`id,domain_id,harvest_id,harvest_date,tri_status,qty_priced_kg,qty_acceptee_kg,ca_amount,markets!harvest_lots_market_id_fkey(${options.marketSelect || 'type,currency'}),campaign_plantings(${planting}),harvests!harvest_lots_harvest_id_fkey(${harvest})${options.lotExtras ? `,${options.lotExtras}` : ''}`)
      .eq('domain_id', domain).eq('category', 'station_dispatch').eq('harvests.domain_id', domain)),
    pages(() => supabase.from('station_settlement_allocations').select(`id,harvest_lot_id,qty_allocated_kg,amount_allocated,price_per_kg,harvest_lots!inner(domain_id),station_settlement_lines(station_settlements!station_settlement_lines_settlement_id_fkey(status${options.settlementExtras ? `,${options.settlementExtras}` : ''}))`).eq('harvest_lots.domain_id', domain)),
    // Only the lot join is INNER: retain the weight of an inaccessible source
    // rather than reallocating its money to the other, accessible harvests.
    pages(() => supabase.from('harvest_lot_sources').select(`id,harvest_id,harvest_lot_id,qty_contributed_kg,harvest_lots!inner(domain_id),harvests(${harvest})`)
      .eq('harvest_lots.domain_id', domain).eq('harvests.domain_id', domain)),
    options.includeTrays ? pages(()=>supabase.from('harvest_tray_lines').select('id,harvest_id,tray_type_code,tray_type_label,nb_trays,poids_unitaire_kg,line_kg,harvests!inner(domain_id)').eq('harvests.domain_id',domain)) : Promise.resolve([]),
  ])
  return {lots, allocations, sources, trayLines, entries: lots.flatMap(lot => allocateHarvestRevenue(lot, sources, allocations))}
}
