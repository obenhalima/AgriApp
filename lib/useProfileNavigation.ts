'use client'
import {useEffect,useState} from 'react'
import {useAuth} from './auth'
import {supabase} from './supabase'
import {profileNavigation,type MenuConfig} from './profileNavigation'
export function useProfileNavigation(){
 const {activeDomain,role,canAccessModule,isPlatformAdmin}=useAuth()
 const key=`${activeDomain?.domain_id}:${role?.id}`
 const [state,setState]=useState<{key:string;config:MenuConfig|null}>({key:'',config:null})
 useEffect(()=>{
  let cancelled=false
  const load=async()=>{
   if(!activeDomain||!role){setState({key,config:null});return}
   try{const {data,error}=await supabase.from('profile_navigation').select('config').eq('domain_id',activeDomain.domain_id).eq('role_id',role.id).maybeSingle();if(!cancelled)setState({key,config:error?null:data?.config||null})}catch{if(!cancelled)setState({key,config:null})}
  }
  load();window.addEventListener('profile-navigation-updated',load)
  return()=>{cancelled=true;window.removeEventListener('profile-navigation-updated',load)}
 },[key,activeDomain,role])
 const config=state.key===key?state.config:null
 const nav=profileNavigation(config,canAccessModule,isPlatformAdmin)
 const home=config?.home&&nav.some(g=>g.items.some(i=>i.href===config.home))?config.home:''
 return {nav,config,home,loading:state.key!==key}
}
