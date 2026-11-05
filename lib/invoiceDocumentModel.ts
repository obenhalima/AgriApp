export type InvoiceKind = 'client' | 'fournisseur'
export type InvoiceParty = {name:string;address?:string;city?:string;country?:string;tax_id?:string;email?:string;phone?:string}
export type InvoiceLine = {description:string;quantity:number|null;unit:string;price:number|null;amount:number|null;source:string}
export type InvoiceDocument = {
  documentType?:'purchase';
  kind:InvoiceKind;domainId:string;invoice:Record<string,any>;issuer:InvoiceParty;recipient:InvoiceParty;
  currency:string|null;lines:InvoiceLine[];payments:Record<string,any>[];warnings:string[]
}
export function recordedNumber(value:unknown):number|null {
  if(value===null||value===undefined||value==='')return null
  const number=Number(value);return Number.isFinite(number)?number:null
}
export function invoiceMoney(value:unknown,currency:string|null){
  const number=recordedNumber(value)
  return number===null?'Non renseigné':`${new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(number)} ${currency||'(devise non renseignée)'}`
}
export function invoiceQuantity(value:unknown){const n=recordedNumber(value);return n===null?'—':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:4}).format(n)}
export function invoiceDate(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return 'Non renseignée'
  const [year,month,day]=value.slice(0,10).split('-');return `${day}/${month}/${year}`
}
export function invoiceTitle(doc:InvoiceDocument){return doc.documentType==='purchase'?'BON DE COMMANDE':doc.invoice.invoice_type==='avoir'?'AVOIR':doc.kind==='fournisseur'?'FACTURE FOURNISSEUR':'FACTURE'}
export function invoiceStatus(value:string){return ({en_attente:'En attente',partiellement_paye:'Partiellement réglée',paye:'Soldée',annule:'Annulée',annulee:'Annulée',en_retard:'En retard'} as Record<string,string>)[value]||value||'Non renseigné'}
export function invoiceTotals(doc:InvoiceDocument){
  const i=doc.invoice,total=recordedNumber(i.total_amount),paid=recordedNumber(i.paid_amount)
  if(doc.documentType==='purchase')return [['Sous-total HT',recordedNumber(i.subtotal)],['Taxes',recordedNumber(i.tax_amount)],['Total du bon',total]] as const
  return [
    ['Sous-total enregistré',recordedNumber(i.subtotal)],['Taxes enregistrées',recordedNumber(i.tax_amount)],
    ['Total de la facture',total],['Paiements enregistrés',paid],
    ['Solde',recordedNumber(i.balance)??(total!==null&&paid!==null?Math.round((total-paid)*100)/100:null)],
  ] as const
}
export function finishInvoiceDocument(doc:InvoiceDocument):InvoiceDocument {
  if(!doc.currency)doc.warnings.push('La devise de cette facture n’est pas renseignée. Aucune devise n’a été déduite.')
  if(!doc.lines.length)doc.lines.push({description:'Montant global enregistré - détail des articles non disponible',quantity:null,unit:'',price:null,amount:recordedNumber(doc.invoice.subtotal),source:'Facture enregistrée'})
  else {
    const subtotal=recordedNumber(doc.invoice.subtotal)
    if(subtotal!==null&&doc.lines.every(l=>l.amount!==null)&&Math.abs(doc.lines.reduce((s,l)=>s+(l.amount||0),0)-subtotal)>0.02)
      doc.warnings.push('Le détail lié diffère du sous-total de la facture. Les totaux ci-dessous sont ceux de la facture enregistrée ; aucun montant n’a été recalculé pour les remplacer.')
  }
  const paid=recordedNumber(doc.invoice.paid_amount)
  if(paid!==null&&Math.abs(doc.payments.reduce((s,p)=>s+(recordedNumber(p.amount)||0),0)-paid)>0.02)
    doc.warnings.push('Le journal des paiements disponible ne correspond pas au cumul enregistré sur la facture. Le cumul enregistré est conservé.')
  doc.warnings=Array.from(new Set(doc.warnings))
  return doc
}
export function invoiceFilename(doc:InvoiceDocument){
  const name=String(doc.invoice.invoice_number||doc.invoice.id).normalize('NFKC').replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,100)
  return `ITRIX-${doc.documentType==='purchase'?'BDC':doc.kind}-${name}.pdf`
}
