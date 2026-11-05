import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {invoiceFileType,checkInvoicePrefill} from './purchaseInvoiceDocument'
it('accepts supported file signatures, not disguised HTML or empty/oversized documents',()=>{
 expect(invoiceFileType(new TextEncoder().encode('%PDF-1.4'))).toBe('application/pdf')
 expect(invoiceFileType(new Uint8Array([255,216,255,0]))).toBe('image/jpeg')
 expect(invoiceFileType(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe('image/png')
 expect(()=>invoiceFileType(new TextEncoder().encode('<html>not a PDF'))).toThrow()
 expect(()=>invoiceFileType(new Uint8Array())).toThrow()
 expect(()=>invoiceFileType(new Uint8Array(4_000_001))).toThrow()
})
it('requires consistent recorded totals and the purchase currency before confirmation',()=>{
 expect(()=>checkInvoicePrefill({source:'docindex',currency:'EUR'},'MAD')).toThrow('devise')
 expect(()=>checkInvoicePrefill({source:'docindex',subtotal:'100',taxAmount:'20',totalAmount:'119'},'MAD')).toThrow('TTC')
 expect(()=>checkInvoicePrefill({source:'docindex',subtotal:'-1'},'MAD')).toThrow()
 expect(()=>checkInvoicePrefill({source:'docindex',currency:'MAD',subtotal:'100',taxAmount:'20',totalAmount:'120'},'MAD')).not.toThrow()
})
it('keeps local document storage independent from external transmission and validates tenant/permissions',()=>{
 const route=readFileSync('app/api/purchases/invoice-documents/route.ts','utf8')
 expect(route).toContain("db.rpc('has_domain_permission'")
 expect(route).toContain(".eq('domain_id',domain).eq('id',po)")
 expect(route).toContain('invoiceFileType(bytes)')
 expect(route).not.toContain('sendDocIndexFixture')
 const form=readFileSync('components/purchase/SupplierInvoiceModal.tsx','utf8')
 expect(form).toContain('domain_id:activeDomain.domain_id')
 expect(form).toContain('CONFIRMER ET CRÉER LA FACTURE')
 expect(form).toContain('checkInvoicePrefill')
})
