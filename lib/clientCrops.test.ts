import { beforeEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({calls:[] as string[], rows:[] as any[]}))
vi.mock('./supabase',()=>({supabase:{rpc:async()=>({data:true,error:null}),from:(table:string)=>{
  mock.calls.push(table)
  const filters:[string,unknown][]=[]
  let patch:any
  const result=()=>{
    const rows=mock.rows.filter(row=>filters.every(([key,value])=>row[key]===value))
    if(patch) rows.forEach(row=>Object.assign(row,patch))
    return rows
  }
  const q:any={select:()=>q,order:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q},update:(value:any)=>{patch=value;return q},
    single:async()=>{const rows=result();return {data:rows[0]||null,error:rows.length===1?null:{message:'inaccessible'}}},
    then:(resolve:any)=>Promise.resolve({data:result(),error:null}).then(resolve)}
  return q
}}}))
import { listCrops, updateCrop, importCatalogVarieties } from './crops'
const a='11111111-1111-4111-8111-111111111111'
const b='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{
  vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','true')
  mock.calls=[]
  mock.rows=[{id:'a',domain_id:a,is_active:true},{id:'b',domain_id:b,is_active:true}]
})
it('keeps crop lists and updates inside the selected client',async()=>{
  expect((await listCrops(a)).map(row=>row.id)).toEqual(['a'])
  await expect(updateCrop('b',{is_active:false},a)).rejects.toBeTruthy()
  expect(mock.rows[1].is_active).toBe(true)
  await updateCrop('a',{is_active:false},a)
  expect(mock.rows[0].is_active).toBe(false)
})
it('rejects catalog import into a crop owned by another client',async()=>{
  await expect(importCatalogVarieties({id:'b',code:'TOM'},[],a)).rejects.toThrow('inaccessible')
  expect(mock.calls).toEqual(['crops'])
})
it('rejects ownership changes and freezes writes before cutover',async()=>{
  await expect(updateCrop('a',{domain_id:b} as any,a)).rejects.toThrow('propriétaire')
  vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','false')
  await expect(updateCrop('a',{is_active:false},a)).rejects.toThrow('lecture seule')
  expect(mock.calls).toEqual([])
})
