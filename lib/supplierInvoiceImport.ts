import { supabase } from './supabase'

export type ExtractedLine = {
  description: string | null; product_code: string | null; quantity: number | null; unit: string | null
  packaging: string | null; unit_price_ht: number | null; discount_pct: number | null; vat_rate: number | null
  amount_ht: number | null; lot_number: string | null
}
export type ImportData = {
  supplier: Record<string, string | null>; customer: Record<string, string | null>
  invoice: Record<string, string | null>; lines: ExtractedLine[]
  totals: { total_ht: number | null; total_vat: number | null; total_ttc: number | null; stamp_duty: number | null }
  confidence: Record<string, number>; warnings: string[]
}
export type InvoiceImport = {
  id: string; filename: string; status: string; error_message: string | null; invoice_id: string | null
  object_path: string; preview_pages: number | null; extracted_data: ImportData | null
  checks: { path: string; message: string; severity: string }[]
}
export type StockOption = { id: string; code: string; name: string; unit: string | null; plant_protection_product_id?: string | null; phytoName?: string; phytoCode?: string }
export type LineMatch = { stock_item_id: string; factor: string; confirmed?: boolean }
type SupplierOption = { id: string; name: string; ice?: string; if_number?: string }

export const importBucket = 'supplier-invoice-imports'

const normalize = (value?: string | null) => (value || '').normalize('NFD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function closeName<T>(value: string | null, candidates: T[], label: (candidate: T) => string) {
  const key = normalize(value)
  if (!key) return undefined
  const exact = candidates.filter(candidate => normalize(label(candidate)) === key)
  if (exact.length) return exact.length === 1 ? exact[0] : undefined
  const tokens = new Set(key.split(' '))
  const ranked = candidates.map(candidate => {
    const other = new Set(normalize(label(candidate)).split(' '))
    const common = [...tokens].filter(token => other.has(token)).length
    return { candidate, score: common / new Set([...tokens, ...other]).size }
  }).sort((a, b) => b.score - a.score)
  return ranked[0]?.score >= 0.6 && ranked[0].score - (ranked[1]?.score ?? 0) >= 0.15 ? ranked[0].candidate : undefined
}

export function matchSupplier(data: ImportData['supplier'], candidates: SupplierOption[]) {
  for (const field of ['ice', 'if_number'] as const) {
    if (!data[field]) continue
    const matches = candidates.filter(candidate => normalize(candidate[field]) === normalize(data[field]))
    if (matches.length) return matches.length === 1 ? matches[0] : undefined
  }
  return closeName(data.name, candidates, candidate => candidate.name)
}

export function stockSuggestion(line: ExtractedLine, options: StockOption[], historicalId?: string) {
  const code = normalize(line.product_code)
  const byCode = code && options.filter(item => [item.code, item.phytoCode].some(value => normalize(value) === code))
  return (byCode && byCode.length === 1 ? byCode[0] : undefined)
    ?? closeName(line.description, options, item => item.name)
    ?? closeName(line.description, options.filter(item => item.phytoName), item => item.phytoName!) ?? options.find(item => item.id === historicalId)
}

export function unitFactor(line: ExtractedLine, stockUnit: string | null) {
  const from = normalize(line.unit)
  const to = normalize(stockUnit)
  if (from && from === to) return '1'
  const metric: Record<string, [string, number]> = { kg: ['mass', 1000], g: ['mass', 1], l: ['volume', 1000], ml: ['volume', 1] }
  if (metric[from] && metric[to] && metric[from][0] === metric[to][0]) return String(metric[from][1] / metric[to][1])
  const pack = (line.packaging ?? '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)$/)
  if (pack && metric[to] && metric[pack[2]][0] === metric[to][0]) return String(Number(pack[1].replace(',', '.')) * metric[pack[2]][1] / metric[to][1])
  return ''
}

export async function mutateInvoiceImport(domain: string, opts: { file: File } | { id: string; action: 'retry' | 'abandon' }) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw Error('Connexion requise.')
  const endpoint = new URL('/functions/v1/supplier-invoice-extract', process.env.NEXT_PUBLIC_SUPABASE_URL)
  endpoint.searchParams.set('domain', domain)
  const headers = new Headers({
    Authorization: `Bearer ${data.session.access_token}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  })
  if ('file' in opts) {
    headers.set('Content-Type', 'application/octet-stream')
    headers.set('X-Filename', encodeURIComponent(opts.file.name))
  } else {
    endpoint.searchParams.set('action', opts.action)
    endpoint.searchParams.set('id', opts.id)
  }
  const response = await fetch(endpoint, {
    method: 'file' in opts ? 'POST' : 'PATCH', headers, body: 'file' in opts ? opts.file : null,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(result.error || 'Service d’import indisponible.')
  return result as { id: string; invoice_id?: string; duplicate?: boolean }
}

export function invoiceImportLink(id: string, domain: string) {
  return `/factures/document/${id}?type=fournisseur&domain=${domain}`
}

export async function openInvoiceOriginal(domain: string, invoiceID: string) {
  const invoiceImport = await supabase.from('supplier_invoice_imports').select('object_path,filename')
    .eq('domain_id', domain).eq('invoice_id', invoiceID).maybeSingle()
  if (invoiceImport.error) throw invoiceImport.error
  return invoiceImport.data ?? null
}
