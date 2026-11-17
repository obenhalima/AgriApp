import {expect, it} from 'vitest'
import {calculateNetPayroll, type NetPayrollContext} from './netPayroll'
import {newPayrollLine, payrollLineAmounts, payrollLineIssues} from './payrollPreparation'
const worker = {id: 'w', farm_id: 'f', first_name: '', last_name: 'EMPLOYE', matricule: 'EMP01', is_active: true, is_declared: true, normal_hourly_rate: 12.5, overtime_hourly_rate: 15}
it('preserves the agreed net and reconstructs employee and employer contributions', () => {
  const result = calculateNetPayroll(230, true, '2026-11-01')
  expect(result).toMatchObject({gross_salary: 246.62, net_before_adjustments: 230, cnss_employee: 11.05, amo_employee: 5.57, cnss_employer: 22.15, amo_employer: 10.14, family_allowance_employer: 15.78, prof_training_employer: 3.95, total_employer_cost: 298.64})
  expect(Math.round((result.gross_salary - result.cnss_employee - result.amo_employee - result.ir_amount) * 100)).toBe(23000)
})
it('defaults unknown declaration status to declared while preserving explicit undeclared payroll', () => {
  expect(calculateNetPayroll(230, false, '2026-11-01')).toMatchObject({gross_salary: 230, total_employer_cost: 230, cnss_employee: 0, ir_amount: 0})
  const line = {...newPayrollLine({...worker, is_declared: null}, {period: null, rows: []}), normal_hours: 16, overtime_hours: 2, deductions_confirmed: true}
  expect(payrollLineIssues(line, 15, true)).toEqual([])
  expect(calculateNetPayroll(230, null, '2026-11-01')).toEqual(calculateNetPayroll(230, true, '2026-11-01'))
  expect(payrollLineAmounts(line).gross_salary).toBe(246.62)
})
it('subtracts advances once after net acquisition and ignores caller-supplied social amounts', () => {
  const line = {...newPayrollLine(worker, {period: null, rows: []}), normal_hours: 16, overtime_hours: 2, advance: 10, cnss_employee: 999, ir_amount: 999}
  expect(payrollLineAmounts(line)).toMatchObject({gross_salary: 246.62, net_salary: 220, cnss_employee: 11.05, ir_amount: 0, total_employer_cost: 298.64})
})
it('regularises the monthly ceiling across unequal fortnights and retains exact net cents', () => {
  const first = calculateNetPayroll(4000, true, '2026-11-01', 2)
  const prior: NetPayrollContext = {...first, prior_gross: first.gross_salary}
  const second = calculateNetPayroll(1000, true, '2026-11-16', 2, prior)
  const capped = Math.min(first.gross_salary + second.gross_salary, 6000)
  expect(Math.round((first.cnss_employee + second.cnss_employee) * 100)).toBe(Math.round(capped * .0448 * 100))
  expect(Math.round((second.gross_salary - second.cnss_employee - second.amo_employee - second.ir_amount) * 100)).toBe(100000)
})
it('handles professional expense thresholds, taxable income and dependent deductions without changing the net', () => {
  for (const amount of [0, .01, .03, 100, 230, 1000, 2800, 3000, 3100, 3200, 4000, 5000, 8000, 18000, 99999]) {
    const result = calculateNetPayroll(amount, true, '2026-11-01', 2)
    expect(Math.round((result.gross_salary - result.cnss_employee - result.amo_employee - result.ir_amount) * 100)).toBe(Math.round(amount * 100))
  }
  const noDependents = calculateNetPayroll(5000, true, '2026-11-01', 0)
  const dependents = calculateNetPayroll(5000, true, '2026-11-01', 2)
  expect(dependents.gross_salary).toBeLessThan(noDependents.gross_salary)
  expect(dependents.ir_amount).toBeGreaterThan(0)
})
