'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

const PAGES: Record<string, { title: string; href?: string; cta?: string }> = {
  '/': { title: 'Tableau de bord', href: '/recoltes', cta: 'Voir les recoltes' },
  '/serres': { title: 'Serres' },
  '/varietes': { title: 'Varietes' },
  '/campagnes': { title: 'Campagnes' },
  '/production': { title: 'Suivi production' },
  '/recoltes': { title: 'Recoltes' },
  '/agronomie': { title: 'Agronomie' },
  '/marches': { title: 'Marches' },
  '/clients': { title: 'Clients' },
  '/commandes': { title: 'Commandes' },
  '/factures': { title: 'Factures' },
  '/fournisseurs': { title: 'Fournisseurs' },
  '/achats': { title: 'Bons de commande' },
  '/stocks': { title: 'Stocks' },
  '/couts': { title: 'Couts & Budget' },
  '/marges': { title: 'Marges & Rentabilite' },
  '/analytique': { title: 'IA & Previsions' },
  '/alertes': { title: 'Alertes' },
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const page = PAGES[pathname] || { title: 'TomatoPilot' }

  if (pathname === '/login') {
    return null
  }

  const handleSignOut = async () => {
    try {
      setLoggingOut(true)
      const supabase = getSupabaseBrowserClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header
      style={{
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: '#ffffff',
        borderBottom: '1px solid #cce5d4',
        boxShadow: '0 1px 4px rgba(27,58,45,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, color: '#1b3a2d' }}>
        {page.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="chip">Base reelle uniquement</div>
        <Link href="/alertes" style={{ textDecoration: 'none' }}>
          <div className="chip">Centre d&apos;alertes</div>
        </Link>
        {page.href && page.cta && (
          <Link href={page.href} style={{ textDecoration: 'none' }}>
            <button className="btn-secondary">{page.cta}</button>
          </Link>
        )}
        <button className="btn-ghost" onClick={handleSignOut} disabled={loggingOut}>
          {loggingOut ? 'Deconnexion...' : 'Se deconnecter'}
        </button>
      </div>
    </header>
  )
}
