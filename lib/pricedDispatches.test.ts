import { describe, expect, it } from 'vitest'
import { pricedDispatch } from './pricedDispatches'

const lot = { id: 'lot', tri_status: 'priced', qty_acceptee_kg: 100, ca_amount: 900 }
const allocation = (qty: number, amount: number, status = 'valide') => ({ harvest_lot_id: 'lot', qty_allocated_kg: qty, amount_allocated: amount, station_settlement_lines: { station_settlements: { status } } })
describe('priced dispatch report', () => {
  it('uses validated allocations without adding mirrored lot revenue', () => {
    expect(pricedDispatch(lot, [allocation(20, 100), allocation(30, 210)] )).toMatchObject({ qty: 50, amount: 310, price: 6.2, partial: true })
  })
  it('excludes invalidated allocations and their mirrored revenue', () => {
    expect(pricedDispatch(lot, [allocation(100, 900, 'brouillon')])).toBeNull()
  })
  it('supports direct prices and zero prices', () => {
    expect(pricedDispatch(lot, [])).toMatchObject({ qty: 100, amount: 900, price: 9, partial: false })
    expect(pricedDispatch({ ...lot, ca_amount: 0 }, [])).toMatchObject({ amount: 0, price: 0 })
  })
  it('excludes unpriced lots, missing revenue and invalid quantities', () => {
    expect(pricedDispatch({ ...lot, tri_status: 'tried' }, [])).toBeNull()
    expect(pricedDispatch({ ...lot, ca_amount: null }, [])).toBeNull()
    expect(pricedDispatch({ ...lot, qty_priced_kg: Infinity }, [])).toBeNull()
  })
})
