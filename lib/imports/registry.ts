import { ImportTarget } from './types'
import { costsTarget,createCostsTarget } from './targets/costs'
import { harvestsTarget,createHarvestsTarget } from './targets/harvests'

// Registre des cibles d'import. Ajouter une cible = l'ajouter ici.
// (Phase 3 : purchases)
export const IMPORT_TARGETS: ImportTarget[] = [
  harvestsTarget,
  costsTarget,
]
export function getClientImportTargets(domainId:string,isCurrent:()=>boolean):ImportTarget[]{
  return [createHarvestsTarget(domainId,isCurrent),createCostsTarget(domainId,isCurrent)]
}

export function getTarget(key: string): ImportTarget | undefined {
  return IMPORT_TARGETS.find(t => t.key === key)
}
