export function harvestLoadError(label: string, error: unknown) {
  const candidate = (error as {code?: unknown} | null)?.code
  const code = typeof candidate === 'string' && /^[A-Z0-9_]{3,20}$/.test(candidate) ? ` (code ${candidate})` : ''
  return new Error(`Chargement impossible : ${label}${code}. Aucune donnée n’a été supprimée. Réessayez ou contactez votre administrateur.`)
}

/** Read every page; rebuild the query so range and tenant filters stay explicit. */
export async function readHarvestHistory<T>(
  query: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>,
  label: string,
) {
  const rows: T[] = []
  const size = 500
  for (let from = 0; ; from += size) {
    const result = await query(from, from + size - 1)
    if (result.error) {
      throw harvestLoadError(label, result.error)
    }
    const page = result.data || []
    rows.push(...page)
    if (page.length < size) return {data: rows, error: null}
  }
}
