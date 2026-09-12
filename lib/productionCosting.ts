export type CostPlanting = { id: string; campaign_id: string; greenhouse_id: string; variety_id: string; farm_id: string; farm_name: string; greenhouse_name: string; area: number; target_kg: number | null }
export type CostLine = { id: string; campaign_id: string; greenhouse_id: string | null; variety_id: string | null; amount: number; planned: boolean; quality?: string; source?: string; category: string }
export type CostHarvest = { planting_id: string; gross_kg: number; sorted_kg: number }
export type CostData = { basis: 'surface' | 'production'; plantings: CostPlanting[]; costs: CostLine[]; harvests: CostHarvest[]; pending_movements: any[]; inventory: any[]; transit: number }
export type CostSummary = { id: string; name: string; farm_id?: string; direct: number; shared: number; planned: number; gross: number; sorted: number; target: number; targetMissing: boolean; provisional: boolean }
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const costRatio = (amount: number, kg: number) => kg > 0 ? amount / kg : null
export function buildProductionCosts(data: CostData) {
  const rows = new Map<string, CostSummary>()
  const harvests = new Map(data.harvests.map(h => [h.planting_id, h]))
  for (const p of data.plantings) {
    if (!rows.has(p.greenhouse_id)) rows.set(p.greenhouse_id, { id: p.greenhouse_id, name: p.greenhouse_name, farm_id: p.farm_id, direct: 0, shared: 0, planned: 0, gross: 0, sorted: 0, target: 0, targetMissing: false, provisional: false })
    const row = rows.get(p.greenhouse_id)!, h = harvests.get(p.id)
    row.gross += Number(h?.gross_kg ?? 0); row.sorted += Number(h?.sorted_kg ?? 0)
    row.target += Number(p.target_kg ?? 0); row.targetMissing ||= p.target_kg == null
  }
  let unallocated = 0, plannedUnallocated = 0
  for (const c of data.costs) {
    const targets = data.plantings.filter(p => p.campaign_id === c.campaign_id && (!c.greenhouse_id || p.greenhouse_id === c.greenhouse_id) && (!c.variety_id || p.variety_id === c.variety_id)).sort((a, b) => a.id.localeCompare(b.id))
    // A direct cost is never spread onto unrelated greenhouses if its target is missing.
    const weights = targets.map(p => c.greenhouse_id || data.basis === 'surface' ? Number(p.area) : Number(harvests.get(p.id)?.gross_kg ?? 0))
    const total = weights.reduce((s, v) => s + v, 0)
    if (total <= 0) { if (c.planned) plannedUnallocated += Number(c.amount); else unallocated += Number(c.amount); continue }
    let allocated = 0
    targets.forEach((p, i) => {
      const share = i === targets.length - 1 ? round(Number(c.amount) - allocated) : round(Number(c.amount) * weights[i] / total)
      allocated = round(allocated + share)
      const row = rows.get(p.greenhouse_id)!
      if (c.planned) row.planned = round(row.planned + share)
      else if (c.greenhouse_id) row.direct = round(row.direct + share)
      else row.shared = round(row.shared + share)
      row.provisional ||= !c.planned && c.quality === 'provisional'
    })
  }
  const aggregate = (id: string, name: string, input: CostSummary[]): CostSummary => input.reduce((r, v) => ({ ...r,
    direct: round(r.direct + v.direct), shared: round(r.shared + v.shared), planned: round(r.planned + v.planned), gross: r.gross + v.gross,
    sorted: r.sorted + v.sorted, target: r.target + v.target, targetMissing: r.targetMissing || v.targetMissing, provisional: r.provisional || v.provisional }),
  { id, name, direct: 0, shared: 0, planned: 0, gross: 0, sorted: 0, target: 0, targetMissing: false, provisional: false })
  const greenhouses = Array.from(rows.values())
  const farms = Array.from(new Map(data.plantings.map(p => [p.farm_id, p.farm_name])).entries()).map(([id, name]) => aggregate(id, name, greenhouses.filter(g => g.farm_id === id)))
  return { greenhouses, farms, company: aggregate('company', 'Client / société', farms), unallocated: round(unallocated), plannedUnallocated: round(plannedUnallocated) }
}
