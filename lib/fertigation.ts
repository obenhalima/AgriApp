import { decimal } from './irrigation'

export const fertigationDoseUnits = {kg_m3:'kg / m³',g_m3:'g / m³',l_m3:'L / m³',ml_m3:'mL / m³'} as const
export type FertigationDoseUnit = keyof typeof fertigationDoseUnits
export type FertigationLine = {stock_item_id:string;dose:string;dose_unit:FertigationDoseUnit}
const units:Record<string,{dimension:string;factor:number}> = {
  kg:{dimension:'mass',factor:1000},g:{dimension:'mass',factor:1},
  l:{dimension:'volume',factor:1000},ml:{dimension:'volume',factor:1},
}
// Concentration in the FINAL distributed solution. Never a mother-tank calculation.
export function fertigationQuantity(liters:string|number,dose:string|number,doseUnit:string,stockUnit:string) {
  const water=decimal(liters), concentration=decimal(dose)
  const source=units[doseUnit.replace(/_m3$/,'')],target=units[stockUnit.trim().toLowerCase()]
  if(!(doseUnit in fertigationDoseUnits)||!source||!target||source.dimension!==target.dimension)
    throw new Error('Unité de dose incompatible avec l’unité de stock. Aucune conversion masse/volume automatique.')
  if(water<=0||concentration<=0)throw new Error('Volume et concentration strictement positifs requis.')
  const quantity=Math.round(water/1000*concentration*source.factor/target.factor*1e4)/1e4
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1e10)throw new Error('Quantité trop faible ou trop élevée pour le stock.')
  return quantity
}
export function compatibleDoseUnits(stockUnit:string):FertigationDoseUnit[] {
  const unit=units[stockUnit.trim().toLowerCase()]
  return unit?Object.keys(fertigationDoseUnits).filter(k=>units[k.replace('_m3','')].dimension===unit.dimension) as FertigationDoseUnit[]:[]
}
