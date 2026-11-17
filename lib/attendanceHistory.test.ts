import {describe, expect, it} from 'vitest'
import {attendancePaymentSummary} from './attendanceHistory'
import type {PayrollPreparation, PayrollPayment} from './payrollPreparation'

const preparation = {id: 'p1', status: 'validated', rows: [{worker_id: 'w1', net_salary: 100}, {worker_id: 'w2', net_salary: 50}]} as PayrollPreparation
const payment = (worker: string, amount: number, id = 'p1') => ({worker_id: worker, amount, preparation_id: id}) as PayrollPayment

describe('attendance payment history', () => {
  it('distinguishes missing and draft payroll from validated unpaid payroll', () => {
    expect(attendancePaymentSummary(undefined, []).label).toBe('Paie à préparer')
    expect(attendancePaymentSummary({...preparation, status: 'draft'}, []).net).toBeNull()
    expect(attendancePaymentSummary(preparation, [])).toEqual({label: 'À payer', net: 150, paid: 0, remaining: 150})
  })
  it('uses saved net amounts and multiple partial payments in cents', () => {
    expect(attendancePaymentSummary(preparation, [payment('w1', 40.1), payment('w1', 59.9)])).toEqual({label: 'Partiellement payé', net: 150, paid: 100, remaining: 50})
    expect(attendancePaymentSummary(preparation, [payment('w1', 100), payment('w2', 50), payment('w1', 100, 'other')]).label).toBe('Payé')
  })
  it('does not let an overpayment for one worker hide an unpaid worker', () => {
    expect(attendancePaymentSummary(preparation, [payment('w1', 150)]).remaining).toBe(50)
  })
  it('distinguishes zero net and missing historical amounts from paid', () => {
    expect(attendancePaymentSummary({...preparation, rows: []}, []).label).toBe('Aucun montant à payer')
    expect(attendancePaymentSummary({...preparation, rows: [{worker_id: 'w1'}] as PayrollPreparation['rows']}, []).label).toBe('Paiement à vérifier')
  })
})
