'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// Mark only entries reached while this app shell is mounted. A direct entry
// must never send the user back to an unrelated external website.
export function BackButton() {
 const pathname=usePathname(),router=useRouter(),previous=useRef<string|null>(null)
 useEffect(()=>{
  const state=window.history.state||{}
  // Next.js copies custom state when navigating; associate the marker with its URL.
  if(state.farmPilotBackPath!==pathname){
   window.history.replaceState({...state,farmPilotBackPath:pathname,farmPilotCanGoBack:previous.current!==null&&!['/','/login','/change-password'].includes(previous.current)},'')
  }
  previous.current=pathname
 },[pathname])
 const goBack=()=>{
  const navigation=(window as unknown as {navigation?:{currentEntry?:{index:number};entries:()=>{url?:string}[]}}).navigation
  if(navigation?.currentEntry){
   const url=navigation.entries()[navigation.currentEntry.index-1]?.url
   if(url&&new URL(url).origin===window.location.origin)router.back()
   else router.push('/')
   return
  }
  if(window.history.state?.farmPilotCanGoBack)router.back()
  else router.push('/')
 }
 return <button type="button" onClick={goBack} aria-label="Revenir à la page précédente" title="Page précédente — accueil si aucune page précédente dans l’application" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-xs font-semibold text-fg-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><ArrowLeft size={15}/><span className="hidden sm:inline">Retour</span></button>
}
