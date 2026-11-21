import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'

describe('Compte exploitation: contrat de lecture', () => {
  const source = readFileSync(new URL('./actuals.ts', import.meta.url), 'utf8')
  it('utilise les montants tarifés des envois', () => {
    expect(readFileSync(new URL('./harvestRevenueApi.ts', import.meta.url), 'utf8')).toContain('qty_priced_kg,qty_acceptee_kg,ca_amount')
    expect(source).toContain("params.revenueBasis==='provisional'")
  })
  it('ne transforme pas une erreur de catégories en rapport vide', () => {
    expect(source).toContain('if (categoriesError) throw categoriesError')
  })
})
