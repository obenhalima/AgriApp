import {HISTORY_COLUMNS,type HistoryCatalog,type HistoryRow} from './stockHistory'

export async function stockHistoryWorkbook(domain:string,name:string,catalog:HistoryCatalog){
 const ExcelJS=(await import('exceljs')).default
 const wb=new ExcelJS.Workbook();wb.creator='ItriX Farm'
 const guide=wb.addWorksheet('Guide')
 for(const text of [
  'ItriX Farm — Historique des entrées et sorties',`Client : ${name}`,`Méthode de valorisation : ${(catalog.cost_method??'cump').toUpperCase()}`,
  catalog.cost_method==='fifo'?'FIFO : prix obligatoire sur chaque entrée. Les sorties consomment les entrées les plus anciennes à leur prix.':'CUMP : le prix des sorties est calculé à partir des entrées précédentes.',
  'Mouvements : une ligne par opération réelle. Conservez un identifiant unique et stable, par exemple HIST-501-0001. Le même identifiant avec le même contenu ne sera pas importé deux fois.',
  'Date réelle AAAA-MM-JJ ou date Excel. Ordre entier unique par date : 1, 2, 3… Les lignes sont traitées par date puis par ordre, même si elles sont déplacées dans Excel.',
  'Type : entree ou sortie. Quantité toujours positive dans l’unité exacte de Ref_Articles, maximum deux décimales. Aucune conversion automatique de conditionnement.',
  catalog.cost_method==='fifo'?'Entrée FIFO : prix unitaire en MAD obligatoire. Zéro signifie un prix nul confirmé.':'Entrée CUMP : prix unitaire en MAD si connu. Prix inconnu : laisser vide. Zéro signifie un prix nul confirmé.',
  'Sortie : laisser prix et fournisseur vides. Le coût est calculé selon la méthode de valorisation du client pour cet article et entrepôt.',
  'Pour chaque sortie, saisir la campagne et une ou plusieurs références de Ref_Plantations séparées par ;. Elles doivent appartenir à la ferme de l’entrepôt et à la même campagne. La répartition se fait au prorata des surfaces plantées.',
  'Soldes_Existants : photographie informative du stock déjà présent. Les mouvements existants sont inclus dans la base de départ. Toute ligne antérieure ou égale à la dernière date existante du même article/entrepôt sera bloquée.',
  'Si un inventaire initial couvre déjà la période à reprendre, réconcilier cette reprise avant de charger l’historique. Cet outil ne remet pas les stocks à zéro et ne supprime aucun mouvement.',
  'Les feuilles Ref_ et Soldes_Existants ne sont pas importées. Le serveur relit les références et les soldes lors du contrôle et de la validation.',
  'Charger le fichier, lire la synthèse et les stocks finaux, puis confirmer l’import. L’ensemble du fichier est validé dans une transaction. Les sorties valorisées génèrent les coûts, les autres rejoignent Sorties à rapprocher.',
  'Une réception historique ne crée pas de facture fournisseur. La référence pièce reste une référence de traçabilité. Les transferts et ajustements utilisent leurs écrans dédiés.',
  'Maximum 1 000 mouvements et 5 Mo. Les formules, macros et objets dans la saisie sont interdits. Les noms et en-têtes des onglets doivent être conservés.',
 ]){const row=guide.addRow([text]);row.height=52;row.alignment={wrapText:true,vertical:'middle'}}
 guide.getColumn(1).width=120
 const sheet=wb.addWorksheet('Mouvements')
 sheet.columns=HISTORY_COLUMNS.map(([key,header])=>({key,header,width:['plantings','notes'].includes(key)?50:26}))
 const refs=[
  ['Ref_Articles',['Code','Désignation','Unité','Catégorie'],catalog.items.map(i=>[i.code,i.name,i.unit,i.category])],
  ['Ref_Entrepots',['Code','Nom','Code ferme','Ferme'],catalog.warehouses.map(w=>[w.code,w.name,w.farm_code,w.farm_name])],
  ['Ref_Fournisseurs',['Code','Nom'],catalog.suppliers.map(s=>[s.code,s.name])],
  ['Ref_Fermes',['Code','Nom'],[...new Map(catalog.warehouses.map(w=>[w.farm_code,[w.farm_code,w.farm_name]])).values()]],
  ['Ref_Campagnes',['Code','Nom'],[...new Map(catalog.plantings.map(p=>[p.campaign,[p.campaign,p.campaign_name]])).values()]],
  ['Ref_Plantations',['Référence','Code ferme','Code campagne','Serre','Variété','Surface plantée (m²)'],catalog.plantings.map(p=>[p.ref,p.farm,p.campaign,p.greenhouse,p.variety,p.area])],
  ['Soldes_Existants',['Code article','Code entrepôt','Stock disponible','Valeur connue (MAD)','Prix confirmé','Dernière date existante'],catalog.balances.map(b=>[b.item,b.warehouse,b.quantity,b.value,b.verified?'oui':'non',b.last_date])],
 ] as const
 for(const [title,headers,rows]of refs){const ref=wb.addWorksheet(title);ref.addRow([...headers]);for(const row of rows)ref.addRow([...row]);ref.columns.forEach(c=>c.width=28);ref.views=[{state:'frozen',ySplit:1}];ref.getRow(1).font={bold:true};ref.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}}}
 for(let row=2;row<=1001;row++){
  sheet.getCell(row,2).numFmt='dd/mm/yyyy';sheet.getCell(row,8).numFmt='#,##0.00';sheet.getCell(row,9).numFmt='#,##0.########'
  sheet.getCell(row,4).dataValidation={type:'list',allowBlank:true,formulae:['"entree,sortie"'],showErrorMessage:true,errorStyle:'stop',error:'Choisir entree ou sortie.'}
  for(const [column,ref]of [[5,'Ref_Articles'],[7,'Ref_Entrepots'],[11,'Ref_Fournisseurs'],[12,'Ref_Fermes'],[13,'Ref_Campagnes'],[14,'Ref_Plantations']]as const){
   const count=wb.getWorksheet(ref)!.rowCount
   if(count>1)sheet.getCell(row,column).dataValidation={type:'list',allowBlank:true,formulae:[`'${ref}'!$A$2:$A$${count}`],showErrorMessage:column!==14,errorStyle:'stop',error:'Choisir un code du référentiel.'}
  }
 }
 sheet.views=[{state:'frozen',ySplit:1,xSplit:1}];sheet.autoFilter='A1:O1';sheet.getRow(1).height=40
 sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B3D2E'}};cell.alignment={wrapText:true}})
 const meta=wb.addWorksheet('_history_itr');meta.addRow(['version',1]);meta.addRow(['domain',domain]);meta.state='veryHidden'
 return new Blob([await wb.xlsx.writeBuffer() as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
export async function readStockHistoryWorkbook(bytes:ArrayBuffer,domain:string):Promise<HistoryRow[]>{
 if(bytes.byteLength>5*1024*1024)throw new Error('Maximum 5 Mo par fichier.')
 const ExcelJS=(await import('exceljs')).default,wb=new ExcelJS.Workbook()
 await wb.xlsx.load(bytes)
 const meta=wb.getWorksheet('_history_itr'),sheet=wb.getWorksheet('Mouvements')
 if(!sheet||meta?.getCell('B1').value!==1||meta?.getCell('B2').value!==domain)throw new Error('Utilisez le modèle historique exporté pour le client actif.')
 if(sheet.rowCount>1001||sheet.columnCount>HISTORY_COLUMNS.length)throw new Error('Maximum 1 000 mouvements, sans colonne supplémentaire.')
 HISTORY_COLUMNS.forEach(([,header],i)=>{if(sheet.getCell(1,i+1).value!==header)throw new Error(`En-tête attendu : ${header}.`)})
 const rows:HistoryRow[]=[]
 for(let line=2;line<=sheet.rowCount;line++){
  const row={line} as HistoryRow
  HISTORY_COLUMNS.forEach(([key],i)=>{
   const value=sheet.getCell(line,i+1).value
   if(value!=null&&!(value instanceof Date)&&!['string','number'].includes(typeof value))throw new Error(`Ligne ${line} : formules et objets non autorisés.`)
   if(value instanceof Date&&key!=='date')throw new Error(`Ligne ${line} : date inattendue.`)
   row[key]=value instanceof Date?value.toISOString().slice(0,10):String(value??'').trim()
   if(row[key].length>2000)throw new Error(`Ligne ${line} : champ trop long.`)
  })
  rows.push(row)
 }
 return rows
}
