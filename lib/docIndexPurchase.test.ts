import {expect,it} from 'vitest'
import {parseDocIndexSummary,docIndexPurchasePrefill} from './docIndexPurchase'
const id='3f6c2a1e-0000-4000-a000-000000000000'
const summary={id,stage:'validated',flow:'purchase',invoice_number:'TEST-001',supplier:'SAOS',currency:'MAD',total:'225.00',document_type:'invoice'}
it('only prefills validated purchase invoices; never infers dates or TTC',()=>{
 const parsed=parseDocIndexSummary(summary,id),draft=docIndexPurchasePrefill(parsed,'MAD')
 expect(draft.invoiceNumber).toBe('TEST-001');expect(draft.invoiceDate).toBe('');expect(draft.dueDate).toBe('');expect(draft.totalAmount).toBeUndefined()
 for(const stage of ['reading','to_review','rejected','reading_failed'])expect(()=>docIndexPurchasePrefill({...parsed,stage},'MAD')).toThrow()
 expect(()=>docIndexPurchasePrefill({...parsed,flow:'sale'},'MAD')).toThrow()
 expect(()=>docIndexPurchasePrefill({...parsed,currency:'EUR'},'MAD')).toThrow()
 expect(()=>docIndexPurchasePrefill({...parsed,document_type:'credit_note'},'MAD')).toThrow()
})
it('rejects wrong identifiers, malformed amounts and incomplete validated summaries',()=>{
 expect(()=>parseDocIndexSummary({...summary,id:'other'},id)).toThrow()
 expect(()=>parseDocIndexSummary({...summary,total:'1,200'},id)).toThrow()
 expect(()=>docIndexPurchasePrefill(parseDocIndexSummary({...summary,supplier:null},id),'MAD')).toThrow()
})
