import { describe, expect, it } from 'vitest'
import { decimal, irrigationDates, waterVolume } from './irrigation'

describe('irrigation — quantités et dates', () => {
  it('accepte les nombres français sans transformer une saisie vide en zéro', () => {
    expect(decimal('1 234,50')).toBe(1234.5)
    for (const v of ['', '-2', 'NaN', 'Infinity', '1,2,3', '1e3']) expect(() => decimal(v)).toThrow()
  })
  it('calcule une estimation en L à partir des minutes et du débit L/h', () => {
    expect(waterVolume('duration', {minutes:'30', flow:'1 200'})).toBe(600)
  })
  it('convertit les index m³ en litres et refuse le compteur inversé', () => {
    expect(waterVolume('meter', {before:'100', after:'102,25'})).toBe(2250)
    expect(() => waterVolume('meter', {before:'102', after:'100'})).toThrow()
    expect(() => waterVolume('duration', {minutes:'30', flow:''})).toThrow()
    expect(() => waterVolume('volume', {volume:'0'})).toThrow()
  })
  it('refuse les dates invalides et les doublons', () => {
    expect(() => irrigationDates('single', ['2026-02-30T10:00'], 'daily',1,1)).toThrow()
    expect(() => irrigationDates('exact_dates', ['2026-10-01T10:00','2026-10-01T10:00'], 'daily',1,1)).toThrow()
    expect(() => irrigationDates('recurring', ['2026-10-01T10:00'], 'daily',1,101)).toThrow()
  })
  it('borne les fins de mois sans dérive des occurrences suivantes', () => {
    const result = irrigationDates('recurring', ['2026-01-31T10:00'], 'monthly',1,3).map(v => new Date(v).getDate())
    expect(result).toEqual([31,28,31])
  })
  it('planifie un intervalle hebdomadaire et conserve les créneaux explicites', () => {
    const dates = irrigationDates('recurring', ['2026-10-01T10:00'], 'weekly',2,3)
    expect(dates.map(v => new Date(v).getDate())).toEqual([1,15,29])
    expect(irrigationDates('exact_dates', ['2026-10-01T14:00','2026-10-01T10:00'],'daily',1,1)).toHaveLength(2)
  })
})
