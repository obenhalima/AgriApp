import { buildFarmPerformance, type PerformanceData } from './farmPerformance'

// Allocation is always computed on the full dataset, never on a drilled subset.
export function productionExplorer(data: PerformanceData, farm = '', greenhouse = '', variety = '') {
  const result = buildFarmPerformance(data, { farm, variety, level: 'greenhouse' })
  const rows = result.rows.filter(r => !greenhouse || r.id === greenhouse)
  const ids = new Set(rows.flatMap(r => r.plantingIds))
  const costs = rows.reduce((sum, r) => sum + r.direct + r.shared, 0)
  const kg = rows.reduce((sum, r) => sum + r.kg, 0)
  const area = rows.reduce((sum, r) => sum + r.area, 0)
  const allocations = rows.flatMap(r => r.allocations).filter(a => !a.planned)
  const categories = new Map<string, number>()
  for (const a of allocations) categories.set(a.category, (categories.get(a.category) || 0) + a.amount)
  return { rows, costs, kg, area, allocations,
    costKg: kg > 0 && rows.length > 0 && rows.every(r => !r.costMissing) ? costs / kg : null,
    incomplete: rows.some(r => r.costMissing || r.provisional) || result.pendingCount > 0 || result.unallocated !== 0,
    categories: Array.from(categories, ([name, amount]) => ({ name, amount })).sort((a,b) => b.amount-a.amount),
    harvests: data.harvest_details.filter(h => ids.has(h.planting_id)).sort((a,b) => b.date.localeCompare(a.date)),
  }
}
