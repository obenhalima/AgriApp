'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard & KPIs',
  '/serres': 'Fermes & Serres',
  '/varietes': 'Référentiel Variétés',
  '/campagnes': 'Campagnes de Production',
  '/production': 'Suivi de Production',
  '/recoltes': 'Saisie Récoltes',
  '/agronomie': 'Journal Agronomique',
  '/marches': 'Marchés & Prix',
  '/clients': 'Base Clients',
  '/commandes': 'Commandes & Livraisons',
  '/factures': 'Factures Clients',
  '/fournisseurs': 'Base Fournisseurs',
  '/achats': 'Bons de Commande',
  '/stocks': 'Gestion des Stocks',
  '/couts': 'Coûts & Budget',
  '/marges': 'Marges & Rentabilité',
  '/analytique': 'IA & Prévisions',
  '/alertes': "Centre d'Alertes",
}

export function Topbar() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] || 'TomatoPilot'

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-6"
      style={{
        height: '58px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="font-display font-bold text-[17px]">{title}</h1>
        <span className="text-xs text-[#4a5568]">Domaine Souss Agri › {title}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <Link href="/alertes" className="w-[34px] h-[34px] rounded-lg border border-[#30363d] bg-[#1c2333] text-[#8b949e] flex items-center justify-center text-sm hover:bg-[#232c3d] hover:text-[#e6edf3] transition-colors">
            🔔
          </Link>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f85149] text-white text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </div>
        <select className="text-xs px-2 py-1.5 bg-[#1c2333] border border-[#30363d] rounded-lg text-[#8b949e] outline-none">
          <option>Campagne 2025-2026</option>
          <option>Campagne 2024-2025</option>
        </select>
      </div>
    </header>
  )
}
