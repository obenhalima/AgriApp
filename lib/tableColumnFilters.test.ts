import { describe, expect, it } from 'vitest'
import { filterSearch, matchesColumns, applyTableSelections, type TableFilterRow } from './tableColumnFilters'

describe('Filtres de colonnes', () => {
  it('keeps paired normal and overtime rows together while filtering', () => {
    const hidden = new Map<string, boolean>()
    const row = (id: string, pair: string, value: string): TableFilterRow => ({
      element: {dataset: {filterPair: pair}, toggleAttribute: (_name: string, state: boolean) => hidden.set(id, state)} as unknown as HTMLTableRowElement,
      values: [value], kind: 'data', depth: 0,
    })
    expect(applyTableSelections([row('aN', 'a', '8'), row('aS', 'a', '2'), row('bN', 'b', '0'), row('bS', 'b', '0')], {'0': ['8']})).toBe(2)
    expect([...hidden.values()]).toEqual([false, false, true, true])
  })
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
