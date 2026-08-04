import { describe, it, expect } from 'vitest'
import { computeProductivite, type ProdPlanting } from '../productivite'
import type { HarvestAgg } from '../coutRevient'

const P = (id: string, gh: string, v: string, area: number, lm: number, pc: number): ProdPlanting => ({
  id, greenhouse_id: gh, variety_id: v, planted_area: area, linear_meters: lm, plant_count: pc,
  price_per_kg_export: null, price_per_kg_local: null,
})
const plantings = [P('p1', 'G1', 'VA', 600, 400, 3000), P('p2', 'G1', 'VB', 400, 250, 2000), P('p3', 'G2', 'VA', 1000, 700, 5000)]
const varieties = [{ id: 'VA', commercial_name: 'Cerise' }, { id: 'VB', commercial_name: 'Ronde' }]
const harvestsByPlanting = new Map<string, HarvestAgg>([
  ['p1', { qty_cat1: 100, qty_cat2: 0, qty_cat3: 0, total_qty: 100 }],
  ['p2', { qty_cat1: 60, qty_cat2: 0, qty_cat3: 0, total_qty: 60 }],
  ['p3', { qty_cat1: 200, qty_cat2: 0, qty_cat3: 0, total_qty: 200 }],
])
const costs = [
  { amount: 1000, greenhouse_id: 'G1', variety_id: 'VA' },
  { amount: 500, greenhouse_id: 'G1', variety_id: null },
  { amount: 3000, greenhouse_id: null, variety_id: null },
]
const moCosts = [
  { amount: 500, greenhouse_id: 'G1', variety_id: null },
  { amount: 1000, greenhouse_id: null, variety_id: null },
]

describe('computeProductivite', () => {
  const r = computeProductivite({ plantings, varieties, harvestsByPlanting, costs, moCosts })
  const va = r.parVariete.find(v => v.variety_id === 'VA')!
  const vb = r.parVariete.find(v => v.variety_id === 'VB')!

  it('agrège métrage, production, coûts total et MO par variété', () => {
    expect(va.linearMeters).toBe(1100)  // 400 + 700
    expect(va.productionKg).toBe(300)   // 100 + 200
    expect(va.coutTotal).toBeCloseTo(3700, 6)
    expect(va.coutMO).toBeCloseTo(1100, 6) // 600 (p1) + 500 (p3)
  })

  it('calcule kg/ml', () => {
    expect(va.kgParMl).toBeCloseTo(300 / 1100, 6)
    expect(vb.kgParMl).toBeCloseTo(60 / 250, 6)
  })

  it('calcule coût/ml et coût MO/ml', () => {
    expect(va.coutParMl).toBeCloseTo(3700 / 1100, 6)
    expect(va.coutMOParMl).toBeCloseTo(1100 / 1100, 6) // = 1
    expect(vb.coutMOParMl).toBeCloseTo(400 / 250, 6)   // = 1.6
  })

  it('calcule kg/plant et rendement kg/m²', () => {
    expect(va.kgParPlant).toBeCloseTo(300 / 8000, 6)
    expect(va.rendementKgParM2).toBeCloseTo(300 / 1600, 6)
  })

  it('totalise correctement', () => {
    expect(r.totals.linearMeters).toBe(1350)
    expect(r.totals.productionKg).toBe(360)
    expect(r.totals.coutMO).toBeCloseTo(1500, 6)
    expect(r.totals.kgParMl).toBeCloseTo(360 / 1350, 6)
    expect(r.totals.coutMOParMl).toBeCloseTo(1500 / 1350, 6)
  })

  it('signale hasLinearMeters', () => {
    expect(r.hasLinearMeters).toBe(true)
  })

  it('met les ratios à null quand le métrage est absent', () => {
    const noLm = [P('a', 'G', 'VA', 500, 0, 1000)]
    const res = computeProductivite({
      plantings: noLm, varieties,
      harvestsByPlanting: new Map([['a', { qty_cat1: 50, qty_cat2: 0, qty_cat3: 0, total_qty: 50 }]]),
      costs: [], moCosts: [],
    })
    expect(res.hasLinearMeters).toBe(false)
    expect(res.parVariete[0].kgParMl).toBeNull()
    expect(res.parVariete[0].coutParMl).toBeNull()
    // rendement kg/m² reste calculable (basé sur la surface, pas le métrage)
    expect(res.parVariete[0].rendementKgParM2).toBeCloseTo(50 / 500, 6)
  })

  it('gère une campagne vide', () => {
    const res = computeProductivite({ plantings: [], varieties: [], harvestsByPlanting: new Map(), costs: [], moCosts: [] })
    expect(res.parVariete).toHaveLength(0)
    expect(res.totals.kgParMl).toBeNull()
    expect(res.hasLinearMeters).toBe(false)
  })
})
