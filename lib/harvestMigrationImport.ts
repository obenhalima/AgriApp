import {checkHarvestMigration,harvestCollectionKg,number,text,type MigrationData,type MigrationCatalog} from './harvestMigration'
/** Harvests and dispatches are submitted together to one atomic server transaction. */
export function harvestWorkflowImportPayload(data:MigrationData,catalog:MigrationCatalog) {
 if(['Pesees','Tri','Prix'].some(s=>data[s]?.length)) throw new Error('Cet import accepte récoltes, plateaux, envois et sources. Les pesées, tri et prix ne sont pas encore importables.')
 if(checkHarvestMigration(data,catalog).issues.some(i=>i.severity==='error')) throw new Error('Corrigez les erreurs avant import.')
 if(data.Sources?.length&&!data.Envois?.length) throw new Error('Les sources nécessitent des envois.')
 const harvests=harvestImportPayload({...data,Envois:[],Sources:[]},catalog)
 const dispatches=(data.Envois||[]).map(r=>{
  const market=catalog.markets.find(m=>m.label===text(r.market))!
  const sources=(data.Sources||[]).filter(s=>text(s.dispatch)===text(r.ref)).map(s=>({harvest_ref:text(s.harvest),kg:number(s.kg)})).sort((a,b)=>a.harvest_ref.localeCompare(b.harvest_ref))
  return {ref:text(r.ref),market_id:market.id,date:text(r.date),kg:number(r.kg),notes:[text(r.notes),text(r.document)?`Bon de livraison : ${text(r.document)}`:''].filter(Boolean).join('\n'),sources}
 })
 return {harvests,dispatches}
}
export function harvestImportPayload(data:MigrationData,catalog:MigrationCatalog) {
 if(Object.entries(data).some(([s,rows])=>!['Recoltes','Plateaux'].includes(s)&&rows.length)) throw new Error('Cet import concerne uniquement les récoltes et plateaux. Retirez les envois, sources, pesées, tri et prix du fichier.')
 if(checkHarvestMigration(data,catalog).issues.some(i=>i.severity==='error')) throw new Error('Corrigez les erreurs avant import.')
 return data.Recoltes.map(r=>{
  const planting=catalog.plantings.find(p=>p.label===text(r.planting))!
  const trays=text(r.tray)?[r]:(data.Plateaux||[]).filter(t=>text(t.harvest)===text(r.ref))
  if(!trays.length) throw new Error(`${r.ref} : l’import exige des caisses (type et nombre), comme la saisie Récoltes.`)
  const lines=trays.map(t=>({code:text(t.tray),count:number(t.count),unit_kg:text(t.unitKg)?number(t.unitKg):catalog.trays.find(v=>v.code===text(t.tray))!.weight}))
  const kg=lines.reduce((sum,t)=>sum+t.count*t.unit_kg,0)
  if(Math.abs(kg-harvestCollectionKg(r,data,catalog))>0.01) throw new Error(`${r.ref} : le poids saisi diffère des caisses. Conservez la pesée réelle pour l’étape Pesées.`)
  return {ref:text(r.ref),planting_id:planting.id,date:text(r.date),kg,people:text(r.people)?number(r.people):null,hours:text(r.hours)?number(r.hours):null,full_day:r.fullDay==='Oui',notes:[text(r.notes),text(r.document)?`Justificatif : ${text(r.document)}`:''].filter(Boolean).join('\n'),trays:lines}
 })
}
