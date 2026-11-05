import { STOCK_COLUMNS, type StockInput } from './stockInitialization'
import type { InitCatalog } from './initialization'

export async function stockInitializationWorkbook(domain: string, name: string, catalog: InitCatalog, warehouse: string, date: string) {
  if (!catalog.warehouses.some(w => w.code === warehouse)) throw new Error('Choisissez un entrepôt actif du client.')
  if (!catalog.stock_categories?.length || !catalog.units?.length) throw new Error('Les catégories et unités actives doivent être paramétrées avant l’export.')
  const products = catalog.products.filter(p => p.is_active !== 'non')
  if (products.length > 1000) throw new Error('Maximum 1 000 articles par modèle.')
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook(); wb.creator = 'ItriX Farm'
  const guide = wb.addWorksheet('Guide')
  for (const text of [
    'ItriX Farm — Articles et stock initial', `Client : ${name}`, `Date de reprise proposée : ${date}. Vérifier la date réelle de votre inventaire.`,
    'Articles_Stock : une ligne par article et entrepôt. Les articles existants sont préremplis ; ajoutez les nouveaux en dessous, avec un code métier unique.',
    'Catégorie, unité et entrepôt : choisir les codes des listes. Les feuilles Ref_ sont informatives et ne sont jamais importées.',
    'Quantité vide : créer seulement le nouvel article. Zéro : confirmer un stock nul. Stock positif : initialiser une seule fois le solde de cet entrepôt.',
    'Coût inconnu : laisser vide, jamais zéro par défaut. Un coût renseigné exige un justificatif. Valeur de stock : pas une dépense de campagne.',
    'Un article existant est réutilisé sans changer sa désignation, catégorie ni unité. Les articles inactifs doivent être réactivés séparément.',
    'Un stock déjà utilisé (solde, mouvement ou reprise antérieure) ne peut pas être réinitialisé ici. Utiliser le processus de correction de stock.',
    'Recharger, contrôler puis confirmer dans Stocks > Reprise du stock initial, également accessible depuis Initialisation. Rien n’est créé par le téléchargement ou le contrôle.',
    'Le serveur valide à nouveau les références, droits et stocks lors de la confirmation. Chaque validation est atomique et journalisée. Un fichier déjà appliqué ne doit pas être réappliqué.',
    'Dates Excel ou AAAA-MM-JJ. Quantité : deux décimales maximum. Maximum 1 000 lignes. Conserver onglets et en-têtes.',
  ]) guide.addRow([text])
  guide.getColumn(1).width = 110; guide.eachRow(r => { r.height = 45; r.alignment = { wrapText: true, vertical: 'middle' } })
  const sheet = wb.addWorksheet('Articles_Stock')
  sheet.columns = STOCK_COLUMNS.map(([key, header]) => ({ header, key, width: key === 'name' || key === 'notes' ? 40 : 25 }))
  const meta = wb.addWorksheet('_stock_itr'); meta.addRow(['version', 1]); meta.addRow(['domain', domain]); meta.state = 'veryHidden'
  const definitions = [ ['Ref_Articles', ['Code','Désignation','Catégorie','Unité'], products.map(p => [p.code,p.name,p.category,p.unit])], ['Ref_Categories', ['Code','Libellé'], catalog.stock_categories.map(p => [p.code,p.name])], ['Ref_Unites', ['Code','Libellé'], catalog.units.map(p => [p.code,p.name])], ['Ref_Entrepots', ['Code','Nom','Ferme'], catalog.warehouses.map(p => [p.code,p.name,p.farm])] ] as const
  for (const [title, headers, rows] of definitions) {
    const ref = wb.addWorksheet(title); ref.addRow([...headers]); rows.forEach(r => ref.addRow([...r])); ref.columns.forEach(c => { c.width = 30 }); ref.getRow(1).font = { bold: true }; ref.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const limit = Math.min(1001, Math.max(501, products.length + 101))
  for (let n = 2; n <= limit; n++) {
    const product = products[n - 2]
    sheet.addRow([product?.code || '', product?.name || '', product?.category || '', product?.unit || '', warehouse, new Date(date + 'T00:00:00Z'), null, null, '', ''])
    for (let col = 1; col <= 10; col++) sheet.getCell(n,col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8DF' } }
    for (const [column, ref] of [[3,'Ref_Categories'], [4,'Ref_Unites'], [5,'Ref_Entrepots']] as const) {
      const refSheet = wb.getWorksheet(ref)!
      sheet.getCell(n,column).dataValidation = { type: 'list', allowBlank: true, formulae: [`'${ref}'!$A$2:$A$${refSheet.rowCount}`], showErrorMessage: true, errorStyle: 'stop', error: 'Choisissez un code du référentiel.' }
    }
    sheet.getCell(n,6).numFmt = 'dd/mm/yyyy'; sheet.getCell(n,7).numFmt = '#,##0.00'; sheet.getCell(n,8).numFmt = '#,##0.########'
    for (const col of [7,8]) sheet.getCell(n,col).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0,99999999.99], showErrorMessage: true, errorStyle: 'stop', error: 'Nombre positif ou nul attendu.' }
  }
  sheet.getRow(1).height = 32; sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D2E' } }; sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]; sheet.autoFilter = 'A1:J1'
  return new Blob([await wb.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function readStockInitializationWorkbook(bytes: ArrayBuffer, domain: string): Promise<StockInput[]> {
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Maximum 5 Mo par fichier.')
  const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const meta = wb.getWorksheet('_stock_itr'), sheet = wb.getWorksheet('Articles_Stock')
  if (meta?.getCell('B1').value !== 1 || meta?.getCell('B2').value !== domain || !sheet) throw new Error('Utilisez le nouveau modèle Articles et stock exporté pour le client actif.')
  if (sheet.rowCount > 1001 || sheet.columnCount > 10) throw new Error('Maximum 1 000 lignes, sans colonne supplémentaire.')
  STOCK_COLUMNS.forEach(([,label], index) => { if (sheet.getCell(1,index+1).value !== label) throw new Error(`En-tête attendu : ${label}. Retéléchargez le modèle.`) })
  const rows: StockInput[] = []
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = { line: n } as StockInput
    STOCK_COLUMNS.forEach(([key], index) => {
      const value = sheet.getCell(n,index+1).value
      if (value != null && !(value instanceof Date) && !['string','number'].includes(typeof value)) throw new Error(`Articles_Stock ligne ${n}, ${STOCK_COLUMNS[index][1]} : formules et objets non autorisés.`)
      const text = value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').trim()
      if (text.length > 2000) throw new Error(`Ligne ${n} : champ trop long.`)
      row[key] = text
    })
    rows.push(row)
  }
  return rows
}
