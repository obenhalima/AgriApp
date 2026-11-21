// Dispatch composition stores kilos, not a per-tray breakdown. Show the types
// recorded on its source harvests without inventing tray counts or destinations.
export function dispatchTrayTypes(lot:any,sources:any[],lines:any[],references:any[]=[]):{code:string;label:string}[]{
 const linked=sources.filter(source=>source.harvest_lot_id===lot.id)
 const ids=new Set(linked.length?linked.map(source=>source.harvest_id).filter(Boolean):lot.harvest_id?[lot.harvest_id]:[])
 const types=new Map<string,{code:string;label:string}>()
 for(const line of lines){
  if(!ids.has(line.harvest_id))continue
  const code=line.tray_type_code||line.tray_type_label
  if(!code)continue
  types.set(code,{code,label:line.tray_type_label||references.find(ref=>ref.code===code)?.label||code})
 }
 return [...types.values()].sort((a,b)=>a.label.localeCompare(b.label))
}
