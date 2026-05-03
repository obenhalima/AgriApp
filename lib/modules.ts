export function getModuleKeyForPath(pathname: string): string | null {
  const map: Record<string, string> = {
    '/': 'dashboard',
    '/serres': 'serres',
    '/varietes': 'varietes',
    '/campagnes': 'campagnes',
    '/production': 'production',
    '/recoltes': 'recoltes',
    '/agronomie': 'agronomie',
    '/marches': 'marches',
    '/clients': 'clients',
    '/commandes': 'commandes',
    '/factures': 'factures',
    '/fournisseurs': 'fournisseurs',
    '/achats': 'achats',
    '/stocks': 'stocks',
    '/couts': 'couts',
    '/marges': 'marges',
    '/analytique': 'analytique',
    '/alertes': 'alertes',
    '/admin/imports': 'imports',
    '/rh': 'rh',
    '/rh/employes': 'rh_employes',
    '/rh/paie': 'rh_paie',
    '/rh/conges': 'rh_conges',
    '/rh/cnss': 'rh_cnss',
  }
  return map[pathname] ?? null
}
