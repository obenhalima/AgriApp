export const PURCHASE_INVOICE_MAX_BYTES=4_000_000
export type SupplierInvoicePrefill={invoiceNumber?:string;invoiceDate?:string;dueDate?:string;subtotal?:string;taxAmount?:string;totalAmount?:string;currency?:string;requireOriginalNumber?:boolean;source:'manual'|'docindex'|'simulation'}
export function invoiceFileType(bytes:Uint8Array){
 if(!bytes.length||bytes.length>PURCHASE_INVOICE_MAX_BYTES)throw Error('Fichier vide ou supérieur à 4 Mo.')
 if(new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-')return 'application/pdf'
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg'
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png'
 throw Error('Format non reconnu. Utilisez un PDF, PNG ou JPEG valide.')
}
export function checkInvoicePrefill(draft:SupplierInvoicePrefill,currency:string){
 if(draft.currency&&draft.currency!==currency)throw Error(`La devise de la facture (${draft.currency}) diffère de celle du bon (${currency}). Vérifiez le bon avant de créer la facture.`)
 for(const field of ['subtotal','taxAmount','totalAmount'] as const){const value=draft[field];if(value!==undefined&&(!value.trim()||!Number.isFinite(Number(value))||Number(value)<0))throw Error('Montants à vérifier avant confirmation.')}
 if(draft.subtotal!==undefined&&draft.taxAmount!==undefined&&draft.totalAmount!==undefined&&Math.abs(Number(draft.subtotal)+Number(draft.taxAmount)-Number(draft.totalAmount))>0.02)throw Error('Le total TTC ne correspond pas au HT augmenté des taxes.')
}
// The summary API only supplies a partial prefill; unknown amounts/dates stay manual.
export type SupplierExtractionAdapter={extract:(documentId:string)=>Promise<{stage:'reading'|'to_review'|'validated'|'rejected'|'reading_failed';draft:SupplierInvoicePrefill|null}>}
