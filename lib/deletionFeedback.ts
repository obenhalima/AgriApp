export const DELETION_BLOCKED_EVENT='itrix:deletion-blocked'

const relatedLabels:Record<string,string>={
 greenhouses:'des serres',campaigns:'des campagnes',campaign_plantings:'des plantations',
 harvests:'des récoltes',harvest_lots:'des lots de récolte',harvest_lot_sources:'des envois de récoltes',
 cost_entries:'des dépenses',labor_entries:'des saisies de main-d’œuvre',workers:'des employés',
 warehouses:'des entrepôts',farm_zones:'des zones',budget_lines:'des lignes budgétaires',
 assets:'des immobilisations',station_settlement_lines:'des lignes de bordereau',
 sales_order_lines:'des lignes de commande',purchase_order_lines:'des lignes d’achat',
 role_permissions:'des autorisations',profiles:'des utilisateurs',domain_memberships:'des affectations utilisateur',
}

export function deletionBlockedMessage(error:{code?:string;message?:string;details?:string}):string|null{
 if(error.code!=='23503' && !(error.code==='P0001' && /données liées|encore utilisé|still referenced/i.test(error.message||'')))return null
 // PostgreSQL identifies the referencing table in its error, never display SQL/IDs.
 const tables=Array.from((error.message||'').matchAll(/(?:on|in) table "([a-z_]+)"/g),m=>m[1])
 const table=tables[tables.length-1]
 const french=(error.message||'').match(/données liées \(([^)]+)\)/)?.[1]
 const safeFrench=['serres','campagnes','employés','entrepôts','zones','lignes budgétaires','immobilisations']
 const reason=(table&&relatedLabels[table])||(french&&safeFrench.includes(french)?`des ${french}`:'des données liées')
 return `Suppression bloquée : cet élément est encore utilisé par ${reason}. Il est conservé pour protéger les données liées. Consultez ces données avant de réessayer, ou archivez l’élément si cette option est disponible.`
}

// Observe failed deletions without changing their response, transaction or error code.
export function withDeletionFeedback(fetcher:typeof fetch,notify:(message:string)=>void):typeof fetch{
 return async(input,init)=>{
  const response=await fetcher(input,init)
  const request=typeof Request!=='undefined'&&input instanceof Request?input:null
  const method=(init?.method||request?.method||'GET').toUpperCase()
  const url=String(request?.url||input)
  const isDeletion=method==='DELETE'||(method==='POST'&&/\/rpc\/(?:[a-z0-9_]*_)?(?:delete|remove|wipe)[a-z0-9_]*(?:\?|$)/i.test(url))
  if(!response.ok&&isDeletion){
   try{
    const message=deletionBlockedMessage(await response.clone().json())
    // Farms already have a persistent, named error panel in their own screen.
    if(message&&!/\/rpc\/delete_empty_farm(?:\?|$)/.test(url))notify(message)
   }catch{/* Non-JSON response or unavailable notification: retain the original error. */}
  }
  return response
 }
}
