import {supabase} from './supabase'
import type {StockAllocationPlanting,StockAllocationTarget} from './stockAllocation'

export type ReviewMovement={id:string;item:string;code:string;name:string;unit:string;quantity:number;date:string;reference:string;warehouse:string;farm:string;price:number|null;fixed:boolean;linked:boolean;targets?:StockAllocationTarget[]|null}
export function sameReviewMovement(current:ReviewMovement,original:ReviewMovement){
 const keys=['id','item','code','unit','quantity','date','reference','warehouse','farm','price','fixed','linked'] as const
 const targets=(movement:ReviewMovement)=>(movement.targets??[]).map(target=>[
  target.planting_id,target.greenhouse_id,target.variety_id,target.campaign_id,Number(target.area)
 ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
 return keys.every(key=>current[key]===original[key])&&JSON.stringify(targets(current))===JSON.stringify(targets(original))
}
export type ProductReviewContext={method:'cump'|'fifo';version:string;movements:ReviewMovement[];plantings:(StockAllocationPlanting&{ref:string})[]}
export type ProductReviewRow={id:string;price:string;reason:string;plantings:string[]}
export type ProductReviewResult={status:'preview'|'applied';count:number;amount:number}

export async function productReviewContext(domain:string,ids:string[]):Promise<ProductReviewContext>{
 const {data,error}=await supabase.rpc('stock_product_review_context',{p_domain:domain,p_movements:ids}).abortSignal(AbortSignal.timeout(30000))
 if(error)throw new Error(['PGRST202','42883'].includes(error.code)?'Appliquez la migration stock_product_reconciliation pour le rapprochement par article.':error.message)
 return data
}
export async function reviewStockProducts(domain:string,request:string,context:ProductReviewContext,rows:ProductReviewRow[],apply=false):Promise<ProductReviewResult>{
 const {data,error}=await supabase.rpc('review_stock_products',{p_domain:domain,p_request:request,p_rows:rows,p_expected:context.version,p_apply:apply}).abortSignal(AbortSignal.timeout(70000))
 if(error)throw new Error(error.message)
 return data
}
export function reviewProducts(context:ProductReviewContext){
 const products=new Map<string,{id:string;code:string;name:string;unit:string;quantity:number;unvalued:number;count:number}>()
 for(const movement of context.movements){
  const product=products.get(movement.item)??{id:movement.item,code:movement.code,name:movement.name,unit:movement.unit,quantity:0,unvalued:0,count:0}
  product.quantity+=Number(movement.quantity);product.count++
  if(movement.price===null)product.unvalued+=Number(movement.quantity)
  products.set(product.id,product)
 }
 return [...products.values()]
}

export async function productReviewWorkbook(domain:string,context:ProductReviewContext){
 const ExcelJS=(await import('exceljs')).default
 const workbook=new ExcelJS.Workbook();workbook.creator='ItriX Farm'
 const guide=workbook.addWorksheet('Guide');guide.getColumn(1).width=120
 for(const text of ['ItriX Farm — Rapprochement des sorties',`Méthode ${context.method.toUpperCase()}`,
 'Le fichier couvre uniquement les sorties exportées du client et du périmètre sélectionnés.',
 context.method==='cump'?'Produits : saisir une seule fois le CUMP confirmé et son justificatif pour les articles non valorisés. Les prix déjà calculés des sorties sont conservés.':'FIFO : les prix des sorties proviennent des entrées et sont conservés. Compléter les affectations des sorties qui en ont besoin.',
 'Sorties : saisir les références de plantations séparées par ; uniquement si une affectation est demandée. Voir Ref_Plantations. Les affectations existantes sont conservées.',
 'Conserver toutes les lignes, références, dates et quantités. Les colonnes de référence sont contrôlées au rechargement.',
 'Recharger le fichier puis contrôler la synthèse et confirmer. Le rapprochement des sorties ne valorise pas le stock restant.']){
  const row=guide.addRow([text]);row.height=45;row.alignment={wrapText:true,vertical:'middle'}
 }
 if(context.method==='cump'){
  const sheet=workbook.addWorksheet('Produits')
  sheet.addRow(['Code article','Article','Unité','Quantité à valoriser','CUMP confirmé (MAD)','Justificatif'])
  for(const product of reviewProducts(context))sheet.addRow([product.code,product.name,product.unit,product.unvalued,'',''])
 }
 const exits=workbook.addWorksheet('Sorties')
 exits.addRow(['Référence sortie','Date','Code article','Quantité','Unité','Entrepôt','PU calculé (MAD)','Affectation à saisir','Références plantations (; multiples)','Justificatif'])
 for(const movement of context.movements)exits.addRow([movement.id,movement.date,movement.code,Number(movement.quantity),movement.unit,movement.warehouse,movement.price===null?'':Number(movement.price).toFixed(8),movement.fixed||movement.linked?'non':'oui','',''])
 const plantings=workbook.addWorksheet('Ref_Plantations')
 plantings.addRow(['Référence plantation','Ferme','Campagne','Serre','Variété','Surface'])
 for(const planting of context.plantings)plantings.addRow([planting.ref,planting.farm_name,planting.campaign_name,planting.greenhouse_name,planting.variety_name,planting.area])
 for(const sheet of workbook.worksheets){
  if(sheet.name==='Guide')continue
  sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach(column=>column.width=28)
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B3D2E'}}})
  sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}}
 }
 const meta=workbook.addWorksheet('_itr_review')
 meta.addRow(['version',1]);meta.addRow(['domain',domain])
 const serialized=JSON.stringify(context)
 for(let offset=0;offset<serialized.length;offset+=16000)meta.addRow(['context',serialized.slice(offset,offset+16000)])
 meta.state='veryHidden'
 return new Blob([await workbook.xlsx.writeBuffer() as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

export async function readProductReviewWorkbook(bytes:ArrayBuffer,domain:string,options:{allowPartial?:boolean;fallbackReason?:string;allowCachedPrices?:boolean}={}):Promise<{context:ProductReviewContext;rows:ProductReviewRow[];skippedProducts:string[];formulaPrices:number}>{
 if(bytes.byteLength>5242880)throw new Error('Maximum 5 Mo par fichier.')
 const ExcelJS=(await import('exceljs')).default,workbook=new ExcelJS.Workbook()
 await workbook.xlsx.load(bytes)
 const meta=workbook.getWorksheet('_itr_review')
 if(meta?.getCell('B1').value!==1||meta.getCell('B2').value!==domain)throw new Error('Utilisez le fichier exporté pour le client actif.')
 let serialized=''
 for(let line=3;line<=meta.rowCount;line++)serialized+=String(meta.getCell(line,2).value??'')
 const context=JSON.parse(serialized) as ProductReviewContext
 if(!context||!['cump','fifo'].includes(context.method)||!Array.isArray(context.movements)||!context.movements.length||context.movements.length>1000||!Array.isArray(context.plantings)||!/^[a-f0-9]{64}$/.test(context.version))throw new Error('Fichier de rapprochement invalide')
 const text=(sheet:import('exceljs').Worksheet,row:number,column:number)=>{
  const value=sheet.getCell(row,column).value
  if(value!==null&&typeof value!=='string'&&typeof value!=='number')throw new Error(`Ligne ${row} : formules et objets interdits.`)
  return String(value??'').trim()
 }
 const prices=new Map<string,{price:string;reason:string}>()
 const skippedProducts:string[]=[]
 let formulaPrices=0
 if(context.method==='cump'){
  const sheet=workbook.getWorksheet('Produits'),products=reviewProducts(context)
  if(!sheet||sheet.rowCount!==products.length+1)throw new Error('Conservez toutes les lignes de Produits.')
  const expected=new Map(products.map(product=>[product.code,product]))
  for(let line=2;line<=sheet.rowCount;line++){
   const code=text(sheet,line,1),product=expected.get(code)
   if(!product||prices.has(code)||text(sheet,line,2)!==product.name||text(sheet,line,3)!==product.unit||Number(text(sheet,line,4))!==product.unvalued)throw new Error(`Ligne ${line} : référence produit modifiée.`)
   const priceCell=sheet.getCell(line,5)
   let priceText:string
   if(options.allowCachedPrices&&priceCell.type===ExcelJS.ValueType.Formula){
    // Read only the saved result. Never evaluate formulas or resolve external workbook links.
    const saved=priceCell.result
    if(saved!==undefined&&saved!==null&&typeof saved!=='number'&&typeof saved!=='string')throw new Error(`Article ${code} : résultat de formule invalide. Recalculez et enregistrez le fichier Excel.`)
    priceText=String(saved??'').trim()
    if(priceText)formulaPrices++
   }else priceText=text(sheet,line,5)
   const price=priceText.replace(/\s/g,'').replace(',','.'),reason=text(sheet,line,6)||options.fallbackReason?.trim()||''
   if(product.unvalued>0&&!price&&options.allowPartial){skippedProducts.push(code);continue}
   if(product.unvalued>0&&(!price||!Number.isFinite(Number(price))||Number(price)<0||reason.length<5))throw new Error(`Article ${code} : CUMP et justificatif requis.`)
   prices.set(code,{price,reason})
  }
 }
 const sheet=workbook.getWorksheet('Sorties')
 if(!sheet||sheet.rowCount!==context.movements.length+1)throw new Error('Conservez toutes les lignes de Sorties.')
 const movements=new Map(context.movements.map(movement=>[movement.id,movement])),seen=new Set<string>(),rows:ProductReviewRow[]=[]
 for(let line=2;line<=sheet.rowCount;line++){
  const id=text(sheet,line,1),movement=movements.get(id)
  if(!movement||seen.has(id)||text(sheet,line,2)!==movement.date||text(sheet,line,3)!==movement.code||Number(text(sheet,line,4))!==Number(movement.quantity)||text(sheet,line,5)!==movement.unit||text(sheet,line,6)!==movement.warehouse)throw new Error(`Ligne ${line} : référence de sortie modifiée.`)
  seen.add(id)
  const enteredPrice=text(sheet,line,7),originalPrice=movement.price===null?'':Number(movement.price).toFixed(8)
  if(enteredPrice!==originalPrice&&!(enteredPrice&&originalPrice&&Number(enteredPrice)===Number(originalPrice)))throw new Error(`Ligne ${line} : conserver le PU calculé.`)
  const refs=text(sheet,line,9).split(';').map(ref=>ref.trim()).filter(Boolean)
  if((movement.fixed||movement.linked)&&refs.length)throw new Error(`Ligne ${line} : conserver les affectations existantes.`)
  const plantings=refs.map(ref=>context.plantings.find(planting=>planting.ref===ref)?.id)
  if(plantings.some(id=>!id))throw new Error(`Ligne ${line} : référence de plantation inconnue.`)
  if(movement.price===null&&context.method==='cump'&&!prices.has(movement.code))continue
  rows.push({id,price:movement.price===null?prices.get(movement.code)?.price??'':String(movement.price),reason:prices.get(movement.code)?.reason||text(sheet,line,10),plantings:plantings as string[]})
 }
 if(!rows.length)throw new Error('Aucun CUMP renseigné dans le fichier. Complétez au moins un article.')
 return {context,rows,skippedProducts,formulaPrices}
}
