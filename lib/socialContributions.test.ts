import {beforeEach, describe, expect, it, vi} from 'vitest'
vi.mock('./supabase', () => ({supabase: {rpc: vi.fn()}}))
import {supabase} from './supabase'
import {listSocialContributions, recordSocialPayment, saveSocialDeclaration, socialPaymentStatus, type SocialContributionMonth} from './socialContributions'

const row = {domain_id: 'client-501', period_year: 2026, period_month: 9, revision: 3, source: {total_due: 200, fingerprint: 'published'}, paid: 50, remaining: 150, overpaid: 0} as SocialContributionMonth
describe('social contribution settlements', () => {
  beforeEach(() => vi.mocked(supabase.rpc).mockReset())
  it('distinguishes partial, full, zero-due and overpaid months', () => {
    expect(socialPaymentStatus({...row, paid: 0, remaining: 200})).toBe('À payer')
    expect(socialPaymentStatus(row)).toBe('Partiellement payé')
    expect(socialPaymentStatus({...row, remaining: 0, paid: 200})).toBe('Payé')
    expect(socialPaymentStatus({...row, source: {...row.source, total_due: 0}, paid: 0, remaining: 0})).toBe('Aucun montant à payer')
    expect(socialPaymentStatus({...row, paid: 210, remaining: 0, overpaid: 10})).toBe('Trop-perçu à régulariser')
  })
  it('binds reads to the selected client and year', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({data: [row], error: null} as any)
    expect(await listSocialContributions('client-501', 2026)).toEqual([row])
    expect(supabase.rpc).toHaveBeenCalledWith('list_social_contributions', {p_domain: 'client-501', p_year: 2026})
  })
  it('binds payments to the source version, period, revision and idempotency key', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({data: {}, error: null} as any)
    await recordSocialPayment(row, {amount: 50, date: '2026-10-10', method: 'virement', reference: 'VIR-1'}, 'request-1')
    expect(supabase.rpc).toHaveBeenCalledWith('record_social_contribution_payment', {p_domain: 'client-501', p_year: 2026, p_month: 9,
      p_revision: 3, p_fingerprint: 'published', p_amount: 50, p_date: '2026-10-10', p_method: 'virement', p_reference: 'VIR-1', p_request: 'request-1'})
  })
  it('keeps declaration confirmation independent from payment', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({data: {}, error: null} as any)
    await saveSocialDeclaration(row, true, 'DAM-1')
    expect(supabase.rpc).toHaveBeenCalledWith('save_social_contribution_declaration', {p_domain: 'client-501', p_year: 2026, p_month: 9,
      p_revision: 3, p_fingerprint: 'published', p_reference: 'DAM-1', p_declare: true})
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  it('reports missing migrations and server validation errors without a silent success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({data: null, error: {code: 'PGRST202'}} as any)
    await expect(listSocialContributions('client-501', 2026)).rejects.toThrow('social_contribution_payments')
    const failure = {code: 'P0001', message: 'Les cotisations ont changé. Actualisez le mois avant de continuer.'}
    vi.mocked(supabase.rpc).mockResolvedValue({data: null, error: failure} as any)
    await expect(recordSocialPayment(row, {amount: 50, date: '2026-10-10', method: 'virement', reference: ''}, 'r1')).rejects.toEqual(failure)
  })
})
