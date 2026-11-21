import {attendanceNeedsReview} from './attendance'
import {calculateNetPayroll, type NetPayrollContext} from './netPayroll'
import type {AttendancePeriod, AttendanceRow, AttendanceWorker} from './attendance'

export type PayrollWorker = AttendanceWorker & {normal_hourly_rate: number | null; overtime_hourly_rate: number | null; is_declared?: boolean | null; dependents?: number | null}
export const payrollAdjustmentFields = ['bonuses', 'advance', 'other_deductions', 'cnss_employee', 'amo_employee', 'ir_amount', 'cnss_employer', 'amo_employer', 'family_allowance_employer', 'prof_training_employer'] as const
export type PayrollAdjustment = typeof payrollAdjustmentFields[number]
export type PayrollPreparationLine = {
  worker_id: string
  calculation_basis?: 'net-v1'
  is_declared?: boolean | null
  dependents?: number
  payroll_start?: string
  tax_context?: NetPayrollContext
  source: 'attendance' | 'manual'
  normal_hours: number | null
  overtime_hours: number | null
  normal_rate: number | null
  overtime_rate: number | null
  deductions_confirmed: boolean
  worker_name?: string
  worker_code?: string
  original_normal_rate?: number | null
  original_overtime_rate?: number | null
  base_amount?: number
  overtime_amount?: number
  gross_salary?: number
  net_salary?: number
  total_employer_cost?: number
} & Record<PayrollAdjustment, number>
export type PayrollPreparation = {
  id: string; domain_id: string; farm_id: string; start_date: string; end_date: string
  campaign_id: string | null; pay_date: string; status: 'draft' | 'validated'
  revision: number; attendance_period_id: string | null; attendance_revision: number | null
  payroll_period_id: string | null; rows: PayrollPreparationLine[]; validated_at: string | null
  correction_id?: string | null; correction_mode?: 'reopen' | 'regularization' | null
  published_rows?: PayrollPreparationLine[] | null
}
export type PayrollPayment = {
  id: string; preparation_id: string; worker_id: string; amount: number
  payment_date: string; payment_method: 'cash' | 'virement' | 'cheque'; reference: string | null
}

export function newPayrollLine(worker: PayrollWorker, attendance: {period: AttendancePeriod | null; rows: AttendanceRow[]}): PayrollPreparationLine {
  const rows = attendance.rows.filter(row => row.worker_id === worker.id)
  const validated = attendance.period?.status === 'validated' && rows.length > 0 && !rows.some(attendanceNeedsReview)
  return {
    calculation_basis: 'net-v1', is_declared: worker.is_declared ?? true, dependents: worker.dependents ?? 0, payroll_start: attendance.period?.start_date || '2026-01-01',
    worker_id: worker.id, worker_name: `${worker.last_name} ${worker.first_name}`.trim(), worker_code: worker.matricule || worker.id,
    source: rows.length ? 'attendance' : 'manual',
    normal_hours: validated ? rows.reduce((sum, row) => sum + (row.normal_hours || 0), 0) : null,
    overtime_hours: validated ? rows.reduce((sum, row) => sum + (row.overtime_hours || 0), 0) : null,
    normal_rate: worker.normal_hourly_rate, overtime_rate: worker.overtime_hourly_rate,
    original_normal_rate: worker.normal_hourly_rate, original_overtime_rate: worker.overtime_hourly_rate,
    bonuses: 0, advance: 0, other_deductions: 0, cnss_employee: 0, amo_employee: 0, ir_amount: 0,
    cnss_employer: 0, amo_employer: 0, family_allowance_employer: 0, prof_training_employer: 0,
    deductions_confirmed: false,
  }
}

function scaledInteger(value: number, precision: number) {
  const [whole, fraction = ''] = value.toFixed(precision).split('.')
  return BigInt(whole) * (BigInt(10) ** BigInt(precision)) + BigInt(fraction)
}

