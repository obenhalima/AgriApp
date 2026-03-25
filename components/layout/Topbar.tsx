'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const PAGES: Record<string, { title:string; sub:string; btn?:string; href?:string }> = {
  '/':             { title:'DASHBOARD',       sub:'vue generale · campagne active' },
  '/fermes':       { title:'FERMES & SITES',  sub:'exploitation · fermes & blocs',     btn:'+ NEW FERME',        href:'/fermes' },
  '/serres':       { title:'SERRES',          sub:'infrastructure · serres & surfaces', btn:'+ NEW SERRE',        href:'/serres' },
  '/varietes':     { title:'VARIETES',        sub:'referentiel · semences & plants',   btn:'+ NEW VARIETE',      href:'/varietes' },
  '/campagnes':    { title:'CAMPAGNES',       sub:'planification · saisons',           btn:'+ NEW CAMPAGNE',     href:'/campagnes' },
  '/production':   { title:'PRODUCTION',      sub:'suivi · rendements & recoltes' },
  '/recoltes':     { title:'RECOLTES',        sub:'saisie · lots & qualite',           btn:'+ RECOLTE',          href:'/recoltes' },
  '/agronomie':    { title:'AGRONOMIE',       sub:'journal · traitements',             btn:'+ INTERVENTION',     href:'/agronomie' },
  '/marches':      { title:'MARCHES',         sub:'debouches · export & local',        btn:'+ NEW MARCHE',       href:'/marches' },
  '/clients':      { title:'CLIENTS',         sub:'commercial · base clients',         btn:'+ NEW CLIENT',       href:'/clients' },
  '/commandes':    { title:'COMMANDES',       sub:'ventes · commandes clients',        btn:'+ NEW COMMANDE',     href:'/commandes' },
  '/factures':     { title:'FACTURES',        sub:'facturation · encaissements',       btn:'+ NEW FACTURE',      href:'/factures' },
  '/fournisseurs': { title:'FOURNISSEURS',    sub:'achats · base fournisseurs',        btn:'+ NEW FOURNISSEUR',  href:'/fournisseurs' },
  '/achats':       { title:'BONS DE COMMANDE',sub:'approvisionnement',                btn:'+ BON DE COMMANDE',  href:'/achats' },
  '/stocks':       { title:'STOCKS',          sub:'inventaire · articles',             btn:'+ ARTICLE',          href:'/stocks' },
  '/couts':        { title:'COUTS & BUDGET',  sub:'charges · ventilation',             btn:'+ SAISIR COUT',      href:'/couts' },
  '/marges':       { title:'MARGES',          sub:'rentabilite · analyse' },
  '/analytique':   { title:'IA & PREVISIONS', sub:'analytics · simulation' },
  '/alertes':      { title:'ALERTES',         sub:'monitoring · notifications' },
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const page = PAGES[pathname] || { title:'TOMATOPILOT', sub:'' }
  const [out, setOut] = useState(false)

  const logout = async () => {
    setOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header style={{ height:52, position:'sticky', top:0, zIndex:40, background:'rgba(5,13,9,.96)', backdropFilter:'blur(12px)', borderBottom:'1px solid #1a3526', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px' }}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div>
          <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:15,fontWeight:700,color:'#e8f5ee',letterSpacing:1.2,textTransform:'uppercase',lineHeight:1}}>{page.title}</div>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#3d6b52',letterSpacing:1.2,marginTop:2}}>{page.sub}</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:'#0a1810',border:'1px solid #1a3526',borderRadius:5,fontFamily:'DM Mono,monospace',fontSize:9.5,color:'#7aab90',letterSpacing:.5}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:'#00e87a',boxShadow:'0 0 5px #00e87a',display:'inline-block'}}/>
          LIVE · 2025-2026
        </div>
        {page.btn && page.href && (
          <Link href={page.href} style={{textDecoration:'none'}}>
            <button className="btn-primary" style={{fontSize:11,padding:'7px 14px',letterSpacing:.8}}>{page.btn}</button>
          </Link>
        )}
        <button onClick={logout} disabled={out}
          style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',background:'transparent',border:'1px solid #1a3526',borderRadius:6,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:9.5,cursor:'pointer',letterSpacing:.8,transition:'all .15s'}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#ff4d6d';(e.currentTarget as HTMLElement).style.color='#ff4d6d'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1a3526';(e.currentTarget as HTMLElement).style.color='#3d6b52'}}>
          {out?'...':'⏻ LOGOUT'}
        </button>
      </div>
    </header>
  )
}
