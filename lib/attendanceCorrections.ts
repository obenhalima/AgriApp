import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {sumAttendanceHours, attendanceDays, parseAttendanceHours, type AttendanceWorker} from './attendance'
import {attendanceName} from './attendanceBatch'
import {AttendanceValidationError, attendanceCellAddress, type AttendanceIssueLocation} from './attendanceValidation'

export type AttendanceCorrectionRow = {
  row: number; name: string; nameRow: number; workerId: string; type: string
  hours: unknown[]; undated: unknown[]; issues: string[]; duplicate: boolean
  problems: {message: string; location: AttendanceIssueLocation}[]
}
export type AttendanceCorrectionPeriod = {
  sheet: string; start: string; end: string; native: boolean
  days: {date: string; column: number}[]; undatedColumns: number[]
  rows: AttendanceCorrectionRow[]; workerCodes: Record<string, string>
}
export type AttendanceCellEdit = {row: number; column: number; value: string}

function value(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  const cell = sheet[XLSX.utils.encode_cell({r: row - 1, c: column})]
  if (cell?.t === 'e') return cell.w || '#VALUE!'
  if (cell?.f && cell.v == null) return '#VALUE!'
  return cell?.v ?? null
}

function undatedHours(input: unknown): number | null {
  if (input == null || String(input).trim() === '') return null
  const result = Number(String(input).replace(',', '.'))
  if (!Number.isFinite(result) || result < 0 || Math.abs(result * 100 - Math.round(result * 100)) > .00001) throw new Error('Renseignez des heures positives avec deux décimales au maximum.')
  return result
}

function periodsIn(book: XLSX.WorkBook) {
  if (book.Sheets._Contexte?.B2?.v === 'attendance-multi-1' && book.Sheets.Periodes) {
    return XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Periodes, {header: 1}).slice(1)
      .filter(row => row[0] && row[1] && row[2])
      .map(row => ({sheet: String(row[0]), start: String(row[1]), end: String(row[2]), native: true}))
  }
  return book.SheetNames.flatMap(sheet => {
    const title = String(book.Sheets[sheet].C2?.v || '')
    const dates = [...title.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
    if (!/quinzaine/i.test(title) || dates.length !== 2) return []
    const iso = (date: RegExpMatchArray) => `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`
    return [{sheet, start: iso(dates[0]), end: iso(dates[1]), native: false}]
  })
}

