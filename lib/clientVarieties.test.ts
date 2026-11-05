import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-public-key'
  process.env.NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION='true'
  return { rows: [] as any[], calls: 0 }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc:async()=>({data:true,error:null}),from: (table: string) => {
  expect(table).toBe('varieties')
  fixtures.calls++
  const filters: [string,unknown][]=[]
  let patch: any
  let insertion: any
  const result = () => {
    if (insertion) { const row={id:'new',...insertion}; fixtures.rows.push(row); return [row] }
    const rows=fixtures.rows.filter(row=>filters.every(([key,value])=>row[key]===value))
    if (patch) rows.forEach(row=>Object.assign(row,patch))
    return rows
  }
  const query: any={
    select: () => query, order: () => query,
    eq: (key: string,value: unknown) => { filters.push([key,value]); return query },
    insert: (row: any) => { insertion=row; return query },
    update: (row: any) => { patch=row; return query },
    single: async () => { const rows=result(); return {data:rows[0] || null,error:rows.length===1 ? null : {message:'Row inaccessible'}} },
    then: (resolve: any) => Promise.resolve({data:result(),error:null}).then(resolve),
  }
  return query
} }) }))
import { createVariete, deleteVariete, getVarietes, updateVariete } from './supabase'

const a='11111111-1111-4111-8111-111111111111'
const b='22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','true')
  fixtures.calls=0
  fixtures.rows=[{id:'a',domain_id:a,code:'V01',is_active:true},{id:'b',domain_id:b,code:'V01',is_active:true}]
})
describe('variety query client boundaries (mocked database)', () => {
  it('keeps legacy reads but blocks writes before validated cutover', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','false')
    fixtures.rows=[{id:'legacy',domain_id:null,is_active:true}]
    expect((await getVarietes(a)).map(row=>row.id)).toEqual(['legacy'])
    fixtures.calls=0
    await expect(deleteVariete('legacy',a)).rejects.toThrow('lecture seule')
    await expect(createVariete({domain_id:a} as any)).rejects.toThrow('lecture seule')
    expect(fixtures.calls).toBe(0)
  })
  it('lists only the selected client, including when the same code exists elsewhere', async () => {
    expect((await getVarietes(a)).map(row=>row.id)).toEqual(['a'])
    expect((await getVarietes(b)).map(row=>row.id)).toEqual(['b'])
  })
  it('cannot archive another client row or falsely report success', async () => {
    await expect(deleteVariete('b',a)).rejects.toBeTruthy()
    expect(fixtures.rows[1].is_active).toBe(true)
    await deleteVariete('a',a)
    expect(fixtures.rows[0].is_active).toBe(false)
    expect(fixtures.rows[1].is_active).toBe(true)
  })
  it('rejects clientless operations before database access', async () => {
    await expect(getVarietes('')).rejects.toThrow('client valide')
    await expect(deleteVariete('a','')).rejects.toThrow('client valide')
    await expect(createVariete({domain_id:''} as any)).rejects.toThrow('client valide')
    expect(fixtures.calls).toBe(0)
  })
  it('scopes edits and rejects identity/owner reassignment', async () => {
    await expect(updateVariete('b',{commercial_name:'Changed'},a)).rejects.toBeTruthy()
    await expect(updateVariete('a',{domain_id:b},a)).rejects.toThrow('propriétaire')
    await expect(updateVariete('a',{id:'b'},a)).rejects.toThrow('identifiant')
    await updateVariete('a',{commercial_name:'Client A'},a)
    expect(fixtures.rows[0].commercial_name).toBe('Client A')
    expect(fixtures.rows[1].commercial_name).toBeUndefined()
  })
  it('creates an independent client-owned row', async () => {
    const row=await createVariete({domain_id:a,code:'V02',commercial_name:'Test',type:'ronde',destination:'mixte',theoretical_yield_per_m2:1,theoretical_cost_per_m2:2,avg_price_local:3,avg_price_export:4})
    expect(row.domain_id).toBe(a)
    expect(fixtures.rows.filter(row=>row.domain_id===b)).toHaveLength(1)
  })
})
