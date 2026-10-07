type Invoice = { id: string; invoice_number?: string; currency?: string; total_amount: number | string; paid_amount: number | string; invoice_type?: string; status?: string }
export function linkedDispatchInvoices(rows: any[]) {
 const invoices = new Map<string, Invoice>()
 for (const row of rows) {
  const linked = [row.invoices, ...(row.allocations || []).map((a: any) => a.station_settlement_lines?.station_settlements?.invoices)]
  for (const invoice of linked) if (invoice?.id) invoices.set(invoice.id, invoice)
 }
 return Array.from(invoices.values()).map(invoice => {
  const total = invoice.total_amount == null ? NaN : Number(invoice.total_amount)
  const paid = invoice.paid_amount == null ? NaN : Number(invoice.paid_amount)
  const valid = Number.isFinite(total) && Number.isFinite(paid) && total >= 0 && paid >= 0 && invoice.invoice_type === 'vente' && invoice.status !== 'annulee' && invoice.status !== 'annule'
  return { ...invoice, total: valid ? total : null, paid: valid ? paid : null, balance: valid ? total - paid : null }
 })
}
