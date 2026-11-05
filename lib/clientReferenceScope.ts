/** Client selection is explicit, never inferred from a browser-wide cache. */
export function requireReferenceDomain(domainId: string): string {
  if (typeof domainId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
    throw new Error('Sélectionnez un client valide avant de gérer ses référentiels.')
  }
  return domainId
}

/** Enable only after ownership/remapping, RLS and relational checks pass.
 * This switch stages the UI; it is NOT an authorization control for PostgreSQL.
 */
export function clientReferenceIsolationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION === 'true'
}

export function requireClientReferenceWrite(domainId: string): string {
  const domain = requireReferenceDomain(domainId)
  if (!clientReferenceIsolationEnabled()) throw new Error('Référentiels en lecture seule jusqu’à validation de l’isolation par client.')
  return domain
}