export function inspectAttendanceCorrections(buffer: ArrayBuffer, workers: AttendanceWorker[], mapping: Record<string, string> = {}): AttendanceCorrectionPeriod[] {
  const book = XLSX.read(buffer, {type: 'array'})
  const references = book.Sheets.Ref_Employes ? XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Ref_Employes, {header: 1}).slice(1) : []
  const idByCode = new Map(references.map(row => [String(row[0]), String(row[1])]))
  const workerCodes = Object.fromEntries(workers.map(worker => [worker.id, String(references.find(row => String(row[1]) === worker.id)?.[0] || worker.matricule || worker.id)]))
  return periodsIn(book).flatMap(period => {
    const sheet = book.Sheets[period.sheet]
    if (!sheet) return []
    const [year, month, day] = period.start.split('-').map(Number)
    const dates = attendanceDays(year, month, day === 1 ? 'first' : 'second')
    if (dates[0] !== period.start || dates.at(-1) !== period.end) return []
    const days = dates.map((date, index) => ({date, column: index + 3}))
    if (period.native && days.some(item => value(sheet, 1, item.column) !== item.date)) return []
    if (!period.native && days.some(item => Number(value(sheet, 6, item.column)) !== Number(item.date.slice(-2)))) return []
    const headers = period.native ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1})[0] || [] : []
    const undatedColumns = period.native ? headers.flatMap((header, column) => header === 'Heures sans date' ? [column] : []) : Array.from({length: 16 - days.length}, (_, index) => days.length + 3 + index)
    const rows: AttendanceCorrectionRow[] = []
    const last = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 1
    for (let row = period.native ? 2 : 10; row <= last; row++) {
      const type = String(value(sheet, row, 2) ?? '').trim().toUpperCase()
      if (!period.native && !['N', 'S'].includes(type) && String(value(sheet, row + 1, 2) || '').trim().toUpperCase() !== 'S') continue
      let nameRow = row
      if (!period.native && type === 'S' && !value(sheet, row, 1)) nameRow = row - 1
      const name = String(value(sheet, nameRow, 1) || '').trim()
      const code = period.native ? String(value(sheet, row, 0) ?? '') : ''
      const hours = days.map(item => value(sheet, row, item.column))
      const undated = undatedColumns.map(column => value(sheet, row, column))
      if (!name && !code && !type && ![...hours, ...undated].some(item => item != null)) continue
      const byCode = workers.find(worker => worker.id === idByCode.get(code))
      const exact = workers.filter(worker => attendanceName(`${worker.last_name} ${worker.first_name}`) === attendanceName(name))
      const worker = byCode || workers.find(item => item.id === mapping[name]) || (!code && exact.length === 1 ? exact[0] : undefined)
      const issues: string[] = []
      const problems: AttendanceCorrectionRow['problems'] = []
      const issue = (message: string, column: number) => {issues.push(message); problems.push({message, location: {sheet: period.sheet, row, column, employee: name}})}
      if (!worker) issue('Employé à associer.', period.native ? 0 : 1)
      if (!['N', 'S'].includes(type)) issue('Type N/S invalide.', 2)
      for (let index = 0; index < hours.length; index++) {
        try {const parsed = parseAttendanceHours(hours[index]); if(parsed != null && Math.abs(parsed*100-Math.round(parsed*100))>.00001) issue(`${days[index].date} · Plus de deux décimales : valeur d’origine conservée, précision à contrôler.`, days[index].column)} catch {issue(`${days[index].date} · Heures invalides.`, days[index].column)}
      }
      for (let index = 0; index < undated.length; index++) {
        try {if (undatedHours(undated[index])) issue('Heures sans date.', undatedColumns[index])} catch {issue('Heures sans date invalides.', undatedColumns[index])}
      }
      rows.push({row, name, nameRow, workerId: worker?.id || '', type, hours, undated, issues, duplicate: false, problems})
    }
    const groups = new Map<string, AttendanceCorrectionRow[]>()
    for (const row of rows) {
      if (!row.workerId || !['N', 'S'].includes(row.type)) continue
      const key = `${row.workerId}:${row.type}`
      groups.set(key, [...(groups.get(key) || []), row])
    }
    const add = (row: AttendanceCorrectionRow, message: string, column: number, relatedRows?: number[]) => {
      row.issues.push(message)
      row.problems.push({message, location: {sheet: period.sheet, row: row.row, column, employee: row.name, relatedRows}})
    }
    for (const group of groups.values()) if (group.length > 1) for (const row of group) {row.duplicate = true; add(row, 'Ligne N/S en double.', 2, group.map(item => item.row))}
    const ids = new Set(rows.map(row => row.workerId).filter(Boolean))
    for (const id of ids) {
      const employeeRows = rows.filter(row => row.workerId === id)
      if (!employeeRows.some(row => row.type === 'N') || !employeeRows.some(row => row.type === 'S')) for (const row of employeeRows) add(row, 'Ligne N ou S manquante.', 2, employeeRows.map(item => item.row))
      for (let index = 0; index < days.length; index++) {
        const total = employeeRows.reduce((sum, row) => {try {return sum + (parseAttendanceHours(row.hours[index]) || 0)} catch {return sum}}, 0)
        if (total > 24) for (const row of employeeRows) add(row, `${days[index].date} · N + S dépasse 24 heures.`, days[index].column, employeeRows.map(item => item.row))
      }
    }
    if (!rows.some(row => [...row.hours, ...row.undated].some(input => input != null && String(input).trim() !== ''))) for (const row of rows) add(row, 'Heures à renseigner.', days[0].column)
    return [{...period, days, undatedColumns, rows, workerCodes}]
  })
}

function put(sheet: XLSX.WorkSheet, row: number, column: number, input: string | number | null) {
  const address = XLSX.utils.encode_cell({r: row - 1, c: column})
  if (input == null || input === '') delete sheet[address]
  else sheet[address] = {t: typeof input === 'number' ? 'n' : 's', v: input}
}

