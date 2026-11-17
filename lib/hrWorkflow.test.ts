import {expect, it} from 'vitest'
import {NAV, findNavItem, buildBreadcrumbs} from './navigation'
import {hrNavigation, usesFortnightPayroll} from './hrWorkflow'
import {profileNavigation, defaultMenu} from './profileNavigation'

it('enables the fortnight workflow for the pilot and 501 clients', () => {
  expect(usesFortnightPayroll('DOM-BENHALIMA')).toBe(true)
  expect(usesFortnightPayroll(' dom-benhalima ')).toBe(true)
  expect(usesFortnightPayroll('DOMBEN501')).toBe(true)
  expect(usesFortnightPayroll('STALSON')).toBe(false)
  expect(usesFortnightPayroll('DOM-BENHALIMA-501')).toBe(false)
  expect(usesFortnightPayroll(null)).toBe(false)
  expect(hrNavigation('STALSON')).toBe(NAV)
})
it('groups the pilot into four RH entries without duplicate production attendance or mutation of the standard menu', () => {
  const standard = NAV.map(group => ({section: group.section, paths: group.items.map(item => item.href)}))
  const nav = hrNavigation('DOM-BENHALIMA')
  expect(nav.find(group => group.section === 'RESSOURCES HUMAINES')?.items.map(item => item.href)).toEqual(['/rh', '/rh/employes', '/pointage', '/rh/paie'])
  expect(nav.flatMap(group => group.items).filter(item => item.href === '/pointage')).toHaveLength(1)
  expect(nav.find(group => group.section === 'PRODUCTION')?.items.some(item => item.href === '/pointage')).toBe(false)
  expect(NAV.map(group => ({section: group.section, paths: group.items.map(item => item.href)}))).toEqual(standard)
})
it('keeps permissions and saved profile visibility authoritative', () => {
  const base = hrNavigation('DOM-BENHALIMA')
  const restricted = profileNavigation(null, module => module === 'rh_employes', false, base)
  expect(restricted.flatMap(group => group.items).filter(item => item.href.startsWith('/rh') || item.href === '/pointage').map(item => item.href)).toEqual(['/rh/employes'])
  const hidden = profileNavigation({...defaultMenu, hidden: ['/pointage']}, () => true, false, base)
  expect(hidden.flatMap(group => group.items).some(item => item.href === '/pointage')).toBe(false)
})
it('uses the correct section and payroll label in client breadcrumbs', () => {
  const adapted = hrNavigation('DOM-BENHALIMA')
  expect(findNavItem('/pointage', adapted)?.section).toBe('RESSOURCES HUMAINES')
  expect(findNavItem('/pointage')?.section).toBe('PRODUCTION')
  expect(buildBreadcrumbs('/rh/paie/preparation', adapted).map(item => item.label)).toEqual(['RESSOURCES HUMAINES', 'Paie & paiements'])
})
