export const prerequisiteLabels = {
  farms: 'Fermes',
  crops: 'Cultures',
  varieties: 'Variétés',
  stock_items: 'Articles de stock',
  warehouses: 'Entrepôts',
  campaigns: 'Campagnes',
  plantings: 'Plantations',
  suppliers: 'Fournisseurs',
  commercial_clients: 'Clients commerciaux',
  workers: 'Employés',
  phyto: 'Produits phytosanitaires autorisés',
  account_categories: 'Catégories comptables',
} as const

type Prerequisite = keyof typeof prerequisiteLabels
export type DedicatedReadiness = Record<Prerequisite, boolean>

const rules: [string, Prerequisite[]][] = [
  ['/serres', ['farms']],
  ['/campagnes', ['farms']],
  ['/varietes', ['crops']],
  ['/plan-culture', ['farms', 'campaigns', 'varieties']],
  ['/recoltes', ['plantings']],
  ['/stocks/mouvements', ['warehouses', 'stock_items']],
  ['/stocks/transferts', ['warehouses', 'stock_items']],
  ['/stocks/reprise', ['warehouses', 'stock_items']],
  ['/stocks/preparation-phyto', ['warehouses', 'stock_items', 'phyto']],
  ['/achats', ['suppliers', 'warehouses', 'stock_items']],
  ['/commandes', ['commercial_clients']],
  ['/agronomie/traitements', ['farms', 'phyto']],
  ['/pointage', ['workers']],
  ['/rh/paie', ['workers']],
  ['/admin/budgets', ['campaigns', 'account_categories']],
]

export function dedicatedModulePrerequisites(pathname: string): Prerequisite[] {
  return rules.find(([route]) => pathname === route || pathname.startsWith(route + '/'))?.[1] ?? []
}
