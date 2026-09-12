// Réinitialise le mot de passe d'un utilisateur administrable et impose son changement.
// Le mot de passe temporaire n'est jamais écrit en base ni dans les logs applicatifs.
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
    const admin=createClient(url,key)
    const session=await admin.auth.getUser(token)
    if(session.error||!session.data.user)return json({error:'Session invalide'},401)
    const actorId=session.data.user.id
    const {target_user_id,temporary_password}=await req.json()
    if(!target_user_id)return json({error:'Utilisateur cible obligatoire'},400)
    if(typeof temporary_password!=='string'||temporary_password.length<8)return json({error:'Le mot de passe temporaire doit contenir au moins 8 caractères'},400)
    if(target_user_id===actorId)return json({error:'Utilisez votre fiche personnelle pour modifier votre propre mot de passe'},400)

    const [{data:actor},{data:target}]=await Promise.all([
      admin.from('profiles').select('is_platform_admin').eq('id',actorId).single(),
      admin.from('profiles').select('email,is_platform_admin').eq('id',target_user_id).single(),
    ])
    if(!target)return json({error:'Utilisateur introuvable'},404)
    if(target.is_platform_admin&&!actor?.is_platform_admin)return json({error:'Seul un super-administrateur peut agir sur ce compte'},403)
    const {data:canManage}=await admin.rpc('can_manage_profile',{p_target:target_user_id,p_actor:actorId})
    if(!canManage)return json({error:'Utilisateur hors de vos sociétés administrées'},403)
    const {data:shared}=await admin.from('domain_memberships').select('domain_id').eq('user_id',target_user_id).limit(1).maybeSingle()

    const authResult=await admin.auth.admin.updateUserById(target_user_id,{password:temporary_password})
    if(authResult.error){
      await admin.from('temporary_password_resets').insert({target_user_id,requested_by:actorId,domain_id:shared?.domain_id||null,status:'echec'})
      return json({error:authResult.error.message},400)
    }
    const profileResult=await admin.from('profiles').update({must_change_password:true,updated_at:new Date().toISOString()}).eq('id',target_user_id)
    await admin.from('temporary_password_resets').insert({target_user_id,requested_by:actorId,domain_id:shared?.domain_id||null,status:profileResult.error?'echec':'applique'})
    if(profileResult.error)return json({error:profileResult.error.message},400)
    return json({ok:true,email:target.email})
  }catch(e:any){return json({error:e?.message||'Erreur serveur'},500)}
})
