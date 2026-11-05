// Read-only regression: all Supabase traffic is mocked, including authentication.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3103'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',domain='11111111-1111-4111-8111-111111111111'
const user={id:uid,email:'qa-history@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
let fail=false,failAlerts=false,dispatchCalls=0
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let data=[],status=200
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'BENHALIMA recette',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/alerts')){
   expect(url.searchParams.get('domain_id')).toBe('eq.'+domain)
   expect(url.searchParams.has('type')).toBe(false)
   if(failAlerts){status=403;data={code:'42501',message:'fixture auxiliary failure'}}
  }
  else if(path.endsWith('/harvest_lots')&&url.searchParams.get('category')==='eq.station_dispatch'){
   dispatchCalls++;expect(url.searchParams.get('domain_id')).toBe('eq.'+domain)
   expect(url.searchParams.has('harvest_date')).toBe(false)
   if(fail){status=300;data={code:'PGRST201',message:'fixture backend failure'}}
   else data=[{id:'old-priced',lot_number:'HISTORIQUE-2020',harvest_date:'2020-01-01',quantity_kg:100,qty_acceptee_kg:90,price_per_kg:5,ca_amount:450,tri_status:'priced',markets:{name:'Station QA'},varieties:{code:'V1'}}]
  }
  // Auth can synchronize the profile; this request is fulfilled here, never forwarded.
  if(!['GET','HEAD'].includes(request.method())&&!path.startsWith('/auth/')&&!path.endsWith('/profiles'))throw Error('Unexpected write '+path)
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/recoltes',{waitUntil:'networkidle'})
 await page.getByRole('button',{name:/✅ Confirmés/}).click()
 await expect(page.getByText('HISTORIQUE-2020',{exact:true})).toBeVisible()
 await page.getByLabel('Récoltes du',{exact:true}).fill('2021-01-01')
 await expect(page.getByText('HISTORIQUE-2020',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'✕ Réinitialiser',exact:true}).click()
 await expect(page.getByText('HISTORIQUE-2020',{exact:true})).toBeVisible()
 fail=true
 await page.reload({waitUntil:'networkidle'})
 await expect(page.locator('main [role="alert"]')).toContainText('envois station, pesées et tris')
 await expect(page.locator('main [role="alert"]')).toContainText('code PGRST201')
 await expect(page.getByText('HISTORIQUE-2020',{exact:true})).not.toBeVisible()
 fail=false
 await page.getByRole('button',{name:'Réessayer',exact:true}).click()
 await expect(page.locator('main [role="alert"]')).toHaveCount(0)
 await page.getByRole('button',{name:/✅ Confirmés/}).click()
 await expect(page.getByText('HISTORIQUE-2020',{exact:true})).toBeVisible()
 expect(dispatchCalls).toBeGreaterThanOrEqual(3);expect(errors).toEqual([])
 failAlerts=true
 await page.reload({waitUntil:'networkidle'})
 await expect(page.locator('main [role="alert"]')).toContainText('alertes sans récolte (code 42501)')
 failAlerts=false
 await page.getByRole('button',{name:'Réessayer',exact:true}).click()
 await expect(page.locator('main [role="alert"]')).toHaveCount(0)
 console.log('PASS historical station dispatch, visible dates/reset, tenant filter, explicit failure and retry. Mocked backend only.')
}finally{await browser.close()}
