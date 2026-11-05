/** Transport-neutral connector contract. This workbench only accepts fixture invoices.
 * The browser state is NOT an authoritative validation or production audit log. */
export type ErpConfig = {
  domainId: string; recipientId: string; adapter: 'docindex' | 'erp'; enabled: boolean
  mode: 'simulation'; endpoint: string; credentialRef: string
}
export type FixtureInvoice = {
  id: string; domainId: string; recipientId: string; number: string; fictitious: true
  origin: 'manual' | 'validated_settlement' | 'history'
}
export type Transfer = {
  key: string; domainId: string; recipientId: string; invoiceId: string; invoiceNumber: string
  destination: string; adapter: ErpConfig['adapter']; credentialRef: string
  validatedBy: string; validatedAt: string; state: 'pending' | 'simulated' | 'failed'
  attempts: number; remoteId?: string; remoteStatus?: string; lastError?: string; nextAttemptAt?: string
  events: { at: string; actor: string; action: string }[]
}
export const DOCINDEX_ENDPOINT = 'https://docindex-phi.vercel.app/api/v1/documents'
export function defaultErpConfig(domainId: string, recipientId: string): ErpConfig {
  return { domainId, recipientId, adapter: 'docindex', enabled: false, mode: 'simulation', endpoint: DOCINDEX_ENDPOINT, credentialRef: '' }
}
export function checkConfig(config: ErpConfig) {
  if (!config.domainId || !config.recipientId || config.mode !== 'simulation') throw Error('Simulation uniquement. Aucun envoi réel autorisé.')
  const url = new URL(config.endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('URL HTTPS sans identifiant ni paramètre requise.')
  if (config.adapter === 'docindex' && config.endpoint !== DOCINDEX_ENDPOINT) throw Error('Adresse DocIndex non reconnue.')
  // References only. Never accept an API credential in browser storage.
  if (config.credentialRef && !/^[A-Z][A-Z0-9_]{0,99}$/.test(config.credentialRef)) throw Error('Indiquez un nom de secret serveur, jamais la clé API.')
}
export function transferKey(invoice: FixtureInvoice) {
  return `itrix:${invoice.domainId}:${invoice.recipientId}:${invoice.id}`
}
export function queueFixture(config: ErpConfig, invoice: FixtureInvoice, actor: string, explicitValidation: boolean, existing: Transfer[], at = new Date().toISOString()): Transfer | null {
  checkConfig(config)
  if (invoice.fictitious !== true) throw Error('Seules les factures fictives sont autorisées dans cette recette.')
  if (invoice.domainId !== config.domainId || invoice.recipientId !== config.recipientId) throw Error('Client ou destinataire incompatible.')
  if (!actor) throw Error('Utilisateur requis.')
  if (invoice.origin === 'history') return null // Never retroactively validate historical invoices.
  if (invoice.origin === 'manual' && !explicitValidation) return null
  if (!config.enabled) return null
  const key = transferKey(invoice), previous = existing.find(job => job.key === key)
  if (previous) return previous
  return { key, domainId: invoice.domainId, recipientId: invoice.recipientId, invoiceId: invoice.id, invoiceNumber: invoice.number,
    destination: config.endpoint, adapter: config.adapter, credentialRef: config.credentialRef,
    validatedBy: actor, validatedAt: at, state: 'pending', attempts: 0,
    events: [{ at, actor, action: invoice.origin === 'manual' ? 'Validation explicite fictive ; mise en file' : 'Bordereau validé fictif ; mise en file automatique' }] }
}
export type ErpAdapter = {
  send: (request: { key: string; filename: string; pdf: Uint8Array; domainId: string; recipientId: string; invoiceId: string }) => Promise<{ id: string; status: string; duplicate: boolean }>
}
export function simulatedAdapter(fail = false): ErpAdapter {
  return { async send({ key, pdf }) {
    if (!pdf.length || new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-') throw Error('INVALID_PDF')
    if (pdf.length > 4_000_000) throw Error('PDF_TOO_LARGE')
    if (fail) throw Error('SIMULATED_UNAVAILABLE')
    return { id: `simulation:${key}`, status: 'to_review', duplicate: false }
  } }
}
export async function deliverFixture(config: ErpConfig, job: Transfer, actor: string, pdf: Uint8Array, adapter: ErpAdapter, manual = false, at = new Date().toISOString()): Promise<Transfer> {
  checkConfig(config)
  if (!config.enabled) throw Error('Connecteur désactivé.')
  if (job.domainId !== config.domainId || job.recipientId !== config.recipientId || job.destination !== config.endpoint || job.adapter !== config.adapter || job.credentialRef !== config.credentialRef) throw Error('La configuration a changé : vérifiez le destinataire avant tout renvoi.')
  if (!actor) throw Error('Utilisateur requis.')
  if (!manual && (job.state === 'simulated' || job.attempts >= 3 || (job.nextAttemptAt && Date.parse(at) < Date.parse(job.nextAttemptAt)))) return job
  const next: Transfer = { ...job, attempts: job.attempts + 1, events: [...job.events, { at, actor, action: manual ? 'Renvoi manuel simulé' : 'Tentative simulée' }] }
  try {
    const result = await adapter.send({ key: job.key, filename: `${job.invoiceNumber.replace(/[^A-Za-z0-9_.-]/g, '_')}.pdf`, pdf, domainId: job.domainId, recipientId: job.recipientId, invoiceId: job.invoiceId })
    // Provider status is opaque; each ERP can return its own vocabulary.
    if (typeof result.id !== 'string' || !result.id || typeof result.status !== 'string' || !result.status || result.status.length > 100) throw Error('INVALID_RESPONSE')
    return { ...next, state: 'simulated', remoteId: result.id, remoteStatus: result.status, lastError: undefined, nextAttemptAt: undefined,
      events: [...next.events, { at, actor, action: 'Réception simulée ; aucune validation humaine effectuée' }] }
  } catch (error) {
    const code = error instanceof Error && ['INVALID_PDF','PDF_TOO_LARGE','SIMULATED_UNAVAILABLE','INVALID_RESPONSE'].includes(error.message) ? error.message : 'TRANSFER_FAILED'
    return { ...next, state: 'failed', lastError: code, nextAttemptAt: new Date(Date.parse(at) + 60000 * 2 ** Math.min(job.attempts, 5)).toISOString(),
      events: [...next.events, { at, actor, action: 'Échec simulé ; facture source inchangée' }] }
  }
}