function bindRows(book: XLSX.WorkBook, period: AttendanceCorrectionPeriod, workers: AttendanceWorker[], mapping: Record<string, string>) {
  const sheet = book.Sheets[period.sheet]
  for (const row of period.rows) {
    if (!row.workerId) continue
    if (period.native) put(sheet, row.row, 0, period.workerCodes[row.workerId])
    else if (mapping[row.name]) {
      const worker = workers.find(item => item.id === row.workerId)!
      put(sheet, row.nameRow, 1, `${worker.last_name} ${worker.first_name}`.trim())
    }
  }
}

function ensureReferences(book: XLSX.WorkBook, workers: AttendanceWorker[]) {
  const refs = book.Sheets.Ref_Employes
  if (!refs) return
  const known = XLSX.utils.sheet_to_json<unknown[]>(refs, {header: 1}).slice(1)
  for (const worker of workers) if (!known.some(row => String(row[1]) === worker.id)) {
    const code = worker.matricule || worker.id
    const duplicate = known.findIndex(row => String(row[0]) === code)
    if (duplicate >= 0) throw new AttendanceValidationError('Code employé en double dans le référentiel.', {sheet: 'Ref_Employes', row: duplicate + 2, column: 0, employee: String(known[duplicate][2] || '')})
    const entry = [code, worker.id, `${worker.last_name} ${worker.first_name}`.trim()]
    XLSX.utils.sheet_add_aoa(refs, [entry], {origin: -1}); known.push(entry)
  }
}

function finish(book: XLSX.WorkBook): ArrayBuffer {
  for (const period of periodsIn(book)) {
    if (!period.native) continue
    const sheet = book.Sheets[period.sheet]
    const headers = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1})[0] || []
    const total = headers.indexOf('Total heures'), equivalent = headers.indexOf('Équivalent jours N')
    if (total < 0) continue
    const last = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 1
    for (let row = 2; row <= last; row++) {
      if (!value(sheet, row, 0) && !value(sheet, row, 1) && !value(sheet, row, 2)) continue
      let sum = 0
      for (let column = 3; column < total; column++) {const input = value(sheet, row, column); if (typeof input === 'number') sum += input}
      const cell = sheet[XLSX.utils.encode_cell({r: row - 1, c: total})]
      sheet[XLSX.utils.encode_cell({r: row - 1, c: total})] = {...cell, t: 'n', v: Math.round(sum * 1000000) / 1000000}
      if (equivalent >= 0) {
        const address = XLSX.utils.encode_cell({r: row - 1, c: equivalent})
        const normal = value(sheet, row, 2) === 'N'
        sheet[address] = {...sheet[address], t: normal ? 'n' : 's', v: normal ? sum / 8 : ''}
      }
    }
  }
  return XLSX.write(book, {type: 'array', bookType: 'xlsx'}) as ArrayBuffer
}

export function applyAttendanceEdits(buffer: ArrayBuffer, sheetName: string, edits: AttendanceCellEdit[], workers: AttendanceWorker[], mapping: Record<string, string> = {}): ArrayBuffer {
  const period = inspectAttendanceCorrections(buffer, workers, mapping).find(item => item.sheet === sheetName)
  if (!period) throw new Error('Période invalide.')
  const book = XLSX.read(buffer, {type: 'array'}), sheet = book.Sheets[sheetName]
  bindRows(book, period, workers, mapping)
  const allowedRows = new Set(period.rows.flatMap(row => [row.row, row.nameRow]))
  for (const edit of edits) {
    try {
      if (!allowedRows.has(edit.row)) throw new Error('Ligne de pointage invalide.')
      if (period.days.some(day => day.column === edit.column)) put(sheet, edit.row, edit.column, parseAttendanceHours(edit.value))
      else if (period.undatedColumns.includes(edit.column)) put(sheet, edit.row, edit.column, undatedHours(edit.value))
      else if (edit.column === 2) {
        if (!['N', 'S'].includes(edit.value)) throw new Error('Type N/S invalide.')
        put(sheet, edit.row, edit.column, edit.value)
      } else if (edit.column === 1 || (period.native && edit.column === 0)) put(sheet, edit.row, edit.column, edit.value)
      else throw new Error('Cette colonne ne peut pas être modifiée.')
    } catch (reason) {
      throw new AttendanceValidationError((reason as Error).message, {sheet: sheetName, row: edit.row, column: edit.column, employee: period.rows.find(row => row.row === edit.row)?.name})
    }
  }
  if (period.native) ensureReferences(book, workers)
  return finish(book)
}

