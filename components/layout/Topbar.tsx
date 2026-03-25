'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const PAGES: Record<string, { title:string; sub:string; btn?:string; href?:string }> = {
  '/':             { title:'DASHBOARD',      sub:'vue generale · campagne 2025-2026' },
  '/serres':       { title:'SERRES',         sub:'infrastructure · serres & blocs', btn:'+ NEW SERRE', href:'/serres' },
  '/varietes':     { title:'VARIETES',       sub:'referentiel · semences & plants', btn:'+ NEW VARIETE', href:'/varietes' },
  '/campagnes':    { title:'CAMPAGNES',      sub:'planification · saisons de production', btn:'+ NEW CAMPAGNE', href:'/campagnes' },
  '/production':   { title:'PRODUCTION',     sub:'suivi · rendements & recoltes' },
  '/recoltes':     { title:'RECOLTES',       sub:'saisie · lots & qualite', btn:'+ RECOLTE', href:'/recoltes' },
  '/agronomie':    { title:'AGRONOMIE',      sub:'journal · traitements & irrigation', btn:'+ INTERVENTION', href:'/agronomie' },
  '/marches':      { title:'MARCHES',        sub:'debouches · export & local', btn:'+ NEW MARCHE', href:'/marches' },
  '/clients':      { title:'CLIENTS',        sub:'commercial · base clients', btn:'+ NEW CLIENT', href:'/clients' },
  '/commandes':    { title:'COMMANDES',      sub:'ventes · commandes clients', btn:'+ NEW COMMANDE', href:'/commandes' },
  '/factures':     { title:'FACTURES',       sub:'facturation · encaissements', btn:'+ NEW FACTURE', href:'/factures' },
  '/fournisseurs': { title:'FOURNISSEURS',   sub:'achats · base fournisseurs', btn:'+ NEW FOURNISSEUR', href:'/fournisseurs' },
  '/achats':       { title:'ACHATS',         sub:'approvisionnement · bons de commande', btn:'+ BON DE COMMANDE', href:'/achats' },
  '/stocks':       { title:'STOCKS',         sub:'inventaire · articles & mouvements', btn:'+ ARTICLE', href:'/stocks' },
  '/couts':        { title:'COUTS',          sub:'budget · charges & ventilation', btn:'+ SAISIR COUT', href:'/couts' },
  '/marges':       { title:'MARGES',         sub:'rentabilite · analyse financiere' },
  '/analytique':   { title:'IA & PREVISIONS',sub:'analytics · simulation & forecast' },
  '/alertes':      { title:'ALERTES',        sub:'monitoring · notifications actives' },
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const page = PAGES[pathname] || { title:'TOMATOPILOT', sub:'' }
  const [out, setOut] = useState(false)

  const logout = async () => {
    setOut(true)
    await supabase.auth.signOut()
    localStorage.removeItem('tp_mode')
    router.replace('/login')
  }

  return (
    <header style={{
      height:54, position:'sticky', top:0, zIndex:40,
      background:'rgba(5,13,9,.95)',
      backdropFilter:'blur(12px)',
      borderBottom:'1px solid #1a3526',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 24px',
    }}>
      {/* Left */}
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div>
          <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:16, fontWeight:700, color:'#e8f5ee', letterSpacing:1.2, textTransform:'uppercase', lineHeight:1 }}>{page.title}</div>
          <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:1.5, marginTop:2 }}>{page.sub}</div>
        </div>
      </div>

      {/* Right */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Status badge */}
        <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'#0a1810', border:'1px solid #1a3526', borderRadius:5, fontFamily:'DM Mono,monospace', fontSize:10, color:'#7aab90' }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#00e87a', boxShadow:'0 0 6px #00e87a', display:'inline-block' }} />
          LIVE · 2025-2026
        </div>

        {/* Action button */}
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ fontSize:11, padding:'7px 14px', letterSpacing:1 }}>
              {page.btn}
            </button>
          </Link>
        )}

        {/* Logout */}
        <button onClick={logout} disabled={out}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'transparent', border:'1px solid #1a3526', borderRadius:6, color:'#3d6b52', fontFamily:'DM Mono,monospace', fontSize:10, cursor:'pointer', letterSpacing:1, transition:'all .15s' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#ff4d6d';(e.currentTarget as HTMLElement).style.color='#ff4d6d'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1a3526';(e.currentTarget as HTMLElement).style.color='#3d6b52'}}>
          {out ? '...' : '⏻ LOGOUT'}
        </button>
      </div>
    </header>
  )
}
