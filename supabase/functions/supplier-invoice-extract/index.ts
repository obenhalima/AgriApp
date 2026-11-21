import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import { createInvoiceExtractor, type ImagePage } from './providers.ts'
import { invoiceSchema } from './schema.ts'
import { checkInvoice } from './checks.ts'

const env = (name: string) => Deno.env.get(name) ?? ''
const max = 10_000_000
const bucket = 'supplier-invoice-imports'
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-filename',
  'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
}
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })

function mime(bytes: Uint8Array) {
  const ascii = new TextDecoder().decode(bytes.subarray(0, 32))
  if (ascii.startsWith('%PDF-')) return 'application/pdf'
  if ([255, 216, 255].every((n, i) => bytes[i] === n)) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'image/png'
  if (ascii.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx/.test(ascii.slice(8))) return 'image/heic'
  return null
}

async function readUpload(req: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(req.headers.get('content-length')) > max || !req.body) throw Error('Fichier manquant ou supérieur à 10 Mo.')
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel()
      throw Error('Le fichier dépasse 10 Mo.')
    }
    chunks.push(value)
  }
  const data = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  return data
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const url = new URL(req.url)
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } })
  try {
    if (url.searchParams.get('action') === 'extract') {
      if (req.method !== 'POST' || !serviceKey || token !== serviceKey) return reply({ error: 'Accès refusé.' }, 403)
      const { id, attempt, pages, text } = await req.json() as { id: string; attempt: number; pages: ImagePage[]; text: string }
      if (!uuid.test(id) || !Array.isArray(pages) || pages.length < 1 || pages.length > 5 ||
        pages.some(page => page.mimeType !== 'image/jpeg' || typeof page.base64 !== 'string' || page.base64.length > 2_000_000) ||
        typeof text !== 'string' || text.length > 100_000) return reply({ error: 'Pages invalides.' }, 400)
      const job = await db.from('supplier_invoice_imports').select('*').eq('id', id)
        .eq('attempt', attempt).eq('status', 'processing').gt('lease_until', new Date().toISOString()).single()
      if (job.error) return reply({ error: 'Tentative expirée.' }, 409)
      const { domain_id: domain, mime_type: type } = job.data
      const provider = env('EXTRACTION_PROVIDER')
      if (provider !== 'gemini' && provider !== 'ollama') return reply({ error: 'Fournisseur d’extraction non configuré.' }, 503)
      const extractor = createInvoiceExtractor({
        provider, model: provider === 'gemini' ? env('GEMINI_MODEL') : env('OLLAMA_MODEL') || 'qwen3-vl:8b',
        key: env('GEMINI_API_KEY'), url: env('OLLAMA_URL'),
      })
      const result = await extractor.extract(pages, type, text)

      const { ice, if_number: fiscal, name } = result.data.supplier

      const find = (column: string, value: string) =>
        db.from('suppliers').select('id').eq('domain_id', domain).eq('is_active', true).eq(column, value).limit(2)
      let matches = ice ? (await find('ice', ice)).data : null
      if (!matches?.length && fiscal) matches = (await find('if_number', fiscal)).data
      if (!matches?.length && name) matches = (await find('name', name)).data
      const supplierId = matches?.length === 1 ? matches[0].id : null
      const org = await db.from('domains').select('ice,timezone').eq('id', domain).single()
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: org.data?.timezone || 'Africa/Casablanca',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      let final = result
      if (supplierId) {
        const history = await db.from('supplier_invoice_imports').select('validated_data,supplier_invoices!supplier_invoice_imports_invoice_id_fkey!inner(supplier_id)')
          .eq('domain_id', domain).eq('status', 'validated').eq('supplier_invoices.supplier_id', supplierId)
          .order('validated_at', { ascending: false }).limit(2)
        const examples = (history.data ?? []).flatMap(row => {
          const parsed = invoiceSchema.safeParse(row.validated_data?.data)
          if (!parsed.success) return []
          const example = parsed.data
          return [{ ...example, supplier: { ...example.supplier, rib: null, phone: null, email: null, address: null } }]
        })
        if (examples.length) final = await extractor.extract(pages, type, text, examples)
      }
      const resultChecks = checkInvoice(final.data, { today, customerIce: org.data?.ice })
      const saved = await db.from('supplier_invoice_imports').update({
        provider: final.provider, model: final.model, duration_ms: result === final ? final.durationMs : result.durationMs + final.durationMs,
        preview_pages: pages.length, raw_payload: final.raw, extracted_data: final.data, checks: resultChecks, status: 'to_review', lease_until: null,
      }).eq('id', id).eq('attempt', attempt).eq('status', 'processing').select('id').maybeSingle()
      if (saved.error) throw saved.error
      return reply({ id: saved.data?.id ?? null })
    }
    const { data: identity, error } = await db.auth.getUser(token)
    const actor = identity.user?.id
    const domain = url.searchParams.get('domain') ?? ''
    if (error || !actor) return reply({ error: 'Connexion requise.' }, 401)
    if (!uuid.test(domain)) return reply({ error: 'Client invalide.' }, 400)
    const [permission, profile] = await Promise.all([
      db.rpc('has_domain_permission', { p_domain_id: domain, p_user_id: actor, p_module_code: 'achats', p_action: 'create' }),
      db.from('profiles').select('is_active').eq('id', actor).maybeSingle(),
    ])
    if (permission.data !== true || !profile.data?.is_active) return reply({ error: 'Droits de création de facture requis.' }, 403)

    if (req.method === 'PATCH') {
      const id = url.searchParams.get('id') ?? ''
      const action = url.searchParams.get('action')
      if (!uuid.test(id) || !['retry', 'abandon'].includes(action ?? '')) return reply({ error: 'Action invalide.' }, 400)
      const retry = action === 'retry'
      const updated = await db.from('supplier_invoice_imports').update({
        status: retry ? 'queued' : 'abandoned', lease_until: null, error_message: null,
      }).eq('id', id).eq('domain_id', domain)
        .in('status', retry ? ['failed', 'to_review'] : ['queued', 'processing', 'failed', 'to_review']).select('id').maybeSingle()
      if (updated.error) throw updated.error
      return updated.data ? reply(updated.data) : reply({ error: 'Cet import ne peut plus être modifié.' }, 409)
    }
    if (req.method !== 'POST') return reply({ error: 'Méthode non acceptée.' }, 405)
    let bytes: Uint8Array<ArrayBuffer>
    try { bytes = await readUpload(req) } catch (error) { return reply({ error: (error as Error).message }, 413) }
    const type = mime(bytes)
    if (!type) return reply({ error: 'Utilisez un PDF, JPG, PNG ou HEIC valide.' }, 415)
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      value => value.toString(16).padStart(2, '0')).join('')
    let filename = 'facture'
    try { filename = decodeURIComponent(req.headers.get('x-filename') ?? 'facture').slice(0, 255) || 'facture' } catch { /* fallback */ }
    const entry = await db.from('supplier_invoice_imports').insert({
      domain_id: domain, uploaded_by: actor, filename, mime_type: type, byte_size: bytes.length, sha256,
    }).select('id,object_path').single()
    let target = entry.data
    if (entry.error?.code === '23505') {
      const existing = await db.from('supplier_invoice_imports').select('id,invoice_id,status,object_path')
        .eq('domain_id', domain).eq('sha256', sha256).single()
      if (existing.error) throw existing.error
      if (existing.data.status === 'abandoned') {
        const resumed = await db.from('supplier_invoice_imports').update({ status: 'queued', error_message: null })
          .eq('id', existing.data.id).eq('status', 'abandoned').select('id').maybeSingle()
        if (resumed.data) return reply({ id: resumed.data.id }, 202)
      }
      if (existing.data.status !== 'uploading') {
        return reply({ id: existing.data.id, invoice_id: existing.data.invoice_id, duplicate: true })
      }
      target = existing.data
    }
    if (!target) throw entry.error
    // The path contains the hash of the bytes, so an upsert can safely resume an interrupted upload.
    const upload = await db.storage.from(bucket).upload(target.object_path, bytes, { contentType: type, upsert: true })
    if (upload.error) throw upload.error
    const queued = await db.from('supplier_invoice_imports').update({ status: 'queued' })
      .eq('id', target.id).eq('status', 'uploading')
    if (queued.error) throw queued.error
    return reply({ id: target.id }, 202)
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('Quota atteint')
      ? error.message : 'Impossible de traiter la facture. Réessayez.'
    return reply({ error: message }, 502)
  }
})
