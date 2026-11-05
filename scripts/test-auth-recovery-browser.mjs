// Isolated browser fixture: all Supabase traffic is intercepted, no real session/data.
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base = process.env.TEST_BASE_URL || 'http://localhost:3103'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role='cccccccc-cccc-4ccc-8ccc-cccccccccccc', domain='11111111-1111-4111-8111-111111111111'
const user={id:uid,email:'qa-auth@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const key=`sb-${host.split('.')[0]}-auth-token`
const session={access_token:token,refresh_token:'qa-preserve-session',expires_at:exp,expires_in:3600,token_type:'bearer',user}
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session))},{key,session})
 let mode='stalled', protectedReads=0,identityReads=0
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname
  let data=[],status=200
  if(path==='/auth/v1/user'){
   identityReads++
   if(mode==='stalled')await new Promise(resolve=>setTimeout(resolve,20000))
   data=user
  } else if(path.endsWith('/profiles')){
   if(mode==='profile-error'){status=503;data={message:'fixture unavailable'}}
   else data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  } else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{code:'QA',name:'Recette',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/invoices')||path.endsWith('/supplier_invoices'))protectedReads++
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{})
 })
 const page=await context.newPage()
 await page.goto(base+'/factures',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Service de connexion indisponible'})).toBeVisible({timeout:22000})
 expect(protectedReads).toBe(0)
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).refresh_token).toBe(session.refresh_token)
 const beforeRetry=identityReads
 await page.getByRole('button',{name:'Réessayer',exact:true}).click()
 await expect(page.getByRole('button',{name:'Vérification en cours…',exact:true})).toBeDisabled()
 // Repeated clicks and focus events must not launch concurrent identity reads.
 await page.getByRole('button',{name:'Vérification en cours…',exact:true}).evaluate(el=>{el.click();el.click();window.dispatchEvent(new Event('focus'))})
 await expect(page.getByRole('button',{name:'Réessayer',exact:true})).toBeEnabled({timeout:22000})
 expect(identityReads-beforeRetry).toBeLessThanOrEqual(1)
 const afterFailure=identityReads
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForTimeout(500)
 expect(identityReads).toBe(afterFailure)
 fs.mkdirSync('tmp/auth-recovery',{recursive:true})
 await page.screenshot({path:'tmp/auth-recovery/service-unavailable.png'})
 mode='healthy'
 await page.getByRole('button',{name:'Réessayer',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Factures',exact:true})).toBeVisible({timeout:22000})
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).refresh_token).toBe(session.refresh_token)
 await page.waitForLoadState('networkidle')
 mode='profile-error';protectedReads=0
 await page.reload({waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Service de connexion indisponible'})).toBeVisible({timeout:22000})
 expect(protectedReads).toBe(0)
 await expect(page.getByText('Compte indisponible ou désactivé.',{exact:false})).toHaveCount(0)
 mode='healthy';await page.getByRole('button',{name:'Réessayer',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Factures',exact:true})).toBeVisible({timeout:22000})
 console.log('PASS HTTP deadline, retry disabled while pending, no concurrent retries, automatic checks suspended after failure, recovery, session preserved and protected children blocked. Mocked backend only.')
} finally {await browser.close()}
