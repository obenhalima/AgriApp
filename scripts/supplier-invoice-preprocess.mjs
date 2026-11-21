import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const exec = promisify(execFile)
const max = 10_000_000
const run = (command, args) => exec(command, args, { timeout: 30_000, windowsHide: true, maxBuffer: 1_000_000 })

export function invoiceMime(bytes) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg'
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png'
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /heic|heix|hevc|hevx/.test(bytes.subarray(8, 32).toString())) return 'image/heic'
  throw new Error('Format de facture non reconnu.')
}

export async function preprocessInvoice(bytes, type = invoiceMime(bytes)) {
  if (bytes.length > max || type !== invoiceMime(bytes)) throw Error('Fichier invalide ou supérieur à 10 Mo.')
  const dir = await mkdtemp(join(tmpdir(), 'supplier-invoice-'))
  try {
    const suffix = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' }[type]
    const input = join(dir, 'source.' + suffix)
    await writeFile(input, bytes, { mode: 0o600 })
    let text = ''
    let inputs = [input]
    if (type === 'application/pdf') {
      const engine = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')
      const { getDocument } = await import(engine)
      inputs = []
      const document = await getDocument({
        data: Uint8Array.from(bytes), isEvalSupported: false, disableFontFace: true,
        standardFontDataUrl: fileURLToPath(new URL('../../standard_fonts/', engine)),
        cMapUrl: fileURLToPath(new URL('../../cmaps/', engine)), cMapPacked: true,
      }).promise
      try {
        const pageTexts = []
        for (let number = 1; number <= Math.min(5, document.numPages); number++) {
          const page = await document.getPage(number)
          const content = await page.getTextContent()
          pageTexts.push(content.items.map(item => item.str ?? '').join(' '))
          const { width, height } = page.getViewport({ scale: 150 / 72 })
          const limit = Math.max(width, height) > 2000 ? ['-scale-to', '2000'] : []
          const prefix = join(dir, 'page-' + number)
          await run(process.env.PDFTOPPM_PATH || 'pdftoppm', [
            '-f', String(number), '-l', String(number), '-singlefile', '-r', '150', ...limit, '-jpeg', input, prefix,
          ])
          inputs.push(prefix + '.jpg')
        }
        text = pageTexts.join('\n').slice(0, 100_000)
      } finally { await document.destroy() }
    }

    const pages = []
    for (const [index, source] of inputs.entries()) {
      const output = join(dir, `render-${index}.jpg`)
      await run(process.env.MAGICK_PATH || 'magick', [
        '-limit', 'memory', '192MiB', '-limit', 'map', '256MiB', '-limit', 'disk', '256MiB',
        `${source}[0]`, '-auto-orient', '-resize', '2000x2000>', '-strip', '-quality', '78', output,
      ])
      const page = await readFile(output)
      if (page.length > 1_500_000) throw Error('Une page dépasse la taille maximale après compression.')
      pages.push({ mimeType: 'image/jpeg', base64: page.toString('base64') })
    }
    if (!pages.length) throw Error('Aucune page lisible.')
    return { pages, text }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log = console.error
  try {
    const file = process.argv[2]
    if (!file) throw Error('Indiquez le chemin d’une facture.')
    if ((await stat(file)).size > max) throw Error('Fichier supérieur à 10 Mo.')
    const bytes = await readFile(file)
    const type = invoiceMime(bytes)
    const prepared = await preprocessInvoice(bytes, type)
    process.stdout.write(JSON.stringify({ type, ...prepared }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Prétraitement impossible.')
    process.exitCode = 1
  }
}
