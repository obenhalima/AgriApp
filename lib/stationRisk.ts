export type StationRisk = 'green' | 'yellow' | 'red' | 'unknown' | 'none'
export function stationRisk(value: unknown): StationRisk {
  const v = String(value ?? '').trim().toUpperCase()
  if (['V', 'VERT', 'GREEN', 'FAIBLE'].includes(v)) return 'green'
  if (['O', 'J', 'JAUNE', 'YELLOW', 'ORANGE', 'MOYEN'].includes(v)) return 'yellow'
  if (['R', 'R*', 'ROUGE', 'RED'].includes(v)) return 'red'
  return 'unknown'
}
export const stationRiskLabels: Record<StationRisk, string> = { green: 'Vert — faible', yellow: 'Jaune — accord Station', red: 'Rouge — restreint', unknown: 'Couleur à contrôler', none: 'Sans liste Station active' }
export const stationRiskStyles: Record<StationRisk, string> = { green: 'bg-green-100 text-green-900 border-green-300', yellow: 'bg-yellow-100 text-yellow-900 border-yellow-400', red: 'bg-red-100 text-red-900 border-red-400', unknown: 'bg-slate-100 text-slate-900 border-slate-300', none: 'bg-slate-100 text-slate-900 border-slate-300' }
export function stationConfirmationsComplete(lines: any[], confirmations: Record<string, any>) {
  return lines.every(line => line.risk !== 'unknown' && !line.expired && (!['yellow', 'red'].includes(line.risk) || (confirmations[line.line_id]?.station_agreed === true && (line.risk !== 'red' || confirmations[line.line_id]?.restrictions_checked === true))))
}
