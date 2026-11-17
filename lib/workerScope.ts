import {supabase} from './supabase'

export type WorkerFarm = {id:string;code:string;name:string}

async function readWorkerPages(makeQuery:()=>any):Promise<any[]> {
  const rows:any[]=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await makeQuery().order('id').range(offset,offset+499)
    if(error)throw error
    rows.push(...(data||[]))
    if(!data||data.length<500)return rows
  }
}

export async function listClientWorkerFarms(domainId:string):Promise<WorkerFarm[]> {
  if(!domainId)throw new Error('Sélectionnez un client')
  return readWorkerPages(()=>supabase.from('farms').select('id,code,name').eq('domain_id',domainId).order('name'))
}

export async function listClientWorkers(domainId:string):Promise<any[]> {
  if(!domainId)throw new Error('Sélectionnez un client')
  // An inner join excludes workers without a direct farm attachment.
  return readWorkerPages(()=>supabase.from('workers').select('*,farms!inner(id,domain_id)').eq('farms.domain_id',domainId).order('last_name'))
}

export async function listClientPayslips(domainId:string):Promise<any[]> {
  if(!domainId)throw new Error('Sélectionnez un client')
  return readWorkerPages(()=>supabase.from('payslips').select('*,workers!inner(farm_id,farms!inner(domain_id))').eq('workers.farms.domain_id',domainId))
}
