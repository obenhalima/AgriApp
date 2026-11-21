import { describe, expect, it, vi } from 'vitest'
import { matchSupplier, stockSuggestion, unitFactor, type ExtractedLine } from './supplierInvoiceImport'

vi.mock('./supabase', () => ({ supabase: {} }))

const line: ExtractedLine = {
  description: 'Engrais', product_code: null, quantity: 10, unit: 'sac', packaging: '25 kg',
  unit_price_ht: null, discount_pct: null, vat_rate: null, amount_ht: null, lot_number: null,
}

describe('supplier invoice reconciliation', () => {
  it('prioritizes ICE, then IF and then the normalized supplier name', () => {
    const suppliers = [
      { id: 'one', name: 'Agri Supply SARL', ice: '123456789012345', if_number: '1' },
      { id: 'two', name: 'Engrais du Nord', if_number: '2' },
    ]
    expect(matchSupplier({ name: 'Engrais du Nord', ice: '123456789012345', if_number: '2' }, suppliers)?.id).toBe('one')
    expect(matchSupplier({ name: 'Agri Supply', if_number: '2' }, suppliers)?.id).toBe('two')
    expect(matchSupplier({ name: 'Agri Supply' }, suppliers)?.id).toBe('one')
    expect(matchSupplier({ name: 'Inconnu' }, suppliers)).toBeUndefined()
  })

  it('uses codes, including phyto references, before names and validated history', () => {
    const items = [
      { id: 'engrais', code: 'ENG', name: 'Engrais', unit: 'kg' },
      { id: 'phyto', code: 'PHY', name: 'Produit certifié', unit: 'L', phytoCode: 'ONSSA-42' },
    ]
    expect(stockSuggestion({ ...line, product_code: 'ONSSA-42' }, items, 'engrais')?.id).toBe('phyto')
    expect(stockSuggestion(line, items, 'phyto')?.id).toBe('engrais')
    expect(stockSuggestion({ ...line, description: 'Autre référence' }, items, 'phyto')?.id).toBe('phyto')
  })

  it('converts known packaging or units and leaves unfamiliar conversions for review', () => {
    expect(unitFactor(line, 'kg')).toBe('25')
    expect(unitFactor({ ...line, packaging: '1,5 kg' }, 'g')).toBe('1500')
    expect(unitFactor({ ...line, unit: 'mL', packaging: null }, 'L')).toBe('0.001')
    expect(unitFactor(line, 'L')).toBe('')
  })
})
