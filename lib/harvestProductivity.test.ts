import { describe, it, expect } from 'vitest'
import { harvestPerformance, harvestGroups, harvestTarget, type HarvestWork } from './harvestProductivity'
const row = (overrides: Partial<HarvestWork> = {}): HarvestWork => ({id:'1',farm_id:'f',team_id:'t',work_date:'2026-09-21',quantity_kg:2400,person_hours:40,target_rate:50,...overrides})
describe('Harvest productivity', () => {
  it('calculates person-hour productivity and target attainment', () => {
    expect(harvestPerformance([row()])).toMatchObject({kg:2400,hours:40,rate:60,expected:2000,attainment:120})
  })
  it('weights aggregation by hours, never averages rates', () => {
    expect(harvestPerformance([row(),row({quantity_kg:100,person_hours:10})]).rate).toBe(50)
  })
  it('excludes missing targets from assessment, not from production', () => {
    expect(harvestPerformance([row(),row({target_rate:null})])).toMatchObject({kg:4800,attainment:120,missingTargets:1})
    expect(harvestPerformance([row({target_rate:null})]).attainment).toBeNull()
  })
  it('excludes cancellations and handles empty sets', () => {
    expect(harvestPerformance([row({cancelled_at:'2026-09-22'})])).toMatchObject({kg:0,hours:0,rate:null,attainment:null})
  })
  it('keeps teams and dates separate', () => {
    expect(harvestGroups([row(),row({team_id:'t2'})],'team_id')).toHaveLength(2)
  })
  it('selects objective effective at harvest date and same farm', () => {
    const targets=[{farm_id:'f',effective_from:'2026-09-01',kg_per_person_hour:50},{farm_id:'f',effective_from:'2026-10-01',kg_per_person_hour:60}]
    expect(harvestTarget(targets,'f','2026-09-21')).toBe(50)
    expect(harvestTarget(targets,'other','2026-09-21')).toBeNull()
  })
})
