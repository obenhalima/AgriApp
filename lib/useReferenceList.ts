'use client'
// ============================================================
// useReferenceList — hook pour alimenter une liste déroulante
// depuis les référentiels dynamiques (no-code).
//
// Usage :
//   const { values, loading, defaultCode } = useReferenceList('client_type')
//   <select>{values.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}</select>
//
// Cache module-level : la même liste n'est fetchée qu'une fois par session.
// Invalidé automatiquement via Realtime quand un admin modifie un référentiel.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface RefValue {
  code: string
  label: string
  color?: string | null
  icon?: string | null
  metadata?: any
  is_default?: boolean
}

// Cache partagé entre tous les composants
const cache = new Map<string, RefValue[]>()
// Listeners pour invalider le cache quand une liste change (Realtime)
const subscribers = new Map<string, Set<(v: RefValue[]) => void>>()
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

function ensureRealtime() {
  if (realtimeChannel) return
  realtimeChannel = supabase
    .channel('reference-values-changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'reference_values' }, (payload: any) => {
      // Invalide la liste concernée et re-fetch
      const key = payload.new?.list_key ?? payload.old?.list_key
      if (!key) return
      cache.delete(key)
      fetchList(key).then((vals) => {
        subscribers.get(key)?.forEach(fn => fn(vals))
      })
    })
    .subscribe()
}

async function fetchList(listKey: string): Promise<RefValue[]> {
  const { data } = await supabase
    .from('reference_values')
    .select('code, label, color, icon, metadata, is_default')
    .eq('list_key', listKey)
    .eq('is_active', true)
    .order('order_idx')
  const vals = (data ?? []) as RefValue[]
  cache.set(listKey, vals)
  return vals
}

export function useReferenceList(listKey: string): {
  values: RefValue[]
  loading: boolean
  defaultCode: string | null
} {
  const [values, setValues] = useState<RefValue[]>(cache.get(listKey) ?? [])
  const [loading, setLoading] = useState(!cache.has(listKey))

  useEffect(() => {
    let cancelled = false
    ensureRealtime()

    // S'abonne aux invalidations
    if (!subscribers.has(listKey)) subscribers.set(listKey, new Set())
    const onUpdate = (v: RefValue[]) => { if (!cancelled) setValues(v) }
    subscribers.get(listKey)!.add(onUpdate)

    if (cache.has(listKey)) {
      setValues(cache.get(listKey)!)
      setLoading(false)
    } else {
      fetchList(listKey).then((vals) => {
        if (cancelled) return
        setValues(vals)
        setLoading(false)
      })
    }

    return () => {
      cancelled = true
      subscribers.get(listKey)?.delete(onUpdate)
    }
  }, [listKey])

  const defaultCode = values.find(v => v.is_default)?.code ?? null
  return { values, loading, defaultCode }
}

/**
 * Helper non-réactif : récupère le label d'un code (pour affichage en table).
 * Utilise le cache si dispo, sinon retourne le code brut.
 */
export function refLabel(listKey: string, code: string | null | undefined): string {
  if (!code) return '—'
  const vals = cache.get(listKey)
  return vals?.find(v => v.code === code)?.label ?? code
}
