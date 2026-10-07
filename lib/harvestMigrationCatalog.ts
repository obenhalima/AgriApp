import { supabase } from './supabase'
import type { MigrationCatalog } from './harvestMigration'

/** Uses the current authenticated session and RLS. No service key or writes. */
export async function loadHarvestMigrationCatalog(domainId: string, domainName: string): Promise<MigrationCatalog> {
  if (!domainId) throw new Error('Sélectionnez un client avant de préparer la reprise.')
  async function all(make: () => any) {
    const result: any[]=[]
    for(let offset=0;;offset+=500) {
      const {data,error}=await make().order('id').range(offset,offset+499)
      if(error) throw new Error(`Référentiels indisponibles : ${error.message}`)
      result.push(...data||[])
      if(!data || data.length<500) return result
    }
  }
  const [plantings,markets,values,existing]=await Promise.all([
    all(()=>supabase.from('campaign_plantings').select('id,first_harvest_date,last_harvest_date,greenhouses!inner(code,name,farms!inner(code,name,domain_id)),campaigns!inner(code,name,domain_id),varieties(code,commercial_name)').eq('domain_id',domainId).eq('greenhouses.farms.domain_id',domainId).eq('campaigns.domain_id',domainId)),
    // Markets and clients are shared reference catalogs in the current schema.
    all(()=>supabase.from('markets').select('id,code,name,type,currency,clients!client_id(name)').eq('is_active',true)),
    all(()=>supabase.from('reference_values').select('id,list_key,code,label,metadata').in('list_key',['tray_type','destination_rejet']).eq('is_active',true)),
    all(()=>supabase.from('harvests').select('id,campaign_planting_id,harvest_date,lot_number').eq('domain_id',domainId)),
  ])
  const result: MigrationCatalog={domainId,domainName,fetchedAt:new Date().toISOString(),
    plantings:plantings.map(p=>{
      const h=p.greenhouses,f=h.farms,c=p.campaigns,v=p.varieties
      return {id:p.id,label:`${f.code} · ${c.code} · ${h.code} · ${v.commercial_name} [${p.id}]`,farm:`${f.code} — ${f.name}`,campaign:`${c.code} — ${c.name}`,greenhouse:`${h.code} — ${h.name||h.code}`,variety:`${v.code} — ${v.commercial_name}`,start:p.first_harvest_date,end:p.last_harvest_date}
    }),
    markets:markets.map(m=>({id:m.id,label:`${m.code||m.id} — ${m.name}${m.clients?.name?' — '+m.clients.name:''}`,currency:m.currency||'',client:m.clients?.name||'',type:m.type||''})),
    trays:values.filter(v=>v.list_key==='tray_type').map(v=>({code:v.code,label:v.label,weight:Number(v.metadata?.poids_kg||0)})),
    destinations:values.filter(v=>v.list_key==='destination_rejet').map(v=>({code:v.code,label:v.label})),
    existing:existing.map(h=>({planting:h.campaign_planting_id,date:h.harvest_date,ref:h.lot_number})),
  }
  if(!result.plantings.length) throw new Error('Aucune plantation paramétrée pour ce client. Renseignez campagne, ferme, serre et variété avant l’export.')
  return result
}