export function consolidateAttendanceCorrespondences(buffer: ArrayBuffer, workers: AttendanceWorker[], mapping: Record<string, string> = {}): {buffer: ArrayBuffer; warnings: AttendanceValidationError[]} {
  let result = buffer
  const warnings: AttendanceValidationError[] = []
  for (const period of inspectAttendanceCorrections(buffer, workers, mapping)) {
    if (!period.native) continue
    result = applyAttendanceEdits(result, period.sheet, [], workers, mapping)
    const duplicatedWorkers = [...new Set(period.rows.filter(row => row.duplicate).map(row => row.workerId))]
    for (const workerId of duplicatedWorkers) {
      try {result = mergeAttendanceDuplicates(result, period.sheet, workers, mapping, workerId)}
      catch (reason) {
        if (reason instanceof AttendanceValidationError) warnings.push(reason)
        else throw reason
      }
    }
  }
  return {buffer: result, warnings}
}

export function exportAttendanceCorrections(buffer: ArrayBuffer, workers: AttendanceWorker[], mapping: Record<string, string> = {}): ArrayBuffer {
  buffer = consolidateAttendanceCorrespondences(buffer, workers, mapping).buffer
  const book = XLSX.read(buffer, {type: 'array'})
  for (const period of inspectAttendanceCorrections(buffer, workers, mapping)) bindRows(book, period, workers, mapping)
  ensureReferences(book, workers)
  const audit = book.Sheets.A_completer
  const expected = ['Quinzaine', 'Onglet source', 'Ligne source', 'Nom source', 'Champ', 'Valeur source', 'Point à vérifier', 'Onglet ItriX']
  const headers = audit ? XLSX.utils.sheet_to_json<unknown[]>(audit, {header: 1})[0] || [] : []
  if (audit && XLSX.utils.decode_range(audit['!ref'] || 'A1').e.c === 7 && headers.length === expected.length && expected.every((header, index) => headers[index] === header)) {
    const rows: unknown[][] = [expected]
    for (const period of inspectAttendanceCorrections(finish(book), workers)) {
      if (period.rows.length && period.rows.every(row => row.issues.includes('Heures à renseigner.'))) {
        rows.push([period.start, period.sheet, null, null, 'Période', null, 'Heures à renseigner.', period.sheet])
        continue
      }
      const sourceSheet = book.Sheets[period.sheet]
      const sourceColumn = (XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, {header: 1})[0] || []).indexOf('Source')
      for (const row of period.rows) for (const issue of row.issues) {
        const origin = sourceColumn >= 0 ? String(value(sourceSheet, row.row, sourceColumn) || '').match(/^(.+?)!(\d+)/) : null
        rows.push([period.start, origin?.[1] || period.sheet, origin ? Number(origin[2]) : row.row, row.name, row.type || 'N/S', null, issue, period.sheet])
      }
    }
    book.Sheets.A_completer = XLSX.utils.aoa_to_sheet(rows)
  }
  const inspected = inspectAttendanceCorrections(finish(book), workers)
  const controls: unknown[][] = [['Onglet à corriger', 'Ligne', 'Cellule', 'Employé', 'Anomalie', 'Lignes liées']]
  for (const period of inspected) {
    if (period.rows.length && period.rows.every(row => row.issues.includes('Heures à renseigner.'))) {
      const first = period.rows[0]
      controls.push([period.sheet, first.row, attendanceCellAddress(first.row, period.days[0].column), '', 'Période sans pointage : renseigner les heures ou ne pas sélectionner cette quinzaine à l’import.', ''])
      continue
    }
    for (const row of period.rows) for (const problem of row.problems) {
      controls.push([period.sheet, row.row, attendanceCellAddress(row.row, problem.location.column), row.name, problem.message, (problem.location.relatedRows || []).join(', ')])
    }
  }
  const reportName = 'Controle_Pointage'
  if (!book.SheetNames.includes(reportName)) book.SheetNames.push(reportName)
  book.Sheets[reportName] = XLSX.utils.aoa_to_sheet(controls)
  for (let index = 1; index < controls.length; index++) {
    const sheet = String(controls[index][0]).replace(/'/g, "''"), cell = String(controls[index][2])
    book.Sheets[reportName][`C${index + 1}`].l = {Target: `#'${sheet}'!${cell}`}
  }
  const guideName = 'Mode_correction'
  if (!book.SheetNames.includes(guideName)) book.SheetNames.push(guideName)
  book.Sheets[guideName] = XLSX.utils.aoa_to_sheet([
    ['Corriger le pointage dans Excel'],
    ['1', 'Consultez Controle_Pointage. Chaque anomalie indique un onglet, une ligne et une cellule cliquable.'],
    ['2', 'Corrigez directement les onglets Pointage. Modifier le rapport de contrôle ne modifie pas les données importées.'],
    ['3', 'Employé : recopiez le code et le nom depuis Ref_Employes. Le code identifie la personne ; modifier uniquement le nom ne change pas cette identité.'],
    ['4', 'Chaque employé doit avoir une ligne N et une ligne S dans la période. N = heures normales ; S = heures supplémentaires.'],
    ['5', 'Heures : conservez les valeurs d’origine. Un total N + S supérieur à 24 h ou une précision supérieure à deux décimales est importé avec une alerte à contrôler. 8 h = 1 jour.'],
    ['6', 'Sans date : répartissez les heures dans les colonnes des jours concernés, puis retirez la quantité répartie de Heures sans date. Le total des heures doit rester identique.'],
    ['7', 'Lignes sans nom inutiles : supprimez les lignes entières, y compris leur paire N/S si elle est inutile. Les autres employés gardent leurs lignes N et S.'],
    ['8', 'Doublons : pour une même personne, additionnez les heures par jour et par type N/S dans une seule paire, puis supprimez les lignes supplémentaires. Pour deux personnes, corrigez leurs codes.'],
    ['9', 'Vide = inconnu ; zéro = aucune heure confirmée. Ne remplacez pas les inconnues par zéro sans vérification.'],
    ['10', 'Conservez les noms des onglets, les en-têtes de dates, Periodes, Ref_Employes et le contexte du client.'],
    ['11', 'Enregistrez en .xlsx et rechargez le fichier dans Importer plusieurs quinzaines. Les contrôles sont recalculés depuis les données ; le rapport Excel est informatif.'],
    ['12', 'Enregistrez en brouillon, puis ouvrez Contrôler les anomalies. Un motif et une résolution ou confirmation sont nécessaires avant validation et paie. Une avance doit être saisie comme montant séparé, jamais déduite automatiquement des heures.'],
  ])
  return finish(book)
}

