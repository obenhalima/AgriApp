import {supabase} from './supabase'
import {requireReferenceDomain} from './clientReferenceScope'
export type FarmEdit={code:string;name:string;address:string;city:string;region:string;country:string;total_area:string;notes:string}
export function farmEditPayload(input:FarmEdit){
 const code=input.code.trim().toUpperCase(),name=input.name.trim()
 if(!code||!name)throw new Error('Le code et le nom de la ferme sont obligatoires.')
 const area=input.total_area.trim()?Number(input.total_area.replace(',','.')):null
 if(area!==null && (!Number.isFinite(area)||area<0))throw new Error('La superficie doit être un nombre positif ou nul.')
 return {code,name,address:input.address.trim(),city:input.city.trim(),region:input.region.trim(),country:input.country.trim()||'Maroc',total_area:area,notes:input.notes.trim()}
}
export async function updateClientFarm(domain:string,id:string,input:FarmEdit){
 requireReferenceDomain(domain)
 const {data,error}=await supabase.from('farms').update({...farmEditPayload(input),updated_at:new Date().toISOString()}).eq('domain_id',domain).eq('id',id).select().single()
 if(error)throw error
 return data
}
export async function deleteEmptyFarm(domain:string,id:string){
 requireReferenceDomain(domain)
 const {data,error}=await supabase.rpc('delete_empty_farm',{p_domain:domain,p_farm:id})
 if(error){
  if(error.code==='23503'){
   const label=error.message?.match(/données liées \(([^)]+)\)/)?.[1]
   const known=['serres','campagnes','employés','entrepôts','zones','lignes budgétaires','immobilisations']
   const reason=label&&known.includes(label)?`des ${label}`:'des données liées'
   throw new Error(`Cette ferme ne peut pas être supprimée car elle possède ${reason}. Aucune donnée n’a été supprimée. Consultez les éléments liés avant de réessayer.`)
  }
  throw new Error(['PGRST202','42883'].includes(error.code)?'Suppression protégée non activée : contactez votre administrateur.':error.code==='42501'?'Vous n’avez pas l’autorisation de supprimer cette ferme.':'La suppression n’a pas pu être effectuée. Actualisez la liste et réessayez ; si le problème persiste, contactez votre administrateur.')
 }
 if(data!==id)throw new Error('Suppression non confirmée : actualisez la liste des fermes.')
}
