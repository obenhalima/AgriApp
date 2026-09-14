// Isolated browser fixture: all Supabase HTTP requests are intercepted; no real decision is sent.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local'))
const host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-mobile@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'})
 await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}))
 await context.route('https://fonts.gstatic.com/**',route=>route.abort())
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 let items=[{kind:'treatment',id:'44444444-4444-4444-8444-444444444444',domain_id:domain,company:'Société QA',process:'treatment',reference:'TRT-QA',level:1,levels:1,requested_by:'other',created_at:new Date().toISOString(),entity:{target_name:'Cible QA'},lines:[],history:[],href:'/agronomie/traitements'}]
 let decisions=0
 const snapshot={request:{target_name:'Cible QA',planned_at:new Date().toISOString()},lines:[{line_id:'red',product:'Produit rouge QA',risk:'red',sources:[{version:'QA'}],prescribed:{dose:1,dose_unit:'l_ha',planned_quantity:2,phi_days:3}},{line_id:'yellow',product:'Produit jaune QA',risk:'yellow',sources:[{version:'QA'}],prescribed:{dose:1,dose_unit:'l_ha',planned_quantity:2,phi_days:3}}]}
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'Responsable QA',role_id:role,is_active:true,is_platform_admin:false,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Société de recette',code:'QA'},roles:{name:'Responsable'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Responsable',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/mobile_approval_items'))data=items
  else if(url.pathname.endsWith('/get_treatment_station_review'))data={snapshot,fingerprint:'QA-version',can_review:true,history:[]}
  else if(url.pathname.endsWith('/review_treatment_station')){const body=route.request().postDataJSON();if(body.p_request!==items[0]?.id||body.p_fingerprint!=='QA-version'||body.p_confirmations.length!==2||!body.p_confirmations.find(c=>c.line_id==='red')?.restrictions_checked)throw Error('Invalid station payload');decisions++;items=[];data=null}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/validations',{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('heading',{name:'TRT-QA'}).waitFor({timeout:45000})
 await page.getByRole('button',{name:'Approuver',exact:true}).click()
 await page.getByText('Produit rouge QA',{exact:true}).waitFor()
 const submit=page.getByRole('button',{name:'Valider la prescription',exact:true})
 if(await submit.isEnabled())throw Error('Approval enabled before attestations')
 const checks=page.getByRole('checkbox')
 if(await checks.count()!==3)throw Error('Expected three confirmations')
 for(let i=0;i<3;i++)if(await checks.nth(i).isChecked())throw Error('Prechecked confirmation')
 await checks.nth(0).check();await checks.nth(1).check()
 if(await submit.isEnabled())throw Error('Yellow agreement missing but approval enabled')
 await checks.nth(2).check()
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))throw Error('Horizontal overflow')
 fs.mkdirSync('tmp/station',{recursive:true});await page.screenshot({path:'tmp/station/mobile.png',fullPage:true})
 await submit.click()
 await page.getByText('Aucune demande à valider avec vos habilitations actuelles.').waitFor()
 if(decisions!==1||errors.length)throw Error('Decision or runtime failure: '+errors.join(';'))
 console.log('Station mobile: individual unchecked confirmations, blocked until complete, exactly one validated payload: OK; no real writes')
}finally{await browser.close()}
