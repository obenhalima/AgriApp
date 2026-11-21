import {supabase} from './supabase'
import {attendanceNeedsReview, type AttendancePeriod, type AttendanceRow} from './attendance'
import type {PayrollPreparation, PayrollPayment} from './payrollPreparation'

export const attendanceMigrationMessage = 'Appliquez la migration employee_attendance pour activer l’enregistrement du pointage.'
function check(error: any) {
  if (!error) return
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) throw new Error(attendanceMigrationMessage)
  throw error
}

export async function listAttendanceHistory(domain: string, includePayroll: boolean) {
  const periods: AttendancePeriod[] = []
  for (let offset = 0; ; offset += 500) {
    const page = await supabase.from('employee_attendance_periods').select('*').eq('domain_id', domain)
      .order('start_date', {ascending: false}).order('id').range(offset, offset + 499)
    check(page.error)
    periods.push(...(page.data || []))
    if (!page.data || page.data.length < 500) break
  }
  const preparations: PayrollPreparation[] = [], payments: PayrollPayment[] = []
  if (includePayroll) {
    // Keep URL filters bounded and paginate payments (several payments per employee).
    for (let index = 0; index < periods.length; index += 50) {
      const ids = [...new Set(periods.slice(index, index + 50).map(period => period.farm_id))]
      const starts = [...new Set(periods.slice(index, index + 50).map(period => period.start_date))]
      for (let offset = 0; ; offset += 100) {
        const page = await supabase.from('payroll_preparations').select('*').eq('domain_id', domain)
          .in('farm_id', ids).in('start_date', starts).order('id').range(offset, offset + 99)
        if (page.error) throw page.error
        preparations.push(...(page.data || []))
        if (!page.data || page.data.length < 100) break
      }
    }
    const uniquePreparations = [...new Map(preparations.map(item => [item.id, item])).values()]
    for (let index = 0; index < uniquePreparations.length; index += 50) {
      const ids = uniquePreparations.slice(index, index + 50).map(item => item.id)
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from('payroll_preparation_payments').select('*').eq('domain_id', domain)
          .in('preparation_id', ids).order('id').range(offset, offset + 499)
        if (page.error) throw page.error
        payments.push(...(page.data || []))
        if (!page.data || page.data.length < 500) break
      }
    }
    return {periods, preparations: uniquePreparations, payments}
  }
  return {periods, preparations, payments}
}

export async function readAttendance(domain: string, farm: string, start: string) {
  const result = await supabase.from('employee_attendance_periods').select('*')
    .eq('domain_id', domain).eq('farm_id', farm).eq('start_date', start).maybeSingle()
  check(result.error)
  const period = result.data as AttendancePeriod | null
  const rows: AttendanceRow[] = []
  if (period) {
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from('employee_attendance_records').select('*')
        .eq('domain_id', domain).eq('period_id', period.id).order('worker_id').order('work_date').range(offset, offset + 499)
      check(page.error)
      rows.push(...(page.data || []))
      if (!page.data || page.data.length < 500) break
    }
  }
  return {period, rows}
}

export async function saveAttendance(input: {
  domain: string; farm: string; start: string; end: string; revision: number
  rows: AttendanceRow[]; action: 'save' | 'validate' | 'reopen'; request: string
}) {
  const result = await supabase.rpc('save_employee_attendance', {
    p_domain: input.domain, p_farm: input.farm, p_start: input.start, p_end: input.end,
    p_revision: input.revision, p_rows: input.rows, p_action: input.action, p_request: input.request,
  })
  if (result.error && input.rows.some(attendanceNeedsReview) && (result.error.code === '23514' || /24 heures/.test(result.error.message))) throw new Error('Appliquez la migration attendance_anomaly_review pour enregistrer les heures atypiques.')
  check(result.error)
  return result.data as AttendancePeriod
}


export async function reviewAttendance(input: {domain: string; period: string; revision: number; worker: string; date: string; reason: string; note: string; action: 'confirm' | 'resolve'; request: string}) {
  const result = await supabase.rpc('review_employee_attendance', {p_domain: input.domain, p_period: input.period, p_revision: input.revision, p_worker: input.worker, p_date: input.date, p_reason: input.reason, p_note: input.note, p_action: input.action, p_request: input.request})
  if (result.error?.code === 'PGRST202') throw new Error('Appliquez la migration attendance_anomaly_review pour enregistrer et contrôler les heures atypiques.')
  check(result.error)
  return result.data as AttendancePeriod
}
