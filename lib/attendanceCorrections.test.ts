import {expect, it} from 'vitest'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {readFarmAttendanceBatch} from './attendanceBatch'
import {consolidateAttendanceCorrespondences, applyAttendanceAllocations, removeUnnamedAttendanceRow, allocateAttendanceHours, applyAttendanceEdits, exportAttendanceCorrections, inspectAttendanceCorrections, mergeAttendanceDuplicates, preserveAttendanceWorkbookLayout, restoreAttendanceCorrectionSheet} from './attendanceCorrections'

const workers = [{id: 'a', farm_id: 'farm', first_name: '', last_name: 'EMPLOYE TEST', matricule: 'EMP01', is_active: true}]
const binding = {domain: 'domain', farm: 'farm'}
function workbook() {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Clé', 'Valeur'], ['version', 'attendance-multi-1'], ['client', 'domain'], ['ferme', 'farm']]), '_Contexte')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Code', 'ID', 'Nom'], ['EMP01', 'a', 'EMPLOYE TEST']]), 'Ref_Employes')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Onglet', 'Début', 'Fin'], ['Pointage', '2026-07-01', '2026-07-15']]), 'Periodes')
  const days = Array.from({length: 15}, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`)
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Code employé', 'Nom', 'Type', ...days, 'Total heures', 'Équivalent jours N', 'Heures sans date', 'Source'],
    ['EMP01', 'EMPLOYE TEST', 'N', 8], ['EMP01', 'EMPLOYE TEST', 'S', 2],
  ]), 'Pointage')
  book.Sheets.Pointage['!ref'] = 'A1:V3'
  return book
}
const bytes = (book: XLSX.WorkBook) => XLSX.write(book, {type: 'array', bookType: 'xlsx'}) as ArrayBuffer
const parsed = (buffer: ArrayBuffer) => readFarmAttendanceBatch(buffer, 'file.xlsx', workers, {}, binding)[0]

it('corrects invalid types and decimal hours without changing source bytes or blank cells', () => {
  const book = workbook()
  book.Sheets.Pointage.C2 = {t: 'n', v: 0}; book.Sheets.Pointage.E2 = {t: 'n', v: 17.5824}
  const original = bytes(book)
  expect(inspectAttendanceCorrections(original, workers)[0].rows[0].issues.join()).toContain('Type N/S invalide')
  const result = applyAttendanceEdits(original, 'Pointage', [{row: 2, column: 2, value: 'N'}, {row: 2, column: 4, value: '17,58'}], workers)
  expect(parsed(result).issues).toEqual([])
  expect(parsed(result).rows[1].normal_hours).toBe(17.58)
  expect(parsed(result).rows[1].overtime_hours).toBeNull()
  expect(XLSX.read(original, {type: 'array'}).Sheets.Pointage.C2.v).toBe(0)
  expect(() => applyAttendanceEdits(original, 'Pointage', [{row: 1, column: 2, value: 'N'}], workers)).toThrow('Ligne')
  expect(() => applyAttendanceEdits(original, 'Pointage', [{row: 2, column: 18, value: '4'}], workers)).toThrow('colonne')
  expect(parsed(applyAttendanceEdits(result, 'Pointage', [{row: 2, column: 3, value: '25'}], workers)).warnings?.[0].message).toContain('24')
})

it('allocates undated hours in parts while preserving their total and enforcing daily limits', () => {
  const book = workbook(); book.Sheets.Pointage.U3 = {t: 'n', v: 28}
  const original = bytes(book)
  const first = allocateAttendanceHours(original, 'Pointage', 3, '2026-07-01', '6', workers)
  const inspected = inspectAttendanceCorrections(first, workers)[0].rows[1]
  expect(inspected.hours[0]).toBe(8)
  expect(inspected.undated[0]).toBe(22)
  expect(() => allocateAttendanceHours(first, 'Pointage', 3, '2026-07-01', '23', workers)).toThrow('solde')
  expect(() => allocateAttendanceHours(first, 'Pointage', 3, '2026-08-01', '2', workers)).toThrow('date')
  const second = allocateAttendanceHours(first, 'Pointage', 3, '2026-07-02', '22', workers)
  expect(parsed(second).issues).toEqual([])
  expect(parsed(second).rows.reduce((sum, row) => sum + (row.overtime_hours || 0), 0)).toBe(30)
  expect(XLSX.read(original, {type: 'array'}).Sheets.Pointage.U3.v).toBe(28)
})

it('merges explicit duplicate N/S rows, preserves unknowns and source traces, and refuses excessive totals', () => {
  const book = workbook()
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage, [['EMP01', 'EMPLOYE TEST', 'N', 4], ['EMP01', 'EMPLOYE TEST', 'S', 1]], {origin: 'A4'})
  book.Sheets.Pointage.V2 = {t: 's', v: 'Source!10'}; book.Sheets.Pointage.V4 = {t: 's', v: 'Source!20'}
  const original = bytes(book)
  expect(inspectAttendanceCorrections(original, workers)[0].rows.every(row => row.duplicate)).toBe(true)
  const result = mergeAttendanceDuplicates(original, 'Pointage', workers)
  expect(parsed(result).issues).toEqual([])
  expect(parsed(result).rows[0]).toMatchObject({normal_hours: 12, overtime_hours: 3})
  expect(parsed(result).rows[1]).toMatchObject({normal_hours: null, overtime_hours: null})
  expect(XLSX.read(result, {type: 'array'}).Sheets.Pointage.V2.v).toBe('Source!10 · Source!20')
  book.Sheets.Pointage.D4 = {t: 'n', v: 16}; book.Sheets.Pointage.D5 = {t: 'n', v: 16}
  expect(parsed(mergeAttendanceDuplicates(bytes(book), 'Pointage', workers)).warnings?.[0].message).toContain('24 heures')
})

it('persists employee mappings in corrected exports and adds new farm employees to the reference sheet', () => {
  const book = workbook()
  book.Sheets.Pointage.A2 = {t: 's', v: ''}; book.Sheets.Pointage.A3 = {t: 's', v: ''}
  book.Sheets.Pointage.B2 = {t: 's', v: 'Alias'}; book.Sheets.Pointage.B3 = {t: 's', v: 'Alias'}
  const other = {...workers[0], id: 'b', last_name: 'EMPLOYE B', matricule: 'EMP02'}
  const result = exportAttendanceCorrections(bytes(book), [...workers, other], {Alias: 'b'})
  const loaded = readFarmAttendanceBatch(result, 'corrected.xlsx', [...workers, other], {}, binding)[0]
  expect(loaded.issues).toEqual([])
  expect(new Set(loaded.rows.map(row => row.worker_id))).toEqual(new Set(['b']))
  expect(loaded.names).toEqual([])
})

it('supports corrections and allocations in the original farm format while preserving financial input cells', () => {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([])
  sheet.C2 = {t: 's', v: 'QUINZAINE DU 01/07/2026 AU 15/07/2026'}
  for (let day = 1; day <= 15; day++) sheet[XLSX.utils.encode_cell({r: 5, c: day + 2})] = {t: 'n', v: day}
  Object.assign(sheet, {B10: {t: 's', v: 'Alias'}, C10: {t: 'n', v: 0}, D10: {t: 'n', v: 8}, C11: {t: 's', v: 'S'}, S11: {t: 'n', v: 2}, V10: {t: 'n', v: 999}, '!ref': 'B2:Z20'})
  XLSX.utils.book_append_sheet(book, sheet, '01.07.2026')
  const fixed = applyAttendanceEdits(bytes(book), '01.07.2026', [{row: 10, column: 2, value: 'N'}], workers, {Alias: 'a'})
  const result = allocateAttendanceHours(fixed, '01.07.2026', 11, '2026-07-02', '2', workers)
  const imported = readFarmAttendanceBatch(result, 'farm.xlsx', workers)[0]
  expect(imported.issues).toEqual([])
  expect(imported.rows[1].overtime_hours).toBe(2)
  expect(XLSX.read(result, {type: 'array'}).Sheets['01.07.2026'].V10.v).toBe(999)
})

it('marks empty periods as editable and keeps explicit zero distinct from unknown', () => {
  const book = workbook(); delete book.Sheets.Pointage.D2; delete book.Sheets.Pointage.D3
  const original = bytes(book)
  expect(inspectAttendanceCorrections(original, workers)[0].rows.every(row => row.issues.includes('Heures à renseigner.'))).toBe(true)
  const fixed = applyAttendanceEdits(original, 'Pointage', [{row: 2, column: 3, value: '0'}], workers)
  expect(parsed(fixed).issues).toEqual([])
  expect(parsed(fixed).rows[0]).toMatchObject({normal_hours: 0, overtime_hours: null})
})

it('undoes only the corrected sheet while keeping changes to other periods', () => {
  const book = workbook(), second = structuredClone(book.Sheets.Pointage)
  for (let index = 0; index < 15; index++) second[XLSX.utils.encode_cell({r: 0, c: index + 3})] = {t: 's', v: `2026-08-${String(index + 1).padStart(2, '0')}`}
  XLSX.utils.book_append_sheet(book, second, 'August')
  XLSX.utils.sheet_add_aoa(book.Sheets.Periodes, [['August', '2026-08-01', '2026-08-15']], {origin: -1})
  const original = bytes(book)
  const july = applyAttendanceEdits(original, 'Pointage', [{row: 2, column: 3, value: '9'}], workers)
  const august = applyAttendanceEdits(july, 'August', [{row: 2, column: 3, value: '12'}], workers)
  const restored = XLSX.read(restoreAttendanceCorrectionSheet(august, original, 'Pointage'), {type: 'array'})
  expect(restored.Sheets.Pointage.D2.v).toBe(8)
  expect(restored.Sheets.August.D2.v).toBe(12)
})

it('keeps Excel formatting, validations and hidden context in the corrected download', async () => {
  const original = new ExcelJS.Workbook()
  await original.xlsx.load(bytes(workbook()))
  const sheet = original.getWorksheet('Pointage')!
  sheet.getCell('D2').numFmt = '0.00'
  sheet.getCell('D2').font = {bold: true, color: {argb: 'FF0B3D2E'}}
  sheet.getCell('C2').dataValidation = {type: 'list', formulae: ['"N,S"']}
  original.getWorksheet('_Contexte')!.state = 'hidden'
  const source = Uint8Array.from(new Uint8Array(await original.xlsx.writeBuffer())).buffer
  const corrected = applyAttendanceEdits(source, 'Pointage', [{row: 2, column: 3, value: '9'}], workers)
  const result = await preserveAttendanceWorkbookLayout(source, corrected)
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(result)
  expect(loaded.getWorksheet('Pointage')!.getCell('D2').value).toBe(9)
  expect(loaded.getWorksheet('Pointage')!.getCell('D2').numFmt).toBe('0.00')
  expect(loaded.getWorksheet('Pointage')!.getCell('D2').font.bold).toBe(true)
  expect(loaded.getWorksheet('Pointage')!.getCell('C2').dataValidation.type).toBe('list')
  expect(loaded.getWorksheet('_Contexte')!.state).toBe('hidden')
  expect(parsed(result).issues).toEqual([])
})

it('refreshes the generated anomaly sheet in corrected downloads', () => {
  const book = workbook()
  const headers = ['Quinzaine', 'Onglet source', 'Ligne source', 'Nom source', 'Champ', 'Valeur source', 'Point à vérifier', 'Onglet ItriX']
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ['2026-07-01', 'Source', 10, 'EMPLOYE TEST', 'Type', '0', 'Ancienne anomalie', 'Pointage']]), 'A_completer')
  const result = XLSX.read(exportAttendanceCorrections(bytes(book), workers), {type: 'array'})
  expect(XLSX.utils.sheet_to_json(result.Sheets.A_completer, {header: 1})).toEqual([headers])
  book.Sheets.Pointage.C2 = {t: 's', v: '0'}
  const withError = XLSX.read(exportAttendanceCorrections(bytes(book), workers), {type: 'array'})
  expect(JSON.stringify(XLSX.utils.sheet_to_json(withError.Sheets.A_completer, {header: 1}))).toContain('Type N/S invalide.')
})


it('locates invalid hours and duplicate groups in their actual worksheet cells', () => {
  const book = workbook(); book.Sheets.Pointage.E2 = {t: 'n', v: 17.5824}
  const invalid = parsed(bytes(book))
  expect(invalid.issues).toEqual([])
  expect(invalid.rows[1].normal_hours).toBe(17.5824)
  expect(invalid.warnings?.[0].message).toContain('décimales')
  book.Sheets.Pointage.E2 = {t: 'n', v: 17.58}
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage, [['EMP01', 'EMPLOYE TEST', 'N', 4]], {origin: 'A4'})
  const inspection = inspectAttendanceCorrections(bytes(book), workers)[0]
  expect(inspection.rows[0].problems.find(item => item.location.relatedRows)?.location).toMatchObject({row: 2, column: 2, relatedRows: [2, 4]})
  expect(parsed(bytes(book)).rows[0].normal_hours).toBe(12)
  expect(parsed(mergeAttendanceDuplicates(bytes(book), 'Pointage', workers)).issues).toEqual([])
})


it('applies date-only allocations, preserves totals and rejects incomplete assignments', () => {
  const book = workbook(); book.Sheets.Pointage.U3 = {t: 'n', v: 2}
  const original = bytes(book)
  const result = applyAttendanceAllocations(original, 'Pointage', {3: {date: '2026-07-02', amount: ''}}, workers)
  expect(parsed(result).issues).toEqual([])
  expect(parsed(result).rows[1].overtime_hours).toBe(2)
  expect(XLSX.read(result, {type: 'array'}).Sheets.Pointage.U3.v).toBe(0)
  expect(() => applyAttendanceAllocations(original, 'Pointage', {3: {date: '', amount: '1'}}, workers)).toThrow('U3')
})

it('removes only unnamed rows without shifting other row references and can undo', () => {
  const book = workbook()
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage, [['', '', 'N', 4], ['', '', 'S', 1]], {origin: 'A4'})
  const original = bytes(book)
  const result = removeUnnamedAttendanceRow(original, 'Pointage', 4, workers)
  const reloaded = XLSX.read(result, {type: 'array'})
  expect(reloaded.Sheets.Pointage.D4).toBeUndefined()
  expect(reloaded.Sheets.Pointage.D5.v).toBe(1)
  expect(reloaded.Sheets.Pointage.D2.v).toBe(8)
  expect(() => removeUnnamedAttendanceRow(original, 'Pointage', 2, workers)).toThrow('B2')
  const restored = restoreAttendanceCorrectionSheet(result, original, 'Pointage')
  expect(XLSX.read(restored, {type: 'array'}).Sheets.Pointage.D4.v).toBe(4)
})


it('exports an editable correction file with cell links and accepts Excel edits and row deletion on reload', async () => {
  const book = workbook()
  book.Sheets.Pointage.C2 = {t: 's', v: '0'}
  book.Sheets.Pointage.U3 = {t: 'n', v: 2}
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage, [['', '', 'N', 4], ['', '', 'S', 1]], {origin: 'A4'})
  const original = new ExcelJS.Workbook(); await original.xlsx.load(bytes(book))
  await original.getWorksheet('Pointage')!.protect('test', {spinCount: 1})
  original.getWorksheet('_Contexte')!.state = 'hidden'
  const source = Uint8Array.from(new Uint8Array(await original.xlsx.writeBuffer())).buffer
  const exported = await preserveAttendanceWorkbookLayout(source, exportAttendanceCorrections(source, workers))
  const edited = new ExcelJS.Workbook(); await edited.xlsx.load(exported)
  const sheet = edited.getWorksheet('Pointage')!
  expect((sheet as unknown as {sheetProtection?: {sheet?: boolean}}).sheetProtection?.sheet).not.toBe(true)
  expect(edited.getWorksheet('Controle_Pointage')!.getCell('C2').value).toMatchObject({text: 'C2', hyperlink: "#'Pointage'!C2"})
  expect(edited.getWorksheet('Mode_correction')!.rowCount).toBeGreaterThan(10)
  sheet.getCell('C2').value = 'N'
  sheet.getCell('E3').value = 2; sheet.getCell('U3').value = 0
  sheet.spliceRows(4, 2)
  sheet.getRow(4).values = []; sheet.getRow(5).values = [] // ExcelJS retains trailing rows when deleting at the end; Excel removes their cells.
  const reloaded = Uint8Array.from(new Uint8Array(await edited.xlsx.writeBuffer())).buffer
  expect(parsed(reloaded).issues).toEqual([])
  expect(parsed(reloaded).rows[1].overtime_hours).toBe(2)
  const refreshed = XLSX.read(exportAttendanceCorrections(reloaded, workers), {type: 'array'})
  expect(XLSX.utils.sheet_to_json(refreshed.Sheets.Controle_Pointage, {header: 1})).toHaveLength(1)
  expect(edited.getWorksheet('_Contexte')!.state).toBe('hidden')
})


it('downloads valid SpreadsheetML files with prefixed XML while retaining hours, styles and context', async () => {
  const original = new ExcelJS.Workbook(); await original.xlsx.load(bytes(workbook()))
  original.getWorksheet('Pointage')!.getCell('D2').numFmt = '0.00'
  original.getWorksheet('_Contexte')!.state = 'hidden'
  const zip = await JSZip.loadAsync(await original.xlsx.writeBuffer())
  for (const entry of Object.values(zip.files)) {
    if (!entry.name.endsWith('.xml')) continue
    let xml = await entry.async('string')
    if (!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue
    xml = xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    xml = xml.replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2')
    zip.file(entry.name, xml)
  }
  const source = await zip.generateAsync({type: 'arraybuffer'})
  const result = await preserveAttendanceWorkbookLayout(source, exportAttendanceCorrections(source, workers))
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(result)
  expect(parsed(result).issues).toEqual([])
  expect(loaded.getWorksheet('Pointage')!.getCell('D2').value).toBe(8)
  expect(loaded.getWorksheet('Pointage')!.getCell('D2').numFmt).toBe('0.00')
  expect(loaded.getWorksheet('_Contexte')!.state).toBe('hidden')
  expect(loaded.getWorksheet('Mode_correction')).toBeDefined()
})


it('consolidates mapped aliases with existing employee rows and preserves undated hours and source references', () => {
  const book = workbook()
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage, [['', 'ALIAS', 'N', 4], ['', 'ALIAS', 'S', 1]], {origin: 'A4'})
  book.Sheets.Pointage.U5 = {t:'n',v:3}
  book.Sheets.Pointage.V2 = {t:'s',v:'Source!10'};book.Sheets.Pointage.V4 = {t:'s',v:'Source!20'}
  const result = consolidateAttendanceCorrespondences(bytes(book), workers, {ALIAS:'a'})
  expect(result.warnings).toEqual([])
  const loaded = XLSX.read(result.buffer,{type:'array'})
  expect(loaded.Sheets.Pointage.D2.v).toBe(12)
  expect(loaded.Sheets.Pointage.D3.v).toBe(3)
  expect(loaded.Sheets.Pointage.U3.v).toBe(3)
  expect(loaded.Sheets.Pointage.V2.v).toContain('Source!20')
  expect(loaded.Sheets.Pointage.A4).toBeUndefined()
  const again=consolidateAttendanceCorrespondences(result.buffer,workers,{ALIAS:'a'})
  expect(XLSX.read(again.buffer,{type:'array'}).Sheets.Pointage.D2.v).toBe(12)
})


it('allows deleting named but unassigned rows while protecting identified employees', () => {
  const book=workbook()
  XLSX.utils.sheet_add_aoa(book.Sheets.Pointage,[['','NOM INCONNU','N',4],['','NOM INCONNU','S',1]],{origin:'A4'})
  const first=removeUnnamedAttendanceRow(bytes(book),'Pointage',4,workers)
  expect(XLSX.read(first,{type:'array'}).Sheets.Pointage.B4).toBeUndefined()
  const second=removeUnnamedAttendanceRow(first,'Pointage',5,workers)
  expect(parsed(second).issues).toEqual([])
  expect(parsed(second).rows[0].normal_hours).toBe(8)
  expect(()=>removeUnnamedAttendanceRow(second,'Pointage',2,workers)).toThrow('B2')
})


it('consolidates valid employees even when another employee exceeds daily hours', () => {
 const book=workbook(),others=[...workers,{...workers[0],id:'b',last_name:'SECOND',matricule:'EMP02'}]
 XLSX.utils.sheet_add_aoa(book.Sheets.Ref_Employes,[['EMP02','b','SECOND']],{origin:'A3'})
 XLSX.utils.sheet_add_aoa(book.Sheets.Pointage,[['EMP01','EMPLOYE TEST','N',4],['EMP02','SECOND','N',20],['EMP02','SECOND','S',2],['EMP02','SECOND','N',8]],{origin:'A4'})
 const result=consolidateAttendanceCorrespondences(bytes(book),others)
 const data=XLSX.read(result.buffer,{type:'array'}).Sheets.Pointage
 expect(data.D2.v).toBe(12)
 expect(data.A4).toBeUndefined()
 expect(data.D5.v).toBe(28);expect(data.D7).toBeUndefined()
 expect(result.warnings).toHaveLength(0)
})