export function restoreAttendanceCorrectionSheet(current: ArrayBuffer, previous: ArrayBuffer, sheetName: string): ArrayBuffer {
  const book = XLSX.read(current, {type: 'array'}), snapshot = XLSX.read(previous, {type: 'array'})
  if (!book.Sheets[sheetName] || !snapshot.Sheets[sheetName]) throw new Error('Période invalide.')
  book.Sheets[sheetName] = snapshot.Sheets[sheetName]
  return finish(book)
}

export async function preserveAttendanceWorkbookLayout(original: ArrayBuffer, corrected: ArrayBuffer): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS expects unprefixed SpreadsheetML elements; valid x:workbook
  // exports otherwise leave its parsed workbook undefined.
  const zip = await JSZip.loadAsync(original)
  let normalized = false
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.endsWith('.xml')) continue
    let xml = await entry.async('string')
    const declarations = [...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g)]
    if (!declarations.length) continue
    for (const declaration of declarations) {
      const prefix = declaration[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      xml = xml.replace(new RegExp(`(<\\/?)(?:${prefix}):`, 'g'), '$1')
      xml = xml.replace(declaration[0], 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    }
    zip.file(entry.name, xml); normalized = true
  }
  const compatible = normalized ? await zip.generateAsync({type: 'arraybuffer', compression: 'DEFLATE'}) : original
  await workbook.xlsx.load(compatible)
  const values = XLSX.read(corrected, {type: 'array'})
  for (const name of values.SheetNames) {
    const sheet = workbook.getWorksheet(name) || workbook.addWorksheet(name)
    const previousRows = sheet.rowCount
    const source = values.Sheets[name]
    sheet.eachRow(row => row.eachCell(cell => {if (!source[cell.address]) cell.value = null}))
    for (const [address, cell] of Object.entries(source)) {
      if (!/^[A-Z]+\d+$/.test(address)) continue
      const target = sheet.getCell(address)
      if (target.fullAddress.row > previousRows) {
        target.style = {...sheet.getCell(2, target.fullAddress.col).style}
        sheet.getRow(target.fullAddress.row).height = sheet.getRow(2).height
      }
      if (cell.f) target.value = {formula: cell.f, result: cell.v}
      else if (cell.t === 'e') target.value = {error: cell.w || '#VALUE!'} as ExcelJS.CellValue
      else target.value = cell.v ?? null
      if (cell.l?.Target) target.value = {text: String(cell.v || address), hyperlink: cell.l.Target}
    }
  }
  const periods = values.Sheets.Periodes ? XLSX.utils.sheet_to_json<unknown[]>(values.Sheets.Periodes, {header: 1}).slice(1).map(row => String(row[0] || '')) : ['Pointage']
  for (const name of periods) {
    const sheet = workbook.getWorksheet(name)
    if (sheet) sheet.unprotect()
  }
  for (const name of ['Controle_Pointage', 'Mode_correction']) {
    const sheet = workbook.getWorksheet(name)
    if (!sheet) continue
    sheet.views = [{state: 'frozen', ySplit: 1}]
    sheet.getRow(1).font = {bold: true, color: {argb: 'FFFFFFFF'}}
    sheet.getRow(1).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF0B4033'}}
    sheet.columns.forEach((column, index) => {column.width = name === 'Mode_correction' ? (index ? 110 : 18) : [30, 10, 15, 32, 65, 20][index] || 20})
    sheet.eachRow(row => {row.alignment = {wrapText: true, vertical: 'top'}; if (row.number > 1) row.height = name === 'Mode_correction' ? 48 : 40})
  }
  workbook.calcProperties.fullCalcOnLoad = true
  const bytes = await workbook.xlsx.writeBuffer()
  return Uint8Array.from(new Uint8Array(bytes)).buffer
}

