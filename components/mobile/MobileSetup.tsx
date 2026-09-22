'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export function MobileSetup({expanded=false}:{expanded?:boolean}) {
 const { user, activeDomain } = useAuth()
 const [diagnostic,setDiagnostic]=useState('')
 async function testNotification(remote:boolean){
  setBusy(true);setDiagnostic('Vérification du téléphone…')
  try{
   if(!('Notification' in window)||!('serviceWorker' in navigator))throw Error('Ouvrez FarmPilot depuis son icône installée sur l’écran d’accueil.')
   if(Notification.permission!=='granted')throw Error(`Autorisation : ${Notification.permission}. Autorisez les notifications dans les réglages puis activez ce téléphone.`)
   const registration=await navigator.serviceWorker.getRegistration('/')
   if(!registration?.active)throw Error('Service mobile non actif. Rechargez la PWA puis réessayez.')
   if(!remote){await registration.showNotification('FarmPilot · Test local',{body:'Affichage local opérationnel. Testez ensuite la réception depuis le serveur.',tag:`local-test-${Date.now()}`,icon:'/pwa/icon-192.png'});setDiagnostic('Test local demandé à iOS. Vérifiez la bannière ou le centre de notifications ; ce test ne passe pas par le serveur.');return}
   const subscription=await registration.pushManager.getSubscription()
   if(!subscription)throw Error('Aucun abonnement sur cet appareil. Cliquez sur Activer sur ce téléphone.')
   const session=await supabase.auth.getSession()
   if(!session.data.session||!activeDomain)throw Error('Reconnectez-vous et sélectionnez un client.')
   setDiagnostic('Test serveur en cours. Vous pouvez mettre FarmPilot en arrière-plan et vérifier le centre de notifications.')
   const response=await fetch('/api/mobile/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({endpoint:subscription.endpoint,domain:activeDomain.domain_id}),signal:AbortSignal.timeout(25000)})
   const result=await response.json();if(!response.ok)throw Error(result.error||'Test serveur indisponible.')
   setDiagnostic(result.message)
  }catch(e:any){setDiagnostic(e.name==='TimeoutError'?'Délai dépassé : résultat inconnu. Consultez les notifications avant de réessayer.':e.message)}finally{setBusy(false)}
 }
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[code,setCode]=useState(''),[linked,setLinked]=useState(false),[configured,setConfigured]=useState(false)
 useEffect(()=>{let stopped=false;setCode('');setLinked(false);if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>{if(!stopped)setReady(true)}).catch(()=>{if(!stopped)setMessage('Installation du service mobile impossible.')});fetch('/api/mobile/config',{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).then(c=>{if(!stopped)setConfigured(!!c.publicKey)}).catch(()=>{}); if(user) supabase.from('mobile_telegram_links').select('linked_at').eq('user_id',user.id).maybeSingle().then(r=>{if(!stopped)setLinked(!!r.data?.linked_at)});return()=>{stopped=true}},[user])
 async function enablePush(){
  setBusy(true);setMessage('')
  try {
   if(!user || !('PushManager' in window) || !('Notification' in window)) throw Error('Sur iPhone : iOS 16.4 minimum et FarmPilot ajouté à l’écran d’accueil. Ouvrez ensuite cette icône.')
   // Permission requested directly from a click, before any network wait (iOS).
   if(await Notification.requestPermission()!=='granted') throw Error('Notifications non autorisées. Vérifiez les réglages du téléphone.')
   const response=await fetch('/api/mobile/config',{signal:AbortSignal.timeout(15000)});const config=await response.json()
   if(!response.ok || !config.publicKey) throw Error('Le serveur de notifications n’est pas encore configuré.')
   const registration=await navigator.serviceWorker.ready
   const existing=await registration.pushManager.getSubscription()
   const subscription=existing || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey})
   const json=subscription.toJSON()
   const result=await supabase.from('mobile_push_subscriptions').upsert({user_id:user.id,endpoint:json.endpoint,keys:json.keys},{onConflict:'endpoint'}).abortSignal(AbortSignal.timeout(20000))
   if(result.error){await subscription.unsubscribe();throw Error('Impossible de rattacher ce téléphone. Réessayez pour créer un abonnement personnel.')}
   const pref=await supabase.from('mobile_notification_preferences').upsert({user_id:user.id,push_enabled:true}).abortSignal(AbortSignal.timeout(20000))
   if(pref.error) throw pref.error
   setMessage('Téléphone enregistré. La réception effective dépend du service d’envoi et des réglages du téléphone.')
  }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 }
 async function disablePush(){setBusy(true);try{const registration=await navigator.serviceWorker.ready;const sub=await registration.pushManager.getSubscription();if(sub){const r=await supabase.from('mobile_push_subscriptions').delete().eq('endpoint',sub.endpoint);if(r.error)throw r.error;await sub.unsubscribe()}setMessage('Notifications désactivées sur cet appareil.')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 async function telegram(){setBusy(true);try{const r=await supabase.rpc('mobile_telegram_invite').abortSignal(AbortSignal.timeout(20000));if(r.error)throw r.error;setCode(r.data);setMessage('Envoyez la commande ci-dessous au bot FarmPilot en conversation privée. Code personnel valable 15 minutes : ne le partagez pas.');const p=await supabase.from('mobile_notification_preferences').upsert({user_id:user!.id,telegram_enabled:true}).abortSignal(AbortSignal.timeout(20000));if(p.error)throw p.error}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 return <details open={expanded||undefined} className="rounded-xl border border-border p-5 bg-surface-raised text-fg-primary"><summary className="cursor-pointer font-semibold">Installer FarmPilot / Notifications</summary><div className="space-y-4 pt-4 text-sm leading-relaxed">
  <p>Android : menu Chrome → Installer l’application. iPhone : Safari → Partager → Sur l’écran d’accueil ; ouvrez l’icône FarmPilot, puis activez les notifications (iOS 16.4 minimum).</p>
  <p>Une connexion Internet est obligatoire pour consulter et décider. Aucune approbation n’est enregistrée hors ligne.</p>
  <fieldset className="space-y-2 rounded-lg border p-3"><legend className="font-semibold">Tester les notifications</legend><p>1. Vérifiez l’affichage local. 2. Testez l’envoi serveur à ce téléphone uniquement. Une acceptation serveur ne prouve pas l’affichage sur iOS.</p><div className="flex flex-wrap gap-2"><button className="rounded border p-3 disabled:opacity-50" disabled={busy||!ready} onClick={()=>testNotification(false)}>1 · Tester l’affichage local</button><button className="rounded border p-3 disabled:opacity-50" disabled={busy||!ready||!configured} onClick={()=>testNotification(true)}>2 · Tester l’envoi push</button></div>{diagnostic&&<p role="status" className="break-words">{diagnostic}</p>}</fieldset>
  {configured?<p className="rounded bg-green-50 p-2">Service de notifications disponible. Activez ce téléphone pour recevoir les demandes qui nécessitent votre validation, puis ouvrez la notification pour consulter et décider.</p>:<p className="rounded bg-amber-50 p-2">L’envoi push n’est pas encore configuré ou le service est temporairement indisponible. L’installation et les validations restent disponibles.</p>}
  <div className="flex flex-wrap gap-2"><button className="rounded bg-green-800 text-white p-3 disabled:opacity-50" disabled={busy||!ready||!configured} onClick={enablePush}>Activer sur ce téléphone</button><button className="rounded border p-3" disabled={busy||!ready} onClick={disablePush}>Désactiver sur ce téléphone</button><button className="rounded border p-3" disabled={busy} onClick={telegram}>{linked?'Relier un autre compte Telegram':'Relier Telegram'}</button>
  <button className="rounded border p-3" disabled={busy} onClick={async()=>{const r=await supabase.rpc('mobile_telegram_disconnect');setMessage(r.error?r.error.message:'Telegram déconnecté');setLinked(false);setCode('')}}>Déconnecter Telegram</button></div>
  {code&&<><code className="block break-all select-all rounded bg-slate-100 p-3">/start FP_{code}</code><a className="underline" href={`https://t.me/BenhalimaFarm_bot?start=FP_${code}`} target="_blank" rel="noopener noreferrer">Ouvrir @BenhalimaFarm_bot dans Telegram</a></>}{message&&<p role="status">{message}</p>}
 </div></details>
}
