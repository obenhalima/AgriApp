import {NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {randomUUID} from 'node:crypto'
import {localVault,connectionKey,publicConnection,sendDocIndexFixture,docIndexFailureMessage,newDocIndexFixture,fixtureReference,type LocalConnection} from '../../../../../lib/docIndexLocal.server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function reply(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})}
async function authorize(req:Request){
 const url=new URL(req.url)
 if(process.env.ITRIX_LOCAL_DOCINDEX_ENABLED!=='1'||process.env.VERCEL||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('LOCAL_ONLY')
 if(req.method!=='GET'&&req.headers.get('origin')!==url.origin)throw Error('FORBIDDEN')
 const domain=url.searchParams.get('domain')||'',recipient=url.searchParams.get('recipient')||''
 if(!/^[a-f0-9-]{36}$/i.test(domain)||!['fixture-recipient-A','fixture-recipient-B'].includes(recipient))throw Error('INVALID_INPUT')
 const token=req.headers.get('authorization')||''
 if(!/^Bearer [^\s]+$/.test(token))throw Error('UNAUTHORIZED')
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:token},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})},auth:{persistSession:false,autoRefreshToken:false}})
 const identity=await db.auth.getUser(token.slice(7))
 if(identity.error||!identity.data.user)throw Error('UNAUTHORIZED')
 const actor=identity.data.user.id
 const profile=await db.from('profiles').select('is_active,is_platform_admin').eq('id',actor).maybeSingle()
 if(profile.error||!profile.data?.is_active)throw Error('FORBIDDEN')
 const domainRow=await db.from('domains').select('id').eq('id',domain).eq('is_active',true).maybeSingle()
 if(domainRow.error||!domainRow.data)throw Error('FORBIDDEN')
 if(!profile.data.is_platform_admin){
  const member=await db.from('domain_memberships').select('roles!inner(is_admin,is_active)').eq('user_id',actor).eq('domain_id',domain).eq('is_active',true).maybeSingle()
  const role=member.data?.roles as unknown as {is_admin?:boolean;is_active?:boolean}|null
  if(member.error||!role?.is_admin||!role.is_active)throw Error('FORBIDDEN')
 }
 return {domain,recipient,actor}
}
function failure(error:unknown){
 const code=error instanceof Error?error.message:''
 const status=code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='INVALID_INPUT'?400:503
 return reply({error:code==='LOCAL_ONLY'?'Test réel disponible uniquement sur le serveur local autorisé.':status===401?'Reconnectez-vous pour accéder à la configuration.':status===403?'Accès réservé aux administrateurs du client sélectionné.':status===400?'Configuration invalide.':'Configuration sécurisée indisponible. Réessayez sans communiquer votre clé.'},status)
}
export async function GET(req:Request){try{
 const {domain,recipient}=await authorize(req)
 return reply(await localVault(async vault=>publicConnection(vault[connectionKey(domain,recipient)])))
}catch(error){return failure(error)}}
export async function POST(req:Request){try{
 const {domain,recipient,actor}=await authorize(req)
 if(Number(req.headers.get('content-length')||0)>4096)throw Error('INVALID_INPUT')
 const text=await req.text();if(text.length>4096)throw Error('INVALID_INPUT')
 const body=JSON.parse(text),key=connectionKey(domain,recipient),at=new Date().toISOString()
 if(body.action==='configure'){
  if(typeof body.space!=='string'||!body.space.trim()||body.space.length>120||typeof body.enabled!=='boolean'||typeof body.apiKey!=='string'||(body.apiKey&&!/^dik_[A-Za-z0-9_-]{8,240}$/.test(body.apiKey)))throw Error('INVALID_INPUT')
  return reply(await localVault(async vault=>{
   const old=vault[key]
   if(!old&&!body.apiKey)throw Error('INVALID_INPUT')
   // Clear stale receipts on configuration changes, but keep the idempotency
   // reference stable across key rotations (including within the same space).
   const changed=!!old&&((!!body.apiKey&&body.apiKey!==old.apiKey)||body.space.trim()!==old.space)
   const c:LocalConnection={...old,domain,recipient,space:body.space.trim(),enabled:body.enabled,apiKey:body.apiKey||old?.apiKey||'',generation:old?.generation||randomUUID(),events:old?.events||[],remoteId:changed?undefined:old?.remoteId,status:changed?undefined:old?.status,lastAttempt:old?.lastAttempt}
   c.events=[...c.events,{at,actor,action:'Configuration serveur enregistrée (clé masquée)'}].slice(-100)
   vault[key]=c;return publicConnection(c)
  }))
 }
 if(body.action==='new_fixture'&&body.confirmNew===true){
  return reply(await localVault(async vault=>{
   const c=vault[key];if(!c?.enabled)return {error:'Activez et enregistrez le connecteur avant de créer une facture fictive.'}
   vault[key]=newDocIndexFixture(c,actor,at)
   return publicConnection(vault[key])
  }))
 }
 if(body.action!=='send_fixture'||body.confirmFictitious!==true)throw Error('INVALID_INPUT')
 return reply(await localVault(async vault=>{
  const c=vault[key];if(!c?.enabled)return {error:'Activez et enregistrez la configuration du destinataire avant l’envoi.'}
  if(body.reference!==undefined&&body.reference!==fixtureReference(c))return {error:'Une nouvelle facture a été créée dans un autre onglet. Actualisez avant l’envoi.'}
  const hourly=c.events.filter(e=>e.action==='Tentative d’envoi réel fictif'&&Date.parse(e.at)>Date.now()-3600000).length
  if(hourly>=10||(c.lastAttempt&&Date.now()-Date.parse(c.lastAttempt)<60000))return {error:'Patientez une minute entre les envois. Maximum local : 10 tentatives par heure pour ce destinataire.'}
  c.lastAttempt=at;c.events.push({at,actor,action:'Tentative d’envoi réel fictif'})
  try{const receipt=await sendDocIndexFixture(c);c.remoteId=receipt.id;c.status=receipt.status;c.events.push({at:new Date().toISOString(),actor,action:'Facture fictive reçue par DocIndex',remoteId:receipt.id})}
  catch(error){const message=docIndexFailureMessage(error);c.events.push({at:new Date().toISOString(),actor,action:message});c.events=c.events.slice(-100);return {...publicConnection(c),error:message}}
  c.events=c.events.slice(-100);return publicConnection(c)
 }))
}catch(error){return failure(error)}}
