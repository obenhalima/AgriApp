import {expect, it} from 'vitest'
import * as XLSX from 'xlsx'
import {readFarmAttendanceBatch} from './attendanceBatch'

const workers = [{id: 'a', farm_id: 'farm', first_name: '', last_name: 'EMPLOYE TEST', matricule: 'EMP01', is_active: true}]
function sheet(start = 1, month = 7) {
  const end = start === 1 ? 15 : new Date(2026, month, 0).getDate()
  const value = XLSX.utils.aoa_to_sheet([])
  value.C2 = {t: 's', v: `QUINZAINE DU ${start}/${String(month).padStart(2, '0')}/2026 AU ${end}/${String(month).padStart(2, '0')}/2026`}
  for (let day = start; day <= end; day++) value[XLSX.utils.encode_cell({r: 5, c: day - start + 3})] = {t: 'n', v: day}
  Object.assign(value, {B10: {t: 's', v: 'EMPLOYE TEST'}, C10: {t: 's', v: 'N'}, C11: {t: 's', v: 'S'}, D10: {t: 'n', v: 16}, D11: {t: 'n', v: 2}, '!ref': 'B2:Z20'})
  return value
}
function read(sheets: XLSX.WorkSheet[], mapping = {}) {
  const book = XLSX.utils.book_new()
  sheets.forEach((value, index) => XLSX.utils.book_append_sheet(book, value, `P${index}`))
  return readFarmAttendanceBatch(XLSX.write(book, {type: 'array', bookType: 'xlsx'}), 'quinzaines.xlsx', workers, mapping)
}
it('reads multiple calendar periods, actual hours and unknown blanks, without salary columns', () => {
  const first = sheet(), second = sheet(16)
  first.V10 = {t: 'n', v: 45000}
  const periods = read([second, first])
  expect(periods.map(value => value.start)).toEqual(['2026-07-01', '2026-07-16'])
  expect(periods.map(value => value.rows.length)).toEqual([15, 16])
  expect(periods[0].rows[0]).toMatchObject({normal_hours: 16, overtime_hours: 2, source_filename: 'quinzaines.xlsx'})
  expect(periods[0].rows[1].normal_hours).toBeNull()
  expect(periods.flatMap(value => value.issues)).toEqual([])
})
it('reports undated hours, unnamed records, invalid N/S, precision and daily limits with source coordinates', () => {
  const value = sheet()
  value.S11 = {t: 'n', v: 2}
  value.E10 = {t: 'n', v: 17.5824}
  value.D11 = {t: 'n', v: 10}
  value.C12 = {t: 'n', v: 0}; value.C13 = {t: 's', v: 'S'}; value.D12 = {t: 'n', v: 8}
  const period = read([value])[0]
  const messages = [...period.issues, ...(period.warnings || []).map(warning=>[warning.message,...warning.sources].join(' · '))].join('\n')
  expect(messages).toContain('S11'); expect(messages).toContain('sans date')
  expect(messages).toContain('P0!10'); expect(messages).toContain('décimales')
  expect(messages).toContain('24 heures'); expect(messages).toContain('Nom manquant'); expect(messages).toContain('Type N/S invalide')
})
it('requires explicit mappings for unmatched names and rejects duplicate worker assignments', () => {
  const value = sheet(); value.B10 = {t: 's', v: 'Alias'}
  expect(read([value])[0].issues.join()).toContain('à associer')
  expect(read([value], {Alias: 'a'})[0].issues).toEqual([])
  value.B12 = {t: 's', v: 'EMPLOYE TEST'}; value.C12 = {t: 's', v: 'N'}; value.D12 = {t: 'n', v: 1}
  expect(read([value], {Alias: 'a'})[0].rows[0].normal_hours).toBe(17)
})
it('rejects incomplete dates and duplicated periods while protecting independent valid periods', () => {
  const first = sheet(); delete first.E6
  const periods = read([first, sheet(), sheet(16)])
  expect(periods[0].issues.join()).toContain('Dates quotidiennes')
  expect(periods[1].issues.join()).toContain('double')
  expect(periods[2].issues).toEqual([])
})

