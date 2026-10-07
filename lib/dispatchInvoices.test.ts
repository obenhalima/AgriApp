import { describe, expect, it } from 'vitest'
import { linkedDispatchInvoices } from './dispatchInvoices'
const invoice = {id:'i1',total_amount:1000,paid_amount:250,currency:'MAD',invoice_type:'vente'}
describe('explicit dispatch invoice reconciliation', () => {
 it('deduplicates shared direct and settlement invoice links', () => {
  const result=linkedDispatchInvoices([{invoices:invoice},{allocations:[{station_settlement_lines:{station_settlements:{invoices:invoice}}}]}])
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({total:1000,paid:250,balance:750})
 })
 it('never invents a missing invoice or treats missing payment as zero', () => {
  expect(linkedDispatchInvoices([{}])).toEqual([])
  expect(linkedDispatchInvoices([{invoices:{...invoice,paid_amount:null}}])[0].balance).toBeNull()
 })
 it('keeps overpayments visible and excludes credit notes from sales amounts', () => {
  expect(linkedDispatchInvoices([{invoices:{...invoice,paid_amount:1200}}])[0].balance).toBe(-200)
  expect(linkedDispatchInvoices([{invoices:{...invoice,invoice_type:'avoir'}}])[0].total).toBeNull()
 })
})
