import { describe, expect, it } from 'vitest'
import { analyticalHref, readAnalyticalScope } from './analyticalNavigation'

describe('analytical navigation', () => {
  it('preserves analytical filters with safely encoded identifiers', () => {
    const scope = { campaign: 'camp & 1', farm: 'ferme 2', start: '2026-09-01', end: '2026-09-21', level: 'greenhouse', metric: 'costKg', tab: 'production' }
    const url = analyticalHref('/couts/performance', 'client1', scope)
    expect(readAnalyticalScope(url.slice(url.indexOf('?')), 'client1')).toEqual(scope)
  })
  it('does not reuse filters from another client or an unscoped URL', () => {
    expect(readAnalyticalScope('?domain=other&farm=secret&campaign=x', 'client1').farm).toBe('')
    expect(readAnalyticalScope('?farm=secret', 'client1').farm).toBe('')
  })
  it('rejects impossible and malformed dates', () => {
    const scope = readAnalyticalScope('?domain=d&start=2026-02-30&end=invalid', 'd')
    expect(scope.start).toBe(''); expect(scope.end).toBe('')
    expect(readAnalyticalScope('?domain=d&start=2024-02-29', 'd').start).toBe('2024-02-29')
  })
  it('does not forward unrelated URL parameters', () => {
    expect(analyticalHref('/agronomie/dashboard', 'd', { farm: 'f' })).toBe('/agronomie/dashboard?domain=d&farm=f')
  })
})
