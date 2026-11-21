import {NAV, type NavSection} from './navigation'

// The tested fortnight workflow is enabled for the pilot and the 501 rollout.
export function usesFortnightPayroll(domainCode?: string | null): boolean {
  return ['DOM-BENHALIMA', 'DOMBEN501'].includes(domainCode?.trim().toUpperCase() || '')
}

export function hrNavigation(domainCode?: string | null): NavSection[] {
  if (!usesFortnightPayroll(domainCode)) return NAV
  const employee = NAV.flatMap(section => section.items).find(item => item.href === '/rh/employes')!
  const dashboard = NAV.flatMap(section => section.items).find(item => item.href === '/rh')!
  const attendance = NAV.flatMap(section => section.items).find(item => item.href === '/pointage')!
  const payroll = NAV.flatMap(section => section.items).find(item => item.href === '/rh/paie')!
  const contributions = NAV.flatMap(section => section.items).find(item => item.href === '/rh/cnss')!
  return NAV.map(section => section.section === 'RESSOURCES HUMAINES' ? {
    ...section,
    tagline: 'Parcours quinzaine',
    items: [dashboard, employee, {...attendance, description: 'Heures normales et supplémentaires par quinzaine'}, {...payroll, label: 'Paie & paiements', description: 'Taux nets, cotisations, coûts et paiements'}, {...contributions, label: 'CNSS & règlements', description: 'Cotisations mensuelles, paiements et reste à payer'}],
  } : {...section, items: section.items.filter(item => item.href !== '/pointage')})
}
