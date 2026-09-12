import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local'))
const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mobile-readiness`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},body:JSON.stringify({action:process.argv.includes('--configure')?'configure':'inspect'}),signal:AbortSignal.timeout(45000)})
console.log('Readiness HTTP:',response.status)
console.log(await response.text())
if(!response.ok)process.exitCode=1
