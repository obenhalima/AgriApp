import { describe, it, expect } from 'vitest'
import { allocateCostsToPlantings, computeCoutRevient, type PlantingInput, type HarvestAgg } from '../coutRevient'

// Jeu de données de référence : 2 serres, G1 a 2 variétés, G2 a 1.
const plantings: PlantingInput[] = [
  { id: 'p1', greenhouse_id: 'G1', variety_id: 'VA', planted_area: 600, price_per_kg_export: 10, price_per_kg_local: 4 },
  { id: 'p2', greenhouse_id: 'G1', variety_id: 'VB', planted_area: 400, price_per_kg_export: 8, price_per_kg_local: 3 },
  { id: 'p3', greenhouse_id: 'G2', variety_id: 'VA', planted_area: 1000, price_per_kg_export: 10, price_per_kg_local: 4 },
]
const varieties = [
  { id: 'VA', commercial_name: 'Cerise', avg_price_export: 9, avg_price_local: 3 },
  { id: 'VB', commercial_name: 'Ronde', avg_price_export: 7, avg_price_local: 2 },
]
const harvestsByPlanting = new Map<string, HarvestAgg>([
  ['p1', { qty_cat1: 100, qty_cat2: 0, qty_cat3: 0, total_qty: 100 }],
  ['p2', { qty_cat1: 50, qty_cat2: 10, qty_cat3: 0, total_qty: 60 }],
  ['p3', { qty_cat1: 200, qty_cat2: 0, qty_cat3: 0, total_qty: 200 }],
])
const lots = [
  { variety_id: 'VA', ca_amount: 2500, qty_acceptee_kg: 280 },
  { variety_id: 'VB', ca_amount: 300, qty_acceptee_kg: 55 },
]
const costs = [
  { amount: 1000, greenhouse_id: 'G1', variety_id: 'VA' }, // direct → p1
  { amount: 500, greenhouse_id: 'G1', variety_id: null },  // serre G1 → p1+p2 prorata surface
  { amount: 3000, greenhouse_id: null, variety_id: null },  // campagne → prorata surface totale
]

describe('allocateCostsToPlantings (cascade)', () => {
  it('impute un coût serre+variété directement à la plantation', () => {
    const m = allocateCostsToPlantings(plantings, [{ amount: 1000, greenhouse_id: 'G1', variety_id: 'VA' }])
    expect(m.get('p1')).toBe(1000)
    expect(m.get('p2') ?? 0).toBe(0)
  })

  it('répartit un coût serre (sans variété) au prorata de la surface', () => {
    const m = allocateCostsToPlantings(plantings, [{ amount: 500, greenhouse_id: 'G1', variety_id: null }])
    expect(m.get('p1')).toBeCloseTo(300, 6) // 600/1000
    expect(m.get('p2')).toBeCloseTo(200, 6) // 400/1000
  })

  it('répartit un coût campagne sur toutes les plantations au prorata', () => {
    const m = allocateCostsToPlantings(plantings, [{ amount: 3000, greenhouse_id: null, variety_id: null }])
    expect(m.get('p1')).toBeCloseTo(900, 6)  // 600/2000
    expect(m.get('p2')).toBeCloseTo(600, 6)  // 400/2000
    expect(m.get('p3')).toBeCloseTo(1500, 6) // 1000/2000
  })

  it('retombe au niveau serre si la variété du coût n\'a pas de plantation', () => {
    const m = allocateCostsToPlantings(plantings, [{ amount: 100, greenhouse_id: 'G1', variety_id: 'INCONNU' }])
    expect(m.get('p1')).toBeCloseTo(60, 6)
    expect(m.get('p2')).toBeCloseTo(40, 6)
  })

  it('répartit également si les surfaces sont nulles', () => {
    const ps: PlantingInput[] = [
      { id: 'a', greenhouse_id: 'G', variety_id: 'V1', planted_area: 0, price_per_kg_export: 0, price_per_kg_local: 0 },
      { id: 'b', greenhouse_id: 'G', variety_id: 'V2', planted_area: 0, price_per_kg_export: 0, price_per_kg_local: 0 },
    ]
    const m = allocateCostsToPlantings(ps, [{ amount: 200, greenhouse_id: null, variety_id: null }])
    expect(m.get('a')).toBe(100)
    expect(m.get('b')).toBe(100)
  })
})

describe('computeCoutRevient', () => {
  const r = computeCoutRevient({ plantings, varieties, harvestsByPlanting, lots, costs })
  const va = r.parVariete.find(v => v.variety_id === 'VA')!
  const vb = r.parVariete.find(v => v.variety_id === 'VB')!

  it('agrège les coûts par variété (cascade)', () => {
    expect(va.couts).toBeCloseTo(3700, 6) // 2200 (p1) + 1500 (p3)
    expect(vb.couts).toBeCloseTo(800, 6)  // 800 (p2)
    expect(r.totals.couts).toBeCloseTo(4500, 6)
  })

  it('calcule le CA valorisé (récoltes × prix, sans conversion de devise)', () => {
    expect(va.caValorise).toBeCloseTo(3000, 6) // 100×10 + 200×10
    expect(vb.caValorise).toBeCloseTo(430, 6)  // 50×8 + 10×3
  })

  it('reprend le CA réel + qté acceptée par variété depuis les lots', () => {
    expect(va.caReel).toBe(2500)
    expect(vb.caReel).toBe(300)
    expect(va.qtyAccepteeKg).toBe(280)
  })

  it('calcule coût/kg et coût/m²', () => {
    expect(va.coutParKg).toBeCloseTo(3700 / 300, 6)
    expect(va.coutParM2).toBeCloseTo(3700 / 1600, 6)
  })

  it('calcule les deux marges et leurs pourcentages', () => {
    expect(va.margeValorisee).toBeCloseTo(3000 - 3700, 6)
    expect(va.margeReelle).toBeCloseTo(2500 - 3700, 6)
    expect(va.margePctValorisee).toBeCloseTo(((3000 - 3700) / 3000) * 100, 6)
  })

  it('prend le prix de la plantation puis le prix moyen variété en repli', () => {
    const noPricePlant: PlantingInput[] = [
      { id: 'x', greenhouse_id: 'G', variety_id: 'VA', planted_area: 100, price_per_kg_export: null, price_per_kg_local: null },
    ]
    const res = computeCoutRevient({
      plantings: noPricePlant, varieties,
      harvestsByPlanting: new Map([['x', { qty_cat1: 10, qty_cat2: 0, qty_cat3: 0, total_qty: 10 }]]),
      lots: [], costs: [],
    })
    expect(res.parVariete[0].caValorise).toBeCloseTo(10 * 9, 6) // avg_price_export=9
  })

  it('renvoie des totaux nuls sans planté', () => {
    const res = computeCoutRevient({ plantings: [], varieties: [], harvestsByPlanting: new Map(), lots: [], costs: [] })
    expect(res.parVariete).toHaveLength(0)
    expect(res.totals.couts).toBe(0)
    expect(res.totals.margePctValorisee).toBeNull()
  })

  it('coutParKg est null si aucune production', () => {
    const res = computeCoutRevient({
      plantings: [{ id: 'z', greenhouse_id: 'G', variety_id: 'VA', planted_area: 100, price_per_kg_export: 10, price_per_kg_local: 4 }],
      varieties, harvestsByPlanting: new Map(), lots: [], costs: [{ amount: 500, greenhouse_id: null, variety_id: null }],
    })
    expect(res.parVariete[0].coutParKg).toBeNull()
  })
})
