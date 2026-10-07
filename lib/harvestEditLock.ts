import { supabase } from '@/lib/supabase'

/** Partial sends and legacy direct links, with no date cutoff. */
export async function sentHarvestIds(domainId: string, harvestIds: string[]): Promise<Set<string>> {
  const sent = new Set<string>()
  for (let batch = 0; batch < harvestIds.length; batch += 100) {
    const ids = harvestIds.slice(batch, batch + 100)
    for (const source of ['sources', 'direct'] as const) {
      for (let start = 0; ; start += 500) {
        const query = source === 'sources'
          ? supabase.from('harvest_lot_sources').select('harvest_id,harvests!inner(domain_id)').eq('harvests.domain_id', domainId)
          : supabase.from('harvest_lots').select('harvest_id').eq('domain_id', domainId).eq('category', 'station_dispatch')
        const { data, error } = await query.in('harvest_id', ids).order('id').range(start, start + 499)
        if (error) throw error
        for (const row of data || []) if (row.harvest_id) sent.add(row.harvest_id)
        if (!data || data.length < 500) break
      }
    }
  }
  return sent
}
