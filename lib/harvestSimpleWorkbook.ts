import {text,type MigrationCatalog,type MigrationData} from './harvestMigration'

export const SIMPLE_HARVEST_HEADERS=['Date récolte','Ferme','Serre','Variété','Type de caisse','Nombre de caisses','Kilos calculés (information)','Nombre de personnes (facultatif)','Heures par personne (facultatif)','Observations','Référence automatique']

export function readSimpleHarvestRows(wb:any):Record<string,string|number>[] {
 const s=wb.getWorksheet('Recoltes')
 if(!s)throw new Error('Onglet Recoltes manquant')
 SIMPLE_HARVEST_HEADERS.forEach((h,i)=>{if(s.getCell(1,i+1).value!==h)throw new Error(`En-tête modifié : ${h}`)})
 if(s.rowCount>10001)throw new Error('Limite de 10 000 lignes dépassée')
 const fields=['date','farm','greenhouse','variety','tray','count','kg','people','hours','notes','ref']
 const rows:Record<string,string|number>[]=[]
 for(let r=2;r<=s.rowCount;r++){
  const row:Record<string,string|number>={__row:r};let filled=false
  fields.forEach((key,i)=>{
   if(key==='kg')return // informational only; import always recalculates
   let value=s.getCell(r,i+1).value
   if(key==='variety' && value && typeof value==='object' && 'formula' in value)value='' // infer from live catalog, not an Excel cache
   if(value instanceof Date)value=value.toISOString().slice(0,10)
   else if(value && typeof value==='object')throw new Error(`Ligne ${r} : saisir une valeur dans ${SIMPLE_HARVEST_HEADERS[i]}`)
   if(key==='date' && typeof value==='number')value=new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10)
   row[key]=typeof value==='number'?value:text(value)
   if(key!=='ref' && text(row[key]))filled=true
  })
  if(filled){if(!text(row.ref))throw new Error(`Ligne ${r} : référence automatique manquante ; reprendre le modèle téléchargé.`);rows.push(row)}
 }
 return rows
}

/** Resolve user-facing choices using live tenant references, never cached Excel formulas. */
export function resolveSimpleHarvests(rows:Record<string,string|number>[],catalog:MigrationCatalog):MigrationData {
 const Recoltes=rows.map(r=>{
  const matches=catalog.plantings.filter(p=>p.farm===text(r.farm) && p.greenhouse===text(r.greenhouse)
   && (!p.start||text(r.date)>=p.start) && (!p.end||text(r.date)<=p.end))
  const varieties=[...new Set(matches.map(p=>p.variety))]
  const variety=text(r.variety) || (varieties.length===1?varieties[0]:'')
  const chosen=matches.filter(p=>p.variety===variety)
  if(chosen.length!==1)throw new Error(`Ligne ${r.__row} : ${!matches.length?'aucune plantation correspondant à la date, ferme et serre':!variety?'choisir une variété':'plusieurs plantations possibles ou variété incompatible ; vérifier les campagnes et dates'}.`)
  const tray=catalog.trays.find(t=>`${t.label} [${t.code}]`===text(r.tray))
  if(!tray)throw new Error(`Ligne ${r.__row} : choisir un type de caisse du référentiel.`)
  return {__row:r.__row,ref:r.ref,planting:chosen[0].label,date:r.date,tray:tray.code,count:r.count,people:r.people,hours:r.hours,notes:r.notes}
 })
 return {Recoltes,Plateaux:[],Envois:[],Sources:[],Pesees:[],Tri:[],Prix:[]}
}

