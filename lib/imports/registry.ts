import { ImportTarget } from './types'
import { costsTarget } from './targets/costs'
import { harvestsTarget } from './targets/harvests'

// Registre des cibles d'import. Ajouter une cible = l'ajouter ici.
// (Phase 3 : purchases)
export const IMPORT_TARGETS: ImportTarget[] = [
  harvestsTarget,
  costsTarget,
]

export function getTarget(key: string): ImportTarget | undefined {
  return IMPORT_TARGETS.find(t => t.key === key)
}
