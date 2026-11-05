import { INIT_SECTIONS, initProgress, type InitDraft, type InitCatalog } from './initialization'

export const INITIALIZATION_MODULES = [
  { key: 'exploitation', title: 'Exploitation et référentiels', sections: ['farms', 'greenhouses', 'varieties'], description: 'Fermes, serres, cultures et variétés. Préparer les références du client.' },
  { key: 'plantations', title: 'Campagnes et plantations', sections: ['campaigns', 'plantings'], description: 'Périodes, serres plantées, variétés, surfaces et dates.' },
] as const
export type InitializationModule = typeof INITIALIZATION_MODULES[number]['key']
export function initializationModuleSections(module: InitializationModule) {
  const keys: readonly string[] = INITIALIZATION_MODULES.find(item => item.key === module)!.sections
  return INIT_SECTIONS.filter(section => keys.includes(section.key))
}
export function initializationModuleProgress(draft: InitDraft, module: InitializationModule, catalog?: InitCatalog) {
  const all = initProgress(draft, catalog)
  const sections = initializationModuleSections(module)
  const keys = new Set(sections.map(section => section.key))
  const issues = all.issues.filter(issue => keys.has(issue.section))
  const complete = sections.filter(section =>
    (section.optional && draft.skipped.includes(section.key) && !draft.rows[section.key]?.length) ||
    (draft.reviewed.includes(section.key) && !!draft.rows[section.key]?.length && !issues.some(issue => issue.section === section.key && !issue.warning))
  ).length
  return { complete, total: sections.length, percent: Math.round(100 * complete / sections.length), issues }
}
