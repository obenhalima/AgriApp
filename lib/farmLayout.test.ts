import { describe, expect, it } from 'vitest'
import { normalizeShape, newShape, formatPlanNumber } from './farmLayout'
describe('Plan schématique de ferme', () => {
  it('conserve le lien vers la serre sans surface métier', () => {
    const shape = newShape('serre-1', 0)
    expect(shape.greenhouse_id).toBe('serre-1')
    expect(shape).not.toHaveProperty('total_area')
  })
  it('borne les formes et leur rotation dans le canevas', () => {
    const shape = normalizeShape({ greenhouse_id: 'a', x: -100, y: 1000, width: 200, height: 60, rotation: 90 })
    expect(shape.x).toBe(30)
    expect(shape.y).toBe(700)
  })
  it('normalise les dimensions invalides', () => {
    const shape = normalizeShape({ greenhouse_id: 'a', x: NaN, y: Infinity, width: -5, height: 900, rotation: 450 })
    expect(shape.width).toBe(12)
    expect(shape.height).toBe(760)
    expect(shape.rotation).toBe(90)
    expect(Number.isFinite(shape.x)).toBe(true)
  })
  it('positionne les premières serres séparément', () => {
    expect(newShape('a', 0).x).not.toBe(newShape('b', 1).x)
  })
  it('distingue valeur absente et zéro, avec deux décimales', () => {
    expect(formatPlanNumber(null)).toBe('Non renseigné')
    expect(formatPlanNumber(0)).toBe('0,00')
    expect(formatPlanNumber(1234.5).replace(/\s/g, ' ')).toBe('1 234,50')
  })
})
