import type {PayrollPreparation, PayrollPayment} from './payrollPreparation'

// Use the validated amounts saved by payroll, never today's rates or tax rules.
export function attendancePaymentSummary(preparation: PayrollPreparation | undefined, payments: PayrollPayment[]) {
  if (!preparation) return {label: 'Paie à préparer', net: null, paid: null, remaining: null}
  if (preparation.status !== 'validated') return {label: 'Paie en brouillon', net: null, paid: null, remaining: null}
  if (preparation.rows.some(row => row.net_salary == null)) return {label: 'Paiement à vérifier', net: null, paid: null, remaining: null}
  const paidByWorker = new Map<string, number>()
  for (const payment of payments) {
    if (payment.preparation_id !== preparation.id) continue
    paidByWorker.set(payment.worker_id, (paidByWorker.get(payment.worker_id) || 0) + Math.round(Number(payment.amount) * 100))
  }
  let net = 0, paid = 0, remaining = 0
  for (const row of preparation.rows) {
    const due = Math.max(0, Math.round(Number(row.net_salary) * 100))
    const received = paidByWorker.get(row.worker_id) || 0
    net += due
    paid += received
    remaining += Math.max(0, due - received)
  }
  const label = net === 0 ? 'Aucun montant à payer' : remaining === 0 ? 'Payé' : paid > 0 ? 'Partiellement payé' : 'À payer'
  return {label, net: net / 100, paid: paid / 100, remaining: remaining / 100}
}
