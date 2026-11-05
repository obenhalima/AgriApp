import type {SupplierInvoicePrefill} from './purchaseInvoiceDocument'
export type DocIndexSummary={id:string;stage:string;flow:string;invoice_number:string|null;supplier:string|null;currency:string|null;total:string|null;document_type:string|null;error_code:string|null}
export function parseDocIndexSummary(value:unknown,expectedId:string):DocIndexSummary{
 const v=value as Record<string,unknown>|null
 if(!v||v.id!==expectedId||!['reading','to_review','validated','rejected','reading_failed'].includes(String(v.stage)))throw Error('Résumé DocIndex invalide.')
 const str=(key:string,max=200)=>typeof v[key]==='string'&&String(v[key]).length<=max?String(v[key]):null
 const total=str('total',40)
 if(total!==null&&(!/^\d+(\.\d{1,4})?$/.test(total)||!Number.isFinite(Number(total))))throw Error('Montant DocIndex invalide.')
 return {id:expectedId,stage:String(v.stage),flow:str('flow')||'',invoice_number:str('invoice_number'),supplier:str('supplier'),currency:str('currency',10),total,document_type:str('document_type'),error_code:str('error_code',80)}
}
export function docIndexPurchasePrefill(s:DocIndexSummary,currency:string):SupplierInvoicePrefill{
 if(s.stage!=='validated'||s.flow!=='purchase'||(s.document_type&&s.document_type!=='invoice'))throw Error('Une facture d’achat validée dans DocIndex est requise.')
 if(!s.invoice_number||!s.supplier||!s.currency||s.total===null)throw Error('Résumé validé incomplet : vérifiez DocIndex.')
 if(s.currency!==currency)throw Error('La devise DocIndex diffère de celle du bon. Vérifiez avant de continuer.')
 // Total semantics (TTC) and invoice dates are not part of the confirmed API contract.
 return {source:'docindex',invoiceNumber:s.invoice_number,currency:s.currency,requireOriginalNumber:true,invoiceDate:'',dueDate:''}
}