/** Application browser export: keep its existing ExcelJS runtime and protection support. */
export async function simpleHarvestWorkbook(catalog:MigrationCatalog):Promise<Blob> {
 const ExcelJS=(await import('exceljs')).default,wb=new ExcelJS.Workbook()
 wb.creator='ItriX Farm';wb.calcProperties.fullCalcOnLoad=true
 const sheet=wb.addWorksheet('Recoltes',{views:[{state:'frozen',ySplit:1,xSplit:3,showGridLines:false}]})
 sheet.columns=SIMPLE_HARVEST_HEADERS.map((header,i)=>({header,width:[18,30,28,32,30,20,25,25,27,38,30][i]}))
 sheet.getRow(1).height=44;sheet.getRow(1).alignment={wrapText:true,vertical:'middle'}
 sheet.getRow(1).font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'}}
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF166534'}}
 sheet.getColumn(11).hidden=true
 const meta=wb.addWorksheet('_reprise');meta.addRow(['version',3]);meta.addRow(['domain',catalog.domainId]);meta.state='veryHidden'
 const lists=wb.addWorksheet('_listes');lists.state='veryHidden'
 const farms=wb.addWorksheet('Ref_Fermes');farms.addRow(['Ferme','Liste des serres'])
 const houses=wb.addWorksheet('Ref_Serres');houses.addRow(['Ferme et serre','Liste des variétés'])
 const trays=wb.addWorksheet('Ref_Caisses');trays.addRow(['Type de caisse','Poids unitaire (kg)'])
 catalog.trays.forEach(t=>trays.addRow([`${t.label} [${t.code}]`,t.weight>0?t.weight:null]))
 const refs=wb.addWorksheet('Ref_Plantations');refs.addRow(['Ferme','Serre','Variété','Début récolte','Fin récolte','Index'])
 catalog.plantings.forEach((p,i)=>refs.addRow([p.farm,p.greenhouse,p.variety,p.start?new Date(p.start):new Date('1900-01-01'),p.end?new Date(p.end):new Date('9999-12-31'),i+1]))
 refs.getColumn(4).numFmt=refs.getColumn(5).numFmt='dd/mm/yyyy'
 let col=1
 const namedList=(name:string,values:string[])=>{
  const letter=lists.getColumn(col++).letter
  values.forEach((v,i)=>lists.getCell(i+1,col-1).value=v)
  wb.definedNames.add(`'_listes'!$${letter}$1:$${letter}$${Math.max(1,values.length)}`,name)
 }
 namedList('Liste_Vide',[])
 ;[...new Set(catalog.plantings.map(p=>p.farm))].forEach((farm,i)=>{
  const name=`Serres_${i+1}`;farms.addRow([farm,name])
  const available=[...new Set(catalog.plantings.filter(p=>p.farm===farm).map(p=>p.greenhouse))]
  namedList(name,available)
  available.forEach((house,j)=>{
   const variants=`Varietes_${i+1}_${j+1}`;houses.addRow([`${farm}|${house}`,variants])
   namedList(variants,[...new Set(catalog.plantings.filter(p=>p.farm===farm && p.greenhouse===house).map(p=>p.variety))])
  })
 })
 wb.definedNames.add(`'Ref_Fermes'!$A$2:$A$${Math.max(2,farms.rowCount)}`,'Liste_Fermes')
 wb.definedNames.add(`'Ref_Caisses'!$A$2:$A$${Math.max(2,trays.rowCount)}`,'Liste_Caisses')
 const last=Math.max(2,refs.rowCount),batch=crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()
 for(let r=2;r<=501;r++){
  for(let c=1;c<=11;c++){
   const cell=sheet.getCell(r,c);cell.font={name:'Arial',size:11};cell.alignment={vertical:'middle',wrapText:false}
   cell.protection={locked:c===7||c===11};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:c===7||c===11?'FFF1F5F1':'FFFFF9E6'}}
  }
  sheet.getCell(r,1).numFmt='dd/mm/yyyy'
  sheet.getCell(r,1).dataValidation={type:'date',operator:'between',formulae:[new Date('1900-01-01'),new Date()],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Choisir une date passée valide.'}
  const list=(c:number,formula:string)=>{sheet.getCell(r,c).dataValidation={type:'list',formulae:[formula],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Choisir une valeur de la liste.'}}
  list(2,'Liste_Fermes');list(3,`INDIRECT(IFERROR(VLOOKUP(B${r},Ref_Fermes!$A$2:$B$${Math.max(2,farms.rowCount)},2,FALSE),"Liste_Vide"))`)
  list(4,`INDIRECT(IFERROR(VLOOKUP(B${r}&"|"&C${r},Ref_Serres!$A$2:$B$${Math.max(2,houses.rowCount)},2,FALSE),"Liste_Vide"))`);list(5,'Liste_Caisses')
  const criteria=`Ref_Plantations!$A$2:$A$${last},B${r},Ref_Plantations!$B$2:$B$${last},C${r},Ref_Plantations!$D$2:$D$${last},"<="&A${r},Ref_Plantations!$E$2:$E$${last},">="&A${r}`
  const variants=`INDIRECT(IFERROR(VLOOKUP(B${r}&"|"&C${r},Ref_Serres!$A$2:$B$${Math.max(2,houses.rowCount)},2,FALSE),"Liste_Vide"))`
  sheet.getCell(r,4).value={formula:`IF(OR(A${r}="",B${r}="",C${r}=""),"",IF(COUNTA(${variants})=1,INDEX(${variants},1),IF(COUNTIFS(${criteria})=1,INDEX(Ref_Plantations!$C$2:$C$${last},SUMIFS(Ref_Plantations!$F$2:$F$${last},${criteria})),"")))`}
  sheet.getCell(r,7).value={formula:`IF(OR(E${r}="",F${r}=""),"",IF(VLOOKUP(E${r},Ref_Caisses!$A$2:$B$${Math.max(2,trays.rowCount)},2,FALSE)>0,F${r}*VLOOKUP(E${r},Ref_Caisses!$A$2:$B$${Math.max(2,trays.rowCount)},2,FALSE),"Poids à renseigner dans le référentiel"))`}
  sheet.getCell(r,7).numFmt='#,##0.00';sheet.getCell(r,11).value=`REC-${batch}-${String(r-1).padStart(4,'0')}`
  for(const c of [6,8,9])sheet.getCell(r,c).dataValidation={type:c===9?'decimal':'whole',operator:c===9?'between':'greaterThanOrEqual',formulae:c===9?[0.001,24]:[1],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Saisir un nombre positif valide (heures ≤ 24).'}
 }
 sheet.autoFilter={from:{row:1,column:1},to:{row:501,column:10}}
 await sheet.protect('',{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true})
 for(const ref of [farms,houses,trays,refs]){
  ref.views=[{state:'frozen',ySplit:1,showGridLines:false}];ref.columns.forEach(c=>{c.width=32})
  ref.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ref.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF166534'}}
  await ref.protect('',{selectLockedCells:true})
 }
 const guide=wb.addWorksheet('Mode emploi');guide.getColumn(1).width=100
 for(const line of [`Client : ${catalog.domainName}`,'Saisir la date, choisir la ferme puis la serre. La variété apparaît automatiquement si une plantation correspond à la date ; sinon choisir la variété dans la liste.','Choisir le type de caisse et saisir son nombre. Les kilos sont calculés, protégés et uniquement informatifs. Le contrôle recalcule les kilos avec le référentiel actuel.','Personnes et heures sont facultatives. Les heures sont par personne ; si vous les renseignez, préciser aussi le nombre de personnes.','Une ligne par récolte et type de caisse. Pour plusieurs types, utiliser plusieurs lignes ; ne pas répéter les effectifs pour une même journée.','Les références sont générées automatiquement. Conserver le même fichier et ses références pour réessayer sans doublon. Les références internes ne sont pas à saisir.','Les onglets Ref_ donnent le contexte de sélection. Les dates absentes y sont représentées par des bornes techniques sans limite ; ce ne sont pas des dates réelles.','Enregistrer, recharger dans le module 3, vérifier la synthèse puis confirmer. Aucun envoi, pesée, tri ou prix ne sera créé.']){const row=guide.addRow([line]);row.height=44;row.alignment={wrapText:true,vertical:'middle'}}
 return new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
