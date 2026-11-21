import type {PayrollPayment, PayrollPreparation} from './payrollPreparation'

// Never recompute a validated net with today's employee rates. Keep balances
// per employee so that an overpayment cannot pay another employee's salary.
export function payrollSettlementPreview(preparation: PayrollPreparation, payments: PayrollPayment[]) {
  let invalid = false
  const rows = preparation.rows.map(row => {
    const value = row.net_salary
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) invalid = true
    const net = value == null ? 0 : Math.round(Number(value) * 100)
    const paid = payments.filter(payment => payment.preparation_id === preparation.id && payment.worker_id === row.worker_id)
      .reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0)
    return {worker: row.worker_id, name: row.worker_name || '', net: net / 100, paid: paid / 100,
      remaining: Math.max(0, net - paid) / 100, overpaid: Math.max(0, paid - net) / 100}
  })
  const sum = (key: 'net' | 'paid' | 'remaining' | 'overpaid') => rows.reduce((total, row) => total + Math.round(row[key] * 100), 0) / 100
  return {rows, net: sum('net'), paid: sum('paid'), remaining: sum('remaining'), overpaid: sum('overpaid'),
    count: rows.filter(row => row.remaining > 0).length,
    canSettle: !invalid && preparation.status === 'validated' && !preparation.correction_id && rows.some(row => row.remaining > 0)}
}
