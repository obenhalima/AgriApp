// Browser-side workbook exchange for the initialization application feature.
import { INIT_SECTIONS, initNumber, initReferenceRows, emptyInitDraft, InitDraft, InitRow, InitCatalog } from './initialization'

export async function initializationWorkbook(domain: string, draft?: InitDraft, catalog?: InitCatalog, sectionKey?: string): Promise<Blob> {
  const sections = sectionKey ? INIT_SECTIONS.filter(s => s.key === sectionKey) : INIT_SECTIONS
  if (!sections.length) throw new Error('Étape inconnue.')
  const needed = new Set(sections.flatMap(s => s.fields.flatMap(f => f.ref ? [f.ref] : [])))
  // Include the whole reference chain (e.g. stock → warehouse → farm).
  let previous = -1
  while (previous !== needed.size) {
    previous = needed.size
    INIT_SECTIONS.filter(s => needed.has(s.key)).forEach(s => s.fields.forEach(f => { if (f.ref) needed.add(f.ref) }))
  }
  const referenceNames = (key: string) => key === 'crops' ? 'Ref_cultures' : key === 'varieties' ? 'Ref_varietes' : `Ref_${key}`
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const guide = wb.addWorksheet('Guide')
  guide.getColumn(1).width = 105
  const instructions = [
    'FarmPilot — préparation de l’initialisation',
    'Client : ' + domain,
    'Orange clair : obligatoire. Bleu clair : facultatif. Dates : AAAA-MM-JJ. Montants : DH.',
    sectionKey ? `Étape à compléter : ${sections[0].title}. Les lignes déjà saisies sont reprises.` : 'Sauvegarde complète du dossier. Pour saisir une étape, utilisez son modèle dédié.',
    'Conserver les en-têtes techniques. Une ligne = un enregistrement. Les codes relient les feuilles.',
    'Le rechargement remplace uniquement l’étape ouverte, après aperçu et confirmation. Les autres étapes sont conservées.',
    'Ce classeur prépare les données. Il ne crée pas encore de comptes, stocks, budgets ou dépenses.',
    'Budget = prévision. Stock d’ouverture = valeur détenue. Dépense réelle = charge déjà réalisée.',
    'Aucun mot de passe ou secret ne doit figurer dans ce fichier.',
    'Les feuilles Ref_ sont informatives : références existantes et données déjà saisies dans le dossier. Elles ne sont jamais importées.',
  ]
  instructions.forEach(t => guide.addRow([t]))
  guide.eachRow(r => { r.height = 35; r.alignment = { wrapText: true, vertical: 'middle' } })
  const meta = wb.addWorksheet('_farmpilot')
  meta.addRow(['schema', 1]); meta.addRow(['domain', domain]); meta.state = 'hidden'
  if (sectionKey) meta.addRow(['section', sectionKey])
  const examples = wb.addWorksheet('Exemples')
  examples.columns = [{ header: 'Feuille', width: 23 }, { header: 'Champ', width: 25 }, { header: 'Libellé', width: 35 }, { header: 'Exemple fictif', width: 35 }, { header: 'Obligatoire', width: 15 }]
  {
    const keys = new Set([...Object.keys(catalog || {}), ...Object.keys(draft?.rows || {})])
    for (const key of keys) {
      if (sectionKey && !needed.has(key) && key !== sectionKey) continue
      const rows = key === sectionKey ? catalog?.[key] || [] : initReferenceRows(draft || emptyInitDraft(), key, catalog)
      if (!rows.length) continue
      const sheet = wb.addWorksheet(referenceNames(key))
      const fields = key === 'crops' ? ['code', 'name'] : INIT_SECTIONS.find(s => s.key === key)?.fields.map(f => f.key) || ['code', 'name', 'existing_id']
      sheet.columns = fields.map(f => ({ header: f, width: f === 'existing_id' ? 42 : 28 }))
      rows.forEach(r => sheet.addRow(fields.map(f => r[f] || '')))
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      sheet.getRow(1).font = { bold: true }
    }
  }
  for (const section of sections) {
    const sheet = wb.addWorksheet(section.key)
    sheet.columns = section.fields.map(f => ({ header: f.key, key: f.key, width: Math.max(22, Math.min(38, f.label.length + 5)) }))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: section.fields.length } }
    for (const row of draft?.rows[section.key] || []) sheet.addRow(section.fields.map(f => f.type === 'number' && Number.isFinite(initNumber(row[f.key] || '')) ? initNumber(row[f.key]) : row[f.key] ?? ''))
    section.fields.forEach((field, index) => {
      const actualReference = field.ref ? draft?.rows[field.ref]?.find(r => r.code) || initReferenceRows(draft || emptyInitDraft(), field.ref, catalog).find(r => r.code) : undefined
      examples.addRow([section.key, field.key, field.label, actualReference?.code || field.example || '', field.required ? 'Oui' : 'Non'])
      const column = sheet.getColumn(index + 1)
      if (field.key === 'existing_id') column.hidden = true
      column.numFmt = field.type === 'number' ? '#,##0.00' : '@'
      for (let r = 1; r <= Math.max(101, sheet.rowCount); r++) {
        const cell = sheet.getCell(r, index + 1)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: field.required ? 'FFFFEDD5' : 'FFEFF6FF' } }
        if (r === 1) cell.font = { bold: true, color: { argb: 'FF172033' } }
        if (r > 1 && field.options) cell.dataValidation = { type: 'list', allowBlank: !field.required, formulae: ['"' + field.options.join(',') + '"'], showErrorMessage: true, errorTitle: 'Valeur non reconnue', error: 'Choisir une valeur de la liste.', errorStyle: 'stop' }
        const refSheet = field.ref ? wb.getWorksheet(referenceNames(field.ref)) : undefined
        if (r > 1 && refSheet && refSheet.rowCount > 1) cell.dataValidation = { type: 'list', allowBlank: !field.required, formulae: [`'${refSheet.name}'!$A$2:$A$${refSheet.rowCount}`], showErrorMessage: true, errorStyle: 'stop', error: 'Choisir une référence de la liste.' }
      }
    })
  }
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function readInitializationWorkbook(file: ArrayBuffer, domain: string, sectionKey?: string): Promise<Record<string, InitRow[]>> {
  if (file.byteLength > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux (maximum 5 Mo).')
  const XLSX = await import('xlsx')
  const wb = XLSX.read(file, { type: 'array', cellDates: false })
  const meta = wb.Sheets._farmpilot
  if (!meta || meta.B1?.v !== 1 || String(meta.B2?.v) !== domain) throw new Error('Utilisez un modèle de cette version téléchargé pour le client actif.')
  const declaredSection = meta.B3?.v ? String(meta.B3.v) : undefined
  if (sectionKey && declaredSection && declaredSection !== sectionKey) throw new Error('Ce fichier correspond à une autre étape. Ouvrez cette étape avant de le charger.')
  if (sectionKey && !wb.Sheets[sectionKey]) throw new Error('Le fichier ne contient pas la feuille de cette étape.')
  const scope = sectionKey || declaredSection
  const result: Record<string, InitRow[]> = {}
  for (const section of INIT_SECTIONS) {
    if (scope && section.key !== scope) continue
    const sheet = wb.Sheets[section.key]
    if (!sheet) continue
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    if (range.e.r > 1001 || range.e.c > 50) throw new Error(`${section.title} : maximum 1 000 lignes et 51 colonnes.`)
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
    const headers = (rows[0] || []).map(String)
    if (new Set(headers).size !== headers.length || section.fields.some(f => f.required && !headers.includes(f.key))) throw new Error(`${section.title} : en-têtes manquants ou dupliqués. Retéléchargez le modèle.`)
    result[section.key] = rows.slice(1).filter(r => r.some(v => String(v).trim())).map(row => Object.fromEntries(section.fields.map(f => {
      const value = row[headers.indexOf(f.key)] ?? ''
      if (f.type === 'date' && typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value)
        if (date) return [f.key, `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`]
      }
      if (String(value).length > 2000) throw new Error(`${section.title} : champ trop long (maximum 2 000 caractères).`)
      return [f.key, String(value).trim()]
    })))
  }
  if (!Object.keys(result).length) throw new Error('Aucune feuille de données reconnue.')
  return result
}

export function downloadInitFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
