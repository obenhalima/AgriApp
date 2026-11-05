// Read-only browser regression, all Supabase requests mocked.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-alerts@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 for(const mode of ['allowed','denied','no-permission']){
  let plantings=0,cultural=0
  const context=await browser.newContext({serviceWorkers:'block'})
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
  await context.route(`https://${host}/**`,async route=>{
   const url=new URL(route.request().url()),path=url.pathname;let data=[]
   if(path==='/auth/v1/user')data=user
   else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',is_active:true,role_id:role,must_change_password:false}]
   else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{code:'QA',name:'QA',is_active:true},roles:{name:'QA',is_active:true}}]
   else if(path.endsWith('/roles'))data=[{id:role,name:'QA',is_active:true,is_admin:mode!=='no-permission'}]
   else if(path.endsWith('/role_permissions'))data=['alertes.view','dashboard.view'].map(code=>({granted:true,permissions:{code}}))
   else if(path.endsWith('/campaign_plantings')){
    plantings++;expect(url.searchParams.get('domain_id')).toBe('eq.'+domain)
    expect(url.searchParams.get('select')).toContain('varieties!campaign_plantings_variety_id_fkey(commercial_name)')
   } else if(path.endsWith('/rpc/cultural_workspace')){
    cultural++;expect(route.request().postDataJSON().p_domain).toBe(domain)
    if(mode==='denied'){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Accès agronomie requis'})});return}
    data={families:[],farms:[],programs:[],forecast:[]}
   }
   if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/alertes',{waitUntil:'domcontentloaded',timeout:120000})
  if(mode==='allowed')await expect(page.getByText('Aucune alerte détectée pour ces filtres et les règles activées.',{exact:true})).toBeVisible({timeout:30000})
  else {await expect(page.getByText(/Les alertes des interventions culturales ne sont pas évaluées/)).toBeVisible({timeout:30000});await expect(page.getByText('Non évalué',{exact:true})).toHaveCount(2)}
  await expect(page.getByText('Résultat partiel — certaines données ne sont pas disponibles.',{exact:true})).toHaveCount(0)
  expect(plantings).toBeGreaterThan(0);expect(cultural).toBe(mode==='no-permission'?0:1);expect(errors).toEqual([])
  console.log(JSON.stringify({mode,plantings,cultural,pageErrors:errors}));await context.close()
 }
} finally {await browser.close()}
