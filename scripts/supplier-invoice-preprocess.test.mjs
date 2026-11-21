import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { invoiceMime, preprocessInvoice } from './supplier-invoice-preprocess.mjs'

function pdfFixture(pageCount) {
  const kids = Array.from({ length: pageCount }, (_, i) => (4 + i * 2) + ' 0 R').join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let i = 0; i < pageCount; i++) {
    const stream = `BT /F1 14 Tf 20 200 Td (Facture page ${i + 1}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 250] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  return Buffer.from(pdf + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`)
}

test('PDF rasterization and text are limited to the same first five pages', async () => {
  const result = await preprocessInvoice(pdfFixture(6))
  assert.equal(result.pages.length, 5)
  assert.match(result.text, /Facture page 5/)
  assert.doesNotMatch(result.text, /Facture page 6/)
  for (const page of result.pages) assert.equal(invoiceMime(Buffer.from(page.base64, 'base64')), 'image/jpeg')
})

test('large photo is resized before extraction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'invoice-photo-test-'))
  const magick = process.env.MAGICK_PATH || 'magick'
  try {
    const source = join(dir, 'source.png')
    execFileSync(magick, ['-size', '3000x1500', 'xc:white', source])
    const result = await preprocessInvoice(await readFile(source))
    assert.equal(result.text, '')
    assert.equal(result.pages.length, 1)
    const output = execFileSync(magick, ['identify', '-format', '%wx%h', '-'], {
      input: Buffer.from(result.pages[0].base64, 'base64'), encoding: 'utf8',
    })
    assert.equal(output, '2000x1000')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('HEIC is decoded as a page JPEG', { skip: !process.env.TEST_HEIC_FILE }, async () => {
  const input = await readFile(process.env.TEST_HEIC_FILE)
  assert.equal(invoiceMime(input), 'image/heic')
  const result = await preprocessInvoice(input)
  assert.equal(result.pages.length, 1)
  assert.equal(invoiceMime(Buffer.from(result.pages[0].base64, 'base64')), 'image/jpeg')
})
