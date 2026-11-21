import { createInvoiceExtractor } from './providers.ts'
import { checkInvoice, normalizeUnit, parseAmount } from './checks.ts'
import { invoiceSchema } from './schema.ts'

const party = Object.fromEntries(
  ['name','ice','if_number','rc','patente','address','city','phone','email','rib'].map(key => [key, null]),
)
const invoice = Object.fromEntries(
  ['number','date','due_date','currency','purchase_order_ref','delivery_note_ref','payment_terms','payment_method'].map(key => [key, null]),
)
const fixture = {
  supplier: party, customer: { name: null, ice: null }, invoice, lines: [],
  totals: { total_ht: null, total_discount: null, total_vat: null, stamp_duty: null, total_ttc: null, vat_breakdown: [] },
  confidence: {}, warnings: [],
}

Deno.test('Gemini retries quota responses and validates structured output', async () => {
  const waits: number[] = []
  let requests = 0
  const request: typeof fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.generationConfig.temperature !== 0 || body.generationConfig.responseSchema.properties.confidence.type !== 'ARRAY' || body.contents[0].parts.length !== 2) {
      throw new Error('Unexpected Gemini request.')
    }
    if (++requests < 3) return new Response(null, { status: 429 })
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...fixture, confidence: [{ path: 'invoice.number', score: 0.9 }] }) }] } }] })
  }
  const extractor = createInvoiceExtractor(
    { provider: 'gemini', model: 'fixture-model', key: 'fixture-key' },
    request, async ms => { waits.push(ms) },
  )
  const result = await extractor.extract([{ mimeType: 'image/jpeg', base64: 'aQ==' }], 'application/pdf', 'Facture')
  if (result.provider !== 'gemini' || waits.join(',') !== '1000,2000' || result.data.invoice.number !== null || result.data.confidence['invoice.number'] !== 0.9) {
    throw new Error('Unexpected Gemini result.')
  }
})

Deno.test('Ollama sends images and rejects invalid structured output', async () => {
  const request: typeof fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.messages[1].images[0] !== 'aQ==' || body.format.type !== 'object') {
      throw new Error('Unexpected Ollama request.')
    }
    return Response.json({ message: { content: JSON.stringify({ ...fixture, warnings: [123] }) } })
  }
  const extractor = createInvoiceExtractor({ provider: 'ollama', model: 'fixture-model', url: 'http://localhost:11434' }, request)
  try {
    await extractor.extract([{ mimeType: 'image/jpeg', base64: 'aQ==' }], 'image/jpeg')
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') return
    throw error
  }
  throw new Error('Invalid data was accepted.')
})

Deno.test('Moroccan identifiers, totals, VAT rates and dates', () => {
  const data = invoiceSchema.parse({
    ...fixture,
    supplier: { ...party, ice: '12', rib: '34' },
    customer: { name: null, ice: '123456789012345' },
    invoice: { ...invoice, date: '2026-02-30', due_date: '2026-01-01' },
    lines: [{ description: null, product_code: null, quantity: 1, unit: 'kg', packaging: null,
      unit_price_ht: 100, discount_pct: null, vat_rate: 13, amount_ht: 50, lot_number: null }],
    totals: { ...fixture.totals, total_ht: 100, total_vat: 20, stamp_duty: 1, total_ttc: 121.06,
      vat_breakdown: [{ rate: 20, base: 100, amount: 19 }] },
  })
  const checks = checkInvoice(data, { today: '2026-11-21', customerIce: '987654321098765' })
  for (const path of ['supplier.ice', 'supplier.rib', 'customer.ice', 'invoice.date', 'lines.0.vat_rate',
    'totals.total_ht', 'totals.total_ttc', 'totals.vat_breakdown.0.amount']) {
    if (!checks.some(check => check.path === path)) throw Error('Missing check: ' + path)
  }
  const tolerated = checkInvoice({ ...data, totals: { ...data.totals, total_ttc: 121.05 } }, { today: '2026-11-21' })
  if (tolerated.some(check => check.path === 'totals.total_ttc')) throw Error('Five cent tolerance failed.')
})

Deno.test('French invoice amounts and units', () => {
  for (const value of ['1 234,56', '1.234,56', '1234.56']) {
    if (parseAmount(value) !== 1234.56) throw new Error('Invalid amount parsing.')
  }
  if (parseAmount('1234,56,78') !== null || normalizeUnit('Pièces') !== 'unité' || normalizeUnit('mL') !== 'mL') {
    throw new Error('Invalid normalization.')
  }
})
