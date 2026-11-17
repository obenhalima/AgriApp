import type {AttendancePeriod} from './attendance'
import {attendancePaymentSummary} from './attendanceHistory'
import type {PayrollPreparation, PayrollPayment} from './payrollPreparation'

export type RhCampaign = {id: string; code: string; name: string; farm_id: string; status: string; preparation_start: string | null; planting_start: string | null; harvest_start: string | null; campaign_end: string | null}
export type ExpectedFortnight = {farm_id: string; start_date: string; end_date: string}

export function expectedCampaignFortnights(campaigns: RhCampaign[], today: string) {
  const periods = new Map<string, ExpectedFortnight>()
  const missingDates: string[] = []
  for (const campaign of campaigns) {
    const start = campaign.preparation_start
    if (!start) {missingDates.push(campaign.name); continue}
    const [year, month, day] = start.split('-').map(Number)
    let cursor = new Date(Date.UTC(year, month - 1, day < 16 ? 1 : 16))
    const limit = campaign.campaign_end && campaign.campaign_end < today ? campaign.campaign_end : today
    while (cursor.toISOString().slice(0, 10) <= limit) {
      const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth(), d = cursor.getUTCDate()
      const end = new Date(Date.UTC(y, m, d === 1 ? 15 : new Date(Date.UTC(y, m + 1, 0)).getUTCDate())).toISOString().slice(0, 10)
      const due = campaign.campaign_end && campaign.campaign_end < end ? campaign.campaign_end : end
      if (due >= today) break
      const item = {farm_id: campaign.farm_id, start_date: cursor.toISOString().slice(0, 10), end_date: end}
      periods.set(`${item.farm_id}:${item.start_date}`, item)
      cursor = new Date(Date.UTC(y, m + (d === 1 ? 0 : 1), d === 1 ? 16 : 1))
    }
  }
  return {periods: [...periods.values()], missingDates}
}

export function rhFortnightChecks(periods: AttendancePeriod[], preparations: PayrollPreparation[], payments: PayrollPayment[], expected?: ExpectedFortnight[]) {
  const key = (item: {farm_id: string; start_date: string}) => `${item.farm_id}:${item.start_date}`
  const attendance = new Map(periods.map(item => [key(item), item]))
  const payroll = new Map(preparations.map(item => [key(item), item]))
  const all = new Map((expected ?? [...periods, ...preparations]).map(item => [key(item), item]))
  return [...all.entries()].map(([id, item]) => {
    const period = attendance.get(id), preparation = payroll.get(id)
    const payment = attendancePaymentSummary(preparation, payments)
    const attendanceOk = period?.status === 'validated'
    const payrollOk = preparation?.status === 'validated'
    const paymentOk = payrollOk && payment.remaining === 0
    return {...item, key: id, attendanceOk, payrollOk, paymentOk,
      unrecorded: !period && !preparation,
      attendanceLabel: !period ? 'Pointage manquant' : attendanceOk ? 'Validé' : 'À valider',
      payrollLabel: !preparation ? 'À préparer' : payrollOk ? 'Validée' : 'À valider',
      paymentLabel: payment.label, remaining: payment.remaining,
      complete: attendanceOk && payrollOk && paymentOk,
    }
  }).sort((a, b) => b.start_date.localeCompare(a.start_date) || a.farm_id.localeCompare(b.farm_id))
}

export function rhPeriodMatches(item: {farm_id: string | null; start_date: string}, farm: string, year: number, month: string) {
  return (!farm || item.farm_id === farm) && item.start_date.startsWith(`${year}-${month ? `${month.padStart(2, '0')}-` : ''}`)
}

export function rhPayrollTotals(preparations: PayrollPreparation[], payments: PayrollPayment[]) {
  const validated = preparations.filter(item => item.status === 'validated')
  const summaries = validated.map(item => attendancePaymentSummary(item, payments))
  const known = summaries.every(summary => summary.net != null)
  const costKnown = validated.every(item => item.rows.every(row => row.total_employer_cost != null))
  return {
    drafts: preparations.filter(item => item.status === 'draft').length,
    validated: validated.length,
    net: known ? summaries.reduce((sum, item) => sum + Math.round(item.net! * 100), 0) / 100 : null,
    paid: known ? summaries.reduce((sum, item) => sum + Math.round(item.paid! * 100), 0) / 100 : null,
    remaining: known ? summaries.reduce((sum, item) => sum + Math.round(item.remaining! * 100), 0) / 100 : null,
    cost: costKnown ? validated.reduce((sum, item) => sum + item.rows.reduce((total, row) => total + Math.round(Number(row.total_employer_cost) * 100), 0), 0) / 100 : null,
  }
}
