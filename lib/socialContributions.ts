import {supabase} from './supabase'

export type SocialContributionSource = {
  nb_workers: number; nb_periods: number; total_gross: number
  total_cnss_employee: number; total_amo_employee: number; total_cnss_employer: number; total_amo_employer: number
  total_family_allowance: number; total_prof_training: number; total_employee: number; total_employer: number; total_due: number
  fingerprint: string; open_correction: boolean
}
export type SocialContributionPayment = {
  id: string; amount: number; payment_date: string; payment_method: 'virement' | 'cheque' | 'cash' | 'other'
  reference: string | null; created_at: string; created_by: string
}
export type SocialContributionMonth = {
  id: string | null; domain_id: string; period_year: number; period_month: number; revision: number
  source: SocialContributionSource; declared_at: string | null; declaration_number: string | null; stale: boolean
  paid: number; remaining: number; overpaid: number; last_payment_date: string | null; payments: SocialContributionPayment[]
}
export function socialPaymentStatus(row: Pick<SocialContributionMonth, 'overpaid' | 'paid' | 'remaining' | 'source'>) {
  if (Number(row.overpaid) > 0) return 'Trop-perçu à régulariser'
  if (Number(row.source.total_due) === 0) return 'Aucun montant à payer'
  if (Number(row.remaining) === 0) return 'Payé'
  return Number(row.paid) > 0 ? 'Partiellement payé' : 'À payer'
}
function check(error: any) {
  if (!error) return
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) throw new Error('Appliquez la migration social_contribution_payments pour activer le suivi des règlements CNSS.')
  throw error
}
export async function listSocialContributions(domain: string, year: number) {
  const result = await supabase.rpc('list_social_contributions', {p_domain: domain, p_year: year})
  check(result.error)
  return (result.data || []) as SocialContributionMonth[]
}
export async function saveSocialDeclaration(row: SocialContributionMonth, declare: boolean, reference: string) {
  const result = await supabase.rpc('save_social_contribution_declaration', {p_domain: row.domain_id, p_year: row.period_year,
    p_month: row.period_month, p_revision: row.revision, p_fingerprint: row.source.fingerprint, p_reference: reference, p_declare: declare})
  check(result.error)
}
export async function recordSocialPayment(row: SocialContributionMonth, form: {amount: number; date: string; method: string; reference: string}, request: string) {
  const result = await supabase.rpc('record_social_contribution_payment', {p_domain: row.domain_id, p_year: row.period_year,
    p_month: row.period_month, p_revision: row.revision, p_fingerprint: row.source.fingerprint, p_amount: form.amount,
    p_date: form.date, p_method: form.method, p_reference: form.reference, p_request: request})
  check(result.error)
}
