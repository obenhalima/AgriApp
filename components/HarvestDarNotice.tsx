'use client'
import {useEffect,useState} from 'react'
import {supabase} from '@/lib/supabase'

export function HarvestDarNotice({plantingId,date}:{plantingId:string;date:string}) {
 const [state,setState]=useState<{key:string;loading:boolean;error:string;blocks:any[]}>({key:'',loading:false,error:'',blocks:[]})
 const key=plantingId+'|'+date
 useEffect(()=>{
  let cancelled=false
  if(!plantingId||!date)return
  setState({key,loading:true,error:'',blocks:[]})
  Promise.resolve(supabase.rpc('get_harvest_dar_blocks',{p_planting:plantingId,p_date:date}))
   .then(({data,error})=>{if(!cancelled)setState({key,loading:false,error:error?.message||'',blocks:data||[]})})
   .catch(error=>{if(!cancelled)setState({key,loading:false,error:error?.message||'Erreur de vérification',blocks:[]})})
  return()=>{cancelled=true}
 },[plantingId,date,key])
 if(!plantingId||!date)return <p className="text-caption text-fg-tertiary">Le DAR sera contrôlé pour la serre et la date choisies.</p>
 if(state.key!==key||state.loading)return <p className="text-caption">Vérification du DAR…</p>
 if(state.error)return <p role="alert" className="text-warning">Aperçu DAR indisponible : {state.error}. Le contrôle en base reste obligatoire.</p>
 if(!state.blocks.length)return <p className="text-caption text-success">Aucun blocage DAR identifié pour cette date. Nouvelle vérification à l’enregistrement.</p>
 return <div role="alert" className="border border-danger rounded-md p-sm text-danger text-caption">
  <p className="font-semibold">Récolte bloquée par le DAR</p>
  {state.blocks.map((b,index)=><p key={index}>{b.product} : {b.eligible_date?`récolte autorisée à partir du ${b.eligible_date.split('-').reverse().join('/')}`:'DAR inconnu — régularisation requise'}</p>)}
 </div>
}
