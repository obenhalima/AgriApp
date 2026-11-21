import {describe, expect, it} from 'vitest'
import {payrollSettlementPreview} from './payrollSettlement'
import type {PayrollPayment, PayrollPreparation} from './payrollPreparation'
const prep = {id: 'p1', status: 'validated', rows: [{worker_id: 'w1', worker_name: 'Employé A', net_salary: 100}, {worker_id: 'w2', worker_name: 'Employé B', net_salary: 50}, {worker_id: 'w3', net_salary: 0}]} as PayrollPreparation
const payment = (worker: string, amount: number, preparation = 'p1') => ({worker_id: worker, amount, preparation_id: preparation}) as PayrollPayment
describe('fortnight settlement preview', () => {
  it('settles only the remaining salary after partial/full payments', () => {
    const result = payrollSettlementPreview(prep, [payment('w1', 40), payment('w2', 50), payment('w1', 999, 'other-period')])
    expect(result).toMatchObject({net: 150, paid: 90, remaining: 60, count: 1, canSettle: true})
    expect(result.rows[0]).toMatchObject({name: 'Employé A', remaining: 60})
  })
  it('does not offset an overpayment against another employee', () => {
    expect(payrollSettlementPreview(prep, [payment('w1', 120)])).toMatchObject({remaining: 50, overpaid: 20, count: 1, canSettle: true})
  })
  it('does not offer settlement for drafts, corrections, missing amounts or paid salaries', () => {
    expect(payrollSettlementPreview({...prep, status: 'draft'}, []).canSettle).toBe(false)
    expect(payrollSettlementPreview({...prep, correction_id: 'open'}, []).canSettle).toBe(false)
    expect(payrollSettlementPreview({...prep, rows: [{worker_id: 'w1'}] as PayrollPreparation['rows']}, []).canSettle).toBe(false)
    expect(payrollSettlementPreview(prep, [payment('w1', 100), payment('w2', 50)])).toMatchObject({remaining: 0, count: 0, canSettle: false})
  })
  it('uses exact currency cents for multiple small partial payments', () => {
    const small = {...prep, rows: [{worker_id: 'w1', net_salary: 0.3}]} as PayrollPreparation
    expect(payrollSettlementPreview(small, [payment('w1', 0.1), payment('w1', 0.1)])).toMatchObject({paid: 0.2, remaining: 0.1, count: 1})
  })
})
