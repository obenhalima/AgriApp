import { validateTreatmentDates } from './treatmentScheduleDates'

export const interventionTypes = [
  ['irrigation', 'Irrigation simple', 'Eau seule', 'Disponible après migration 133'],
  ['fertigation', 'Fertigation', 'Engrais et eau', 'Recettes et simulation : migration 135A ; planification à suivre'],
  ['nutrition_foliaire', 'Correction nutritionnelle foliaire', 'Correcteurs nutritionnels', 'Parcours hors phyto 135B'],
  ['amendement', 'Fertilisation de fond / amendements', 'Engrais et amendements', 'Parcours hors phyto 135B'],
  ['qualite_eau', 'Correction de la qualité de l’eau', 'Correcteurs adaptés à l’analyse', 'Parcours hors phyto 135B'],
  ['biostimulation', 'Biostimulation', 'Produits selon leur statut', 'Parcours hors phyto 135B'],
  ['auxiliaires', 'Lâcher d’auxiliaires', 'Organismes vivants', 'Parcours hors phyto 135B'],
  ['piegeage', 'Piégeage et surveillance', 'Pièges et attractifs', 'Parcours hors phyto 135B'],
  ['confusion', 'Confusion sexuelle', 'Diffuseurs ; produits réglementés dans Phyto', 'Parcours hors phyto 135B'],
  ['hygiene', 'Nettoyage / désinfection', 'Produits adaptés aux équipements', 'Parcours hors phyto 135B'],
  ['reseau', 'Entretien du réseau d’irrigation', 'Consommables facultatifs', 'Parcours hors phyto 135B'],
  ['sol', 'Préparation du sol / substrat', 'Méthodes hors phyto', 'Parcours hors phyto 135B'],
  ['pollinisation', 'Pollinisation', 'Colonies / ruches', 'Parcours hors phyto 135B'],
  ['ombrage', 'Blanchiment / ombrage', 'Produits de couverture', 'Parcours hors phyto 135B'],
  ['co2', 'Enrichissement CO₂', 'CO₂ si installation équipée', 'Parcours hors phyto 135B'],
  ['travaux', 'Travaux culturaux', 'Fournitures facultatives', 'Parcours hors phyto 135B'],
] as const

export type WaterMode = 'volume' | 'duration' | 'meter'
export function decimal(value: string | number): number {
  const s = String(value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Renseignez un nombre positif valide (virgule ou point).')
  const n = Number(s)
  if (!Number.isFinite(n) || n > 1e12) throw new Error('Valeur trop élevée.')
  return n
}
export function waterVolume(mode: WaterMode, values: {volume?: string; minutes?: string; flow?: string; before?: string; after?: string}) {
  const n = (x?: string) => decimal(x ?? '')
  const liters = mode === 'volume' ? n(values.volume) : mode === 'duration'
    ? n(values.minutes) * n(values.flow) / 60 : (n(values.after) - n(values.before)) * 1000
  if (!Number.isFinite(liters) || liters <= 0 || liters > 1e12) throw new Error('Le volume doit être positif ; vérifiez le débit ou les index du compteur.')
  const rounded = Math.round(liters * 100) / 100
  if (rounded <= 0) throw new Error('Volume trop faible pour être enregistré.')
  return rounded
}
export function irrigationDates(mode: 'single' | 'exact_dates' | 'recurring', dates: string[], frequency: string, interval: number, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(interval) || interval < 1 || interval > 365)
    throw new Error('Prévoir de 1 à 100 occurrences et un intervalle de 1 à 365.')
  const check = validateTreatmentDates({schedule_mode: mode === 'recurring' ? 'single' : mode, exact_dates: dates, starts_at: '', ends_at: ''})
  if (Object.keys(check.errors).length) throw new Error(Object.values(check.errors)[0])
  let result = check.exact_dates
  if (mode === 'recurring') {
    if (!['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) throw new Error('Fréquence invalide.')
    const first = new Date(dates[0])
    result = Array.from({length: count}, (_, i) => {
      const d = new Date(first)
      if (frequency === 'daily' || frequency === 'weekly') d.setDate(first.getDate() + i * interval * (frequency === 'weekly' ? 7 : 1))
      else {
        d.setDate(1)
        d.setMonth(first.getMonth() + i * interval * (frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12))
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        d.setDate(Math.min(first.getDate(), last))
      }
      return d.toISOString()
    })
  }
  if (!result.length || result.length > 100 || new Set(result).size !== result.length) throw new Error('Prévoir 1 à 100 dates distinctes.')
  return result.sort()
}
export const irrigationStatus: Record<string,string> = {brouillon:'Brouillon', soumise:'À valider', approuvee:'À exécuter', rejetee:'Refusé', annulee:'Annulé', terminee:'Terminé'}
export const waterFormat = (n: number) => n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2})
