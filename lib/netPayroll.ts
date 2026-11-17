// General salaried regime. Sources: CGI 2026 articles 59, 73 and 74,
// https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf
// Social rates: https://www.cleiss.fr/docs/cotisations/maroc.html and
// https://acaps.ma/fr/grand-public/sante/couverture-medicale-de-base-amo
export const netPayrollContributionFields = ['cnss_employee', 'amo_employee', 'ir_amount', 'cnss_employer', 'amo_employer', 'family_allowance_employer', 'prof_training_employer'] as const
export type NetPayrollContext = Partial<Record<'prior_gross' | typeof netPayrollContributionFields[number], number>> & {fingerprint?: string; worker_id?: string}
export type NetPayrollAmounts = Record<typeof netPayrollContributionFields[number], number> & {
  gross_salary: number; net_before_adjustments: number; total_employer_cost: number
}
const moneyCents = (value: number) => Math.round((value + Number.EPSILON) * 100)
const contribution = (base: number, basisPoints: number) => Math.floor((base * basisPoints + 5000) / 10000)

export function calculateNetPayroll(targetNet: number, declared: boolean | null, start: string, dependents = 0, prior: NetPayrollContext = {}): NetPayrollAmounts {
  const target = moneyCents(targetNet)
  if (!Number.isFinite(targetNet) || target < 0 || target > 9999999900) throw new Error('Net acquis invalide')
  const empty = {cnss_employee: 0, amo_employee: 0, ir_amount: 0, cnss_employer: 0, amo_employer: 0, family_allowance_employer: 0, prof_training_employer: 0}
  if (declared === false) return {...empty, gross_salary: target / 100, net_before_adjustments: target / 100, total_employer_cost: target / 100}
  const year = Number(start.slice(0, 4))
  if (year < 2023 || year > 2026) throw new Error('Barème automatique disponible de 2023 à 2026')
  const annualFactor = Number(start.slice(8, 10)) === 1 ? 24 : 12
  const priorGross = moneyCents(Number(prior.prior_gross || 0))
  const dependentsCount = Math.min(6, Math.max(0, Math.floor(dependents || 0)))
  const familyAnnual = (year >= 2026 ? 60000 : year === 2025 ? 50000 : 36000) * dependentsCount
  const thresholds = year >= 2025 ? [4000000, 6000000, 8000000, 10000000, 18000000, Infinity] : [3000000, 5000000, 6000000, 8000000, 18000000, Infinity]
  const rates = [0, 1000, 2000, 3000, 3400, year >= 2025 ? 3700 : 3800]
  const deductions = year >= 2025 ? [0, 400000, 1000000, 1800000, 2200000, 2740000] : [0, 300000, 800000, 1400000, 1720000, 2440000]
  function atGross(gross: number) {
    const cumulative = priorGross + gross
    const capped = Math.min(cumulative, 7200000 / annualFactor)
    const totals = {
      cnss_employee: contribution(capped, 448), amo_employee: contribution(cumulative, 226),
      cnss_employer: contribution(capped, 898), amo_employer: contribution(cumulative, 411),
      family_allowance_employer: contribution(cumulative, 640), prof_training_employer: contribution(cumulative, 160),
    }
    const feeRate = cumulative * annualFactor <= 7800000 ? 3500 : 2500
    const fees = Math.min(contribution(cumulative, feeRate), Math.round(3500000 / annualFactor))
    const taxableAnnual = Math.max(0, cumulative - totals.cnss_employee - totals.amo_employee - fees) * annualFactor
    const bracket = thresholds.findIndex(limit => taxableAnnual <= limit)
    const taxNumerator = Math.max(0, taxableAnnual * rates[bracket] - (deductions[bracket] + familyAnnual) * 10000)
    const ir = Math.floor((taxNumerator + 5000 * annualFactor) / (10000 * annualFactor))
    const values = {...totals, ir_amount: ir}
    for (const field of netPayrollContributionFields) values[field] -= moneyCents(Number(prior[field] || 0))
    return {values, net: gross - values.cnss_employee - values.amo_employee - values.ir_amount}
  }
  // The professional-expense rate changes at 78,000 MAD annualised gross.
  // Search the two monotone ranges separately and verify the exact cent result.
  const boundary = Math.floor(7800000 / annualFactor) - priorGross
  const maximum = 9999999900
  const ranges = [[0, Math.min(maximum, boundary)], [Math.max(0, boundary + 1), maximum]]
  for (const [startCent, endCent] of ranges) {
    if (endCent < startCent) continue
    let low = startCent, high = endCent
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (atGross(middle).net < target) low = middle + 1
      else high = middle
    }
    for (let candidate = Math.max(startCent, low - 12); candidate <= Math.min(endCent, low + 12); candidate++) {
      const result = atGross(candidate)
      if (result.net !== target) continue
      const amounts = Object.fromEntries(netPayrollContributionFields.map(field => [field, result.values[field] / 100])) as Record<typeof netPayrollContributionFields[number], number>
      const employer = result.values.cnss_employer + result.values.amo_employer + result.values.family_allowance_employer + result.values.prof_training_employer
      return {...amounts, gross_salary: candidate / 100, net_before_adjustments: target / 100, total_employer_cost: (candidate + employer) / 100}
    }
  }
  throw new Error('Régularisation mensuelle incompatible avec le net acquis. Vérifiez les paies précédentes.')
}
