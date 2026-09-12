import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { timingSafeEqual } from 'node:crypto'
import { allowedPushEndpoint, notificationBody } from '@/lib/mobilePush'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:Request){
 const expected=process.env.CRON_SECRET,provided=req.headers.get('authorization')?.replace(/^Bearer /,'')||''
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return NextResponse.json({error:'Unauthorized'},{status:401})
 const base=process.env.APP_PUBLIC_URL,publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY
 if(!base?.startsWith('https://')||!publicKey||!privateKey||!process.env.SUPABASE_SERVICE_ROLE_KEY)return NextResponse.json({error:'Notification service not configured'},{status:503})
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const refreshed=await db.rpc('mobile_refresh_notifications');if(refreshed.error)return NextResponse.json({error:'Queue unavailable'},{status:503})
 const claimed=await db.rpc('mobile_claim_notifications');if(claimed.error)return NextResponse.json({error:'Claim failed'},{status:503})
 let sent=0,failed=0,cancelled=0
 await Promise.all((claimed.data||[]).map(async(n:any)=>{
  try {
   const membership=await db.rpc('is_domain_member',{p_domain_id:n.domain_id,p_user_id:n.user_id})
   // Use the same active profile and domain checks for both pending and result messages.
   const profile=await db.from('profiles').select('is_active').eq('id',n.user_id).single()
   if(membership.error||profile.error)throw Error('access_check_failed')
   let allowed=membership.data===true&&profile.data?.is_active===true
   if(n.phase==='pending'){const check=await db.rpc('mobile_can_review',{p_kind:n.kind,p_id:n.entity_id,p_user:n.user_id});if(check.error)throw Error('access_check_failed');allowed=allowed&&check.data===true}
   const prefs=await db.from('mobile_notification_preferences').select('*').eq('user_id',n.user_id).maybeSingle()
   if(prefs.error)throw Error('preference_check_failed')
   let processCode=n.kind
   if(n.kind==='approval'){const source=await db.from('approval_requests').select('process_code').eq('id',n.entity_id).eq('domain_id',n.domain_id).maybeSingle();if(source.error)throw Error('access_check_failed');processCode=source.data?.process_code||'';allowed=allowed&&!!processCode}
   const rule=await db.from('mobile_notification_rules').select('enabled').eq('domain_id',n.domain_id).eq('process',processCode).maybeSingle()
   if(rule.error)throw Error('preference_check_failed')
   allowed=allowed&&rule.data?.enabled!==false
   allowed=allowed&&(n.channel==='push'?prefs.data?.push_enabled!==false:prefs.data?.telegram_enabled===true)
   if(!allowed){await db.from('mobile_notifications').update({cancelled:true,last_error:'No longer eligible',locked_until:null}).eq('id',n.id);cancelled++;return}
   const body=notificationBody(n.phase)
   if(n.channel==='push'){
    const s=await db.from('mobile_push_subscriptions').select('*').eq('id',n.subscription_id).eq('user_id',n.user_id).single()
    if(!s.data||!allowedPushEndpoint(s.data.endpoint))throw Error('invalid_subscription')
    try{await webpush.sendNotification({endpoint:s.data.endpoint,keys:s.data.keys},JSON.stringify({body,tag:n.kind+n.entity_id}),{vapidDetails:{subject:base,publicKey,privateKey},TTL:3600,timeout:10000})}
    catch(e:any){if(e.statusCode===404||e.statusCode===410)await db.from('mobile_push_subscriptions').delete().eq('id',s.data.id);throw Error('push_delivery_failed')}
   }else{
    const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw Error('telegram_not_configured')
    const link=await db.from('mobile_telegram_links').select('chat_id').eq('user_id',n.user_id).single()
    if(!link.data?.chat_id)throw Error('telegram_not_linked')
    const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({chat_id:link.data.chat_id,text:body,reply_markup:{inline_keyboard:[[{text:'Ouvrir FarmPilot',url:base.replace(/\/$/,'')+'/validations'}]]}})})
    const result=await response.json();if(!response.ok||!result.ok)throw Error('telegram_delivery_failed')
   }
   const result=await db.from('mobile_notifications').update({sent_at:new Date().toISOString(),locked_until:null,last_error:null}).eq('id',n.id);if(result.error)throw Error('delivery_record_failed');sent++
  }catch(e:any){failed++;await db.from('mobile_notifications').update({locked_until:null,available_at:new Date(Date.now()+Math.min(3600,60*2**n.attempts)*1000).toISOString(),last_error: ['preference_check_failed','invalid_subscription','push_delivery_failed','telegram_not_configured','telegram_not_linked','telegram_delivery_failed','delivery_record_failed'].includes(e.message)?e.message:'delivery_failed'}).eq('id',n.id)}
 }))
 return NextResponse.json({sent,failed,cancelled},{headers:{'Cache-Control':'no-store'}})
}
