'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTheme, setTheme } from '@/lib/theme'
import { useState, useEffect } from 'react'

const PAGES: Record<string, { title:string; sub:string; btn?:string; href?:string }> = {
  '/':             { title:'Dashboard',        sub:'vue générale · campagne active' },
  '/fermes':       { title:'Fermes & Sites',   sub:'exploitation',       btn:'+ Ferme',       href:'/fermes' },
  '/serres':       { title:'Serres',           sub:'infrastructure',     btn:'+ Serre',       href:'/serres' },
  '/varietes':     { title:'Variétés',         sub:'référentiel',        btn:'+ Variété',     href:'/varietes' },
  '/campagnes':    { title:'Campagnes',        sub:'planification',      btn:'+ Campagne',    href:'/campagnes' },
  '/production':   { title:'Production',       sub:'rendements' },
  '/recoltes':     { title:'Récoltes',         sub:'lots & qualité',     btn:'+ Récolte',     href:'/recoltes' },
  '/agronomie':    { title:'Agronomie',        sub:'journal cultural',   btn:'+ Intervention',href:'/agronomie' },
  '/marches':      { title:'Marchés',          sub:'débouchés',          btn:'+ Marché',      href:'/marches' },
  '/clients':      { title:'Clients',          sub:'commercial',         btn:'+ Client',      href:'/clients' },
  '/commandes':    { title:'Commandes',        sub:'ventes',             btn:'+ Commande',    href:'/commandes' },
  '/factures':     { title:'Factures',         sub:'facturation',        btn:'+ Facture',     href:'/factures' },
  '/fournisseurs': { title:'Fournisseurs',     sub:'achats',             btn:'+ Fournisseur', href:'/fournisseurs' },
  '/achats':       { title:'Bons de commande', sub:'approvisionnement',  btn:'+ Bon',         href:'/achats' },
  '/stocks':       { title:'Stocks',           sub:'inventaire',         btn:'+ Article',     href:'/stocks' },
  '/couts':        { title:'Coûts & Budget',   sub:'charges',            btn:'+ Coût',        href:'/couts' },
  '/marges':       { title:'Marges',           sub:'rentabilité' },
  '/analytique':   { title:'IA & Prévisions',  sub:'analytics' },
  '/alertes':      { title:'Alertes',          sub:'monitoring' },
}

export function Topbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const page     = PAGES[pathname] || { title:'TomatoPilot', sub:'' }
  const [out,   setOut]   = useState(false)
  const [theme, setThemeState] = useState<'dark'|'light'>('dark')

  useEffect(() => { setThemeState(getTheme()) }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); setThemeState(next)
  }

  const logout = async () => {
    setOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header style={{
      height:'var(--topbar-h)', position:'sticky', top:0, zIndex:40,
      background:'var(--bg-card)',
      borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 22px',
      backdropFilter:'blur(20px)',
      WebkitBackdropFilter:'blur(20px)',
      transition:'all .3s',
    }}>
      {/* Ligne décorative top */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,var(--neon),transparent)', opacity:.3 }} />

      {/* Left */}
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:800, color:'var(--tx-1)', letterSpacing:-.2, lineHeight:1 }}>
          {page.title}
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--tx-3)', letterSpacing:1, marginTop:2 }}>
          {page.sub}
        </div>
      </div>

      {/* Right */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Status */}
        <div style={{
          display:'flex', alignItems:'center', gap:6, padding:'5px 12px',
          background:'var(--neon-dim)', border:'1px solid color-mix(in srgb,var(--neon) 25%,transparent)',
          borderRadius:20, fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--neon)',
          backdropFilter:'blur(8px)',
        }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--neon)', boxShadow:'0 0 6px var(--neon)', display:'inline-block', animation:'pulse 2s infinite' }} />
          LIVE · 2025-2026
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

        {/* Action page */}
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ fontSize:11.5, padding:'7px 14px' }}>{page.btn}</button>
          </Link>
        )}

        {/* Toggle thème */}
        <button onClick={toggleTheme} className="theme-toggle"
          title={theme==='dark'?'Mode clair':'Mode sombre'}
          aria-label="Changer le thème">
          <span style={{ fontSize:14, lineHeight:1 }}>{theme==='dark'?'🌙':'☀️'}</span>
          <div className="theme-toggle-track">
            <div className="theme-toggle-thumb" />
          </div>
          <span className="theme-toggle-label">{theme==='dark'?'DARK':'LIGHT'}</span>
        </button>

        {/* Logout */}
        <button onClick={logout} disabled={out} className="btn-ghost"
          style={{ fontSize:10.5, padding:'6px 12px', letterSpacing:.5 }}>
          {out?'...':'⏻ Logout'}
        </button>
      </div>
    </header>
  )
}