export function allocateAttendanceHours(buffer: ArrayBuffer, sheetName: string, rowNumber: number, date: string, amount: string, workers: AttendanceWorker[], mapping: Record<string, string> = {}): ArrayBuffer {
  const period = inspectAttendanceCorrections(buffer, workers, mapping).find(item => item.sheet === sheetName)
  const row = period?.rows.find(item => item.row === rowNumber)
  const day = period?.days.find(item => item.date === date)
  if (!period || !row || !day || period.undatedColumns.length !== 1) throw new Error('Choisissez une date de cette quinzaine.')
  let quantity: number | null, remaining: number, current: number
  try {
    quantity = parseAttendanceHours(amount)
    remaining = undatedHours(row.undated[0]) || 0
    if (quantity == null || quantity <= 0 || quantity > remaining) throw new Error('Les heures à affecter doivent être positives et inférieures ou égales au solde sans date.')
  } catch (reason) {throw new AttendanceValidationError((reason as Error).message, {sheet: sheetName, row: rowNumber, column: period.undatedColumns[0], employee: row.name})}
  try {current = parseAttendanceHours(row.hours[period.days.indexOf(day)]) || 0}
  catch (reason) {throw new AttendanceValidationError((reason as Error).message, {sheet: sheetName, row: rowNumber, column: day.column, employee: row.name})}
  return applyAttendanceEdits(buffer, sheetName, [
    {row: rowNumber, column: day.column, value: String(Math.round((current + quantity) * 100) / 100)},
    {row: rowNumber, column: period.undatedColumns[0], value: String(Math.round((remaining - quantity) * 100) / 100)},
  ], workers, mapping)
}

