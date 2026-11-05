import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {readHarvestHistory,harvestLoadError} from './harvestHistory'

it('loads historic rows beyond a single API page without date cutoffs',async()=>{
  const rows=Array.from({length:1103},(_,id)=>({id}))
  const query=vi.fn(async(from:number,to:number)=>({data:rows.slice(from,to+1),error:null}))
  const result=await readHarvestHistory(query,'envois station')
  expect(result.data).toEqual(rows)
  expect(query.mock.calls).toEqual([[0,499],[500,999],[1000,1499]])
})
it('does not return a partial history when a later page fails',async()=>{
  await expect(readHarvestHistory(async(from)=>from===0
    ? {data:Array.from({length:500},(_,id)=>({id})),error:null}
    : {data:null,error:{message:'private backend detail'}},'envois station'))
    .rejects.toThrow('Chargement impossible : envois station')
})
it('returns a genuine empty history without fabricating records',async()=>{
  expect((await readHarvestHistory(async()=>({data:[],error:null}),'récoltes')).data).toEqual([])
})
it('exposes a safe diagnostic code without exposing backend details',async()=>{
  const failure=readHarvestHistory(async()=>({data:null,error:{code:'PGRST201',message:'private backend detail'}}),'envois station')
  await expect(failure).rejects.toThrow('code PGRST201')
  await expect(failure).rejects.not.toThrow('private backend detail')
})
it('disambiguates joins after tenant isolation adds composite foreign keys',()=>{
  const screen=readFileSync(new URL('../app/recoltes/page.tsx',import.meta.url),'utf8')
  const report=readFileSync(new URL('../components/harvest/PricedDispatchReport.tsx',import.meta.url),'utf8')
  expect(screen).toContain('markets!harvest_lots_market_id_fkey(name, currency)')
  expect(report).toContain('markets!harvest_lots_market_id_fkey(')
  expect(report).toContain('varieties!harvest_lots_variety_id_fkey(')
  expect(report).toContain('varieties!campaign_plantings_variety_id_fkey(')
  expect(report).toContain('station_settlements!station_settlement_lines_settlement_id_fkey(')
})
it('keeps tenant filters and visible dates, checks errors, and removes hidden limits',()=>{
  const source=readFileSync(new URL('../app/recoltes/page.tsx',import.meta.url),'utf8')
  expect(source).not.toContain('since30')
  expect(source).not.toContain('.limit(300)')
  expect(source).toContain(".eq('domain_id', activeDomain.domain_id)")
  expect(source).toContain('Récoltes du')
  expect(source).toContain('Récoltes au')
  expect(source).toContain('role="alert"')
  expect(source).toContain('hidden={Boolean(loadError) || historyDomain !== activeDomain?.domain_id}')
  expect(source).toContain('checks.find(([, result]) => result.error)')
  expect(source).toContain('if (!isCurrent()) return')
})
it('identifies auxiliary failures without exposing raw backend messages',()=>{
  expect(harvestLoadError('alertes sans récolte',{code:'22P02',message:'private detail'}).message)
    .toContain('alertes sans récolte (code 22P02)')
  expect(harvestLoadError('marchés',{code:'42501'}).message).toContain('marchés (code 42501)')
  expect(harvestLoadError('bordereaux',null).message).not.toContain('undefined')
})
it('reads tenant alerts without sending a value absent from the legacy enum',()=>{
  const source=readFileSync(new URL('../app/recoltes/page.tsx',import.meta.url),'utf8')
  expect(source).not.toContain(".eq('type', 'no_harvest')")
  expect(source).toContain(".filter(a => a.type === 'no_harvest')")
  expect(source).toMatch(/from\('alerts'\)\.select\('\*'\)\s*\.eq\('domain_id', activeDomain.domain_id\)/)
})
