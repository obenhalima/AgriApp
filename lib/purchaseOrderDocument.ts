import {supabase} from './supabase'
import {requireReferenceDomain} from './clientReferenceScope'
import {recordedNumber,type InvoiceDocument} from './invoiceDocumentModel'

/** Read only; explicit tenant scope supplements existing RLS. */
export async function loadPurchaseOrderDocument(domainId:string,id:string):Promise<InvoiceDocument>{
 const domain=requireReferenceDomain(domainId);requireReferenceDomain(id)
 const {data:po,error}=await supabase.from('purchase_orders').select('*').eq('domain_id',domain).eq('id',id).maybeSingle()
 if(error||!po)throw Error('Bon de commande introuvable ou inaccessible pour le client sélectionné.')
 const [org,supplier]=await Promise.all([
  supabase.from('domains').select('id,name,legal_name,address,city,country').eq('id',domain).maybeSingle(),
  supabase.from('suppliers').select('name,address,city,country,email,phone,tax_id').eq('domain_id',domain).eq('id',po.supplier_id).maybeSingle(),
 ])
 if(org.error||!org.data||supplier.error||!supplier.data)throw Error('Coordonnées de l’exploitation ou du fournisseur indisponibles. Réessayez.')
 const lines:InvoiceDocument['lines']=[]
 for(let offset=0;;offset+=500){
  const r=await supabase.from('purchase_order_lines').select('id,item_description,quantity,unit,unit_price,line_total').eq('domain_id',domain).eq('po_id',id).order('id').range(offset,offset+499)
  if(r.error)throw Error('Chargement des articles impossible. Aucun document incomplet ne sera généré.')
  lines.push(...(r.data||[]).map(l=>({description:l.item_description,quantity:recordedNumber(l.quantity),unit:l.unit||'',price:recordedNumber(l.unit_price),amount:recordedNumber(l.line_total),source:''})))
  if(!r.data||r.data.length<500)break
 }
 const currency=typeof po.currency==='string'&&po.currency.trim()?po.currency.trim():null,warnings:string[]=[]
 if(!currency)warnings.push('Devise non renseignée. Aucune devise n’a été déduite.')
 if(po.status==='brouillon')warnings.push('BROUILLON - bon non validé, ne pas transmettre au fournisseur.')
 if(!lines.length)warnings.push('Ce bon ne comporte aucun article enregistré.')
 if(lines.length&&lines.every(l=>l.amount!==null)&&recordedNumber(po.subtotal)!==null&&Math.abs(lines.reduce((n,l)=>n+(l.amount||0),0)-Number(po.subtotal))>.02)warnings.push('Le détail des lignes diffère du sous-total enregistré. Les montants enregistrés sont conservés.')
 const statuses:Record<string,string>={brouillon:'Brouillon',envoye:'Envoyé',recu:'Reçu',partiellement_recu:'Partiellement reçu',facture:'Facturé',paye:'Payé',annule:'Annulé',valide:'Validé',approuve:'Approuvé'}
 return {documentType:'purchase',kind:'client',domainId:domain,invoice:{...po,invoice_number:po.po_number,invoice_date:po.order_date,due_date:po.expected_delivery,status:statuses[po.status]||po.status},issuer:{...org.data,name:org.data.legal_name||org.data.name},recipient:supplier.data,currency,lines,payments:[],warnings}
}
