// For a trusted scheduler or an operator; never expose this secret in browser code.
import dotenv from 'dotenv'
dotenv.config({path:'.env.local',quiet:true})
const base=process.env.APP_PUBLIC_URL,secret=process.env.CRON_SECRET
if(!base?.startsWith('https://')||!secret)throw Error('APP_PUBLIC_URL HTTPS and CRON_SECRET are required')
const response=await fetch(base.replace(/\/$/,'')+'/api/mobile/dispatch',{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)})
console.log('Dispatch HTTP:',response.status)
console.log(await response.text())
if(!response.ok)process.exitCode=1
