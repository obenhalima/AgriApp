import {expect, it} from 'vitest'
import {rhPeriodMatches, rhPayrollTotals, rhFortnightChecks, expectedCampaignFortnights, type RhCampaign} from './rhDashboard'
import type {AttendancePeriod} from './attendance'
import type {PayrollPreparation, PayrollPayment} from './payrollPreparation'

it('filters periods by farm, year and optional month without mixing months', () => {
  const period = {farm_id: 'f1', start_date: '2026-01-16'}
  expect(rhPeriodMatches(period, '', 2026, '')).toBe(true)
  expect(rhPeriodMatches(period, 'f1', 2026, '1')).toBe(true)
  expect(rhPeriodMatches(period, 'f2', 2026, '1')).toBe(false)
  expect(rhPeriodMatches(period, '', 2025, '')).toBe(false)
  expect(rhPeriodMatches(period, '', 2026, '10')).toBe(false)
})
it('totals saved validated payroll and excludes draft estimates', () => {
  const preparations = [
    {id: 'p1', status: 'validated', rows: [{worker_id: 'w1', net_salary: 10.25, total_employer_cost: 14.1}]},
    {id: 'p2', status: 'draft', rows: [{worker_id: 'w1', net_salary: 1000, total_employer_cost: 1200}]},
  ] as PayrollPreparation[]
  const payments = [{preparation_id: 'p1', worker_id: 'w1', amount: 4.1}] as PayrollPayment[]
  expect(rhPayrollTotals(preparations, payments)).toEqual({drafts: 1, validated: 1, net: 10.25, paid: 4.1, remaining: 6.15, cost: 14.1})
  expect(rhPayrollTotals([{...preparations[0], rows: [{worker_id: 'w1'}] as PayrollPreparation['rows']}], []).net).toBeNull()
  expect(rhPayrollTotals([], []).net).toBe(0)
})

it('checks attendance, payroll and payment independently for each recorded fortnight', () => {
  const period = {id: 'a1', farm_id: 'f1', start_date: '2026-09-01', end_date: '2026-09-15', status: 'validated'} as AttendancePeriod
  const preparation = {id: 'p1', farm_id: 'f1', start_date: period.start_date, end_date: period.end_date, status: 'validated', rows: [{worker_id: 'w1', net_salary: 100}]} as PayrollPreparation
  const payment = {preparation_id: 'p1', worker_id: 'w1', amount: 100} as PayrollPayment
  expect(rhFortnightChecks([period], [preparation], [payment])[0].complete).toBe(true)
  expect(rhFortnightChecks([{...period, status: 'draft'}], [preparation], [payment])[0]).toMatchObject({complete: false, attendanceOk: false, paymentOk: true})
  expect(rhFortnightChecks([period], [preparation], [{...payment, amount: 50}])[0]).toMatchObject({complete: false, paymentOk: false, remaining: 50})
  expect(rhFortnightChecks([period], [], [])[0]).toMatchObject({complete: false, payrollLabel: 'À préparer'})
  expect(rhFortnightChecks([], [preparation], [payment])[0]).toMatchObject({complete: false, attendanceLabel: 'Pointage manquant'})
  expect(rhFortnightChecks([period], [{...preparation, status: 'draft'}], [payment])[0].complete).toBe(false)
  expect(rhFortnightChecks([period], [{...preparation, rows: [{worker_id: 'w1', net_salary: 0}] as PayrollPreparation['rows']}], [])[0].complete).toBe(true)
  expect(rhFortnightChecks([period], [{...preparation, rows: [{worker_id: 'w1'}] as PayrollPreparation['rows']}], [payment])[0].complete).toBe(false)
  expect(rhFortnightChecks([period], [{...preparation, farm_id: 'f2'}], [payment])).toHaveLength(2)
})

it('finds entirely missing fortnights from campaign start across years and leap February', () => {
  const campaign = {id: 'c1', farm_id: 'f1', name: 'Campaign', preparation_start: '2023-12-20', planting_start: null, harvest_start: null, campaign_end: null} as RhCampaign
  const expected = expectedCampaignFortnights([campaign], '2024-03-03')
  expect(expected.periods.map(item => [item.start_date, item.end_date])).toEqual([
    ['2023-12-16', '2023-12-31'], ['2024-01-01', '2024-01-15'], ['2024-01-16', '2024-01-31'], ['2024-02-01', '2024-02-15'], ['2024-02-16', '2024-02-29'],
  ])
  expect(rhFortnightChecks([], [], [], expected.periods)).toHaveLength(5)
  expect(rhFortnightChecks([], [], [], expected.periods).every(item => item.unrecorded && !item.complete)).toBe(true)
  expect(expectedCampaignFortnights([{...campaign, preparation_start: '2024-02-01', planting_start: '2024-01-01', campaign_end: '2024-02-20'}], '2024-03-03').periods).toHaveLength(2)
  expect(expectedCampaignFortnights([{...campaign, preparation_start: null, planting_start: '2024-01-01', harvest_start: '2024-02-01'}], '2024-03-03').missingDates).toEqual(['Campaign'])
  expect(expectedCampaignFortnights([campaign, campaign], '2024-03-03').periods).toHaveLength(5)
  expect(expectedCampaignFortnights([{...campaign, preparation_start: '2024-03-01'}], '2024-03-15').periods).toHaveLength(0)
  expect(expectedCampaignFortnights([{...campaign, preparation_start: '2024-03-01'}], '2024-03-16').periods).toHaveLength(1)
})
