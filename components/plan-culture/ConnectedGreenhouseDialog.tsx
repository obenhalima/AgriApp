'use client'
import {useEffect,useState,type ComponentProps} from 'react'
import {supabase} from '@/lib/supabase'
import {GreenhouseDetailsDialog} from './GreenhouseDetailsDialog'
type Details=ComponentProps<typeof GreenhouseDetailsDialog>
export function ConnectedGreenhouseDialog(props:Pick<Details,'greenhouse'|'farmName'|'domainId'|'farmId'|'campaignId'|'onClose'>){
 const [data,setData]=useState<{plantings:Details['plantings'];harvests:Details['harvests'];varieties:Details['varieties']}>({plantings:[],harvests:[],varieties:{}})
 const [busy,setBusy]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let alive=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  setBusy(!!props.campaignId);setError('');setData({plantings:[],harvests:[],varieties:{}})
  async function load(){if(!props.campaignId)return;try{
   const plantings:Details['plantings']=[],harvests:Details['harvests']=[],varieties:Details['varieties']={}
   for(let start=0;;start+=500){const r=await supabase.from('campaign_plantings').select('id,variety_id,planted_area,planting_date,status,target_total_production,target_yield_per_m2,harvest_start_date,harvest_end_date,first_harvest_date,last_harvest_date,plant_count,actual_density,greenhouses!inner(farm_id)').eq('domain_id',props.domainId).eq('campaign_id',props.campaignId).eq('greenhouse_id',props.greenhouse.id).eq('greenhouses.farm_id',props.farmId).order('id').range(start,start+499).abortSignal(controller.signal);if(r.error)throw r.error;plantings.push(...(r.data||[]));if((r.data?.length||0)<500)break}
   for(let start=0;;start+=500){const r=await supabase.from('harvests').select('id,campaign_planting_id,total_qty,harvest_date,campaign_plantings!inner(campaign_id,greenhouse_id,greenhouses!inner(farm_id))').eq('domain_id',props.domainId).eq('campaign_plantings.campaign_id',props.campaignId).eq('campaign_plantings.greenhouse_id',props.greenhouse.id).eq('campaign_plantings.greenhouses.farm_id',props.farmId).order('id').range(start,start+499).abortSignal(controller.signal);if(r.error)throw r.error;harvests.push(...(r.data||[]));if((r.data?.length||0)<500)break}
   const ids=Array.from(new Set(plantings.map(p=>p.variety_id)))
   for(let start=0;start<ids.length;start+=100){const r=await supabase.from('varieties').select('id,commercial_name').in('id',ids.slice(start,start+100)).abortSignal(controller.signal);if(r.error)throw r.error;r.data?.forEach(v=>{varieties[v.id]=v.commercial_name})}
   if(alive)setData({plantings,harvests,varieties})
  }catch(e:any){if(alive)setError(`Données de la serre indisponibles : ${e.message||'délai dépassé'}`)}finally{clearTimeout(timer);if(alive)setBusy(false)}}
  void load();return()=>{alive=false;clearTimeout(timer);controller.abort()}
 },[props.domainId,props.farmId,props.campaignId,props.greenhouse.id])
 return <GreenhouseDetailsDialog {...props} {...data} busy={busy} error={error}/>
}
