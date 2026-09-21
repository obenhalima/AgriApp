'use client'
import { useEffect, useState } from 'react'
import { readAnalyticalScope, type AnalyticalScope } from './analyticalNavigation'
export function useAnalyticalEntry(domain?: string) {
  const [entry, setEntry] = useState<{ domain: string; scope: AnalyticalScope } | null>(null)
  useEffect(() => {
    if (!domain) return
    const read = () => setEntry({ domain, scope: readAnalyticalScope(window.location.search, domain) })
    read(); window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [domain])
  return entry && entry.domain === domain ? entry.scope : null
}
