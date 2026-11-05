// Application export/import feature: uses the application's existing ExcelJS runtime.
import { MIGRATION_SHEETS, type MigrationCatalog, type MigrationData, text } from './harvestMigration'
export async function harvestMigrationWorkbook(catalog: MigrationCatalog,scope:'workflow'|'harvests'='workflow'): Promise<Blob> {
  if(scope==='harvests')return (await import('./harvestSimpleWorkbook')).simpleHarvestWorkbook(catalog)
  const ExcelJS=(await import('exceljs')).default
  const wb=new ExcelJS.Workbook(); wb.creator='ItriX Farm'; wb.created=new Date()
  const guide=wb.addWorksheet('Mode emploi'); guide.getColumn(1).width=115
  const instructions=[
    'ItriX Farm — Reprise historique des récoltes', `Client : ${catalog.domainName}`, `Référentiels extraits le ${catalog.fetchedAt.slice(0,10)}. 500 lignes par étape.`,
    'Remplir uniquement les étapes déjà réalisées. Cellules jaunes : saisie. Colonnes grises : calculs et informations automatiques.',
    'Recoltes : une référence stable (ex. REC-0001) par opération. Choisir la plantation existante dans la liste. Ne pas saisir d’UUID.',
    'Récolte en caisses : saisir directement le type et le nombre de caisses dans Recoltes. Laisser les kg et le mode de poids vides. Pour plusieurs types, utiliser uniquement Plateaux pour cette récolte. Le contrôle calcule les kg estimés.',
    'Plateaux : poids unitaire historique facultatif. S’il est connu, le saisir. Sinon le contrôle utilise le poids actuel du référentiel et signale cette hypothèse à confirmer. Un poids inconnu ne vaut pas zéro.',
    'Récolte connue seulement en kg : saisir Quantité au champ et préciser Mesuré ou Estimé. La pesée réelle de l’envoi reste dans Pesees, séparée de l’estimation des caisses.',
    'Envois : une référence stable (ex. ENV-0001) par envoi. Sources relie chaque envoi aux récoltes, avec les kg au départ. Ne jamais répéter le total récolté par envoi.',
    'Pesees : facultatif, un poids net final et son ticket par envoi. Si plusieurs tickets, consolider et les citer dans Observations.',
    'Tri : facultatif. Poids soumis au tri = accepté + écart + freinte détruite. Saisir zéro seulement si la perte est réellement nulle.',
    'Prix : facultatif, plusieurs lignes possibles par envoi. Préciser accepté ou écart, kg tarifés, prix/kg, devise et justificatif. Tarifé ne signifie pas payé.',
    'Sans tri documenté, la tarification sera signalée au contrôle. Pour une vente sans perte, renseigner le bilan réel avec freinte et écart à zéro.',
    'Effectif facultatif : aucune valeur par défaut. Journée complète = toute la journée des personnes, sans compter deux fois une même journée.',
    'Les listes marchés/clients commerciaux sont partagées selon les droits de votre compte. Les plantations sont limitées au client affiché.',
    'Recharger dans Récoltes > Reprise historique > Contrôler le fichier. Les référentiels sont relus en base ; les feuilles Ref_ ne font pas autorité.',
    'Corriger les erreurs feuille / ligne / champ. Les collages Excel peuvent contourner les listes : le contrôle dans l’application est indispensable.',
    'Le contrôle ne crée aucune donnée. Après confirmation, l’import reprend Recoltes, Plateaux, Envois et Sources dans une transaction, avec contrôle serveur des droits, dates, DAR et quantités disponibles. Les références identiques déjà importées ne sont pas recréées. Les récoltes envoyées deviennent non modifiables. Pesees, Tri et Prix doivent rester vides pour cet import. Aucune facture créée.',
    'Les retours et ventes d’écarts sont identifiés au tri et au prix, mais leurs réexpéditions nécessitent un rapprochement. Factures et encaissements ne sont pas repris par ce modèle.',
    'Conserver les noms d’onglets et d’en-têtes. Dates Excel ou AAAA-MM-JJ. Unités : kg. Les cellules vides signifient inconnu / étape non réalisée, pas zéro.',
  ]
  const guideLines=instructions
  guideLines.forEach((line,i)=>{const r=guide.addRow([line]);r.height=i===0?30:44;r.alignment={wrapText:true,vertical:'middle'};r.font={name:'Arial',size:i===0?16:11,bold:i===0,color:{argb:i===0?'FF166534':'FF24352A'}}})
  guide.views=[{showGridLines:false}]
  const meta=wb.addWorksheet('_reprise');meta.addRow(['version',2]);meta.addRow(['domain',catalog.domainId]);meta.state='veryHidden'
  const reference=(name:string,headers:string[],rows:(string|number|null|undefined)[][])=>{
    const s=wb.addWorksheet('Ref_'+name);s.columns=headers.map(h=>({header:h,width:32}));rows.forEach(r=>s.addRow(r));s.views=[{state:'frozen',ySplit:1,showGridLines:false}];s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF166534'}}
    const range=`'Ref_${name}'!$A$2:$A$${Math.max(2,rows.length+1)}`;wb.definedNames.add(range,'Liste_'+name);return s
  }
  reference('Plantations',['Choix plantation','Ferme','Campagne','Serre','Variété','Début récolte','Fin récolte'],catalog.plantings.map(p=>[p.label,p.farm,p.campaign,p.greenhouse,p.variety,p.start,p.end])).getColumn(1).width=95
  reference('Marches',['Choix marché et client','Client commercial','Type','Devise'],catalog.markets.map(m=>[m.label,m.client,m.type,m.currency])).getColumn(1).width=65
  reference('PlateauxRef',['Code','Libellé','Poids actuel indicatif (kg)'],catalog.trays.map(t=>[t.code,t.label,t.weight]))
  reference('Destinations',['Code','Destination écart'],catalog.destinations.map(d=>[d.code,d.label]))
  reference('Devises',['Devise'],[...new Set(catalog.markets.map(m=>m.currency).filter(Boolean))].map(c=>[c]))
  for(const name of ['Recoltes','Envois']) wb.definedNames.add(`'${name}'!$${name==='Recoltes'?'D':'A'}$2:$${name==='Recoltes'?'D':'A'}$501`,'Liste_'+name)
  for(const spec of MIGRATION_SHEETS) {
    const s=wb.addWorksheet(spec.name,{views:[{state:'frozen',ySplit:1,xSplit:1,showGridLines:false}]})
    const extra=spec.name==='Recoltes'?['Ferme (auto)','Campagne (auto)','Serre (auto)','Variété (auto)']:spec.name==='Prix'?['Montant (calculé)']:[]
    s.columns=[...spec.columns.map(c=>({header:c.label,key:c.key,width:c.key==='planting'?95:c.key==='market'?65:28})),...extra.map(h=>({header:h,width:30}))]
    s.getRow(1).height=42;s.getRow(1).alignment={wrapText:true,vertical:'middle'};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF166534'}}
    spec.columns.forEach((c,i)=>{
      s.getCell(1,i+1).note=`${c.required?'Obligatoire si cette étape est renseignée. ':''}${c.help||spec.help}`
      for(let r=2;r<=501;r++) {
        const cell=s.getCell(r,i+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF9E6'}}
        if(c.kind) {cell.numFmt=c.kind==='date'?'dd/mm/yyyy':c.kind==='whole'?'0':'#,##0.00'; cell.dataValidation=c.kind==='date'?{type:'date',operator:'between',formulae:[new Date('1900-01-01'),new Date()],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Saisir une date passée valide.'}:{type:c.kind==='whole'?'whole':'decimal',operator:'greaterThanOrEqual',formulae:[['lossKg','rejectKg','acceptedKg','price'].includes(c.key)?0:c.kind==='whole'?1:0.001],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Saisir un nombre valide.'}}
        if(c.list) cell.dataValidation={type:'list',formulae:[c.list.includes(',')?`"${c.list}"`:'Liste_'+c.list],allowBlank:true,showErrorMessage:true,errorStyle:'stop',errorTitle:'Référence inconnue',error:'Choisir une valeur de la liste.'}
      }
    })
    for(let r=2;r<=501;r++) {
      extra.forEach((_,j)=> {const cell=s.getCell(r,spec.columns.length+j+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F1'}};cell.value={formula:spec.name==='Recoltes'?`IF(E${r}="","",IFERROR(VLOOKUP(E${r},Ref_Plantations!$A$2:$G$${Math.max(2,catalog.plantings.length+1)},${j+2},FALSE),"Référence inconnue"))`:`IF(OR(E${r}="",F${r}=""),"",ROUND(E${r}*F${r},2))`};if(spec.name==='Prix')cell.numFmt='#,##0.00'})
    }
    s.autoFilter={from:{row:1,column:1},to:{row:501,column:s.columns.length}}
  }
  return new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

export async function readHarvestMigration(buffer: ArrayBuffer, domainId: string, scope:'workflow'|'harvests'='workflow',catalog?:MigrationCatalog): Promise<MigrationData> {
  const ExcelJS=(await import('exceljs')).default, wb=new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const meta=wb.getWorksheet('_reprise')
  const version=meta?.getCell('B1').value
  if((version!==1 && version!==2 && version!==3) || meta?.getCell('B2').value!==domainId) throw new Error('Modèle incompatible ou fichier d’un autre client. Télécharger le modèle du client actif.')
  if(version===3){
    if(!catalog || catalog.domainId!==domainId)throw new Error('Référentiel actuel du client requis pour contrôler ce modèle.')
    const {readSimpleHarvestRows,resolveSimpleHarvests}=await import('./harvestSimpleWorkbook')
    return resolveSimpleHarvests(readSimpleHarvestRows(wb),catalog)
  }
  const data: MigrationData={}
  for(const spec of MIGRATION_SHEETS) {
    const s=wb.getWorksheet(spec.name);
    if(!s && scope==='harvests' && !['Recoltes','Plateaux'].includes(spec.name)){data[spec.name]=[];continue}
    if(!s) throw new Error(`Onglet manquant : ${spec.name}`)
    const columns=version===1 && spec.name==='Recoltes' ? spec.columns.filter(c=>!['tray','count','unitKg'].includes(c.key)) : spec.columns
    columns.forEach((c,i)=>{if(s.getCell(1,i+1).value!==c.label)throw new Error(`${spec.name} : en-tête « ${c.label} » modifié ou déplacé.`)})
    if(s.rowCount>10001)throw new Error(`${spec.name} : limite de 10 000 lignes dépassée.`)
    data[spec.name]=[]
    for(let r=2;r<=s.rowCount;r++) {
      const row: Record<string,string|number>={__row:r};let filled=false
      columns.forEach((col,i)=>{
        const value=s.getCell(r,i+1).value
        if(value && typeof value==='object' && !(value instanceof Date)) throw new Error(`${spec.name}, ligne ${r}, ${col.label} : saisir une valeur, pas une formule ou un objet.`)
        let v:string|number=value instanceof Date?value.toISOString().slice(0,10):typeof value==='number'?value:text(value)
        if(col.kind==='date' && typeof v==='number') v=new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10)
        row[col.key]=v;if(text(v))filled=true
      })
      if(filled)data[spec.name].push(row)
    }
  }
  return data
}
