'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href: '/', label: 'Tableau de bord' }] },
  { section: 'Exploitation', items: [
    { href: '/serres', label: 'Serres' },
    { href: '/varietes', label: 'Variétés' },
    { href: '/campagnes', label: 'Campagnes' },
  ]},
  { section: 'Production', items: [
    { href: '/production', label: 'Suivi production' },
    { href: '/recoltes', label: 'Récoltes' },
    { href: '/agronomie', label: 'Agronomie' },
  ]},
  { section: 'Commerce', items: [
    { href: '/marches', label: 'Marchés' },
    { href: '/clients', label: 'Clients' },
    { href: '/commandes', label: 'Commandes' },
    { href: '/factures', label: 'Factures' },
  ]},
  { section: 'Achats', items: [
    { href: '/fournisseurs', label: 'Fournisseurs' },
    { href: '/achats', label: 'Bons de commande' },
    { href: '/stocks', label: 'Stocks' },
  ]},
  { section: 'Finances', items: [
    { href: '/couts', label: 'Coûts & Budget' },
    { href: '/marges', label: 'Marges' },
    { href: '/analytique', label: 'IA & Prévisions' },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto"
      style={{ width: 200, background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="w-8 h-8 flex items-center justify-center text-base flex-shrink-0"
          style={{ background: '#40916c', borderRadius: '50% 8px 50% 8px' }}>
          🌿
        </div>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 14, color: '#fff' }}>TomatoPilot</div>
          <div style={{ fontSize: 10, color: '#74c69d', fontWeight: 600 }}>Souss Agri</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-2">
        {NAV.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.section && (
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '1.2px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', padding: '8px 16px 3px' }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', opacity: .7, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5 }}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#40916c', fontSize: 10, fontWeight: 700, color: '#fff' }}>
            AH
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Ahmed Hassani</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Administrateur</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
