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
 let items=[{kind:'approval',id:'44444444-4444-4444-8444-444444444444',domain_id:domain,company:'Société de recette',process:'purchase_order',reference:'BA-QA-001',level:1,levels:2,requested_by:'another-user',requester:'Demandeur de recette',supplier:'Fournisseur de recette',created_at:new Date().toISOString(),entity:{po_number:'BA-QA-001',total_amount:2500,currency:'MAD'},lines:[{id:'line1',item_description:'Article de recette',quantity:10,unit:'l',unit_price:250,line_total:2500}],history:[],href:'/achats/qa'}]
 let decisions=0
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'Responsable QA',role_id:role,is_active:true,is_platform_admin:false,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Société de recette',code:'QA'},roles:{name:'Responsable'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Responsable',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/mobile_approval_items'))data=items
  else if(url.pathname.endsWith('/mobile_review')){const body=route.request().postDataJSON();if(body.p_level!==1||body.p_id!==items[0]?.id||body.p_approve!==true)throw Error('Unexpected decision');decisions++;items=[];data=null}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/validations',{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('heading',{name:'BA-QA-001'}).waitFor({timeout:45000})
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))throw Error('Horizontal overflow on mobile')
 fs.mkdirSync('tmp/mobile',{recursive:true});await page.screenshot({path:'tmp/mobile/mobile-validation.png',fullPage:true})
 await page.getByRole('button',{name:'Refuser',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'motif du refus'}).waitFor()
 if(decisions!==0)throw Error('Refusal without reason reached server')
 page.on('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Approuver',exact:true}).click()
 await page.getByText('Aucune demande à valider avec vos habilitations actuelles.').waitFor()
 if(decisions!==1)throw Error('Decision not sent exactly once')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('Mobile browser fixture: layout 390px, mandatory refusal reason, confirmation and exactly one decision: OK. No real DB writes.')
}finally{await browser.close()}
