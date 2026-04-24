'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getTheme, setTheme } from '@/lib/theme'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'

const PAGES: Record<string, { title:string; icon:string; sub:string; btn?:string; href?:string }> = {
  '/':             { title:'Dashboard',       icon:'📊', sub:'vue générale · campagne active' },
  '/fermes':       { title:'Fermes & Sites',  icon:'🏭', sub:'exploitation',    btn:'+ Ferme',       href:'/fermes' },
  '/serres':       { title:'Serres',          icon:'🏗️', sub:'infrastructure',  btn:'+ Serre',       href:'/serres' },
  '/varietes':     { title:'Variétés',        icon:'🧬', sub:'référentiel',     btn:'+ Variété',     href:'/varietes' },
  '/campagnes':    { title:'Campagnes',       icon:'📅', sub:'planification',   btn:'+ Campagne',    href:'/campagnes' },
  '/production':   { title:'Production',      icon:'⚙️', sub:'rendements & plantations' },
  '/recoltes':     { title:'Récoltes',        icon:'🌿', sub:'lots & qualité',  btn:'+ Récolte',     href:'/recoltes' },
  '/agronomie':    { title:'Agronomie',       icon:'🔬', sub:'journal cultural',btn:'+ Intervention',href:'/agronomie' },
  '/marches':      { title:'Marchés',         icon:'🌍', sub:'débouchés',       btn:'+ Marché',      href:'/marches' },
  '/clients':      { title:'Clients',         icon:'🤝', sub:'commercial',      btn:'+ Client',      href:'/clients' },
  '/commandes':    { title:'Commandes',       icon:'📋', sub:'ventes',          btn:'+ Commande',    href:'/commandes' },
  '/factures':     { title:'Factures',        icon:'🧾', sub:'facturation',     btn:'+ Facture',     href:'/factures' },
  '/fournisseurs': { title:'Fournisseurs',    icon:'🏢', sub:'achats',          btn:'+ Fournisseur', href:'/fournisseurs' },
  '/achats':       { title:'Bons de commande',icon:'🛒', sub:'approvisionnement',btn:'+ Bon',        href:'/achats' },
  '/stocks':       { title:'Stocks',          icon:'📦', sub:'inventaire',      btn:'+ Article',     href:'/stocks' },
  '/couts':        { title:'Coûts & Budget',  icon:'💰', sub:'charges',         btn:'+ Coût',        href:'/couts' },
  '/marges':       { title:'Marges',          icon:'📈', sub:'rentabilité' },
  '/analytique':   { title:'IA & Prévisions', icon:'🤖', sub:'analytics & simulation' },
  '/alertes':      { title:'Alertes',         icon:'🔔', sub:'monitoring' },
}

export function Topbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { profile, role, signOut } = useAuth()
  const page     = PAGES[pathname] || { title:'Domaine BENHALIMA', icon:'🍅', sub:'' }
  const [out,   setOut]        = useState(false)
  const [theme, setThemeState] = useState<'dark'|'light'>('dark')

  useEffect(() => { setThemeState(getTheme()) }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); setThemeState(next)
  }
  const logout = async () => { setOut(true); await signOut(); router.replace('/login') }

  return (
    <header style={{
      height: 'var(--topbar-h)', position: 'sticky', top: 0, zIndex: 40,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: '0 1px 0 var(--border), 0 2px 8px rgba(0,0,0,.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', transition: 'background .3s',
    }}>
      {/* Left */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18, lineHeight:1 }}>{page.icon}</span>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:800, color:'var(--tx-1)', letterSpacing:-.3, lineHeight:1 }}>{page.title}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--tx-3)', letterSpacing:.8, marginTop:2 }}>{page.sub}</div>
        </div>
      </div>

      {/* Right */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Live badge */}
        <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.2)', fontFamily:'var(--font-mono)', fontSize:9.5, color:'#059669', fontWeight:600 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'pulse 2s infinite' }} />
          LIVE · 2025-2026
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

        {/* Action page */}
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ fontSize:11.5, padding:'7px 14px' }}>{page.btn}</button>
          </Link>
        )}

        {/* Toggle thème */}
        <button onClick={toggleTheme} className="theme-toggle" title={theme==='dark'?'Passer en clair':'Passer en sombre'}>
          <span style={{ fontSize:13 }}>{theme==='dark'?'🌙':'☀️'}</span>
          <div className="theme-toggle-track"><div className="theme-toggle-thumb"/></div>
          <span className="theme-toggle-label">{theme==='dark'?'DARK':'LIGHT'}</span>
        </button>

        {/* User badge */}
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'color-mix(in srgb, var(--neon) 25%, transparent)', color: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              {(profile.full_name ?? profile.email).slice(0, 1).toUpperCase()}
            </div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-1)', fontWeight: 600 }}>{profile.full_name ?? profile.email}</div>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {role?.name ?? 'Sans rôle'}
              </div>
            </div>
          </div>
        )}

        {/* Logout */}
        <button onClick={logout} disabled={out} className="btn-ghost" style={{ fontSize:10.5, padding:'6px 11px' }}>
          {out?'…':'⏻ Logout'}
        </button>
      </div>
    </header>
  )
}
