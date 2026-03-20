'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PAGES: Record<string, { title: string; btn?: string; href?: string }> = {
  '/':            { title: 'Tableau de bord',     btn: '+ Saisir recolte',      href: '/recoltes' },
  '/serres':      { title: 'Serres',               btn: '+ Nouvelle serre',      href: '/serres' },
  '/varietes':    { title: 'Varietes',             btn: '+ Nouvelle variete',    href: '/varietes' },
  '/campagnes':   { title: 'Campagnes',            btn: '+ Nouvelle campagne',   href: '/campagnes' },
  '/production':  { title: 'Suivi production',     btn: '+ Saisir production',   href: '/production' },
  '/recoltes':    { title: 'Recoltes',             btn: '+ Nouvelle recolte',    href: '/recoltes' },
  '/agronomie':   { title: 'Agronomie',            btn: '+ Intervention',        href: '/agronomie' },
  '/marches':     { title: 'Marches',              btn: '+ Nouveau marche',      href: '/marches' },
  '/clients':     { title: 'Clients',              btn: '+ Nouveau client',      href: '/clients' },
  '/commandes':   { title: 'Commandes',            btn: '+ Nouvelle commande',   href: '/commandes' },
  '/factures':    { title: 'Factures',             btn: '+ Nouvelle facture',    href: '/factures' },
  '/fournisseurs':{ title: 'Fournisseurs',         btn: '+ Nouveau fournisseur', href: '/fournisseurs' },
  '/achats':      { title: 'Bons de commande',     btn: '+ Bon de commande',     href: '/achats' },
  '/stocks':      { title: 'Stocks',               btn: '+ Mouvement stock',     href: '/stocks' },
  '/couts':       { title: 'Couts & Budget',       btn: '+ Saisir cout',         href: '/couts' },
  '/marges':      { title: 'Marges & Rentabilite' },
  '/analytique':  { title: 'IA & Previsions' },
  '/alertes':     { title: 'Alertes' },
}

export function Topbar() {
  const pathname = usePathname()
  const page = PAGES[pathname] || { title: 'TomatoPilot' }
  return (
    <header style={{
      height: 52, position: 'sticky', top: 0, zIndex: 40,
      background: '#ffffff', borderBottom: '1px solid #cce5d4',
      boxShadow: '0 1px 4px rgba(27,58,45,0.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      <div style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700, color:'#1b3a2d' }}>
        {page.title}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div className="chip">🌱 Campagne 2025-2026</div>
        <Link href="/alertes" style={{ textDecoration:'none' }}>
          <div className="chip" style={{ background:'#fce4e5', borderColor:'#fcc', color:'#9b1d1d' }}>
            ⚠ 3 alertes
          </div>
        </Link>
        {page.btn && page.href && (
          <Link href={page.href} style={{ textDecoration:'none' }}>
            <button className="btn-primary">
              {page.btn}
            </button>
          </Link>
        )}
      </div>
    </header>
  )
}