export function mergeAttendanceDuplicates(buffer: ArrayBuffer, sheetName: string, workers: AttendanceWorker[], mapping: Record<string, string> = {}, onlyWorkerId?: string): ArrayBuffer {
  buffer = applyAttendanceEdits(buffer, sheetName, [], workers, mapping)
  const period = inspectAttendanceCorrections(buffer, workers, mapping).find(item => item.sheet === sheetName)
  if (!period?.native) throw new Error('La fusion des doublons nécessite le modèle ItriX.')
  const book = XLSX.read(buffer, {type: 'array'}), sheet = book.Sheets[sheetName]
  const groups = new Map<string, AttendanceCorrectionRow[]>()
  for (const row of period.rows) if (row.workerId && (!onlyWorkerId || row.workerId === onlyWorkerId) && ['N', 'S'].includes(row.type)) {
    const key = `${row.workerId}:${row.type}`
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const width = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.c
  const sourceColumn = (XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1})[0] || []).indexOf('Source')
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const first = group[0]
    const worker = workers.find(item => item.id === first.workerId)!
    put(sheet, first.row, 0, period.workerCodes[worker.id]); put(sheet, first.row, 1, `${worker.last_name} ${worker.first_name}`.trim())
    for (const day of period.days) {
      const values = group.map(row => {
        try {return parseAttendanceHours(value(sheet, row.row, day.column))}
        catch (reason) {throw new AttendanceValidationError((reason as Error).message, {sheet: sheetName, row: row.row, column: day.column, employee: row.name})}
      })
      const sum = sumAttendanceHours(values) ?? 0
      try {parseAttendanceHours(sum)}
      catch {throw new AttendanceValidationError('La fusion dépasserait 24 heures par jour. Corrigez les heures ou l’employé avant de fusionner.', {sheet: sheetName, row: first.row, column: day.column, employee: first.name, relatedRows: group.map(item => item.row)})}
      put(sheet, first.row, day.column, values.every(item => item == null) ? null : sum)
    }
    for (const column of period.undatedColumns) {
      const values = group.map(row => undatedHours(value(sheet, row.row, column)))
      put(sheet, first.row, column, values.every(item => item == null) ? null : Math.round(values.reduce<number>((total, item) => total + (item || 0), 0) * 100) / 100)
    }
    if (sourceColumn >= 0) put(sheet, first.row, sourceColumn, group.map(row => value(sheet, row.row, sourceColumn)).filter(Boolean).join(' · '))
    for (const row of group.slice(1)) for (let column = 0; column <= width; column++) delete sheet[XLSX.utils.encode_cell({r: row.row - 1, c: column})]
  }
  const result = finish(book)
  return result
}


export function removeUnnamedAttendanceRow(buffer: ArrayBuffer, sheetName: string, rowNumber: number, workers: AttendanceWorker[], mapping: Record<string, string> = {}): ArrayBuffer {
  const period = inspectAttendanceCorrections(buffer, workers, mapping).find(item => item.sheet === sheetName)
  const row = period?.rows.find(item => item.row === rowNumber)
  if (!period || !row || row.workerId) throw new AttendanceValidationError('Seules les lignes sans employé associé peuvent être supprimées.', {sheet: sheetName, row: rowNumber, column: 1})
  const book = XLSX.read(buffer, {type: 'array'}), sheet = book.Sheets[sheetName]
  const removed = period.native ? [rowNumber] : period.rows.filter(item => item.nameRow === row.nameRow && !item.workerId).map(item => item.row)
  for (const address of Object.keys(sheet)) if (!address.startsWith('!') && removed.includes(XLSX.utils.decode_cell(address).r + 1)) delete sheet[address]
  return finish(book)
}

export function applyAttendanceAllocations(buffer: ArrayBuffer, sheetName: string, allocations: Record<number, {date: string; amount: string}>, workers: AttendanceWorker[], mapping: Record<string, string> = {}): ArrayBuffer {
  let result = buffer
  for (const [number, allocation] of Object.entries(allocations)) {
    if (!allocation.date && !allocation.amount) continue
    const rowNumber = Number(number)
    const period = inspectAttendanceCorrections(result, workers, mapping).find(item => item.sheet === sheetName)
    const row = period?.rows.find(item => item.row === rowNumber)
    if (!period || !row) throw new Error('Ligne de pointage invalide.')
    if (!allocation.date) throw new AttendanceValidationError('Choisissez la date d’affectation.', {sheet: sheetName, row: rowNumber, column: period.undatedColumns[0], employee: row.name})
    const amount = allocation.amount.trim() || String(row.undated[0] ?? '')
    result = allocateAttendanceHours(result, sheetName, rowNumber, allocation.date, amount, workers, mapping)
  }
  return result
}
