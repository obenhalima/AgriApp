'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href: '/', icon: '🌿', label: 'Tableau de bord' }] },
  {
    section: 'Exploitation',
    items: [
      { href: '/serres',    icon: '🏡', label: 'Serres & Fermes' },
      { href: '/varietes',  icon: '🌱', label: 'Variétés' },
      { href: '/campagnes', icon: '📆', label: 'Campagnes' },
    ],
  },
  {
    section: 'Production',
    items: [
      { href: '/production', icon: '📈', label: 'Suivi Récoltes' },
      { href: '/recoltes',   icon: '🍅', label: 'Saisie Récoltes' },
      { href: '/agronomie',  icon: '🧑‍🌾', label: 'Agronomie' },
    ],
  },
  {
    section: 'Commerce',
    items: [
      { href: '/marches',   icon: '🌍', label: 'Marchés' },
      { href: '/clients',   icon: '🤝', label: 'Clients' },
      { href: '/commandes', icon: '📋', label: 'Commandes' },
      { href: '/factures',  icon: '🧾', label: 'Factures' },
    ],
  },
  {
    section: 'Achats',
    items: [
      { href: '/fournisseurs', icon: '🏭', label: 'Fournisseurs' },
      { href: '/achats',       icon: '🛒', label: 'Commandes Achat' },
      { href: '/stocks',       icon: '📦', label: 'Stocks' },
    ],
  },
  {
    section: 'Finances',
    items: [
      { href: '/couts',  icon: '💰', label: 'Coûts & Budget' },
      { href: '/marges', icon: '📊', label: 'Marges' },
    ],
  },
  {
    section: 'Analytique',
    items: [
      { href: '/analytique', icon: '🤖', label: 'IA & Prévisions' },
      { href: '/alertes',    icon: '🔔', label: 'Alertes' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto"
      style={{ width: '240px', background: 'var(--bg-sidebar)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'rgba(245,230,192,0.1)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #d94535, #a83020)', boxShadow: '0 3px 10px rgba(217,69,53,0.4)' }}>
          🍅
        </div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16, color: 'var(--straw)' }}>
            TomatoPilot
          </div>
          <div style={{ fontSize: 10, color: 'rgba(245,230,192,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Gestion Agricole
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-3 px-3 overflow-y-auto">
        {NAV.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.section && (
              <div className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase"
                style={{ color: 'rgba(245,230,192,0.3)' }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`nav-item ${isActive ? 'nav-item-active' : ''}`}>
                  <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                  <span style={{ fontSize: 13.5 }}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Season indicator */}
      <div className="mx-3 mb-3 p-3 rounded-xl" style={{ background: 'rgba(90,122,53,0.15)', border: '1px solid rgba(90,122,53,0.25)' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--lime)' }}>
          🌿 Campagne Active
        </div>
        <div className="text-sm font-semibold" style={{ color: 'var(--straw)' }}>2025 – 2026</div>
        <div className="mt-2 h-1 rounded-full" style={{ background: 'rgba(245,230,192,0.15)' }}>
          <div className="h-full rounded-full" style={{ width: '61%', background: 'linear-gradient(90deg, var(--leaf), var(--lime))' }} />
        </div>
        <div className="text-[10px] mt-1" style={{ color: 'rgba(245,230,192,0.4)' }}>61% — En cours</div>
      </div>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: 'rgba(245,230,192,0.1)' }}>
        <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #d94535, #7aab45)' }}>
            AH
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--straw)' }}>Ahmed Hassani</div>
            <div className="text-[11px]" style={{ color: 'rgba(245,230,192,0.35)' }}>Administrateur</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
