// Read-only UI regression: all Supabase requests are mocked, no real session/database.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let teamReads=0,businessWrites=0
 await context.route(`https://${host}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;let data=[],status=200
  if(req.method()!=='GET'&&!p.endsWith('/profiles'))businessWrites++
  if(p==='/auth/v1/user')data=user
  else if(p.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true}]
  else if(p.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Client fictif 501',code:'DOMBEN501',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(p.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(p.endsWith('/domains'))data=[{id:domain,name:'Client fictif 501',code:'DOMBEN501',is_active:true}]
  else if(p.endsWith('/farms'))data=[{id:'farm-501',domain_id:domain,code:'F501',name:'Ferme fictive 501',is_active:true}]
  else if(p.endsWith('/teams')){
   teamReads++;expect(url.searchParams.get('farms.domain_id')).toBe(`eq.${domain}`)
   if(url.searchParams.get('select')!=='*,farms!teams_farm_id_fkey!inner(domain_id)'){status=300;data={message:"Could not embed because more than one relationship was found for 'teams' and 'farms'"}}
   else data=[{id:'team-501',farm_id:'farm-501',name:'Équipe fictive 501',is_active:true}]
  }
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage()
 await page.goto('http://localhost:3103/admin/initialisation',{waitUntil:'networkidle',timeout:120000})
 const continueButton=page.getByRole('button',{name:'Continuer avec ce client',exact:true})
 await expect(continueButton).toBeVisible({timeout:30000})
 await continueButton.click()
 const prepare=page.getByRole('button',{name:'Préparer ce module',exact:true}).first()
 await expect(prepare).toBeVisible({timeout:30000})
 await prepare.click()
 await expect.poll(()=>teamReads,{timeout:30000}).toBeGreaterThan(0)
 await expect(page.getByText('Référentiels indisponibles',{exact:false})).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Fermes',exact:true})).toBeVisible()
 expect(businessWrites).toBe(0)
 fs.mkdirSync('tmp/initialization-teams',{recursive:true});await page.screenshot({path:'tmp/initialization-teams/local.png',fullPage:true})
 console.log('PASS explicit teams/farms FK, DOMBEN501 tenant filter, initialization unlocked, ZERO business writes. Mocked Supabase only.')
}finally{await browser.close()}
