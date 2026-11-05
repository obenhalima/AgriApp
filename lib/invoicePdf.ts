import {BRAND} from './brand'
import {invoiceDate,invoiceFilename,invoiceMoney,invoiceQuantity,invoiceStatus,invoiceTitle,invoiceTotals,type InvoiceDocument,type InvoiceParty} from './invoiceDocumentModel'

/** A real PDF containing high-resolution A4 pages. Browser text shaping preserves
 * accented/Arabic names without sending invoice data to an external PDF service. */
export function pdfFromJpegPages(pages:{bytes:Uint8Array;width:number;height:number}[]):Blob {
  if(!pages.length)throw Error('Aucune page à exporter.')
  const chunks:Uint8Array[]=[],offsets:number[]=[0];let length=0
  const encode=(s:string)=>new TextEncoder().encode(s)
  const append=(value:string|Uint8Array)=>{const bytes=typeof value==='string'?encode(value):value;chunks.push(bytes);length+=bytes.length}
  const object=(id:number,body:string|(()=>void))=>{offsets[id]=length;append(`${id} 0 obj\n`);if(typeof body==='string')append(body);else body();append('\nendobj\n')}
  append('%PDF-1.4\n%ITRIX\n')
  object(1,'<< /Type /Catalog /Pages 2 0 R >>')
  object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`)
  pages.forEach((page,i)=>{
    const id=3+i*3,content='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n'
    object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id+2} 0 R >> >> /Contents ${id+1} 0 R >>`)
    object(id+1,`<< /Length ${encode(content).length} >>\nstream\n${content}endstream`)
    object(id+2,()=>{append(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);append(page.bytes);append('\nendstream')})
  })
  const xref=length,count=3+pages.length*3
  append(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for(let id=1;id<count;id++)append(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`)
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const output=new Uint8Array(length);let start=0;for(const chunk of chunks){output.set(chunk,start);start+=chunk.length}
  return new Blob([output],{type:'application/pdf'})
}

export async function createInvoicePdf(doc:InvoiceDocument):Promise<Blob>{
  const purchase=doc.documentType==='purchase'
  await document.fonts.ready
  const logo=await new Promise<HTMLImageElement|null>(resolve=>{
    const image=new Image(),timer=setTimeout(()=>resolve(null),5000)
    image.onload=()=>{clearTimeout(timer);resolve(image)};image.onerror=()=>{clearTimeout(timer);resolve(null)};image.src='/itrix-logo.png'
  })
  const pages:HTMLCanvasElement[]=[],width=1240,height=1754,left=80,right=1160,bottom=1624
  let canvas!:HTMLCanvasElement,ctx!:CanvasRenderingContext2D,y=0
  const text=(value:string,x:number,top:number,size=20,bold=false,color='#20352a')=>{ctx.font=`${bold?'700':'400'} ${size}px Arial, sans-serif`;ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(value,x,top)}
  const wrap=(value:string,maxWidth:number,size=20):string[]=>{
    ctx.font=`400 ${size}px Arial, sans-serif`
    const result:string[]=[];let line=''
    for(const paragraph of String(value).split(/\r?\n/)){
      for(const word of paragraph.split(/\s+/)){
        if(ctx.measureText(line+(line?' ':'')+word).width<=maxWidth){line+=(line?' ':'')+word;continue}
        if(line){result.push(line);line=''}
        for(const char of word){if(ctx.measureText(line+char).width>maxWidth&&line){result.push(line);line=''}line+=char}
      }
      result.push(line);line=''
    }
    return result.length?result:['']
  }
  const newPage=()=>{
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const context=canvas.getContext('2d');if(!context)throw Error('Export PDF indisponible dans ce navigateur. Utilisez Imprimer.')
    ctx=context;ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle=BRAND.forest;ctx.fillRect(0,0,width,18)
    if(logo){ctx.drawImage(logo,250,220,1060,540,left,22,230,117)}
    else{text('ItriX Farm',left,92,36,true,BRAND.forest);text('by ItriX Technologies',left,124,17,false,'#607465')}
    text(invoiceTitle(doc),720,84,29,true,BRAND.forest)
    wrap(String(doc.invoice.invoice_number||'Sans numéro'),440,20).forEach((line,i)=>text(line,720,118+i*26,20,true))
    ctx.strokeStyle='#dce6df';ctx.beginPath();ctx.moveTo(left,156);ctx.lineTo(right,156);ctx.stroke()
    pages.push(canvas);y=199
  }
  const ensure=(space:number)=>{if(y+space>bottom)newPage()}
  const paragraph=(value:string,size=20,color='#20352a')=>{
    for(const line of wrap(value,right-left,size)){ensure(size+14);text(line,left,y,size,false,color);y+=size+9}y+=9
  }
  const heading=(value:string)=>{ensure(86);y+=18;text(value,left,y,24,true,BRAND.forest);y+=38}
  const party=(label:string,p:InvoiceParty,x:number)=>{
    let top=y;text(label,x,top,17,true,'#607465');top+=30
    const values=[p.name,p.address,[p.city,p.country].filter(Boolean).join(', '),p.tax_id?`Identifiant fiscal : ${p.tax_id}`:'',p.email,p.phone].filter(Boolean)
    for(const value of values)for(const line of wrap(String(value),490,20)){text(line,x,top,20,value===p.name);top+=27}
    return top
  }
  newPage()
  const first=party('ÉMETTEUR',doc.issuer,left),second=party('DESTINATAIRE',doc.recipient,660);y=Math.max(first,second)+34
  paragraph(`Date : ${invoiceDate(doc.invoice.invoice_date)} | ${purchase?'Livraison prévue':'Échéance'} : ${invoiceDate(doc.invoice.due_date)}`)
  paragraph(`Statut enregistré : ${invoiceStatus(doc.invoice.status)} | Devise : ${doc.currency||'Non renseignée'}`)
  paragraph(purchase?'Bon de commande existant - ce document ne constitue pas une facture.':doc.kind==='fournisseur'?'Copie de consultation - ne remplace pas la facture originale du fournisseur.':'Édition de consultation de la facture existante.',17,'#607465')
  paragraph('Coordonnées issues des référentiels actuels ; aucune copie historique n’est reconstituée.',16,'#607465')
  heading('Détail enregistré ou lié')
  const tableHeader=()=>{ensure(60);ctx.fillStyle='#eaf2ec';ctx.fillRect(left,y-22,right-left,45);text('Désignation / provenance',left+12,y+7,17,true);text('Quantité',650,y+7,17,true);text('Prix unitaire',805,y+7,17,true);text('Montant',990,y+7,17,true);y+=50}
  tableHeader()
  for(const line of doc.lines){
    const description=wrap(line.description,540,19),source=wrap(line.source,540,16),rowHeight=(description.length*27)+(source.length*23)+26
    if(y+rowHeight>bottom){newPage();tableHeader()}
    // Rows with unusually long descriptions continue across pages instead of clipping.
    const top=y
    const rowPage:HTMLCanvasElement=canvas
    for(const part of description){ensure(30);text(part,left+10,y,19);y+=27}
    for(const part of source){ensure(26);text(part,left+10,y,16,false,'#607465');y+=23}
    {
      if(canvas!==rowPage){ensure(80)}
      const numberTop=canvas===rowPage?top:y
      const columns=[{x:650,w:140,value:`${invoiceQuantity(line.quantity)} ${line.unit}`},{x:805,w:170,value:line.price===null?'—':`${invoiceQuantity(line.price)} ${doc.currency||'?'}`},{x:990,w:160,value:invoiceMoney(line.amount,doc.currency)}]
      for(const col of columns)wrap(col.value,col.w,17).forEach((part,i)=>text(part,col.x,numberTop+i*23,17))
      if(canvas!==rowPage)y+=70
    }
    y+=22;ctx.strokeStyle='#e3ebe5';ctx.beginPath();ctx.moveTo(left,y-12);ctx.lineTo(right,y-12);ctx.stroke()
  }
  heading(purchase?'Totaux du bon de commande':'Totaux de la facture enregistrée')
  for(const [label,value] of invoiceTotals(doc)){const amount=wrap(invoiceMoney(value,doc.currency),400,21);ensure(Math.max(42,amount.length*30));text(label,left,y,21,label==='Total de la facture');amount.forEach((part,i)=>text(part,760,y+i*30,21,true));y+=Math.max(39,amount.length*30)}
  if(!purchase)heading('Journal des paiements')
  if(!purchase&&!doc.payments.length)paragraph('Aucune ligne de paiement disponible dans le journal consulté.',18)
  for(const p of doc.payments)paragraph(`${invoiceDate(p.payment_date)} | ${invoiceMoney(p.amount,doc.currency)} | ${p.payment_method||'Mode non renseigné'}${p.reference?` | Réf. ${p.reference}`:''}`,18)
  if(doc.invoice.notes){heading('Notes enregistrées');paragraph(String(doc.invoice.notes),18)}
  if(doc.warnings.length){heading('Informations sur cette édition');for(const warning of doc.warnings)paragraph(warning,17,'#77541c')}
  pages.forEach((page,index)=>{const c=page.getContext('2d')!;c.fillStyle='#607465';c.font='16px Arial';c.fillText(`ItriX Farm - by ItriX Technologies | Consultation, sans modification ${purchase?'du bon':'de la facture'}`,left,height-65);c.fillText(`${index+1} / ${pages.length}`,1080,height-65)})
  return pdfFromJpegPages(pages.map(page=>({width,height,bytes:Uint8Array.from(atob(page.toDataURL('image/jpeg',0.94).split(',')[1]),c=>c.charCodeAt(0))})))
}
export function saveInvoicePdf(blob:Blob,doc:InvoiceDocument){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=invoiceFilename(doc)
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
}