// Rates retain nine decimal places. Round each N/S amount once to currency cents.
export function hourlyAmount(hours: number, rate: number): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate) || hours < 0 || rate < 0 || hours > 99999999 || rate > 99999999) return 0
  const product = scaledInteger(hours, 9) * scaledInteger(rate, 9)
  return Number((product + BigInt(5000000000000000)) / BigInt(10000000000000000)) / 100
}
const cents = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100)
export function payrollLineAmounts(line: PayrollPreparationLine) {
  const base = hourlyAmount(line.normal_hours || 0, line.normal_rate || 0)
  const overtime = hourlyAmount(line.overtime_hours || 0, line.overtime_rate || 0)
  if (line.calculation_basis === 'net-v1') {
    const target = (cents(base) + cents(overtime) + cents(line.bonuses)) / 100
    let calculated
    let calculation_error: string | undefined
    try {calculated = calculateNetPayroll(target, line.is_declared ?? true, line.payroll_start || '2026-01-01', line.dependents || 0, line.tax_context)}
    catch (error) {calculation_error = (error as Error).message; calculated = {gross_salary: target, net_before_adjustments: target, total_employer_cost: target, cnss_employee: 0, amo_employee: 0, ir_amount: 0, cnss_employer: 0, amo_employer: 0, family_allowance_employer: 0, prof_training_employer: 0}}
    return {...calculated, calculation_error, base_amount: base, overtime_amount: overtime, net_salary: (cents(target) - cents(line.advance) - cents(line.other_deductions)) / 100}
  }
  const gross = cents(base) + cents(overtime) + cents(line.bonuses)
  const deductions = cents(line.advance) + cents(line.other_deductions) + cents(line.cnss_employee) + cents(line.amo_employee) + cents(line.ir_amount)
  const employer = cents(line.cnss_employer) + cents(line.amo_employer) + cents(line.family_allowance_employer) + cents(line.prof_training_employer)
  return {base_amount: base, overtime_amount: overtime, gross_salary: gross / 100, net_salary: (gross - deductions) / 100, total_employer_cost: (gross + employer) / 100, cnss_employee: line.cnss_employee, amo_employee: line.amo_employee, ir_amount: line.ir_amount, cnss_employer: line.cnss_employer, amo_employer: line.amo_employer, family_allowance_employer: line.family_allowance_employer, prof_training_employer: line.prof_training_employer, calculation_error: undefined}
}

export function payrollLineIssues(line: PayrollPreparationLine, days: number, validate: boolean) {
  const issues: string[] = []
  for (const field of ['normal_hours', 'overtime_hours', 'normal_rate', 'overtime_rate', ...(line.calculation_basis === 'net-v1' ? ['bonuses', 'advance', 'other_deductions'] as const : payrollAdjustmentFields)] as const) {
    const value = line[field]
    const precision = field.endsWith('_rate') || (line.source === 'attendance' && field.endsWith('_hours')) ? 9 : 2
    if (value == null) {
      if (validate && ((field === 'normal_hours' || field === 'overtime_hours') || (field === 'normal_rate' && (line.normal_hours || 0) > 0) || (field === 'overtime_rate' && (line.overtime_hours || 0) > 0))) issues.push('Heures ou taux manquants')
      continue
    }
    const scale = 10 ** precision
    if (!Number.isFinite(value) || value < 0 || value > (99999999) || Math.abs(value * scale - Math.round(value * scale)) > .0001) issues.push('Valeur numérique invalide')
  }
  if (line.source !== 'attendance' && (line.normal_hours || 0) + (line.overtime_hours || 0) > days * 24) issues.push('Le total des heures dépasse la durée de la période')
  try {
    const amounts = payrollLineAmounts(line)
    if (amounts.calculation_error) issues.push(amounts.calculation_error)
    if (amounts.net_salary < 0) issues.push('Les avances et autres retenues dépassent le net acquis')
  } catch (error) {issues.push((error as Error).message)}
  if (validate && !line.deductions_confirmed) issues.push('Retenues et charges à confirmer')
  return [...new Set(issues)]
}

export function withNetPayrollContext(line: PayrollPreparationLine, worker: PayrollWorker | undefined, context: NetPayrollContext & {is_declared?: boolean | null; dependents?: number} | undefined, start: string): PayrollPreparationLine {
  return {...line, calculation_basis: 'net-v1', is_declared: context ? context.is_declared ?? true : worker?.is_declared ?? true, dependents: context?.dependents ?? worker?.dependents ?? 0, payroll_start: start, tax_context: context || {}}
}
