import type { InvoiceData } from './schema.ts'

export type InvoiceCheck = { path: string; message: string; severity: 'warning' | 'error' }
const rates = new Set([0, 7, 10, 14, 20])
const cents = (value: number) => Math.round(value * 100)
const differs = (a: number, b: number) => Math.abs(cents(a) - cents(b)) > 5

export function parseAmount(value: string): number | null {
  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, '')
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null
  const result = Number(normalized)
  return Number.isFinite(result) ? result : null
}

const units: Record<string, string> = {
  kg: 'kg', kgs: 'kg', kilogramme: 'kg', kilogrammes: 'kg', g: 'g',
  gramme: 'g', grammes: 'g', l: 'L', litre: 'L', litres: 'L', ml: 'mL',
  unite: 'unité', unites: 'unité', u: 'unité', piece: 'unité', pieces: 'unité',
  sac: 'sac', sacs: 'sac', bidon: 'bidon', bidons: 'bidon', carton: 'carton', cartons: 'carton',
}
export function normalizeUnit(value: string): string {
  const trimmed = value.trim()
  return units[trimmed.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()] ?? trimmed
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

export function checkInvoice(data: InvoiceData, options: { today: string; customerIce?: string | null }): InvoiceCheck[] {
  const issues: InvoiceCheck[] = []
  const add = (path: string, message: string, severity: InvoiceCheck['severity'] = 'error') =>
    issues.push({ path, message, severity })
  for (const party of ['supplier', 'customer'] as const) {
    const ice = data[party].ice
    if (ice != null && !/^\d{15}$/.test(ice)) add(`${party}.ice`, 'L’ICE doit comporter 15 chiffres.')
  }
  if (data.supplier.rib != null && !/^\d{24}$/.test(data.supplier.rib)) add('supplier.rib', 'Le RIB doit comporter 24 chiffres.')
  if (options.customerIce && data.customer.ice && options.customerIce !== data.customer.ice) {
    add('customer.ice', 'L’ICE du destinataire diffère de celui du client actif.', 'warning')
  }
  const { date, due_date: dueDate } = data.invoice
  if (date && !validDate(date)) add('invoice.date', 'Date de facture invalide.')
  else if (date && date > options.today) add('invoice.date', 'La date de facture est dans le futur.')
  if (dueDate && !validDate(dueDate)) add('invoice.due_date', 'Date d’échéance invalide.')
  else if (date && dueDate && validDate(date) && dueDate < date) add('invoice.due_date', 'L’échéance précède la facture.')

  data.lines.forEach((line, index) => {
    if (line.vat_rate != null && !rates.has(line.vat_rate)) add(`lines.${index}.vat_rate`, 'Taux de TVA à vérifier.')
  })
  const { total_ht: ht, total_vat: vat, total_ttc: ttc, stamp_duty: stamp, vat_breakdown: breakdown } = data.totals
  if (ht != null && data.lines.length && data.lines.every(line => line.amount_ht != null)) {
    const sum = data.lines.reduce((total, line) => total + line.amount_ht!, 0)
    if (differs(sum, ht)) add('totals.total_ht', 'La somme des lignes diffère du montant HT.')
  }
  if (ht != null && vat != null && ttc != null && differs(ht + vat + (stamp ?? 0), ttc)) {
    add('totals.total_ttc', 'Le TTC diffère du HT augmenté de la TVA et du timbre.')
  }
  breakdown.forEach(({ rate, base, amount }, index) => {
    if (rate == null) return
    if (!rates.has(rate)) add(`totals.vat_breakdown.${index}.rate`, 'Taux de TVA à vérifier.')
    if (base != null && amount != null && differs(base * rate / 100, amount)) {
      add(`totals.vat_breakdown.${index}.amount`, 'Le montant de TVA diffère de la base multipliée par le taux.')
    }
  })
  return issues
}
