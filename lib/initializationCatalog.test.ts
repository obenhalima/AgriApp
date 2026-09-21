import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ filters: [] as string[], selects: [] as string[], tables: {} as Record<string, any[]> }))
vi.mock('./supabase', () => ({ supabase: { from: (table: string) => {
  const query: any = {
    select: (columns: string) => { mocks.selects.push(`${table}:${columns}`); return query }, order: () => query, range: () => query,
    eq: (key: string, value: string) => { mocks.filters.push(`${table}.${key}=${value}`); return query },
    then: (resolve: any) => Promise.resolve({ data: mocks.tables[table] || [], error: null }).then(resolve),
  }
  return query
} } }))
import { loadInitializationCatalog } from './initializationCatalog'
it('loads profile full_name and falls back to email without requesting nonexistent columns', async () => {
  mocks.tables.domain_memberships = [
    { user_id: 'u1', profiles: { full_name: 'Responsable QA', email: 'qa@example.test' } },
    { user_id: 'u2', profiles: { full_name: ' ', email: 'second@example.test' } },
    { user_id: 'u3', profiles: null },
  ]
  const result = await loadInitializationCatalog('domain-qa')
  expect(result.members.map(r => r.name)).toEqual(['Responsable QA', 'second@example.test', 'Utilisateur'])
  expect(mocks.selects).toContain('domain_memberships:user_id,is_active,profiles:user_id(full_name,email)')
  expect(mocks.selects.some(s => /profiles:user_id\([^)]*(first_name|last_name)/.test(s))).toBe(false)
})
it('scopes operational catalogs and distinguishes identical greenhouse codes across farms', async () => {
  mocks.tables.farms = [{ id: 'f1', code: 'F1', name: 'One' }, { id: 'f2', code: 'F2', name: 'Two' }]
  mocks.tables.greenhouses = [{ id: 'g1', farm_id: 'f1', code: 'S01', name: 'One' }, { id: 'g2', farm_id: 'f2', code: 'S01', name: 'Two' }]
  const result = await loadInitializationCatalog('domain-qa')
  expect(result.greenhouses.map(r => r.code)).toEqual(['F1/S01', 'F2/S01'])
  for (const table of ['farms', 'warehouses', 'campaigns', 'stock_items', 'suppliers', 'campaign_plantings']) expect(mocks.filters).toContain(`${table}.domain_id=domain-qa`)
  expect(mocks.filters).toContain('greenhouses.farms.domain_id=domain-qa')
  expect(mocks.filters).toContain('workers.farms.domain_id=domain-qa')
  expect(mocks.filters.some(f => f.startsWith('clients.domain_id'))).toBe(false)
})
