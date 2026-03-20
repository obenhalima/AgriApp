'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/serres': 'Serres & Fermes',
  '/varietes': 'Variétés',
  '/campagnes': 'Campagnes',
  '/production': 'Suivi Production',
  '/recoltes': 'Saisie Récoltes',
  '/agronomie': 'Journal Agronomique',
  '/marches': 'Marchés',
  '/clients': 'Clients',
  '/commandes': 'Commandes',
  '/factures': 'Factures',
  '/fournisseurs': 'Fournisseurs',
  '/achats': 'Commandes Achat',
  '/stocks': 'Stocks',
  '/couts': 'Coûts & Budget',
  '/marges': 'Marges',
  '/analytique': 'IA & Prévisions',
  '/alertes': 'Alertes',
}

export function Topbar() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] || 'TomatoPilot'
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6"
      style={{ height: 58, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: 'var(--text-main)' }}>
          {title}
        </h1>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Domaine Souss Agri › {title}
        </span>
        {isDemo && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(200,136,42,0.15)', color: 'var(--ochre)', border: '1px solid rgba(200,136,42,0.3)' }}>
            MODE DÉMO
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <Link href="/alertes"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-colors"
            style={{ background: 'var(--straw)', border: '1px solid var(--border-dark)', color: 'var(--text-sub)' }}>
            🔔
          </Link>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ background: 'var(--rust)' }}>
            3
          </span>
        </div>
        <select className="text-xs px-3 py-1.5 rounded-xl outline-none"
          style={{ background: 'var(--straw)', border: '1px solid var(--border-dark)', color: 'var(--text-sub)' }}>
          <option>Campagne 2025-2026</option>
          <option>Campagne 2024-2025</option>
        </select>
      </div>
    </header>
  )
}
