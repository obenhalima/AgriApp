import { describe, it, expect } from 'vitest'
import { performanceTimeline } from './performanceTimeline'
import type { PerformanceData } from './farmPerformance'
const data = {harvest_details:[
 {planting_id:'a',date:'2026-01-04',kg:100},
 {planting_id:'a',date:'2026-03-01',kg:250},
 {planting_id:'b',date:'2026-03-01',kg:900},
]} as PerformanceData
describe('Performance harvest curves',()=>{
 it('filters before calendar aggregation and fills missing months',()=>{
  const points=performanceTimeline(data,['a'],'month')
  expect(points.map(p=>p.kg)).toEqual([100,0,250])
  expect(points.map(p=>p.cumulative)).toEqual([100,100,350])
 })
 it('uses Monday weeks across year boundaries',()=>{
  expect(performanceTimeline(data,['a'],'week')[0].date).toBe('2025-12-29')
 })
 it('preserves totals across granularity and excludes empty scopes',()=>{
  expect(performanceTimeline(data,['a','b'],'week').at(-1)?.cumulative).toBe(1250)
  expect(performanceTimeline(data,[],'month')).toEqual([])
 })
})
