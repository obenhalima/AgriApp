import {supabase} from './supabase'

export type InventoryCostMethod = 'cump' | 'fifo'
export type InventoryCostSettings = {method:InventoryCostMethod;updated_at:string|null;effective_at?:string|null}

export async function getInventoryCostSettings(domain:string):Promise<InventoryCostSettings> {
  const {data,error}=await supabase.from('inventory_cost_settings').select('*').eq('domain_id',domain).maybeSingle()
  if(error)throw error
  return data??{method:'cump',updated_at:null}
}

export type InventoryMethodPreview = {
  status:'preview'|'blocked'|'applied';domain_code:string;fingerprint:string;method:InventoryCostMethod
  mode:'cutover';effective_date:string;effective_at:string
  blockers:{code:string;item_code:string|null;item_name:string|null;warehouse:string|null;reference:string|null;message:string}[]
  opening_lots:number;historical_unpriced_receipts:number
  movements:number;exits:number;cost_before:number;cost_after:number;stock_before:number|null;stock_after:number|null
  campaigns:{campaign_id:string;name:string;before:number;after:number}[]
}

export async function changeInventoryCostMethod(domain:string,method:InventoryCostMethod,request:string,preview?:InventoryMethodPreview,confirmation?:string):Promise<InventoryMethodPreview> {
  const {data,error}=await supabase.rpc('change_inventory_cost_method_cutover',{
    p_domain:domain,p_method:method,p_request:request,p_expected:preview?.fingerprint??null,
    p_confirmation:confirmation??null,p_apply:!!preview,
  }).abortSignal(AbortSignal.timeout(70000))
  if(error){
    if(['PGRST202','42883'].includes(error.code))throw new Error('Bascule de méthode indisponible. Appliquez la migration inventory_fifo_cutover.')
    throw error
  }
  if(!data||!['preview','blocked','applied'].includes(data.status)||data.mode!=='cutover'||!Array.isArray(data.blockers)||!data.effective_date||!data.domain_code||!/^[a-f0-9]{64}$/.test(data.fingerprint)||!Array.isArray(data.campaigns))throw new Error('Aperçu de valorisation invalide')
  return data
}
