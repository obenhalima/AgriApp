import { describe, it, expect, vi, beforeEach } from 'vitest'
const mock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }))
import { sentHarvestIds } from './harvestEditLock'

describe('harvest edit lock', () => {
  beforeEach(() => mock.from.mockReset())
  function fixture(sources: any[], direct: any[], error: any = null) {
    mock.from.mockImplementation((table: string) => {
      const q: any = {}
      for (const method of ['select', 'eq', 'in', 'order']) q[method] = vi.fn(() => q)
      q.range = vi.fn(async (from: number, to: number) => ({ data: (table === 'harvest_lot_sources' ? sources : direct).slice(from, to + 1), error }))
      return q
    })
  }
  it('keeps unsent harvests editable', async () => {
    fixture([], [])
    expect(await sentHarvestIds('domain', ['unsent'])).toEqual(new Set())
  })
  it('locks partial, grouped and legacy sends without a date cutoff', async () => {
    fixture([{ harvest_id: 'partial' }, { harvest_id: 'grouped' }], [{ harvest_id: 'old' }])
    expect(await sentHarvestIds('domain', ['partial', 'grouped', 'old', 'unsent'])).toEqual(new Set(['partial', 'grouped', 'old']))
    const queries = mock.from.mock.results.map(r => r.value)
    expect(queries[0].eq).toHaveBeenCalledWith('harvests.domain_id', 'domain')
    expect(queries[1].eq).toHaveBeenCalledWith('category', 'station_dispatch')
  })
  it('reads beyond the first page', async () => {
    fixture([...Array.from({ length: 500 }, () => ({ harvest_id: 'a' })), { harvest_id: 'b' }], [])
    expect(await sentHarvestIds('domain', ['a', 'b'])).toEqual(new Set(['a', 'b']))
  })
  it('does not treat a failed lookup as an editable harvest', async () => {
    fixture([], [], new Error('lookup failed'))
    await expect(sentHarvestIds('domain', ['a'])).rejects.toThrow('lookup failed')
  })
})
