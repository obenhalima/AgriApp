'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/serres': 'Serres & Infrastructure',
  '/varietes': 'Référentiel Variétés',
  '/campagnes': 'Campagnes de Production',
  '/production': 'Suivi de Production',
  '/recoltes': 'Récoltes',
  '/agronomie': 'Journal Agronomique',
  '/marches': 'Marchés & Débouchés',
  '/clients': 'Base Clients',
  '/commandes': 'Commandes',
  '/factures': 'Factures Clients',
  '/fournisseurs': 'Fournisseurs',
  '/achats': 'Bons de Commande',
  '/stocks': 'Gestion des Stocks',
  '/couts': 'Coûts & Budget',
  '/marges': 'Marges & Rentabilité',
  '/analytique': 'IA & Prévisions',
  '/alertes': "Centre d'Alertes",
}

export function Topbar() {
  const pathname = usePathname()
  const title = TITLES[pathname] || 'TomatoPilot'
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6"
      style={{ height: 52, background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700 }}>{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="chip">🌱 Campagne 2025–2026</div>
        <div className="chip" style={{ background: '#fce4e5', borderColor: '#fdd', color: '#9b1d1d' }}>
          <Link href="/alertes">⚠ 3 alertes</Link>
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>+ Saisir récolte</button>
      </div>
    </header>
  )
}
