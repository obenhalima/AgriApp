// Service-role-only Telegram setup/check. Never returns credentials or message contents.
Deno.serve(async(req:Request)=>{
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
 if(!key||req.headers.get('authorization')!==`Bearer ${key}`)return new Response('Unauthorized',{status:401})
 if(req.method!=='POST')return new Response('Method not allowed',{status:405})
 const token=Deno.env.get('TELEGRAM_BOT_TOKEN'),secret=Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
 if(!token||!secret)return Response.json({ready:false,reason:'Telegram credentials missing'},{status:503})
 try{
  const input=await req.json()
  const call=async(method:string,body?:unknown)=>{
   const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(10000)})
   const data=await response.json();if(!response.ok||!data.ok)throw Error('Telegram API unavailable');return data.result
  }
  const bot=await call('getMe'),hook=await call('getWebhookInfo')
  const expected=`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`
  if(input.action==='configure'){
   if(hook.url&&hook.url!==expected)return Response.json({ready:false,reason:'Existing webhook belongs to another destination; unchanged'},{status:409})
   await call('setWebhook',{url:expected,secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false})
  }
  return Response.json({bot_username:bot.username,webhook_matches:input.action==='configure'||hook.url===expected,pilot_enabled:Deno.env.get('TELEGRAM_PILOT_ENABLED')==='true'})
 }catch{return Response.json({ready:false,reason:'Readiness check failed'},{status:503})}
})
