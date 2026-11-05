'use client'
import {useEffect,useState} from 'react'
import {usePathname} from 'next/navigation'
import {X,AlertTriangle} from 'lucide-react'
import {DELETION_BLOCKED_EVENT} from '@/lib/deletionFeedback'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'

export function DeletionFeedback(){
 const [message,setMessage]=useState('')
 const pathname=usePathname()
 const {activeDomain}=useAuth()
 const {t}=useLanguage()
 useEffect(()=>{
  const listener=(event:Event)=>{const text=(event as CustomEvent<string>).detail;if(typeof text==='string')setMessage(text)}
  window.addEventListener(DELETION_BLOCKED_EVENT,listener)
  return()=>window.removeEventListener(DELETION_BLOCKED_EVENT,listener)
 },[])
 useEffect(()=>setMessage(''),[pathname,activeDomain?.domain_id])
 if(!message)return null
 return <div role="alert" className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-red-600 bg-red-50 p-4 text-red-800 shadow-lg">
  <AlertTriangle size={22} className="shrink-0" aria-hidden="true"/>
  <p className="flex-1 font-medium">{message}</p>
  <button type="button" aria-label={t('Fermer')} onClick={()=>setMessage('')} className="shrink-0 rounded p-1 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><X size={18}/></button>
 </div>
}
