import {supabase} from './supabase'
import type {MigrationData} from './harvestMigration'
export type HarvestImportResult={created:number;already_imported:number;dispatches_created?:number;dispatches_already_imported?:number}
export async function listHarvestModuleHistory(domain:string){
 const {data,error}=await supabase.from('harvest_module_history').select('id,revision,result,created_at').eq('domain_id',domain).order('created_at',{ascending:false}).limit(10)
 if(error)fail(error)
 return (data||[]) as {id:string;revision:number;result:HarvestImportResult;created_at:string}[]
}
function fail(error:any):never{throw new Error(['PGRST202','42P01','PGRST205','42883'].includes(error?.code)?'Reprise du module non activée : appliquer le SQL 160.':error?.message||'Sauvegarde du module indisponible.')}
export async function loadHarvestModuleDraft(domain:string){
 const {data,error}=await supabase.from('harvest_module_drafts').select('revision,input_data,import_rows,import_result').eq('domain_id',domain).maybeSingle()
 if(error)fail(error)
 return data as {revision:number;input_data:MigrationData;import_rows:unknown[];import_result:HarvestImportResult|null}|null
}
export async function saveHarvestModuleDraft(domain:string,revision:number,input:MigrationData,rows:unknown[]){
 const {data,error}=await supabase.rpc('save_harvest_module_draft',{p_domain:domain,p_revision:revision,p_input:input,p_rows:rows})
 if(error)fail(error)
 if(!Number.isInteger(data)||data<1)throw new Error('Sauvegarde non confirmée : rechargez le module.')
 return data as number
}
export async function importSavedHarvestModule(domain:string,revision:number):Promise<HarvestImportResult>{
 const {data,error}=await supabase.rpc('import_saved_harvest_module',{p_domain:domain,p_revision:revision})
 if(error)fail(error)
 if(!data||!Number.isInteger(data.created)||!Number.isInteger(data.already_imported))throw new Error('Import non confirmé : rechargez le bilan avant de réessayer.')
 return data
}
