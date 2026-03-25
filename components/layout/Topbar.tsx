'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const PAGES: Record<string, { title: string; btn?: string; href?: string }> = {
  '/':             { title: 'Tableau de bord' },
  '/serres':       { title: 'Serres', btn: '+ Nouvelle serre', href: '/serres' },
  '/varietes':     { title: 'Varietes', btn: '+ Nouvelle variete', href: '/varietes' },
  '/campagnes':    { title: 'Campagnes', btn: '+ Nouvelle campagne', href: '/campagnes' },
  '/production':   { title: 'Suivi production' },
  '/recoltes':     { title: 'Recoltes', btn: '+ Saisir recolte', href: '/recoltes' },
  '/agronomie':    { title: 'Agronomie', btn: '+ Intervention', href: '/agronomie' },
  '/marches':      { title: 'Marches', btn: '+ Nouveau marche', href: '/marches' },
  '/clients':      { title: 'Clients', btn: '+ Nouveau client', href: '/clients' },
  '/commandes':    { title: 'Commandes', btn: '+ Nouvelle commande', href: '/commandes' },
  '/factures':     { title: 'Factures', btn: '+ Nouvelle facture', href: '/factures' },
  '/fournisseurs': { title: 'Fournisseurs', btn: '+ Nouveau fournisseur', href: '/fournisseurs' },
  '/achats':       { title: 'Bons de commande', btn: '+ Bon de commande', href: '/achats' },
  '/stocks':       { title: 'Stocks', btn: '+ Article / Mouvement', href: '/stocks' },
  '/couts':        { title: 'Couts & Budget', btn: '+ Saisir cout', href: '/couts' },
  '/marges':       { title: 'Marges & Rentabilite' },
  '/analytique':   { title: 'IA & Previsions' },
  '/alertes':      { title: 'Alertes' },
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const page = PAGES[pathname] || { title: 'TomatoPilot' }
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    localStorage.removeItem('tp_mode')
    router.replace('/login')
  }

  return (
    <header style={{ height:52, position:'sticky', top:0, zIndex:40, background:'#ffffff', borderBottom:'1px solid #cce5d4', boxShadow:'0 1px 4px rgba(27,58,45,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px' }}>
      <div style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700, color:'#1b3a2d' }}>{page.title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {/* Campagne badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:20, background:'#d8f3dc', border:'1px solid #b7e4c7', color:'#1b4332', fontSize:11.5, fontWeight:600 }}>
          🌱 Campagne 2025-2026
        </div>
        {/* Bouton action page */}
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration:'none' }}>
            <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'#2d6a4f', color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              {page.btn}
            </button>
          </Link>
        )}
        {/* Déconnexion */}
        <button onClick={logout} disabled={loggingOut}
          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid #cce5d4', background:'#f4f9f4', color:'#5a7a66', fontSize:12, fontWeight:500, cursor:'pointer' }}>
          {loggingOut ? '...' : '⏻ Déconnexion'}
        </button>
      </div>
    </header>
  )
}
