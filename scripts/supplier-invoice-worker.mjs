import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { preprocessInvoice } from './supplier-invoice-preprocess.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw Error('Configurez Supabase avant de lancer le worker.')
const endpoint = process.env.INVOICE_EXTRACTION_URL || `${url}/functions/v1/supplier-invoice-extract`
const db = createClient(url, key, { auth: { persistSession: false } })
let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })

async function processJob(job) {
  let message = 'Le document n’a pas pu être lu. Vérifiez le fichier puis réessayez.'
  try {
    const download = await db.storage.from('supplier-invoice-imports').download(job.object_path)
    if (download.error) throw download.error
    const bytes = Buffer.from(await download.data.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== job.sha256) throw Error('Empreinte invalide.')
    const prepared = await preprocessInvoice(bytes, job.mime_type)
    for (const [index, page] of prepared.pages.entries()) {
      const preview = await db.storage.from('supplier-invoice-imports').upload(
        job.object_path + '/preview-' + (index + 1) + '.jpg', Buffer.from(page.base64, 'base64'),
        { contentType: 'image/jpeg', upsert: true },
      )
      if (preview.error) throw preview.error
    }
    const target = new URL(endpoint)
    target.searchParams.set('action', 'extract')
    const response = await fetch(target, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, attempt: job.attempt, ...prepared }),
      redirect: 'error', signal: AbortSignal.timeout(240_000),
    })
    if (response.ok || response.status === 409) return
    const failure = await response.json().catch(() => ({}))
    message = failure.error || 'Le service d’extraction est indisponible.'
  } catch {
    // Provider and tool details can contain document data.
  }
  const failed = await db.from('supplier_invoice_imports')
    .update({ status: 'failed', error_message: message, lease_until: null })
    .eq('id', job.id).eq('attempt', job.attempt).eq('status', 'processing')
  if (failed.error) throw failed.error
}

while (!stopping) {
  try {
    const { data, error } = await db.rpc('claim_supplier_invoice_import')
    if (error) throw error
    if (data?.length) await processJob(data[0])
    else await sleep(2500)
  } catch {
    console.error('File d’import indisponible. Nouvelle tentative dans 5 secondes.')
    await sleep(5000)
  }
}
