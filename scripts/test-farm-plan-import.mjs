// Browser fixture only: all backend requests mocked, no production writes.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { readExcelFarmPlan } from '../lib/farmPlanImport.ts'
const input=process.argv[2]
if(!input)throw Error('Pass a local XLSX plan to inspect')
const b=fs.readFileSync(input),plan=await readExcelFarmPlan(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333',farm='44444444-4444-4444-8444-444444444444'
const user={id:uid,email:'qa-plan@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const greenhouses=plan.rectangles.map((r,i)=>({id:`55555555-5555-4555-8555-${String(i).padStart(12,'0')}`,code:r.code,name:r.code,farm_id:farm,total_area:1000,type:'canarienne'}))
let saves=0,stored=[],references=true
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/farms'))data=[{id:farm,code:'QA',name:'Ferme de recette'}]
  else if(url.pathname.endsWith('/greenhouses'))data=references?greenhouses:[]
  else if(url.pathname.endsWith('/farm_schematic_plans'))data=stored.length?{shapes:stored,revision:1}:null
  else if(url.pathname.endsWith('/save_farm_schematic_plan')){
   const body=route.request().postDataJSON()
   if(body.p_farm!==farm||body.p_shapes.length!==plan.rectangles.length)throw Error('Unexpected save payload')
   if(body.p_shapes.some(r=>'total_area' in r))throw Error('Must not change surfaces')
   stored=body.p_shapes;saves++;data=1
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const open=async()=>{
  await page.goto('http://localhost:3001/plan-culture',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByRole('button',{name:'Plan de la ferme',exact:true}).click()
  await page.locator('select').filter({has:page.locator(`option[value="${farm}"]`)}).selectOption(farm)
  await page.getByText('Importer un plan Excel sans dessiner les serres',{exact:true}).click()
  await page.getByLabel('Fichier du plan Excel').setInputFiles(input)
  await page.getByText(`${plan.rectangles.length} serres détectées`,{exact:false}).waitFor({timeout:60000})
 }
 await open()
 await page.getByRole('button',{name:'Utiliser cette disposition',exact:true}).click()
 if(saves!==0)throw Error('Import must be preview-only before save')
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click()
 await page.getByText('Plan enregistré.',{exact:true}).waitFor()
 if(saves!==1)throw Error('Expected one explicit save')
 fs.mkdirSync('tmp/plan114',{recursive:true});await page.screenshot({path:'tmp/plan114/import-browser.png',fullPage:true})
 stored=[];references=false
 await open()
 if(await page.getByRole('button',{name:'Utiliser cette disposition',exact:true}).isEnabled())throw Error('Missing references must block saving')
 if(saves!==1||errors.length)throw Error(errors.join('\n')||'Unexpected backend write')
 console.log(`Plan import: ${plan.rectangles.length} shapes; preview before save; missing references blocked; no real DB writes.`)
}finally{await browser.close()}
