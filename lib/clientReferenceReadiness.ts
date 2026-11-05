import { requireClientReferenceWrite } from './clientReferenceScope'

type ReadinessClient = { rpc: (name: string, args: { p_domain: string }) => PromiseLike<{ data: unknown; error: unknown }> }

/** Never enable a client write solely because a frontend environment flag was set. */
export async function assertClientReferenceIsolation(domainId: string, client: ReadinessClient): Promise<string> {
  const domain = requireClientReferenceWrite(domainId)
  const { data, error } = await client.rpc('client_reference_isolation_ready', { p_domain: domain })
  if (error || data !== true) throw new Error('Isolation du référentiel non validée sur le serveur. Aucune modification effectuée.')
  return domain
}
