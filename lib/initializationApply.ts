import {supabase} from './supabase'
import {assertClientReferenceIsolation} from './clientReferenceReadiness'
import {isInitDraft,type InitDraft,type InitCatalog} from './initialization'

export type InitializationOperation={operation_id:string;status:'applied'|'rolled_back';revision:number;created:number;reused:number;payload:InitDraft}
export function parseInitializationOperation(value:unknown):InitializationOperation {
 const v=value as InitializationOperation
 if(!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.operation_id) || !['applied','rolled_back'].includes(v.status)
  || !Number.isInteger(v.revision) || v.revision<1 || !Number.isInteger(v.created) || v.created<0
  || !Number.isInteger(v.reused) || v.reused<0 || !isInitDraft(v.payload))throw new Error('Bilan d’intégration invalide : rechargez le dossier avant toute nouvelle action.')
 return v
}
/** Normalize linked display values (notably numeric scales) against current references. */
export function canonicalizeModule1Links(draft:InitDraft,catalog:InitCatalog):InitDraft {
 const rows={...draft.rows}
 for(const key of ['farms','greenhouses','varieties','campaigns','plantings']) {
  const current=rows[key]||[]
  if(current.some(row=>row.existing_id && catalog[key]?.some(candidate=>candidate.existing_id===row.existing_id)))rows[key]=current.map(row=>{
   const existing=row.existing_id && catalog[key]?.find(candidate=>candidate.existing_id===row.existing_id)
   return existing?{...existing}:row
  })
 }
 return {...draft,rows}
}
function rpcError(error:any,migration=155):never {
 if(error?.code==='PGRST202' || error?.code==='42883')throw new Error(`Validation serveur non activée : appliquer le SQL ${migration} avant de créer ou annuler ce module.`)
 throw new Error(error?.message || 'Opération serveur impossible. Rechargez le bilan avant de réessayer.')
}
export async function getInitializationModule2State(domain:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('initialization_module2_state',{p_domain:domain})
 if(error)rpcError(error,158)
 if(data?.enabled!==true)throw new Error('Validation serveur indisponible pour ce client.')
 return data.operation?parseInitializationOperation(data.operation):null
}
export async function applyInitializationModule2(domain:string,revision:number,payload:InitDraft,request:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('apply_initialization_module2',{p_domain:domain,p_revision:revision,p_payload:payload,p_request:request})
 if(error)rpcError(error,158)
 return parseInitializationOperation(data)
}
export async function rollbackInitializationModule2(domain:string,operation:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('rollback_initialization_module2',{p_domain:domain,p_operation:operation})
 if(error)rpcError(error,158)
 return parseInitializationOperation(data)
}
export async function getInitializationModule1State(domain:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('initialization_module1_state',{p_domain:domain})
 if(error)rpcError(error)
 if(data?.enabled!==true)throw new Error('Validation serveur indisponible pour ce client.')
 return data.operation?parseInitializationOperation(data.operation):null
}
export async function applyInitializationModule1(domain:string,revision:number,payload:InitDraft,request:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('apply_initialization_module1',{p_domain:domain,p_revision:revision,p_payload:payload,p_request:request})
 if(error)rpcError(error)
 return parseInitializationOperation(data)
}
export async function rollbackInitializationModule1(domain:string,operation:string) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('rollback_initialization_module1',{p_domain:domain,p_operation:operation})
 if(error)rpcError(error)
 return parseInitializationOperation(data)
}
export async function startInitializationComplement(domain:string,module:'exploitation'|'plantations',revision:number) {
 await assertClientReferenceIsolation(domain,supabase)
 const {data,error}=await supabase.rpc('start_initialization_complement',{p_domain:domain,p_module:module,p_revision:revision})
 if(error)rpcError(error,159)
 if(!data || !isInitDraft(data.payload) || !Number.isInteger(data.revision) || data.revision<=revision)throw new Error('Nouvelle préparation non confirmée : rechargez le dossier.')
 return data as {payload:InitDraft;revision:number}
}