function nativeBook() {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Clé', 'Valeur'], ['version', 'attendance-multi-1'], ['client', 'domain'], ['ferme', 'farm']]), '_Contexte')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Code', 'ID', 'Nom'], ['EMP01', 'a', 'EMPLOYE TEST']]), 'Ref_Employes')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Onglet', 'Début', 'Fin'], ['Pointage', '2026-07-01', '2026-07-15']]), 'Periodes')
  const days = Array.from({length: 15}, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`)
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Code employé', 'Nom', 'Type', ...days, 'Total heures', 'Équivalent jours N', 'Heures sans date', 'Source'],
    ['EMP01', 'EMPLOYE TEST', 'N', 16], ['EMP01', 'EMPLOYE TEST', 'S', 2],
  ]), 'Pointage')
  return book
}
it('reads the filled ItriX multi-period model with its exported employee codes and tenant binding', () => {
  const book = nativeBook(), buffer = XLSX.write(book, {type: 'array', bookType: 'xlsx'})
  const periods = readFarmAttendanceBatch(buffer, 'filled.xlsx', workers, {}, {domain: 'domain', farm: 'farm'})
  expect(periods[0].issues).toEqual([])
  expect(periods[0].names).toEqual([])
  expect(periods[0].rows).toHaveLength(15)
  expect(periods[0].rows[0]).toMatchObject({normal_hours: 16, overtime_hours: 2})
  expect(() => readFarmAttendanceBatch(buffer, 'filled.xlsx', workers, {}, {domain: 'other', farm: 'farm'})).toThrow('autre client')
})
it('blocks undated hours in the filled model and permits explicit employee matching', () => {
  const book = nativeBook()
  book.Sheets.Pointage.U3 = {t: 'n', v: 3}
  book.Sheets.Pointage.A2 = {t: 's', v: ''}; book.Sheets.Pointage.A3 = {t: 's', v: ''}
  book.Sheets.Pointage.B2 = {t: 's', v: 'Alias'}; book.Sheets.Pointage.B3 = {t: 's', v: 'Alias'}
  book.Sheets.Pointage['!ref'] = 'A1:U3'
  const buffer = XLSX.write(book, {type: 'array', bookType: 'xlsx'})
  expect(readFarmAttendanceBatch(buffer, 'filled.xlsx', workers, {}, {domain: 'domain', farm: 'farm'})[0].names).toEqual(['Alias'])
  const periods = readFarmAttendanceBatch(buffer, 'filled.xlsx', workers, {Alias: 'a'}, {domain: 'domain', farm: 'farm'})
  expect(periods[0].rows).toHaveLength(15)
  expect(periods[0].issues.join()).toContain('sans date')
  expect(periods[0].names).toEqual([])
})

it('recognizes exact names with missing codes without requesting a manual association', () => {
  const book = nativeBook()
  book.Sheets.Pointage.A2 = {t: 's', v: ''}; book.Sheets.Pointage.A3 = {t: 's', v: ''}
  const periods = readFarmAttendanceBatch(XLSX.write(book, {type: 'array', bookType: 'xlsx'}), 'filled.xlsx', workers, {}, {domain: 'domain', farm: 'farm'})
  expect(periods[0].names).toEqual([])
  expect(periods[0].issues).toEqual([])
  expect(periods[0].rows[0].worker_id).toBe('a')
})

it('uses the exported employee code even when a conflicting name override is supplied', () => {
  const book = nativeBook()
  const other = {...workers[0], id: 'b', last_name: 'AUTRE EMPLOYE'}
  const periods = readFarmAttendanceBatch(XLSX.write(book, {type: 'array', bookType: 'xlsx'}), 'filled.xlsx', [...workers, other], {'EMPLOYE TEST': 'b'}, {domain: 'domain', farm: 'farm'})
  expect(periods[0].names).toEqual([])
  expect(periods[0].issues).toEqual([])
  expect(new Set(periods[0].rows.map(row => row.worker_id))).toEqual(new Set(['a']))
})


it('ignores empty native periods without confusing unknown hours with confirmed zero', () => {
 const book=nativeBook()
 delete book.Sheets.Pointage.D2;delete book.Sheets.Pointage.D3
 const readCurrent=()=>readFarmAttendanceBatch(XLSX.write(book,{type:'array',bookType:'xlsx'}),'empty.xlsx',workers,{}, {domain:'domain',farm:'farm'})[0]
 expect(readCurrent().empty).toBe(true)
 expect(readCurrent().issues).toEqual([])
 book.Sheets.Pointage.D2={t:'n',v:0}
 expect(readCurrent().empty).toBe(false)
 book.Sheets.Pointage.U3={t:'n',v:2};book.Sheets.Pointage['!ref']='A1:V3';delete book.Sheets.Pointage.D2
 expect(readCurrent().empty).not.toBe(true)
 expect(readCurrent().issues.join()).toContain('sans date')
})

it('ignores blank farm sheets but retains structural errors and unknown employee data', () => {
 const empty=sheet();delete empty.D10;delete empty.D11
 expect(read([empty])[0]).toMatchObject({empty:true,issues:[],rows:[]})
 empty.D10={t:'n',v:8};empty.B10={t:'s',v:'INCONNU'}
 expect(read([empty])[0].empty).not.toBe(true)
 expect(read([empty])[0].issues.join()).toContain('associer')
})
