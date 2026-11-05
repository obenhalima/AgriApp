// Isolated fixture browser; all Supabase calls are mocked, no business writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const user={id:uid,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1450,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 const marketReads=[];let writes=0
 await context.route(`https://${host}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;let data=[]
  if(!['GET','HEAD'].includes(req.method())&&!p.endsWith('/profiles'))writes++
  const d=url.searchParams.get('domain_id')?.replace('eq.','')||a
  if(p==='/auth/v1/user')data=user
  else if(p.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true}]
  else if(p.endsWith('/domain_memberships'))data=[a,b].map((id,i)=>({domain_id:id,role_id:role,is_default:i===0,domains:{code:i?'OTHER':'DOMBEN501',name:i?'Autre client fictif':'Client fictif 501',is_active:true},roles:{name:'Admin',is_active:true}}))
  else if(p.endsWith('/roles'))data=[{id:role,is_admin:true,is_active:true}]
  else if(p.endsWith('/markets')){
   expect(url.searchParams.get('domain_id')).toMatch(/^eq\./);marketReads.push(d)
   // A malicious/stale row is also returned to exercise the UI-side ownership guard.
   data=[{id:d+'-market',domain_id:d,name:d===a?'Station 501':'Station autre client',is_active:true},{id:'foreign',domain_id:d===a?b:a,name:'STATION HORS CLIENT',is_active:true}]
  }
  else if(p.endsWith('/harvests'))data=[{id:d+'-harvest',domain_id:d,lot_number:'RECOLTE-TEST',harvest_date:'2026-10-21',total_qty:100,estimated_kg:100,campaign_planting_id:'planting',campaign_plantings:{variety_id:'variety',greenhouse_id:'house',greenhouses:{code:'S1',farm_id:'farm'},varieties:{code:'V1'}}}]
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage()
 await page.goto('http://localhost:3103/recoltes',{waitUntil:'networkidle',timeout:120000})
 await page.getByRole('button',{name:/À envoyer/}).click()
 await page.getByRole('button',{name:/COMPOSER UN ENVOI/}).click()
 const dialog=page.getByRole('dialog'),select=dialog.locator('select')
 await expect(select.locator('option')).toHaveText(['— sélectionner —','🌍 Station 501'])
 await select.selectOption(a+'-market')
 await page.getByLabel('Société active',{exact:true}).selectOption(b)
  await page.waitForLoadState('networkidle')
  await expect(dialog).toHaveCount(0,{timeout:20000})
  await expect(page.getByLabel('Société active',{exact:true})).toHaveValue(b)
  await page.getByRole('button',{name:/À envoyer/}).click()
 await page.getByRole('button',{name:/COMPOSER UN ENVOI/}).click()
 await expect(select.locator('option')).toHaveText(['— sélectionner —','🌍 Station autre client'])
 await expect(select).toHaveValue('')
 expect(marketReads).toContain(a);expect(marketReads).toContain(b);expect(writes).toBe(0)
 fs.mkdirSync('tmp/harvest-market-scope',{recursive:true});await page.screenshot({path:'tmp/harvest-market-scope/local.png',fullPage:true})
 console.log('PASS tenant-scoped markets, foreign rows hidden, composer closed and selection reset on client switch; ZERO business writes.')
}finally{await browser.close()}
