'use client'
import {useLanguage} from '@/lib/i18n'

import {useEffect,useState} from 'react'
import {supabase} from '@/lib/supabase'

export function HarvestDarNotice({plantingId,date}:{plantingId:string;date:string}) {
 const {t:_ui,text:_uiNode}=useLanguage()

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
 if(!plantingId||!date)return <p className="text-caption text-fg-tertiary">{_ui("Le DAR sera contrôlé pour la serre et la date choisies.")}</p>
 if(state.key!==key||state.loading)return <p className="text-caption">{_ui("Vérification du DAR…")}</p>
 if(state.error)return <p role="alert" className="text-warning">{_ui("Aperçu DAR indisponible :")}{" "}{_uiNode(state.error)}{_ui(". Le contrôle en base reste obligatoire.")}</p>
 if(!state.blocks.length)return <p className="text-caption text-success">{_ui("Aucun blocage DAR identifié pour cette date. Nouvelle vérification à l’enregistrement.")}</p>
 return <div role="alert" className="border border-danger rounded-md p-sm text-danger text-caption">
  <p className="font-semibold">{_ui("Récolte bloquée par le DAR")}</p>
  {state.blocks.map((b,index)=><p key={index}>{b.product} : {b.eligible_date?_ui("récolte autorisée à partir du {v0}",{v0:String(b.eligible_date.split('-').reverse().join('/'))}):_ui("DAR inconnu — régularisation requise")}</p>)}
 </div>
}
