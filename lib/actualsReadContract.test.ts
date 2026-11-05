import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'

describe('Compte exploitation: contrat de lecture', () => {
  const source = readFileSync(new URL('./actuals.ts', import.meta.url), 'utf8')
  it('désambiguïse la variété de plantation', () => {
    expect(source).toContain('varieties!campaign_plantings_variety_id_fkey(avg_price_export, avg_price_local)')
    expect(source).not.toContain('varieties(avg_price_export')
  })
  it('ne transforme pas une erreur de catégories en rapport vide', () => {
    expect(source).toContain('if (categoriesError) throw categoriesError')
  })
})
