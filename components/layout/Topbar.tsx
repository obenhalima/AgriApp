'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTheme, setTheme } from '@/lib/theme'
import { useState, useEffect } from 'react'

const PAGES: Record<string, { title:string; sub:string; btn?:string; href?:string }> = {
  '/':             { title:'DASHBOARD',      sub:'vue generale · campagne active' },
  '/fermes':       { title:'FERMES & SITES', sub:'exploitation · fermes & blocs',      btn:'+ NEW FERME',       href:'/fermes' },
  '/serres':       { title:'SERRES',         sub:'infrastructure · serres & surfaces',  btn:'+ NEW SERRE',       href:'/serres' },
  '/varietes':     { title:'VARIÉTÉS',       sub:'referentiel · semences & plants',     btn:'+ NEW VARIETE',     href:'/varietes' },
  '/campagnes':    { title:'CAMPAGNES',      sub:'planification · saisons',             btn:'+ NEW CAMPAGNE',    href:'/campagnes' },
  '/production':   { title:'PRODUCTION',     sub:'suivi · rendements & recoltes' },
  '/recoltes':     { title:'RÉCOLTES',       sub:'saisie · lots & qualite',             btn:'+ SAISIR RÉCOLTE',  href:'/recoltes' },
  '/agronomie':    { title:'AGRONOMIE',      sub:'journal · traitements',               btn:'+ INTERVENTION',    href:'/agronomie' },
  '/marches':      { title:'MARCHÉS',        sub:'debouches · export & local',          btn:'+ NEW MARCHÉ',      href:'/marches' },
  '/clients':      { title:'CLIENTS',        sub:'commercial · base clients',           btn:'+ NEW CLIENT',      href:'/clients' },
  '/commandes':    { title:'COMMANDES',      sub:'ventes · commandes clients',          btn:'+ NEW COMMANDE',    href:'/commandes' },
  '/factures':     { title:'FACTURES',       sub:'facturation · encaissements',         btn:'+ NEW FACTURE',     href:'/factures' },
  '/fournisseurs': { title:'FOURNISSEURS',   sub:'achats · base fournisseurs',          btn:'+ NEW FOURNISSEUR', href:'/fournisseurs' },
  '/achats':       { title:'BONS DE COMMANDE', sub:'approvisionnement',                btn:'+ BON DE COMMANDE', href:'/achats' },
  '/stocks':       { title:'STOCKS',         sub:'inventaire · articles',               btn:'+ ARTICLE',         href:'/stocks' },
  '/couts':        { title:'COÛTS & BUDGET', sub:'charges · ventilation',               btn:'+ SAISIR COÛT',     href:'/couts' },
  '/marges':       { title:'MARGES',         sub:'rentabilite · analyse' },
  '/analytique':   { title:'IA & PREVISIONS',sub:'analytics · simulation' },
  '/alertes':      { title:'ALERTES',        sub:'monitoring · notifications' },
}

export function Topbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const page     = PAGES[pathname] || { title:'TOMATOPILOT', sub:'' }

  const [out,   setOut]   = useState(false)
  const [theme, setThemeState] = useState<'dark'|'light'>('dark')

  useEffect(() => {
    setThemeState(getTheme())
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  const logout = async () => {
    setOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header style={{
      height: 'var(--topbar-h)', position: 'sticky', top: 0, zIndex: 40,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-card)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 22px', backdropFilter: 'blur(12px)',
    }}>
      {/* Left */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx-1)', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1 }}>
          {page.title}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--tx-3)', letterSpacing: 1.2, marginTop: 2 }}>
          {page.sub}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-2)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--neon)', boxShadow: '0 0 5px var(--neon)', display: 'inline-block', flexShrink: 0 }} />
          LIVE · 2025-2026
        </div>

        {/* Action page */}
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ fontSize: 11, padding: '7px 13px' }}>{page.btn}</button>
          </Link>
        )}

        {/* ══ TOGGLE THÈME ══ */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          aria-label="Changer le thème"
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </span>
          <div className="theme-toggle-track">
            <div className="theme-toggle-thumb" />
          </div>
          <span className="theme-toggle-label">
            {theme === 'dark' ? 'DARK' : 'LIGHT'}
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          disabled={out}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 11px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--tx-3)',
            fontFamily: 'var(--font-mono)', fontSize: 9.5,
            cursor: 'pointer', letterSpacing: .8, transition: 'all .15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--red)'; (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--tx-3)' }}
        >
          {out ? '...' : '⏻ LOGOUT'}
        </button>
      </div>
    </header>
  )
}
