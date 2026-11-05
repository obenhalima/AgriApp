// Public endpoint readiness only; no user token, password or business row is read.
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local'))
for(const path of ['/auth/v1/health','/auth/v1/settings']){
 const start=Date.now()
 try{
  const result=await fetch(new URL(path,env.NEXT_PUBLIC_SUPABASE_URL),{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`},signal:AbortSignal.timeout(8000)})
  console.log(JSON.stringify({path,status:result.status,duration_ms:Date.now()-start}))
 }catch(error){console.log(JSON.stringify({path,error:error.name,duration_ms:Date.now()-start}))}
}
