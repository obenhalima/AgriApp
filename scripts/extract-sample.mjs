import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInvoiceExtractor } from '../supabase/functions/supplier-invoice-extract/providers.ts'
import { checkInvoice } from '../supabase/functions/supplier-invoice-extract/checks.ts'
const preprocess = fileURLToPath(new URL('./supplier-invoice-preprocess.mjs', import.meta.url))

const dir = Deno.args[0]
if (!dir) throw Error('Utilisation : extract-sample <dossier>')
const env = key => Deno.env.get(key)
const provider = env('EXTRACTION_PROVIDER')
if (provider !== 'gemini' && provider !== 'ollama') throw Error('Configurer EXTRACTION_PROVIDER=gemini|ollama.')
const extractor = createInvoiceExtractor({
  provider, model: provider === 'gemini' ? env('GEMINI_MODEL') || '' : env('OLLAMA_MODEL') || 'qwen3-vl:8b',
  key: env('GEMINI_API_KEY'), url: env('OLLAMA_URL'),
})
const today = new Date().toISOString().slice(0, 10)
for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isFile() || !/\.(pdf|png|jpe?g|heic)$/i.test(entry.name)) continue
  try {
    const prepared = await new Deno.Command('node', {
      args: [preprocess, join(dir, entry.name)], stdout: 'piped', stderr: 'piped',
    }).output()
    if (!prepared.success) throw Error(new TextDecoder().decode(prepared.stderr).trim())
    const { type, pages, text } = JSON.parse(new TextDecoder().decode(prepared.stdout))
    const result = await extractor.extract(pages, type, text)
    console.log(JSON.stringify({ file: entry.name, ...result, checks: checkInvoice(result.data, { today }) }))
  } catch (error) {
    console.log(JSON.stringify({ file: entry.name, error: error.message }))
    Deno.exitCode = 1
  }
}
