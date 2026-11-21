import {describe, expect, it} from 'vitest'
import {payrollCorrectionChanges} from './payrollCorrections'
import {attendancePaymentSummary} from './attendanceHistory'
import {newPayrollLine, type PayrollPreparation, type PayrollPayment, type PayrollWorker} from './payrollPreparation'

const row = {...newPayrollLine({id: 'w1', first_name: '', last_name: 'TEST', is_declared: false, normal_hourly_rate: 10} as PayrollWorker, {period: null, rows: []}), normal_hours: 8, overtime_hours: 0, normal_rate: 10, overtime_rate: 0, net_salary: 80, total_employer_cost: 80}
describe('payroll corrections', () => {
  it('compares live corrected inputs rather than the old stored net', () => {
    const result = payrollCorrectionChanges([row], [{...row, normal_rate: 15}], [])
    expect(result[0]).toMatchObject({name: 'TEST', netBefore: 80, netAfter: 120, netDelta: 40, costDelta: 40, remaining: 120, overpaid: 0})
  })
  it('uses frozen amounts for historical revisions', () => {
    const result = payrollCorrectionChanges([row], [{...row, normal_rate: 999, net_salary: 100, total_employer_cost: 112.34}], [], true)
    expect(result[0]).toMatchObject({netAfter: 100, costAfter: 112.34, costDelta: 32.34})
  })
  it('does not offset overpayments against other employees', () => {
    const payments = [{worker_id: 'w1', amount: 50.1}, {worker_id: 'w1', amount: 49.9}] as PayrollPayment[]
    const result = payrollCorrectionChanges([row], [row, {...row, worker_id: 'w2'}], payments)
    expect(result[0]).toMatchObject({paid: 100, overpaid: 20, remaining: 0})
    expect(result[1]).toMatchObject({paid: 0, overpaid: 0, remaining: 80})
  })
  it('keeps published balances visible while a correction draft is being edited', () => {
    const preparation = {id: 'p1', status: 'draft', correction_id: 'c1', published_rows: [row], rows: [{...row, net_salary: 100}]} as PayrollPreparation
    expect(attendancePaymentSummary(preparation, [{preparation_id: 'p1', worker_id: 'w1', amount: 50}] as PayrollPayment[])).toMatchObject({net: 80, paid: 50, remaining: 30})
  })
  it('labels overpaid validated payroll explicitly, including zero-net corrections', () => {
    const preparation = {id: 'p1', status: 'validated', rows: [{...row, net_salary: 0}]} as PayrollPreparation
    expect(attendancePaymentSummary(preparation, [{preparation_id: 'p1', worker_id: 'w1', amount: 50}] as PayrollPayment[])).toMatchObject({label: 'Trop-perçu à régulariser', net: 0, paid: 50, remaining: 0})
  })
})
