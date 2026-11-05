import {describe,it,expect} from 'vitest'
import {invoiceTitle,invoiceTotals,invoiceFilename,type InvoiceDocument} from './invoiceDocumentModel'
import {readFileSync} from 'node:fs'
describe('BDC document',()=>{
 const doc:InvoiceDocument={documentType:'purchase',kind:'client',domainId:'test',invoice:{invoice_number:'BDC-001',subtotal:100,tax_amount:20,total_amount:120},issuer:{name:'Ferme'},recipient:{name:'Fournisseur'},currency:'MAD',lines:[],payments:[],warnings:[]}
 it('keeps purchase semantics and recorded totals',()=>{
  expect(invoiceTitle(doc)).toBe('BON DE COMMANDE')
  expect(invoiceFilename(doc)).toBe('ITRIX-BDC-BDC-001.pdf')
  expect(invoiceTotals(doc)).toEqual([['Sous-total HT',100],['Taxes',20],['Total du bon',120]])
 })
 it('loads tenant-scoped data read only and paginates lines',()=>{
  const source=readFileSync('lib/purchaseOrderDocument.ts','utf8')
  expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/)
  expect(source.match(/eq\('domain_id',domain\)/g)).toHaveLength(3)
  expect(source).toContain('.range(offset,offset+499)')
  expect(source).not.toContain("||'EUR'")
 })
})
