// All Supabase requests are mocked. This test never changes business data.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import ts from 'typescript'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const require=createRequire(import.meta.url)
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)
const ExcelJS=require('exceljs')
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3001'
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'stock-history@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')

let phase='outage'
const errors=[],trace=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;trace.push({path,phase})
  let result=[],status=200
  if(path==='/auth/v1/token'){
   if(phase==='outage'){status=503;result={}}
   else if(phase==='invalid'){status=400;result={code:'invalid_credentials',msg:'Invalid login credentials'}}
   else result={access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}
  }
  else if(path==='/auth/v1/user'){if(phase==='outage'){status=503;result={}}else result=user}
  else if(path.endsWith('/profiles'))result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]??null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage();page.setDefaultTimeout(30000)
 page.on('console',message=>{if(message.type()==='warning')console.log(message.text())})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:120000})
 await page.waitForTimeout(31000) // Exercise an explicit login after initial verification failure.
 await page.locator('input[type=email]').fill('login-test@example.test')
 await page.locator('input[type=password]').fill('fake-password')
 await page.getByRole('button',{name:'Se connecter',exact:true}).click()
 await expect(page.locator('form [role=alert]')).toContainText('temporairement indisponible')
 await expect(page.locator('form [role=alert]')).not.toContainText('{}')
 phase='invalid'
 await page.getByRole('button',{name:'Se connecter',exact:true}).click()
 await expect(page.locator('form [role=alert]')).toContainText('Email ou mot de passe incorrect')
 phase='success'
 await page.getByRole('button',{name:'Se connecter',exact:true}).click()
 try{await expect(page).not.toHaveURL(/\/login/,{timeout:15000})}catch(error){console.log(JSON.stringify(trace));console.log(await page.locator('form').innerText());throw error}
 await page.goto(base+'/admin/parametres',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByLabel('Méthode de valorisation',{exact:true})).toBeEnabled()
 expect(errors).toEqual([])
 console.log('PASS login outage message, invalid credentials and successful recovery into authenticated settings')
}finally{await browser.close()}
