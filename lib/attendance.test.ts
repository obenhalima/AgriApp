import {expect, it} from 'vitest'
import ExcelJS from 'exceljs'
import {attendanceHourWarnings, attendanceNeedsReview, attendanceDays, parseAttendanceHours, attendanceDayEquivalent, attendanceCompleteRows, attendanceTotals, mergeAttendanceRows} from './attendance'
import {buildAttendanceWorkbook, readAttendanceWorkbook} from './attendanceWorkbook'

const days = attendanceDays(2026, 11, 'first')
const worker = {id: 'worker-1', farm_id: 'farm-1', first_name: '', last_name: 'EMPLOYE TEST', matricule: 'EMP01', is_active: true}
const context = {domain: 'domain-1', domainCode: 'DOM-BENHALIMA', farm: 'farm-1', farmName: 'Ferme Sud', days, workers: [worker]}

it('uses actual calendar half-months including leap years', () => {
  expect(attendanceDays(2028, 2, 'second')).toHaveLength(14)
  expect(attendanceDays(2026, 7, 'second')).toHaveLength(16)
  expect(days.at(-1)).toBe('2026-11-15')
})
it('distinguishes unknown hours from zero and accepts 16 actual hours', () => {
  expect(parseAttendanceHours('')).toBeNull()
  expect(parseAttendanceHours('0')).toBe(0)
  expect(parseAttendanceHours('16')).toBe(16)
  expect(parseAttendanceHours('7,25')).toBe(7.25)
  expect(parseAttendanceHours('25')).toBe(25)
  expect(parseAttendanceHours('1.005')).toBe(1.005)
  expect(()=>parseAttendanceHours('-1')).toThrow()
  expect(()=>parseAttendanceHours('Infinity')).toThrow()
  expect(attendanceDayEquivalent(63)).toEqual({days: 7, hours: 7})
})
it('creates daily rows and merges explicit values without erasing known values with blanks', () => {
  const rows = attendanceCompleteRows([worker.id], days, [])
  expect(attendanceTotals(rows)).toEqual({normal: 0, overtime: 0, missing: 30})
  rows[0].normal_hours = 16
  rows[0].overtime_hours = 2
  const merged = mergeAttendanceRows(rows, [{...rows[0], normal_hours: null, overtime_hours: 0}])
  expect(merged.replacements).toBe(1)
  expect(merged.rows[0]).toMatchObject({normal_hours: 16, overtime_hours: 0})
  expect(attendanceNeedsReview(mergeAttendanceRows(rows, [{...rows[0], overtime_hours: 9}]).rows[0])).toBe(true)
  expect(mergeAttendanceRows([], [{...rows[0], overtime_hours: 9}]).rows[0].overtime_hours).toBe(9)
})
it('round trips the bound N/S template and ignores editable displayed totals', async () => {
  const blob = await buildAttendanceWorkbook(context, [])
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  const sheet = book.getWorksheet('Pointage')!
  expect(book.getWorksheet('_Contexte')!.state).toBe('hidden')
  sheet.getCell('D2').value = 16
  sheet.getCell('D3').value = 2
  sheet.getCell('E2').value = 0
  sheet.getCell('S2').value = 99999
  const buffer = await book.xlsx.writeBuffer()
  const rows = readAttendanceWorkbook(buffer as ArrayBuffer, 'filled.xlsx', context)
  expect(rows).toHaveLength(15)
  expect(rows[0]).toMatchObject({normal_hours: 16, overtime_hours: 2, entry_source: 'excel', source_filename: 'filled.xlsx'})
  expect(rows[1].normal_hours).toBe(0)
  expect(rows[1].overtime_hours).toBeNull()
  expect(attendanceTotals(rows).normal).toBe(16)
  expect(() => readAttendanceWorkbook(buffer as ArrayBuffer, 'wrong.xlsx', {...context, domain: 'other'})).toThrow(/autre client/)
  sheet.getCell('D3').value = 9
  expect(() => readAttendanceWorkbook(buffer as ArrayBuffer, 'wrong.xlsx', {...context, days: attendanceDays(2026, 11, 'second')})).toThrow()
  const invalid = await book.xlsx.writeBuffer()
  expect(attendanceHourWarnings(readAttendanceWorkbook(invalid as ArrayBuffer, 'invalid.xlsx', context)[0]).join()).toContain('24')
})
