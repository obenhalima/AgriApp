'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href: '/', icon: '📊', label: 'Dashboard' }] },
  {
    section: 'Exploitation',
    items: [
      { href: '/serres', icon: '🏗️', label: 'Fermes & Serres' },
      { href: '/varietes', icon: '🌱', label: 'Variétés' },
      { href: '/campagnes', icon: '📅', label: 'Campagnes' },
    ],
  },
  {
    section: 'Production',
    items: [
      { href: '/production', icon: '📈', label: 'Suivi Production' },
      { href: '/recoltes', icon: '🍅', label: 'Récoltes' },
      { href: '/agronomie', icon: '🧪', label: 'Agronomie' },
    ],
  },
  {
    section: 'Commerce',
    items: [
      { href: '/marches', icon: '🌍', label: 'Marchés' },
      { href: '/clients', icon: '👥', label: 'Clients' },
      { href: '/commandes', icon: '📋', label: 'Commandes' },
      { href: '/factures', icon: '🧾', label: 'Factures' },
    ],
  },
  {
    section: 'Achats',
    items: [
      { href: '/fournisseurs', icon: '🏭', label: 'Fournisseurs' },
      { href: '/achats', icon: '🛒', label: 'Bons de Commande' },
      { href: '/stocks', icon: '📦', label: 'Stocks' },
    ],
  },
  {
    section: 'Finances',
    items: [
      { href: '/couts', icon: '💰', label: 'Coûts & Budget' },
      { href: '/marges', icon: '📉', label: 'Marges' },
    ],
  },
  {
    section: 'Analytique',
    items: [
      { href: '/analytique', icon: '🤖', label: 'IA & Prévisions' },
      { href: '/alertes', icon: '🔔', label: 'Alertes' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto"
      style={{
        width: '240px',
        background: '#161b22',
        borderRight: '1px solid #30363d',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 p-4 border-b border-[#30363d]">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #e05c3b, #c0392b)',
            boxShadow: '0 0 14px rgba(224,92,59,0.35)',
          }}
        >
          🍅
        </div>
        <div className="font-display font-extrabold text-base">
          Tomato<span className="text-[#f07050]">Pilot</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-2">
        {NAV.map((group, gi) => (
          <div key={gi} className="px-2.5 mb-1">
            {group.section && (
              <div className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-widest px-2.5 py-1.5">
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item mb-0.5 ${isActive ? 'nav-item-active' : ''}`}
                >
                  <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                  <span className="text-[13.5px]">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="p-3 border-t border-[#30363d]">
        <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#1c2333] cursor-pointer transition-colors">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #e05c3b, #a371f7)' }}
          >
            AH
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Ahmed Hassani</div>
            <div className="text-[11px] text-[#4a5568]">Administrateur</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
