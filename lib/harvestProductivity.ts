export type HarvestWork = {
  id: string; farm_id: string; team_id: string; work_date: string;
  quantity_kg: number; person_hours: number; target_rate: number | null;
  cancelled_at?: string | null
}

/** Ratios on matching, explicitly attributed quantities and hours only. */
export function harvestPerformance(rows: HarvestWork[]) {
  const active = rows.filter(r => !r.cancelled_at)
  const kg = active.reduce((s, r) => s + Number(r.quantity_kg), 0)
  const hours = active.reduce((s, r) => s + Number(r.person_hours), 0)
  const assessed = active.filter(r => Number(r.target_rate) > 0)
  const expected = assessed.reduce((s, r) => s + Number(r.person_hours) * Number(r.target_rate), 0)
  const assessedKg = assessed.reduce((s, r) => s + Number(r.quantity_kg), 0)
  return { kg, hours, rate: hours > 0 ? kg / hours : null,
    expected, attainment: expected > 0 ? assessedKg / expected * 100 : null,
    missingTargets: active.length - assessed.length }
}

export function harvestGroups(rows: HarvestWork[], key: 'team_id' | 'farm_id' | 'work_date') {
  const groups = new Map<string, HarvestWork[]>()
  for (const row of rows.filter(r => !r.cancelled_at)) groups.set(row[key], [...(groups.get(row[key]) || []), row])
  return [...groups].map(([id, values]) => ({ id, ...harvestPerformance(values) }))
}

export function harvestTarget(targets: { farm_id: string; effective_from: string; kg_per_person_hour: number }[], farm: string, date: string) {
  return [...targets].filter(t => t.farm_id === farm && t.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.kg_per_person_hour ?? null
}
