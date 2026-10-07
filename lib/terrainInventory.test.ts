import { describe,it,expect } from 'vitest'
import { production360, type AgroPlanting } from './agronomy360'
describe('Terrain inventory',()=>{
  it('includes unplanted and zero-area greenhouses, without changing yield eligibility',()=>{
    const gs=Array.from({length:37},(_,i)=>({id:`g${i}`,farm_id:'stalson',code:`S${i+1}`,name:`Serre ${i+1}`,total_area:1000}))
    gs.push({id:'other',farm_id:'other',code:'OTHER',name:'Other',total_area:100})
    const ps=[{id:'p',greenhouse_id:'g0',planted_area:1000},{id:'p2',greenhouse_id:'g1',planted_area:0}] as AgroPlanting[]
    const result=production360(ps,[],gs,'stalson','2026-10-02',7)
    expect(result.terrain).toHaveLength(37);expect(result.comparison).toHaveLength(1)
    expect(result.terrain[1].plantings).toBe(1);expect(result.terrain[2].plantings).toBe(0)
    expect(result.terrain.map(g=>g.name).slice(0,3)).toEqual(['S1','S2','S3'])
    expect(production360([],[],gs,'','2026-10-02',7).terrain).toHaveLength(38)
  })
})
