import {beforeAll,beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const {from}=vi.hoisted(()=>({from:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from})}))
let getFactures: typeof import('./supabase').getFactures
const domain='11111111-1111-4111-8111-111111111111'
beforeAll(async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://qa.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture-public-key')
  getFactures=(await import('./supabase')).getFactures
})
beforeEach(()=>from.mockReset())
function fixture(rows:unknown[],failedPage=-1){
  const calls:{method:string;args:unknown[]}[]=[]
  from.mockImplementation((table:string)=>{
    calls.push({method:'from',args:[table]})
    const q:any={}
    for(const method of ['select','eq','order'])q[method]=(...args:unknown[])=>{calls.push({method,args});return q}
    q.range=async(start:number,end:number)=>{
      calls.push({method:'range',args:[start,end]})
      return start===failedPage?{data:null,error:{code:'PGRST201'}}:{data:rows.slice(start,end+1),error:null}
    }
    return q
  })
  return calls
}
it('loads every invoice page using an explicit client and unambiguous relationship',async()=>{
  const rows=Array.from({length:1003},(_,id)=>({id})),calls=fixture(rows)
  expect(await getFactures(domain)).toEqual(rows)
  expect(calls.filter(c=>c.method==='range').map(c=>c.args)).toEqual([[0,499],[500,999],[1000,1499]])
  expect(calls.filter(c=>c.method==='eq').every(c=>c.args[0]==='domain_id'&&c.args[1]===domain)).toBe(true)
  expect(calls.filter(c=>c.method==='select').every(c=>String(c.args[0]).includes('clients!invoices_client_id_fkey'))).toBe(true)
})
it('rejects a missing client before any request',async()=>{
  await expect(getFactures('')).rejects.toThrow('client valide')
  expect(from).not.toHaveBeenCalled()
})
it('fails instead of returning a partial invoice list',async()=>{
  fixture(Array.from({length:501},(_,id)=>({id})),500)
  await expect(getFactures(domain)).rejects.toEqual({code:'PGRST201'})
})
it('shows read failures, keeps tenant filtering in direct lookup, and rejects stale responses',()=>{
  const page=readFileSync(new URL('../app/factures/page.tsx',import.meta.url),'utf8')
  expect(page).toContain('getFactures(activeDomain.domain_id)')
  expect(page).toContain('if (!isCurrent()) return')
  expect(page).toContain('if (stale) return')
  expect(page).toContain('hidden={Boolean(invoiceLoadError)}')
  expect(page).toContain('role="alert"')
  expect(page).not.toContain(".select('*, clients(name)')")
})
