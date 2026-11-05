// All Supabase requests are intercepted; no real farm is modified or deleted.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-farm@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const expires=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:expires,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
let farms=[{id:'farm-used',domain_id:domain,code:'F1',name:'Ferme utilisée',is_active:true,total_area:2},{id:'farm-empty',domain_id:domain,code:'F2',name:'Ferme vide',is_active:true,total_area:1}]
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:expires,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let result=[],status=200
  if(path==='/auth/v1/user')result=user
  else if(path.endsWith('/profiles'))result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA'},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/farms')){
   if(method==='PATCH'){
    expect(url.searchParams.get('domain_id')).toBe(`eq.${domain}`)
    const id=url.searchParams.get('id').slice(3),body=route.request().postDataJSON()
    expect(body.domain_id).toBeUndefined();expect(body.id).toBeUndefined()
    farms=farms.map(f=>f.id===id?{...f,...body}:f);result=farms.find(f=>f.id===id)
   }else if(method==='GET')result=farms
   else throw Error('Unexpected farm write: '+method)
  }else if(path.endsWith('/delete_empty_farm')){
   const body=route.request().postDataJSON();expect(body.p_domain).toBe(domain)
   if(body.p_farm==='farm-used'){status=409;result={code:'23503',message:'Suppression impossible : cette ferme possède des données liées (serres). Aucune donnée supprimée.'}}
   else{result=body.p_farm;farms=farms.filter(f=>f.id!==body.p_farm)}
  }else if(method!=='GET'&&!path.startsWith('/auth/'))throw Error('Unexpected mutation: '+path)
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
 await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/fermes',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Modifier',exact:true}).first().click()
 await page.getByRole('dialog').locator('input').nth(1).fill('Ferme modifiée QA')
 await page.getByRole('button',{name:'ENREGISTRER LES MODIFICATIONS',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.getByText('Ferme modifiée QA',{exact:true})).toBeVisible()
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'Supprimer',exact:true}).first().click()
  await expect(page.getByRole('alert').getByText(/possède des serres/)).toBeVisible()
 expect(farms).toHaveLength(2)
 await page.getByRole('button',{name:'Supprimer',exact:true}).nth(1).click()
 await expect(page.getByText('Ferme vide',{exact:true})).toHaveCount(0)
 expect(farms).toHaveLength(1);expect(errors).toEqual([])
 console.log('PASS: scoped edit, linked-farm deletion blocked, empty-farm deletion confirmed. Mocked requests only.')
}finally{await browser.close()}
