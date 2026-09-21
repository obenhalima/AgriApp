export type AnalyticalScope = { campaign: string; farm: string; start: string; end: string; level: string; metric: string; tab: string }
export function readAnalyticalScope(search: string, domain: string): AnalyticalScope {
  const empty = { campaign: '', farm: '', start: '', end: '', level: '', metric: '', tab: '' }
  const p = new URLSearchParams(search)
  // Never carry another client's filters across a domain change.
  if (p.get('domain') !== domain) return empty
  const date = (key: string) => {
    const value = p.get(key) || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ''
  }
  return { campaign: p.get('campaign') || '', farm: p.get('farm') || '', start: date('start'), end: date('end'), level: p.get('level') || '', metric: p.get('metric') || '', tab: p.get('tab') || '' }
}
export function analyticalHref(path: '/agronomie/dashboard' | '/couts/performance' | '/couts/pilotage', domain: string, scope: Partial<AnalyticalScope>) {
  const params = new URLSearchParams({ domain })
  for (const key of ['campaign', 'farm', 'start', 'end', 'level', 'metric', 'tab'] as const) if (scope[key]) params.set(key, scope[key]!)
  return `${path}?${params.toString()}`
}
