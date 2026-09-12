// Envoie un email de récupération uniquement pour un utilisateur que l'appelant peut administrer.
// @ts-ignore
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return json({error:'Méthode non autorisée'},405)
 try{
  // @ts-ignore
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/,'')
  if(!token)return json({error:'Non authentifié'},401)
  const admin=createClient(url,key);const ets=await admin.auth.getUser(token)
  if(ets.error||!ets.data.user)return json({error:'Session invalide'},401)
  const actorId=ets.data.user.id;const {target_user_id,redirect_to}=await req.json()
  if(!target_user_id)return json({error:'Utilisateur cible obligatoire'},400)
  const {data:actor}=await admin.from('profiles').select('is_platform_admin').eq('id',actorId).single()
  const {data:target}=await admin.from('profiles').select('email,is_platform_admin').eq('id',target_user_id).single()
  if(!target)return json({error:'Utilisateur introuvable'},404)
  if(target.is_platform_admin&&!actor?.is_platform_admin)return json({error:'Seul un super-administrateur peut agir sur ce compte'},403)
  const {data:canManage}=await admin.rpc('can_manage_profile',{p_target:target_user_id,p_actor:actorId})
  if(!canManage)return json({error:'Utilisateur hors de vos sociétés administrées'},403)
  let redirect=String(redirect_to||'')
  try{const parsed=new URL(redirect);if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost'&&parsed.hostname!=='127.0.0.1')throw new Error();redirect=parsed.origin+'/reset-password'}catch{return json({error:'URL de redirection invalide'},400)}
  const {error}=await admin.auth.resetPasswordForEmail(target.email,{redirectTo:redirect})
  const {data:shared}=await admin.from('domain_memberships').select('domain_id').eq('user_id',target_user_id).limit(1).maybeSingle()
  await admin.from('password_reset_requests').insert({target_user_id,requested_by:actorId,domain_id:shared?.domain_id||null,delivery_status:error?'echec':'envoye'})
  if(error)return json({error:error.message},400)
  return json({ok:true})
 }catch(e:any){return json({error:e?.message||'Erreur serveur'},500)}
})
