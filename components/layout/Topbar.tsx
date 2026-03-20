'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TITLES: Record<string, { title: string; action: string; href: string }> = {
  '/':            { title:'Tableau de bord', action:'+ Saisir recolte', href:'/recoltes' },
  '/serres':      { title:'Serres', action:'+ Nouvelle serre', href:'/serres' },
  '/varietes':    { title:'Varietes', action:'+ Nouvelle variete', href:'/varietes' },
  '/campagnes':   { title:'Campagnes', action:'+ Nouvelle campagne', href:'/campagnes' },
  '/production':  { title:'Suivi production', action:'+ Saisir production', href:'/production' },
  '/recoltes':    { title:'Recoltes', action:'+ Saisir recolte', href:'/recoltes' },
  '/agronomie':   { title:'Agronomie', action:'+ Intervention', href:'/agronomie' },
  '/marches':     { title:'Marches', action:'+ Nouveau marche', href:'/marches' },
  '/clients':     { title:'Clients', action:'+ Nouveau client', href:'/clients' },
  '/commandes':   { title:'Commandes', action:'+ Nouvelle commande', href:'/commandes' },
  '/factures':    { title:'Factures', action:'+ Nouvelle facture', href:'/factures' },
  '/fournisseurs':{ title:'Fournisseurs', action:'+ Nouveau fournisseur', href:'/fournisseurs' },
  '/achats':      { title:'Bons de commande', action:'+ Bon de commande', href:'/achats' },
  '/stocks':      { title:'Stocks', action:'+ Mouvement stock', href:'/stocks' },
  '/couts':       { title:'Couts & Budget', action:'+ Saisir cout', href:'/couts' },
  '/marges':      { title:'Marges', action:'', href:'' },
  '/analytique':  { title:'IA & Previsions', action:'', href:'' },
  '/alertes':     { title:'Alertes', action:'', href:'' },
}

export function Topbar() {
  const pathname = usePathname()
  const page = TITLES[pathname] || { title: 'TomatoPilot', action: '', href: '' }
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6"
      style={{ height:52, background:'#fff', borderBottom:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(27,58,45,0.06)' }}>
      <div>
        <h1 style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700, color:'var(--text)' }}>{page.title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="chip">🌱 Campagne 2025-2026</div>
        <Link href="/alertes" className="chip" style={{ background:'#fce4e5', borderColor:'#fcc', color:'#9b1d1d' }}>
          ⚠ 3 alertes
        </Link>
        {page.action && (
          <Link href={page.href}>
            <button className="btn-primary" style={{ fontSize:12, padding:'6px 14px' }}>
              {page.action}
            </button>
          </Link>
        )}
      </div>
    </header>
  )
}
