import { describe, expect, it } from 'vitest'
import { stockOpeningDraft, checkStockOpening } from './stockOpening'
import { initializationWorkbook, readInitializationWorkbook } from './initializationWorkbook'
import type { InitCatalog } from './initialization'
const catalog: InitCatalog = { crops: [], varieties: [], products: [{ code: 'ENG01', name: 'Engrais', unit: 'kg', category: 'engrais' }], warehouses: [{ code: 'MAG01', name: 'Magasin', farm: 'F01' }], farms: [{ code: 'F01', name: '501' }] }
describe('opening stock preparation', () => {
  it('prefills existing references without assuming quantities or prices', () => {
    const draft = stockOpeningDraft(catalog, 'MAG01', '2026-11-03')
    expect(draft.rows.opening_stock[0]).toMatchObject({ product: 'ENG01', warehouse: 'MAG01', quantity: '', price: '' })
    expect(checkStockOpening(draft.rows.opening_stock, catalog, '2026-11-03').rows).toEqual([])
    expect(() => stockOpeningDraft(catalog, 'OTHER', '2026-11-03')).toThrow()
  })
  it('distinguishes explicit zero and unknown prices and checks references and duplicates', () => {
    const row = stockOpeningDraft(catalog, 'MAG01', '2026-11-03').rows.opening_stock[0]
    expect(checkStockOpening([{ ...row, quantity: '0' }], catalog, '2026-11-03').zero).toBe(1)
    const result = checkStockOpening([{ ...row, quantity: '10' }, { ...row, code: 'STO2', quantity: '4', product: 'MISSING' }], catalog, '2026-11-03')
    expect(result.issues.some(issue => issue.field === 'price' && issue.warning)).toBe(true)
    expect(result.issues.some(issue => issue.field === 'product' && !issue.warning)).toBe(true)
    expect(checkStockOpening([{ ...row, quantity: '-1' }], catalog, '2026-11-03').issues.some(i => !i.warning)).toBe(true)
    expect(checkStockOpening([{ ...row, quantity: '1' }, { ...row, code: 'STO2', quantity: '2' }], catalog, '2026-11-03').issues.some(i => i.field === 'product')).toBe(true)
    expect(checkStockOpening([{ ...row, existing_id: 'forged', notes: 'Saisie incomplète' }], catalog, '2026-11-03').issues.some(i => i.field === 'quantity' && !i.warning)).toBe(true)
    expect(checkStockOpening([{ ...row, date: '2026-11-04', quantity: '1' }], catalog, '2026-11-03').issues.some(i => i.field === 'date' && !i.warning)).toBe(true)
  })
  it('round-trips the referenced template and rejects a different domain', async () => {
    const blob = await initializationWorkbook('client-a', stockOpeningDraft(catalog, 'MAG01', '2026-11-03'), catalog, 'opening_stock')
    const bytes = await blob.arrayBuffer()
    const parsed = await readInitializationWorkbook(bytes, 'client-a', 'opening_stock')
    expect(parsed.opening_stock[0]).toMatchObject({ product: 'ENG01', quantity: '', price: '' })
    await expect(readInitializationWorkbook(bytes, 'client-b', 'opening_stock')).rejects.toThrow()
  }, 60000)
})
