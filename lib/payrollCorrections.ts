import {payrollLineAmounts, type PayrollPayment, type PayrollPreparationLine} from './payrollPreparation'

// Compare employee balances individually. One employee's overpayment must never
// offset another employee's unpaid amount.
export function payrollCorrectionChanges(original: PayrollPreparationLine[], revised: PayrollPreparationLine[], payments: PayrollPayment[], saved = false) {
  const cents = (value: number | undefined) => Math.round(Number(value || 0) * 100)
  const before = new Map(original.map(row => [row.worker_id, row]))
  const after = new Map(revised.map(row => [row.worker_id, row]))
  return [...new Set([...before.keys(), ...after.keys()])].map(id => {
    const previous = before.get(id), current = after.get(id)
    const amounts = current ? saved ? current : payrollLineAmounts(current) : undefined
    const netBefore = cents(previous?.net_salary), netAfter = cents(amounts?.net_salary)
    const costBefore = cents(previous?.total_employer_cost), costAfter = cents(amounts?.total_employer_cost)
    const paid = payments.filter(payment => payment.worker_id === id).reduce((sum, payment) => sum + cents(Number(payment.amount)), 0)
    return {worker: id, name: current?.worker_name || previous?.worker_name || '', netBefore: netBefore / 100, netAfter: netAfter / 100,
      netDelta: (netAfter - netBefore) / 100, costBefore: costBefore / 100, costAfter: costAfter / 100, costDelta: (costAfter - costBefore) / 100,
      paid: paid / 100, remaining: Math.max(0, netAfter - paid) / 100, overpaid: Math.max(0, paid - netAfter) / 100}
  })
}
