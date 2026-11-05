import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { allocationPreview, type StockAllocationPlanting } from './stockAllocation'

const planting: StockAllocationPlanting = {
  id: 'p1', campaign_id: 'c1', campaign_name: '2026', greenhouse_id: 's1',
  greenhouse_name: 'S1', variety_name: 'Tomate', farm_id: 'f1', farm_name: '501', area: 100,
}
const rows = [planting, { ...planting, id: 'p2', greenhouse_id: 's2', area: 300 }]

describe('Affectation multi-serres', () => {
  it('répartit la quantité au prorata des surfaces sans la multiplier', () => {
    const preview = allocationPreview(rows, ['p2', 'p1'], 40)
    expect(preview.map(p => p.share)).toEqual([0.25, 0.75])
    expect(preview.map(p => p.quantity)).toEqual([10, 30])
  })
  it('refuse une sélection vide, inconnue ou dupliquée', () => {
    for (const ids of [[], ['unknown'], ['p1', 'p1']]) expect(allocationPreview(rows, ids)).toEqual([])
  })
  it('refuse de mélanger fermes ou campagnes', () => {
    for (const changed of [{ farm_id: 'f2' }, { campaign_id: 'c2' }]) {
      expect(allocationPreview([planting, { ...rows[1], ...changed }], ['p1', 'p2'])).toEqual([])
    }
  })
  it('refuse les surfaces nulles ou non finies', () => {
    for (const area of [0, -1, NaN, Infinity]) expect(allocationPreview([{ ...planting, area }], ['p1'])).toEqual([])
  })
})
