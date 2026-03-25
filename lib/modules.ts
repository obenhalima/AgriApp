export type ModuleKey =
  | 'dashboard'
  | 'serres'
  | 'varietes'
  | 'campagnes'
  | 'production'
  | 'recoltes'
  | 'agronomie'
  | 'marches'
  | 'clients'
  | 'commandes'
  | 'factures'
  | 'fournisseurs'
  | 'achats'
  | 'stocks'
  | 'couts'
  | 'marges'
  | 'analytique'

type NavItem = {
  href: string
  label: string
  moduleKey: ModuleKey
}

type NavGroup = {
  section?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/', label: 'Tableau de bord', moduleKey: 'dashboard' }],
  },
  {
    section: 'Exploitation',
    items: [
      { href: '/serres', label: 'Serres', moduleKey: 'serres' },
      { href: '/varietes', label: 'Varietes', moduleKey: 'varietes' },
      { href: '/campagnes', label: 'Campagnes', moduleKey: 'campagnes' },
    ],
  },
  {
    section: 'Production',
    items: [
      { href: '/production', label: 'Suivi production', moduleKey: 'production' },
      { href: '/recoltes', label: 'Recoltes', moduleKey: 'recoltes' },
      { href: '/agronomie', label: 'Agronomie', moduleKey: 'agronomie' },
    ],
  },
  {
    section: 'Commerce',
    items: [
      { href: '/marches', label: 'Marches', moduleKey: 'marches' },
      { href: '/clients', label: 'Clients', moduleKey: 'clients' },
      { href: '/commandes', label: 'Commandes', moduleKey: 'commandes' },
      { href: '/factures', label: 'Factures', moduleKey: 'factures' },
    ],
  },
  {
    section: 'Achats',
    items: [
      { href: '/fournisseurs', label: 'Fournisseurs', moduleKey: 'fournisseurs' },
      { href: '/achats', label: 'Bons de commande', moduleKey: 'achats' },
      { href: '/stocks', label: 'Stocks', moduleKey: 'stocks' },
    ],
  },
  {
    section: 'Finances',
    items: [
      { href: '/couts', label: 'Couts & Budget', moduleKey: 'couts' },
      { href: '/marges', label: 'Marges', moduleKey: 'marges' },
      { href: '/analytique', label: 'IA & Previsions', moduleKey: 'analytique' },
    ],
  },
]

const MODULE_BY_PATH = new Map<string, ModuleKey>(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, item.moduleKey])),
)

export function getModuleKeyForPath(pathname: string): ModuleKey | null {
  return MODULE_BY_PATH.get(pathname) ?? null
}
