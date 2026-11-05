import { describe, expect, it } from 'vitest'
import { filterSearch, matchesColumns } from './tableColumnFilters'

describe('Filtres de colonnes', () => {
  it('accepte plusieurs valeurs dans une même colonne', () => {
    expect(matchesColumns(['S1', 'Tomate'], { '0': ['S1', 'S2'] })).toBe(true)
    expect(matchesColumns(['S3', 'Tomate'], { '0': ['S1', 'S2'] })).toBe(false)
  })
  it('combine les colonnes et autorise les cellules vides', () => {
    expect(matchesColumns(['S1', ''], { '0': ['S1'], '1': [''] })).toBe(true)
    expect(matchesColumns(['S1', 'Cherry'], { '0': ['S1'], '1': [''] })).toBe(false)
  })
  it('une sélection vide masque toutes les lignes', () => {
    expect(matchesColumns(['S1'], { '0': [] })).toBe(false)
    expect(matchesColumns(['S1'], {})).toBe(true)
  })
  it('recherche sans dépendre des accents, majuscules ou signes arabes', () => {
    expect(filterSearch('  Récolté ')).toBe('recolte')
    expect(filterSearch('مَزرعة')).toBe(filterSearch('مزرعة'))
  })
})
