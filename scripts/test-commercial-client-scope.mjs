// All Supabase traffic is mocked. No real buyer/market creation or modification.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',role='33333333-3333-4333-8333-333333333333'
const domains=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444']
const user={id:uid,email:'qa-commercial@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const expires=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:expires,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
let buyers=domains.map((d,i)=>({id:`${i?'66666666':'55555555'}-5555-4555-8555-555555555555`,domain_id:d,code:`CL${i}`,name:`Buyer ${i}`,type:'grossiste',is_active:true}))
let markets=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 for(const [index,domain] of domains.entries()){
  const context=await browser.newContext({serviceWorkers:'block'}),writes=[],errors=[]
  await context.addInitScript(({key,session,uid,domain})=>{
   localStorage.setItem(key,JSON.stringify(session));localStorage.setItem(`farmpilot_active_domain_${uid}`,domain)
  },{key:`sb-${host.split('.')[0]}-auth-token`,uid,domain,session:{access_token:token,refresh_token:'qa',expires_at:expires,expires_in:3600,token_type:'bearer',user}})
  await context.route(`https://${host}/**`,async route=>{
   const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let result=[]
   if(path==='/auth/v1/user')result=user
   else if(path.endsWith('/profiles'))result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
   else if(path.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
   else if(path.endsWith('/domain_memberships'))result=domains.map((d,i)=>({domain_id:d,role_id:role,is_default:i===0,domains:{name:`Tenant ${i}`,code:`TENANT${i}`},roles:{name:'Admin'}}))
   else if(['/clients','/markets'].some(end=>path.endsWith(end))){
    const isBuyer=path.endsWith('/clients'),rows=isBuyer?buyers:markets
    if(method==='GET'){
     expect(url.searchParams.get('domain_id')).toBe(`eq.${domain}`)
     result=rows.filter(r=>r.domain_id===domain)
    }else if(method==='POST'){
     const body=route.request().postDataJSON();expect(body.domain_id).toBe(domain)
     if(!isBuyer)expect(buyers.find(b=>b.id===body.client_id)?.domain_id).toBe(domain)
     const row={...body,id:crypto.randomUUID()};rows.push(row);result=row;writes.push({kind:isBuyer?'buyer':'market',body})
    }else if(method==='PATCH'){
     expect(url.searchParams.get('domain_id')).toBe(`eq.${domain}`)
     const id=url.searchParams.get('id')?.slice(3),row=rows.find(r=>r.id===id&&r.domain_id===domain)
     expect(row).toBeTruthy();Object.assign(row,route.request().postDataJSON());result=row
    }else throw Error('Unexpected request '+method+' '+path)
   }else if(method!=='GET'&&!path.startsWith('/auth/'))throw Error('Unexpected mutation '+path)
   if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/clients',{waitUntil:'domcontentloaded',timeout:120000})
  await expect(page.getByText(`Buyer ${index}`,{exact:true})).toBeVisible()
  await expect(page.getByText(`Buyer ${1-index}`,{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Nouveau client',exact:true}).first().click()
  await page.getByRole('dialog').locator('input').nth(1).fill(`Created buyer ${index}`)
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('button',{name:'CRÉER LE CLIENT',exact:true}).click()
  await expect(page.getByText('Client créé !',{exact:true})).toBeVisible()
  expect(writes.filter(w=>w.kind==='buyer')).toHaveLength(1)
  expect(writes.find(w=>w.kind==='buyer').body.is_ecart_buyer).toBe(true)
  await page.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click()
  await expect(page.getByText(`Created buyer ${index}`,{exact:true})).toBeVisible()
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/marches',{waitUntil:'domcontentloaded',timeout:120000})
  await page.getByRole('button',{name:'Nouveau marché',exact:true}).first().click()
  const dialog=page.getByRole('dialog')
  await dialog.locator('input').nth(1).fill(`Created market ${index}`)
  const buyerSelect=dialog.locator('select').filter({has:page.locator(`option[value="${buyers.find(b=>b.name===`Created buyer ${index}`).id}"]`)})
  await buyerSelect.selectOption(buyers.find(b=>b.name===`Created buyer ${index}`).id)
  await expect(buyerSelect.locator('option').filter({hasText:`Buyer ${1-index}`})).toHaveCount(0)
  await dialog.getByRole('button',{name:'CRÉER',exact:true}).click()
  await expect(page.getByText('Marché créé !',{exact:true})).toBeVisible()
  expect(writes.filter(w=>w.kind==='market')).toHaveLength(1);expect(errors).toEqual([])
  await context.close()
 }
 console.log('PASS: buyer and market creation scoped to each of two tenants, atomic ecart flag, filtered lists and buyer choices. All Supabase traffic mocked.')
}finally{await browser.close()}
