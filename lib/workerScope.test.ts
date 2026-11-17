import {beforeEach,expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({tables:{} as Record<string,any[]>,queries:[] as any[]}))
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
  const filters:[string,unknown][]=[]
  let start=0,end=499
  const request={table,filters,select:''}
  fixture.queries.push(request)
  const query:any={
    select:(value:string)=>{request.select=value;return query},
    order:()=>query,
    eq:(key:string,value:unknown)=>{filters.push([key,value]);return query},
    range:(from:number,to:number)=>{start=from;end=to;return query},
    then:(resolve:any)=>Promise.resolve({data:(fixture.tables[table]||[]).filter(row=>filters.every(([key,value])=>key.split('.').reduce((object,part)=>object?.[part],row)===value)).slice(start,end+1),error:null}).then(resolve),
  }
  return query
}}}))
import {listClientWorkers,listClientPayslips,listClientWorkerFarms} from './workerScope'
beforeEach(()=>{
  fixture.queries=[]
  fixture.tables={
    farms:[{id:'f1',domain_id:'client'},{id:'f2',domain_id:'client'},{id:'f3',domain_id:'other'}],
    workers:[...Array.from({length:1201},(_,index)=>({id:String(index),farm_id:'f1',farms:{id:'f1',domain_id:'client'},is_active:index!==0})),{id:'foreign',farm_id:'f3',farms:{id:'f3',domain_id:'other'}},{id:'orphan',farm_id:null,farms:null}],
    payslips:[{id:'own',workers:{farm_id:'f1',farms:{domain_id:'client'}}},{id:'foreign',workers:{farm_id:'f3',farms:{domain_id:'other'}}},{id:'orphan',workers:{farm_id:null,farms:null}}],
  }
})
it('reads all client workers, including inactive history, excluding other clients and unattached workers',async()=>{
  const rows=await listClientWorkers('client')
  expect(rows).toHaveLength(1201)
  expect(rows[0].is_active).toBe(false)
  expect(fixture.queries).toHaveLength(3)
  expect(fixture.queries.every(query=>query.select.includes('farms!inner'))).toBe(true)
})
it('scopes farms and payslips to the selected client through the direct worker farm',async()=>{
  expect((await listClientWorkerFarms('client')).map(farm=>farm.id)).toEqual(['f1','f2'])
  expect((await listClientPayslips('client')).map(slip=>slip.id)).toEqual(['own'])
  expect(fixture.queries.at(-1).select).toContain('workers!inner(farm_id,farms!inner(domain_id))')
})
it('rejects missing client context before reading any payroll data',async()=>{
  await expect(listClientWorkers('')).rejects.toThrow()
  await expect(listClientWorkerFarms('')).rejects.toThrow()
  await expect(listClientPayslips('')).rejects.toThrow()
  expect(fixture.queries).toHaveLength(0)
})
