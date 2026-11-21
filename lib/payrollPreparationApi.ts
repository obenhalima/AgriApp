import {supabase} from './supabase'
import type {NetPayrollContext} from './netPayroll'
import type {PayrollPreparation, PayrollPreparationLine, PayrollPayment} from './payrollPreparation'

function check(error: any) {
  if (!error) return
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) throw new Error('Appliquez la migration payroll_attendance_preparation pour enregistrer la préparation de paie.')
  throw error
}

export async function listPayrollPreparationHistory(domain: string) {
  const preparations: PayrollPreparation[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await supabase.from('payroll_preparations').select('*').eq('domain_id', domain)
      .order('start_date', {ascending: false}).order('id').range(offset, offset + 99)
    check(page.error)
    preparations.push(...(page.data || []))
    if (!page.data || page.data.length < 100) break
  }
  const payments: PayrollPayment[] = []
  for (let index = 0; index < preparations.length; index += 50) {
    const ids = preparations.slice(index, index + 50).map(item => item.id)
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from('payroll_preparation_payments').select('*').eq('domain_id', domain)
        .in('preparation_id', ids).order('id').range(offset, offset + 499)
      check(page.error)
      payments.push(...(page.data || []))
      if (!page.data || page.data.length < 500) break
    }
  }
  return {preparations, payments}
}

export async function readPayrollPreparation(domain: string, farm: string, start: string) {
  const result = await supabase.from('payroll_preparations').select('*').eq('domain_id', domain).eq('farm_id', farm).eq('start_date', start).maybeSingle()
  check(result.error)
  const preparation = result.data as PayrollPreparation | null
  const payments: PayrollPayment[] = []
  if (preparation) {
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from('payroll_preparation_payments').select('*').eq('domain_id', domain).eq('preparation_id', preparation.id).order('id').range(offset, offset + 499)
      check(page.error)
      payments.push(...(page.data || []))
      if (!page.data || page.data.length < 500) break
    }
  }
  return {preparation, payments}
}
export async function savePayrollPreparation(input: {domain: string; farm: string; start: string; end: string; campaign: string | null; payDate: string; attendanceRevision: number | null; revision: number; rows: PayrollPreparationLine[]; action: 'save' | 'validate'; request: string}) {
  const result = await supabase.rpc('save_payroll_preparation', {
    p_domain: input.domain, p_farm: input.farm, p_start: input.start, p_end: input.end,
    p_campaign: input.campaign, p_pay_date: input.payDate, p_attendance_revision: input.attendanceRevision,
    p_revision: input.revision, p_rows: input.rows, p_action: input.action, p_request: input.request,
  })
  check(result.error)
  return result.data as PayrollPreparation
}
export async function recordPayrollPayment(input: {preparation: string; worker: string; amount: number; date: string; method: string; reference: string; request: string}) {
  const result = await supabase.rpc('record_payroll_preparation_payment', {
    p_preparation: input.preparation, p_worker: input.worker, p_amount: input.amount,
    p_date: input.date, p_method: input.method, p_reference: input.reference || null, p_request: input.request,
  })
  check(result.error)
  return result.data as PayrollPayment
}

export type PayrollFortnightSettlement = {
  id: string; preparation_id: string; amount: number; worker_count: number; payment_date: string
  payment_method: 'cash' | 'virement' | 'cheque'; reference: string | null; payments: PayrollPayment[]
  created_by: string; created_at: string
}
function settlementError(error: any) {
  if (error && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) throw new Error('Appliquez la migration payroll_fortnight_settlement pour régler toute la quinzaine.')
  check(error)
}
export async function settlePayrollFortnight(input: {preparation: string; revision: number; expected: number; date: string; method: string; reference: string; request: string}) {
  const result = await supabase.rpc('settle_payroll_fortnight', {p_preparation: input.preparation, p_revision: input.revision,
    p_expected_total: input.expected, p_date: input.date, p_method: input.method, p_reference: input.reference, p_request: input.request})
  settlementError(result.error)
  return result.data as PayrollFortnightSettlement
}
export async function listPayrollFortnightSettlements(domain: string, preparation: string) {
  const rows: PayrollFortnightSettlement[] = []
  for (let offset = 0; ; offset += 100) {
    const result = await supabase.from('payroll_fortnight_settlements').select('*').eq('domain_id', domain).eq('preparation_id', preparation)
      .order('created_at', {ascending: false}).order('id').range(offset, offset + 99)
    settlementError(result.error)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < 100) return rows
  }
}

export async function readNetPayrollContext(domain: string, farm: string, start: string) {
  const result = await supabase.rpc('payroll_net_context', {p_domain: domain, p_farm: farm, p_start: start})
  if (result.error && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(result.error.code)) throw new Error('Appliquez la migration payroll_net_rates pour activer les taux horaires nets et le calcul automatique.')
  check(result.error)
  return (result.data || []) as (NetPayrollContext & {is_declared: boolean | null; dependents: number; has_later_payroll: boolean})[]
}

export type PayrollCorrection = {
  id: string; preparation_id: string; mode: 'reopen' | 'regularization'
  status: 'open' | 'applied' | 'cancelled'; reason: string
  original_preparation: PayrollPreparation; revised_preparation: PayrollPreparation | null
  paid_at_open: number; created_by: string; created_at: string; closed_by: string | null; closed_at: string | null
}

function correctionError(error: any) {
  if (error && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) {
    throw new Error('Appliquez la migration payroll_corrections pour activer la correction des paies.')
  }
  check(error)
}

export async function listPayrollCorrections(domain: string, preparation: string) {
  const rows: PayrollCorrection[] = []
  for (let offset = 0; ; offset += 100) {
    const result = await supabase.from('payroll_corrections').select('*').eq('domain_id', domain)
      .eq('preparation_id', preparation).order('created_at', {ascending: false}).order('id').range(offset, offset + 99)
    correctionError(result.error)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < 100) break
  }
  return rows
}

export async function beginPayrollCorrection(input: {domain: string; preparation: string; revision: number; reason: string; request: string}) {
  const result = await supabase.rpc('begin_payroll_correction', {
    p_domain: input.domain, p_preparation: input.preparation, p_revision: input.revision, p_reason: input.reason, p_request: input.request,
  })
  correctionError(result.error)
  return result.data as PayrollPreparation
}

export async function cancelPayrollCorrection(input: {domain: string; preparation: string; revision: number}) {
  const result = await supabase.rpc('cancel_payroll_correction', {p_domain: input.domain, p_preparation: input.preparation, p_revision: input.revision})
  correctionError(result.error)
  return result.data as PayrollPreparation
}
