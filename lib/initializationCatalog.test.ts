import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION='true'
  return { filters: [] as string[], selects: [] as string[], tables: {} as Record<string, any[]> }
})
vi.mock('./supabase', () => ({ supabase: { from: (table: string) => {
  let selected=''
  const query: any = {
    select: (columns: string) => { selected=columns;mocks.selects.push(`${table}:${columns}`); return query }, order: () => query, range: () => query,
    eq: (key: string, value: string) => { mocks.filters.push(`${table}.${key}=${value}`); return query },
    then: (resolve: any) => Promise.resolve(table==='teams'&&!selected.includes('farms!teams_farm_id_fkey!inner')?{data:null,error:{message:"Could not embed because more than one relationship was found for 'teams' and 'farms'"}}:{ data: mocks.tables[table] || [], error: null }).then(resolve),
  }
  return query
} } }))
import { loadInitializationCatalog } from './initializationCatalog'
it('disambiguates the teams/farms foreign key while preserving tenant filtering and team references',async()=>{
 mocks.tables.farms=[{id:'farm-501',code:'F501',name:'501'}]
 mocks.tables.teams=[{id:'team-501',farm_id:'farm-501',name:'Équipe 501',is_active:true}]
 const result=await loadInitializationCatalog('domain-501')
 expect(mocks.selects).toContain('teams:*,farms!teams_farm_id_fkey!inner(domain_id)')
 expect(mocks.filters).toContain('teams.farms.domain_id=domain-501')
 expect(result.teams[0]).toMatchObject({existing_id:'team-501',name:'Équipe 501',farm:'F501'})
})
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
  for (const table of ['crops', 'varieties', 'farms', 'warehouses', 'campaigns', 'stock_items', 'suppliers', 'campaign_plantings']) expect(mocks.filters).toContain(`${table}.domain_id=domain-qa`)
  expect(mocks.filters).toContain('greenhouses.farms.domain_id=domain-qa')
  expect(mocks.filters).toContain('workers.farms.domain_id=domain-qa')
  expect(mocks.filters.some(f => f.startsWith('clients.domain_id'))).toBe(false)
})
it('only identifies used legacy varieties as client-specific prefill candidates',async()=>{
  mocks.tables.varieties=[{id:'owned-use',code:'V01',commercial_name:'Used',is_active:false},{id:'unrelated',code:'V02',commercial_name:'Shared catalog only',is_active:true}]
  mocks.tables.campaign_plantings=[{id:'p',variety_id:'owned-use'}]
  const result=await loadInitializationCatalog('domain-qa')
  // The isolated path can include all owned varieties; legacy path requires usage evidence.
  vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','false')
  const legacy=await loadInitializationCatalog('domain-qa')
  expect(legacy.client_varieties.map(row=>row.existing_id)).toEqual(['owned-use'])
  expect(legacy.client_varieties[0].is_active).toBe('non')
  expect(result.varieties).toHaveLength(2)
  vi.unstubAllEnvs()
})
