// Public browser key; schema-only GETs with no business rows returned.
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local'))
const source=fs.readFileSync('lib/supabase.ts','utf8')
const query=source.slice(source.indexOf('export const getFactures ='),source.indexOf('export const createFacture ='))
const fields=query.match(/\.select\('([^']+)'\)/)?.[1]
if(!fields)throw Error('Sélection factures introuvable')
const url=new URL('/rest/v1/invoices',env.NEXT_PUBLIC_SUPABASE_URL)
url.searchParams.set('select',fields);url.searchParams.set('limit','0')
const response=await fetch(url,{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`},signal:AbortSignal.timeout(15000)})
const result=await response.json()
console.log(JSON.stringify({status:response.status,rows_requested:0,...(!response.ok?{code:result.code,message:result.message,details:result.details,hint:result.hint}:{})}))
if(!response.ok)process.exitCode=1
