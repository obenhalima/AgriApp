import {supabase} from './supabase'
import {historyPayload,type HistoryRow,type HistoryCatalog,type HistoryResult} from './stockHistory'

async function rpc<T>(name:string,args:Record<string,unknown>,missingMessage='Import historique non activé. Appliquez la migration stock_history_import.'):Promise<T>{
 const {data,error}=await supabase.rpc(name,args).abortSignal(AbortSignal.timeout(70000))
 if(error){
  if(['PGRST202','42883','42P01'].includes(error.code))throw new Error(missingMessage)
  throw new Error(error.message)
 }
 return data as T
}
export function loadStockHistoryCatalog(domain:string){
 return rpc<HistoryCatalog>('get_stock_history_catalog',{p_domain:domain})
}
export async function importStockHistory(domain:string,request:string,rows:HistoryRow[],apply=false){
 const result=await rpc<HistoryResult>('import_stock_history',{p_domain:domain,p_request:request,p_rows:historyPayload(rows),p_apply:apply})
 if(!result||!['preview','applied'].includes(result.status)||!Array.isArray(result.balances)||!Number.isFinite(result.cost_total)||result.cost_total<0||['entries','exits','skipped','unvalued'].some(key=>!Number.isInteger(result[key as keyof HistoryResult])||Number(result[key as keyof HistoryResult])<0)||(result.status==='applied'&&!/^[0-9a-f-]{36}$/i.test(result.operation_id??'')))throw new Error('Résultat serveur invalide. Recontrôlez le même fichier avant de réessayer.')
 return result
}

export type StockResetResult = {
 status:'preview'|'applied'
 domain_code:string
 fingerprint:string
 operation_id:string|null
 movements:number
 costs:number
 balances:number
 items:number
 blockers:Record<'purchases'|'transfers'|'requests'|'treatments'|'cultural'|'inconsistent',number>
}
export async function resetStockHistory(domain:string,request:string,expected:string|null=null,confirmation:string|null=null,apply=false){
 const result=await rpc<StockResetResult>('reset_stock_history',{
  p_domain:domain,p_request:request,p_expected:expected,p_confirmation:confirmation,p_apply:apply,
 },'Remise à zéro non activée. Appliquez la migration stock_history_reset après stock_history_import.')
 if(!result||!['preview','applied'].includes(result.status)||!/^[a-f0-9]{64}$/.test(result.fingerprint)||!result.domain_code||!result.blockers||
  [result.movements,result.costs,result.balances,result.items,...['purchases','transfers','requests','treatments','cultural','inconsistent'].map(key=>result.blockers[key as keyof StockResetResult['blockers']])].some(count=>!Number.isInteger(count)||count<0)||
  (result.status==='applied'&&!/^[0-9a-f-]{36}$/i.test(result.operation_id??'')))
  throw new Error('Aperçu de remise à zéro invalide. Actualisez avant de continuer.')
 return result
}
