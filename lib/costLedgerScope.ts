export function costFarmId(entry: any): string {
  return entry.greenhouses?.farm_id || entry.campaigns?.farm_id || ''
}

// Only a shared source movement proves that allocations belong to one cost.
export function groupCostAllocations(entries: any[]) {
  const groups = new Map<string, any[]>()
  for (const entry of entries) {
    const key = entry.source_stock_movement_id ? `stock:${entry.source_stock_movement_id}` : `entry:${entry.id}`
    const group = groups.get(key) || []
    group.push(entry)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([id, allocations]) => ({
    ...allocations[0],
    id,
    amount: allocations.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    allocations,
  }))
}
