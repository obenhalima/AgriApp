import {supabase} from './supabase'
import {requireReferenceDomain} from './clientReferenceScope'
import {finishInvoiceDocument,recordedNumber,type InvoiceDocument,type InvoiceKind,type InvoiceLine,type InvoiceParty} from './invoiceDocumentModel'

/** GET/SELECT only. RLS stays active and every business lookup has an explicit tenant. */
export async function loadInvoiceDocument(domainId:string,id:string,kind:InvoiceKind):Promise<InvoiceDocument>{
  const domain=requireReferenceDomain(domainId);requireReferenceDomain(id)
  if(kind!=='client'&&kind!=='fournisseur')throw Error('Type de facture invalide.')
  const table=kind==='client'?'invoices':'supplier_invoices'
  const result=await supabase.from(table).select('*').eq('domain_id',domain).eq('id',id).maybeSingle()
  if(result.error)throw Error('Impossible de consulter cette facture. Vérifiez vos droits puis réessayez.')
  if(!result.data)throw Error('Facture introuvable ou inaccessible pour le client sélectionné.')
  const invoice=result.data,warnings:string[]=[]
  async function rows(make:()=>any):Promise<any[]>{
    const all:any[]=[]
    for(let offset=0;;offset+=500){const {data,error}=await make().order('id').range(offset,offset+499);if(error)throw error;all.push(...data||[]);if(!data||data.length<500)return all}
  }
  async function optional<T>(label:string,load:()=>Promise<T>,fallback:T):Promise<T>{try{return await load()}catch{warnings.push(`${label} indisponible. Cette édition peut être incomplète ; la facture enregistrée n’est pas modifiée.`);return fallback}}
  const org=await supabase.from('domains').select('id,name,legal_name,address,city,country').eq('id',domain).maybeSingle()
  if(org.error||!org.data)throw Error('Identité de l’exploitation indisponible. Impossible de produire une facture avec un émetteur fiable.')
  const partyTable=kind==='client'?'clients':'suppliers',partyId=kind==='client'?invoice.client_id:invoice.supplier_id
  const party=await supabase.from(partyTable).select('*').eq('domain_id',domain).eq('id',partyId).maybeSingle()
  if(party.error||!party.data)throw Error('Identité du client ou du fournisseur indisponible. Impossible de produire le document.')
  const domainParty:InvoiceParty={...org.data,name:org.data.legal_name||org.data.name}
  const businessParty:InvoiceParty={name:party.data.name,address:party.data.address,city:party.data.city,country:party.data.country,tax_id:party.data.tax_id,email:party.data.email,phone:party.data.phone}
  const payments=await optional('Journal des paiements',()=>rows(()=>supabase.from(kind==='client'?'payments_received':'payments_made').select('id,payment_date,amount,payment_method,reference').eq('domain_id',domain).eq(kind==='client'?'invoice_id':'supplier_invoice_id',id)),[])
  let lines:InvoiceLine[]=[]
  if(kind==='client'){
    const settlements=await optional('Bordereaux liés',()=>rows(()=>supabase.from('station_settlements').select('id,code').eq('domain_id',domain).eq('invoice_id',id)),[])
    const lots=await optional('Lots liés',()=>rows(()=>supabase.from('harvest_lots').select('id,lot_number,harvest_date,qty_acceptee_kg,price_per_kg,ca_amount,varieties!harvest_lots_variety_id_fkey(commercial_name)').eq('domain_id',domain).eq('invoice_id',id)),[])
    if(settlements.length){
      for(const settlement of settlements){
        const detail=await optional(`Détail du bordereau ${settlement.code}`,()=>rows(()=>supabase.from('station_settlement_lines').select('id,qty_kg,price_per_kg,amount,markets!station_settlement_lines_market_id_fkey(name),varieties!station_settlement_lines_variety_id_fkey(commercial_name)').eq('domain_id',domain).eq('settlement_id',settlement.id)),[])
        lines.push(...detail.map(l=>({description:[l.markets?.name,l.varieties?.commercial_name].filter(Boolean).join(' / ')||'Ligne de bordereau',quantity:recordedNumber(l.qty_kg),unit:'kg',price:recordedNumber(l.price_per_kg),amount:recordedNumber(l.amount),source:`Bordereau ${settlement.code}`})))
      }
      if(lots.length)warnings.push('Cette facture est liée à des bordereaux et à des lots directs. Le détail des bordereaux est présenté sans additionner deux fois les sources.')
    }else if(lots.length){
      lines=lots.map(l=>({description:[l.lot_number,l.varieties?.commercial_name,l.harvest_date].filter(Boolean).join(' / '),quantity:recordedNumber(l.qty_acceptee_kg),unit:'kg',price:recordedNumber(l.price_per_kg),amount:recordedNumber(l.ca_amount),source:'Envoi station lié'}))
    }else if(invoice.order_id){
      const order=await supabase.from('sales_orders').select('id').eq('domain_id',domain).eq('id',invoice.order_id).eq('client_id',invoice.client_id).maybeSingle()
      if(order.data&&!order.error){
        const detail=await optional('Détail de la commande de vente',()=>rows(()=>supabase.from('sales_order_lines').select('id,ordered_qty,unit_price,line_total,varieties!sales_order_lines_variety_id_fkey(commercial_name)').eq('domain_id',domain).eq('order_id',invoice.order_id)),[])
        lines=detail.map(l=>({description:l.varieties?.commercial_name||'Article de la commande',quantity:recordedNumber(l.ordered_qty),unit:'kg',price:recordedNumber(l.unit_price),amount:recordedNumber(l.line_total),source:'Commande de vente liée'}))
        warnings.push('Le détail provient de la commande liée. Il ne constitue pas une ventilation certifiée des éventuelles factures partielles.')
      }else warnings.push('Commande de vente liée inaccessible pour ce client.')
    }
  }else if(invoice.po_id){
    const order=await supabase.from('purchase_orders').select('id,po_number').eq('domain_id',domain).eq('id',invoice.po_id).eq('supplier_id',invoice.supplier_id).maybeSingle()
    if(order.data&&!order.error){
      const orderNumber=order.data.po_number
      const detail=await optional('Détail de la commande d’achat',()=>rows(()=>supabase.from('purchase_order_lines').select('id,item_description,quantity,unit,unit_price,line_total').eq('domain_id',domain).eq('po_id',invoice.po_id)),[])
      lines=detail.map(l=>({description:l.item_description,quantity:recordedNumber(l.quantity),unit:l.unit||'',price:recordedNumber(l.unit_price),amount:recordedNumber(l.line_total),source:`Commande ${orderNumber}`}))
      warnings.push('Le détail provient de la commande d’achat liée et peut différer de la facture du fournisseur. Cette édition ne remplace pas son document original.')
    }else warnings.push('Commande d’achat liée inaccessible pour ce client.')
  }
  return finishInvoiceDocument({kind,domainId:domain,invoice,issuer:kind==='client'?domainParty:businessParty,recipient:kind==='client'?businessParty:domainParty,currency:typeof invoice.currency==='string'&&invoice.currency.trim()?invoice.currency.trim():null,lines,payments:payments.sort((a,b)=>String(a.payment_date).localeCompare(String(b.payment_date))),warnings})
}
