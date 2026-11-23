'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { dedicatedModulePrerequisites, prerequisiteLabels, type DedicatedReadiness } from '@/lib/dedicatedModuleReadiness'

export function DedicatedPrerequisiteGate({ children, domainId, pathname, canConfigure }: {
  children: ReactNode
  domainId: string
  pathname: string
  canConfigure: boolean
}) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; readiness: DedicatedReadiness | null }>()
  const key = `${domainId}/${pathname}/${attempt}`

  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('dedicated_module_readiness', { p_domain: domainId })
        if (current) setResult({ key, readiness: error ? null : data as DedicatedReadiness | null })
      } catch {
        if (current) setResult({ key, readiness: null })
      }
    })()
    return () => { current = false }
  }, [domainId, key])

  if (result?.key !== key) return <p role="status">Vérification des prérequis…</p>
  if (!result.readiness) return <section role="alert" className="space-y-sm">
    <p>Impossible de vérifier les prérequis de ce module.</p>
    <button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>
  </section>

  const missing = dedicatedModulePrerequisites(pathname).filter(item => result.readiness?.[item] !== true)
  if (!missing.length) return <>{children}</>
  return <section role="status" className="space-y-md">
    <h1 className="text-xl font-semibold">Module en attente de configuration</h1>
    <p>Renseigne les prérequis suivants pour la société active.</p>
    <ul className="list-disc pl-6">{missing.map(item => <li key={item}>{prerequisiteLabels[item]}</li>)}</ul>
    {canConfigure
      ? <Link className="btn" href="/admin/domaines?setup=1">Ouvrir l’assistant des référentiels</Link>
      : <p>Contacte l’administrateur de la société pour compléter la configuration.</p>}
  </section>
}
