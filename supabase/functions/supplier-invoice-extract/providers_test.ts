import { createInvoiceExtractor } from './providers.ts'
import { normalizeUnit, parseAmount } from './checks.ts'

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
    if (body.generationConfig.temperature !== 0 || body.contents[0].parts.length !== 2) {
      throw new Error('Unexpected Gemini request.')
    }
    if (++requests < 3) return new Response(null, { status: 429 })
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(fixture) }] } }] })
  }
  const extractor = createInvoiceExtractor(
    { provider: 'gemini', model: 'fixture-model', key: 'fixture-key' },
    request, async ms => { waits.push(ms) },
  )
  const result = await extractor.extract([{ mimeType: 'image/jpeg', base64: 'aQ==' }], 'application/pdf', 'Facture')
  if (result.provider !== 'gemini' || waits.join(',') !== '1000,2000' || result.data.invoice.number !== null) {
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

Deno.test('French invoice amounts and units', () => {
  for (const value of ['1 234,56', '1.234,56', '1234.56']) {
    if (parseAmount(value) !== 1234.56) throw new Error('Invalid amount parsing.')
  }
  if (parseAmount('1234,56,78') !== null || normalizeUnit('Pièces') !== 'unité' || normalizeUnit('mL') !== 'mL') {
    throw new Error('Invalid normalization.')
  }
})
