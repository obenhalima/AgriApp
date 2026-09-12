import { describe, expect, it } from 'vitest'
import { buildProductionCosts, costRatio, CostData } from './productionCosting'
const data = (): CostData => ({ basis: 'surface', pending_movements: [], inventory: [], transit: 0,
 plantings: [{ id: 'p1', campaign_id: 'c1', greenhouse_id: 's1', variety_id: 'v', farm_id: 'f', farm_name: 'Ferme', greenhouse_name: 'S1', area: 100, target_kg: 10000 }, { id: 'p2', campaign_id: 'c2', greenhouse_id: 's2', variety_id: 'v', farm_id: 'f', farm_name: 'Ferme', greenhouse_name: 'S2', area: 100, target_kg: 5000 }],
 costs: [{ id: 'a', campaign_id: 'c1', greenhouse_id: 's1', variety_id: null, amount: 30000, planned: false, category: 'phyto' }, { id: 'b', campaign_id: 'c2', greenhouse_id: 's2', variety_id: null, amount: 20000, planned: false, category: 'phyto' }],
 harvests: [{ planting_id: 'p1', gross_kg: 10000, sorted_kg: 9000 }, { planting_id: 'p2', gross_kg: 5000, sorted_kg: 4500 }] })
describe('Coûts consolidés', () => {
 it('calcule une moyenne pondérée, pas la moyenne des ratios', () => { const r = buildProductionCosts(data()); expect(costRatio(r.company.direct, r.company.gross)).toBeCloseTo(3.333333); expect(r.farms[0].direct).toBe(50000) })
 it('ne répartit jamais une charge sur une autre campagne', () => { const d = data(); d.costs[0].greenhouse_id = null; const r = buildProductionCosts(d); expect(r.greenhouses[0].shared).toBe(30000); expect(r.greenhouses[1].shared).toBe(0) })
 it('signale les coûts sans cible plutôt que de les perdre', () => { const d = data(); d.costs[0].greenhouse_id = 'missing'; expect(buildProductionCosts(d).unallocated).toBe(30000) })
 it('sépare prévisionnel et réalisé', () => { const d = data(); d.costs[0].planned = true; const r = buildProductionCosts(d); expect(r.company.direct).toBe(20000); expect(r.company.planned).toBe(30000) })
 it('ne divise pas par zéro', () => { expect(costRatio(200, 0)).toBeNull() })
 it('conserve les centimes lors des répartitions', () => { const d = data(); d.plantings[1].campaign_id = 'c1'; d.costs = [{ ...d.costs[0], amount: 10.01, greenhouse_id: null }]; expect(buildProductionCosts(d).company.shared).toBe(10.01) })
 it('ne transforme pas un objectif inconnu en coût prévisionnel nul', () => { const d = data(); d.plantings[0].target_kg = null; expect(buildProductionCosts(d).company.targetMissing).toBe(true) })
 it('remonte les valorisations provisoires', () => { const d = data(); d.costs[0].quality = 'provisional'; expect(buildProductionCosts(d).company.provisional).toBe(true) })
})
