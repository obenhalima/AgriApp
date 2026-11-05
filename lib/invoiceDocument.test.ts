import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {finishInvoiceDocument,invoiceDate,invoiceFilename,invoiceMoney,invoiceTotals,type InvoiceDocument} from './invoiceDocumentModel'
import {pdfFromJpegPages} from './invoicePdf'
const {from}=vi.hoisted(()=>({from:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{from}}))
import {loadInvoiceDocument} from './invoiceDocument'
const domain='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
const doc=():InvoiceDocument=>({kind:'client',domainId:domain,invoice:{id,invoice_number:'FD-2026-TEST',subtotal:100,tax_amount:0,total_amount:100,paid_amount:25,currency:'MAD'},issuer:{name:'Ferme QA'},recipient:{name:'Client QA'},currency:'MAD',lines:[],payments:[{id:'payment',amount:25}],warnings:[]})
beforeEach(()=>from.mockReset())
function mockRows(data:Record<string,any[]>,errorTables:string[]=[]){
 const calls:{table:string;filters:Record<string,unknown>}[]=[]
 from.mockImplementation((table:string)=>{
  const filters:Record<string,unknown>={},q:any={}
  calls.push({table,filters})
  q.select=()=>q;q.eq=(key:string,value:unknown)=>{filters[key]=value;return q};q.order=()=>q
  const response=()=>({data:errorTables.includes(table)?null:data[table]||[],error:errorTables.includes(table)?{code:'42501'}:null})
  q.range=async(start:number,end:number)=>{const r=response();return {...r,data:r.data?.slice(start,end+1)}}
  q.maybeSingle=async()=>{const r=response();return {...r,data:r.data?.[0]||null}}
  return q
 })
 return calls
}
it('uses recorded totals and never manufactures detail or currency',()=>{
 const d=doc();d.currency=null;finishInvoiceDocument(d)
 expect(d.lines[0].quantity).toBeNull();expect(d.lines[0].amount).toBe(100)
 expect(invoiceTotals(d).at(-1)).toEqual(['Solde',75])
 expect(invoiceMoney(100,null)).toContain('devise non renseignée')
 expect(invoiceMoney(100,'MAD')).not.toContain('EUR')
 expect(d.warnings.join(' ')).toContain('Aucune devise')
})
it('preserves discrepant invoice totals and flags the linked detail',()=>{
 const d=doc();d.lines=[{description:'Lot',quantity:10,unit:'kg',price:5,amount:50,source:'Lot enregistré'}]
 finishInvoiceDocument(d)
 expect(d.invoice.total_amount).toBe(100)
 expect(d.warnings.join(' ')).toContain('diffère du sous-total')
})
it('loads client details and payments with explicit tenant filters and SELECTs only',async()=>{
 const calls=mockRows({invoices:[{...doc().invoice,client_id:'client'}],domains:[{name:'Ferme QA'}],clients:[{name:'Client QA'}],payments_received:[{amount:25}],harvest_lots:[{lot_number:'LOT-ANCIEN',qty_acceptee_kg:10,price_per_kg:10,ca_amount:100,varieties:{commercial_name:'Tomate'}}]})
 const result=await loadInvoiceDocument(domain,id,'client')
 expect(result.lines[0].description).toContain('LOT-ANCIEN');expect(result.warnings).toEqual([])
 expect(calls.filter(c=>c.table!=='domains').every(c=>c.filters.domain_id===domain)).toBe(true)
 expect(calls.find(c=>c.table==='invoices')?.filters.id).toBe(id)
})
it('shows supplier identity as issuer and the tenant as recipient',async()=>{
 mockRows({supplier_invoices:[{...doc().invoice,supplier_id:'supplier',po_id:'po'}],domains:[{name:'Ferme QA'}],suppliers:[{name:'Fournisseur QA'}],payments_made:[{amount:25}],purchase_orders:[{id:'po',po_number:'BC-01'}],purchase_order_lines:[{item_description:'Engrais',quantity:2,unit:'sac',unit_price:50,line_total:100}]})
 const result=await loadInvoiceDocument(domain,id,'fournisseur')
 expect(result.issuer.name).toBe('Fournisseur QA');expect(result.recipient.name).toBe('Ferme QA')
 expect(result.warnings.join(' ')).toContain('ne remplace pas son document original')
})
it('does not mix direct lots and settlement detail into duplicate invoice amounts',async()=>{
 mockRows({invoices:[{...doc().invoice,client_id:'client'}],domains:[{name:'Ferme QA'}],clients:[{name:'Client QA'}],payments_received:[{amount:25}],station_settlements:[{id:'s',code:'B-01'}],station_settlement_lines:[{qty_kg:10,price_per_kg:10,amount:100}],harvest_lots:[{lot_number:'DUPLICATE',ca_amount:100}]})
 const result=await loadInvoiceDocument(domain,id,'client')
 expect(result.lines).toHaveLength(1);expect(result.lines[0].source).toBe('Bordereau B-01')
 expect(result.warnings.join(' ')).toContain('sans additionner deux fois')
})
it('rejects missing invoices and invalid context before exposing document data',async()=>{
 await expect(loadInvoiceDocument('',id,'client')).rejects.toThrow('client valide');expect(from).not.toHaveBeenCalled()
 mockRows({});await expect(loadInvoiceDocument(domain,id,'client')).rejects.toThrow('introuvable ou inaccessible')
})
it('marks unavailable optional sections rather than pretending their values are zero',async()=>{
 mockRows({invoices:[{...doc().invoice,client_id:'client'}],domains:[{name:'Ferme QA'}],clients:[{name:'Client QA'}]},['payments_received','harvest_lots'])
 const result=await loadInvoiceDocument(domain,id,'client')
 expect(result.invoice.paid_amount).toBe(25)
 expect(result.warnings.join(' ')).toContain('Journal des paiements indisponible')
})
it('creates a binary PDF with stable object offsets and a safe file name',async()=>{
 const blob=pdfFromJpegPages([{bytes:new Uint8Array([255,216,255,217]),width:1,height:1}])
 const content=new TextDecoder().decode(await blob.arrayBuffer())
 expect(blob.type).toBe('application/pdf');expect(content.startsWith('%PDF-1.4')).toBe(true)
 expect(content).toContain('/Count 1');expect(content).toContain('/Filter /DCTDecode')
 const pointer=Number(content.match(/startxref\n(\d+)/)?.[1]);expect(content.slice(pointer,pointer+4)).toBe('xref')
 const d=doc();d.invoice.invoice_number='../<script> facture';expect(invoiceFilename(d)).not.toMatch(/[<>/\\]/)
 expect(invoiceDate('2026-10-15')).toBe('15/10/2026')
})
it('keeps document rendering read-only and behind the existing auth gate',()=>{
 const source=readFileSync(new URL('./invoiceDocument.ts',import.meta.url),'utf8')
 expect(source).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/)
 const shell=readFileSync(new URL('../components/layout/AppShell.tsx',import.meta.url),'utf8')
 expect(shell.indexOf("if (gate === 'denied')")).toBeLessThan(shell.indexOf('// Documents retain'))
})
