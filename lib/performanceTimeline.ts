import type { PerformanceData } from './farmPerformance'

/** Calendar buckets, including empty periods. No fabricated dates for accounting costs. */
export function performanceTimeline(data: PerformanceData, plantingIds: string[], grain: 'week' | 'month') {
  const ids = new Set(plantingIds)
  const bucket = (value: string) => {
    const date = new Date(value.slice(0, 10) + 'T00:00:00Z')
    if (!Number.isFinite(date.getTime())) return null
    if (grain === 'month') date.setUTCDate(1)
    else date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    return date.toISOString().slice(0, 10)
  }
  const quantities = new Map<string, number>()
  for (const h of data.harvest_details) {
    if (!ids.has(h.planting_id)) continue
    const date = bucket(h.date)
    if (date) quantities.set(date, (quantities.get(date) || 0) + Number(h.kg || 0))
  }
  const dates = [...quantities.keys()].sort()
  if (!dates.length) return []
  const cursor = new Date(dates[0] + 'T00:00:00Z'), last = dates[dates.length - 1]
  const points: { date: string; label: string; kg: number; cumulative: number }[] = []
  let cumulative = 0
  while (cursor.toISOString().slice(0, 10) <= last) {
    const date = cursor.toISOString().slice(0, 10), kg = quantities.get(date) || 0
    cumulative += kg
    points.push({ date, label: new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'short', ...(grain === 'week' ? { day: '2-digit' as const } : {}), year: '2-digit' }).format(cursor), kg, cumulative })
    if (grain === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return points
}
