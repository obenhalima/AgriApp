'use client'
// ============================================================
// useRealtimeReload — hook réutilisable pour synchronisation live.
//
// Branche un canal Supabase Realtime sur N tables et rappelle
// `load()` à chaque INSERT / UPDATE / DELETE. Debounce de 800ms
// pour grouper les changements en rafale.
//
// Usage type :
//
//   const load = useCallback(async () => { ... fetch ... }, [])
//   useEffect(() => { load() }, [load])
//
//   const { realtimeOk, lastRefresh, manualRefresh } = useRealtimeReload(
//     ['invoices', 'supplier_invoices', 'payments_received'],
//     load,
//     { channelName: 'factures-changes' }
//   )
//
// Tables doivent être ajoutées à la publication `supabase_realtime`
// (voir migration 042_enable_realtime_full.sql).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

interface Options {
  /** Identifiant unique du channel — préfixe avec le nom de la page */
  channelName: string
  /** Délai de debounce avant de relancer load() (ms). Défaut 800ms. */
  debounceMs?: number
  /** Désactive le hook (utile pour conditionnel) */
  enabled?: boolean
  /** Filtre optionnel par event */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  /** Log console quand un event arrive (dev only). Défaut true. */
  verbose?: boolean
}

export interface RealtimeStatus {
  /** True quand le channel est SUBSCRIBED */
  realtimeOk: boolean
  /** Date du dernier reload effectif */
  lastRefresh: Date
  /** Force un reload manuel (utile pour un bouton "Actualiser") */
  manualRefresh: () => Promise<void>
  /** Compteur incrémenté à chaque event reçu (debug) */
  nudgeCount: number
}

export function useRealtimeReload(
  tables: string[],
  load: () => void | Promise<void>,
  opts: Options,
): RealtimeStatus {
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [nudgeCount, setNudgeCount] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Garde le load() le plus récent sans re-souscrire
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  const debounceMs = opts.debounceMs ?? 800
  const event = opts.event ?? '*'
  const verbose = opts.verbose ?? true
  const enabled = opts.enabled ?? true

  const manualRefresh = useCallback(async () => {
    if (verbose) console.log(`[realtime:${opts.channelName}] manual refresh`)
    await loadRef.current()
    setLastRefresh(new Date())
  }, [opts.channelName, verbose])

  useEffect(() => {
    if (!enabled || tables.length === 0) return

    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const triggerReload = (table: string, payload: any) => {
      if (verbose) {
        const id = payload.new?.id ?? payload.old?.id ?? '?'
        console.log(`[realtime:${opts.channelName}] ✓ ${table} ${payload.eventType} (${id}) → reload`)
      }
      setNudgeCount((x) => x + 1)
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(async () => {
        await loadRef.current()
        setLastRefresh(new Date())
      }, debounceMs)
    }

    if (verbose) console.log(`[realtime:${opts.channelName}] subscribing to ${tables.join(', ')}…`)

    let channel = supabase.channel(opts.channelName)
    for (const t of tables) {
      channel = channel.on(
        'postgres_changes' as any,
        { event, schema: 'public', table: t },
        (p: any) => triggerReload(t, p),
      )
    }

    channel.subscribe((status, err) => {
      if (verbose) {
        console.log(
          `[realtime:${opts.channelName}] status: ${status}`,
          err ? `error: ${JSON.stringify(err)}` : '',
        )
      }
      setRealtimeOk(status === 'SUBSCRIBED')
    })

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      supabase.removeChannel(channel)
    }
    // ⚠️ On ne ré-inclut pas `tables` (référence stable attendue côté caller)
    // Si la liste change, le caller doit changer aussi le channelName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.channelName, event, debounceMs, enabled, verbose])

  return { realtimeOk, lastRefresh, manualRefresh, nudgeCount }
}
