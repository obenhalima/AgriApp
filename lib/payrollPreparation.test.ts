import {expect, it} from 'vitest'
import ExcelJS from 'exceljs'
import {newPayrollLine, payrollLineAmounts, hourlyAmount, payrollLineIssues, type PayrollWorker} from './payrollPreparation'
import {buildPayrollDocuments} from './payrollPreparationWorkbook'
import type {AttendancePeriod} from './attendance'
const worker: PayrollWorker = {id: 'worker-1', farm_id: 'farm-1', first_name: '', last_name: 'EMPLOYE', matricule: 'EMP01', is_active: true, is_declared: false, normal_hourly_rate: 11.9345625, overtime_hourly_rate: 15}
const period: AttendancePeriod = {id: 'attendance-1', domain_id: 'domain-1', farm_id: 'farm-1', start_date: '2026-11-01', end_date: '2026-11-15', status: 'validated', revision: 1, validated_at: '2026-11-16'}
const attendance = {period, rows: [{worker_id: worker.id, work_date: '2026-11-01', normal_hours: 16, overtime_hours: 2, entry_source: 'manual' as const, source_filename: null}]}
it('reuses validated normal and overtime hours and the original hourly rates', () => {
  const line = newPayrollLine(worker, attendance)
  expect(line).toMatchObject({source: 'attendance', normal_hours: 16, overtime_hours: 2, normal_rate: 11.9345625, original_normal_rate: 11.9345625, deductions_confirmed: false})
  expect(newPayrollLine(worker, {period, rows: []})).toMatchObject({source: 'manual', normal_hours: null, overtime_hours: null})
  expect(newPayrollLine(worker, {...attendance, period: {...period, status: 'draft'}})).toMatchObject({source: 'attendance', normal_hours: null, overtime_hours: null})
})
it('rounds products once to cents while preserving hourly precision', () => {
  expect(hourlyAmount(16, 11.9345625)).toBe(190.95)
  expect(hourlyAmount(1, 1.005)).toBe(1.01)
  expect(hourlyAmount(7.25, 12.123456789)).toBe(87.9)
  const line = {...newPayrollLine(worker, attendance), calculation_basis: undefined, normal_rate: 12.5, advance: 10, cnss_employee: 5, cnss_employer: 2}
  expect(payrollLineAmounts(line)).toMatchObject({base_amount: 200, overtime_amount: 30, gross_salary: 230, net_salary: 215, total_employer_cost: 232})
})
it('permits incomplete drafts and requires explicit hours, rates and deduction review for validation', () => {
  const line = newPayrollLine(worker, {period: null, rows: []})
  expect(payrollLineIssues(line, 15, false)).toEqual([])
  expect(payrollLineIssues(line, 15, true)).toContain('Heures ou taux manquants')
  expect(payrollLineIssues({...line, normal_hours: 0, overtime_hours: 0, normal_rate: null, overtime_rate: null, deductions_confirmed: true}, 15, true)).toEqual([])
  expect(payrollLineIssues({...line, normal_hours: 8, overtime_hours: 0, normal_rate: null}, 15, true)).toContain('Heures ou taux manquants')
  expect(payrollLineIssues({...line, normal_hours: 361, overtime_hours: 0}, 15, false)).toContain('Le total des heures dépasse la durée de la période')
  expect(payrollLineIssues({...line, normal_hours: 8, overtime_hours: 0, advance: 10000}, 15, false)).toContain('Les avances et autres retenues dépassent le net acquis')
  expect(payrollLineIssues({...line, normal_hours: 8.001}, 15, false)).toContain('Valeur numérique invalide')
})
it('exports detailed payroll, reference rate differences and payment signatures without inventing a payment', async () => {
  const line = {...newPayrollLine(worker, attendance), normal_rate: 12.5, advance: 10, cnss_employee: 5}
  const blob = await buildPayrollDocuments({client: 'DOM-BENHALIMA', farm: 'FS', start: '2026-11-01', end: '2026-11-15', status: 'validated', rows: [line], payments: [{id: 'payment-1', preparation_id: 'prep-1', worker_id: worker.id, amount: 25, payment_date: '2026-11-16', payment_method: 'cash', reference: null}]})
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  const sheet = book.getWorksheet('Etat_Paie')!, signatures = book.getWorksheet('Emargement')!
  expect(sheet.getCell('D5').value).toBe(16)
  expect(sheet.getCell('G5').value).toBe(12.5)
  expect(sheet.getCell('U5').value).toBe(220)
  expect(signatures.getCell('F5').value).toBe(25)
  expect(signatures.getCell('G5').value).toBe(195)
  expect(signatures.getCell('I5').value).toBe('')
  expect(signatures.getRow(6).getCell(5).value).toMatchObject({result: 220})
})
