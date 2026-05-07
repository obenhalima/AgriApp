'use client'
/**
 * Hooks utilitaires : auth-ready + refresh-on-event.
 *
 * 1. useAuthReady() → garantit que les requêtes Supabase ne partent qu'APRÈS
 *    que l'auth soit prête. Sinon RLS retourne vide silencieusement.
 *
 * 2. useRefreshOnEvent(callback) → écoute l'event 'app:refresh-data' déclenché
 *    par le bouton refresh du Topbar pour rafraîchir les données de la page.
 *
 * Usage :
 *   const { ready } = useAuthReady()
 *   const reload = async () => { ... }
 *   useEffect(() => { if (!ready) return; reload() }, [ready])
 *   useRefreshOnEvent(reload)
 */
import { useEffect } from 'react'
import { useAuth } from './auth'

export function useAuthReady(): { ready: boolean; userId: string | null } {
  const { user, loading } = useAuth()
  return {
    ready: !loading && !!user?.id,
    userId: user?.id ?? null,
  }
}

export function useRefreshOnEvent(callback: () => void | Promise<void>) {
  useEffect(() => {
    const handler = () => { void callback() }
    window.addEventListener('app:refresh-data', handler)
    return () => window.removeEventListener('app:refresh-data', handler)
  // On veut un nouveau handler à chaque render pour capturer la dernière closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback])
}
