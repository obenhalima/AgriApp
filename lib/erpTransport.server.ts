/** Server-only request preparation. No network call or credential persistence.
 * Activate a real worker only after durable tenant/recipient authorization,
 * immutable PDF snapshots, secret provisioning and endpoint allowlisting exist. */
export function docIndexRequest(input: { key: string; filename: string; pdf: Uint8Array }, apiKey: string) {
  if (typeof window !== 'undefined') throw Error('Transport réservé au serveur.')
  if (!apiKey || /[\r\n]/.test(apiKey) || !input.key || /[\r\n]/.test(input.key)) throw Error('Configuration serveur invalide.')
  if (input.pdf.length > 4_000_000 || new TextDecoder().decode(input.pdf.subarray(0, 5)) !== '%PDF-') throw Error('PDF invalide ou supérieur à 4 Mo.')
  return {
    method: 'POST', redirect: 'error' as const,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/pdf', 'Idempotency-Key': input.key, 'X-Filename': encodeURIComponent(input.filename) },
    body: input.pdf,
  }
}
