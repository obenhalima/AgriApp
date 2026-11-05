// Read-only schema check: public browser key only, zero business rows requested.
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local'))
const base=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if(!base||!key)throw Error('Configuration publique Supabase absente')
const source=fs.readFileSync('app/recoltes/page.tsx','utf8')
const select=source.match(/from\('harvest_lots'\)\s*\.select\('([^']+)'\)/)?.[1]
if(!select)throw Error('Requête des envois introuvable')
const checks=[['minimal','harvest_lots','id'],['station_history','harvest_lots',select]]
const load=source.slice(source.indexOf('const [hRes, dRes'),source.indexOf('if (!isCurrent()) return'))
for(const match of load.matchAll(/from\('([^']+)'\)\s*\.select\('([^']+)'/g)){
 checks.push(['screen_'+match[1],match[1],match[2]])
}
const report=fs.readFileSync('components/harvest/PricedDispatchReport.tsx','utf8')
const planting=report.match(/const plantingSelect = '([^']+)'/)?.[1]
const invoice=report.match(/const invoiceSelect = '([^']+)'/)?.[1]
for(const match of report.matchAll(/from\('([^']+)'\)\.select\(`([^`]+)`\)/g)){
 checks.push(['recap_'+match[1],match[1],match[2].replaceAll('${plantingSelect}',planting).replaceAll('${invoiceSelect}',invoice)])
}
for(const [label,table,fields] of checks){
 const url=new URL('/rest/v1/'+table,base)
 url.searchParams.set('select',fields);url.searchParams.set('limit','0')
 const response=await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)})
 const result=await response.json()
 if(!response.ok)process.exitCode=1
 console.log(JSON.stringify({check:label,status:response.status,...(!response.ok?{code:result.code,message:result.message,details:result.details,hint:result.hint}:{rows_requested:0})}))
}
const alertUrl=new URL('/rest/v1/alerts',base)
alertUrl.searchParams.set('select','id');alertUrl.searchParams.set('limit','0');alertUrl.searchParams.set('type','eq.no_harvest')
const alertResponse=await fetch(alertUrl,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)})
const alertResult=await alertResponse.json()
console.log(JSON.stringify({check:'legacy_alert_filter',status:alertResponse.status,code:alertResult.code,message:alertResult.message,rows_requested:0}))
