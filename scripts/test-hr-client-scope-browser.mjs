// All Supabase traffic is mocked. Payroll generation is checked without real writes.
import {chromium,expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const expect=baseExpect.configure({timeout:60000})
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',other='44444444-4444-4444-8444-444444444444',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'hr-scope@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.')
const farms=[{id:'f1',code:'F1',name:'Ferme Alpha',domain_id:domain},{id:'f2',code:'F2',name:'Ferme Beta',domain_id:domain},{id:'f3',code:'F3',name:'Ferme Autre',domain_id:other}]
const worker=(id,farmId,active=true)=>({id,first_name:'Test',last_name:id,matricule:id,farm_id:farmId,farms:farms.find(farm=>farm.id===farmId)||null,is_active:active,pay_frequency:'quinzaine',base_salary:3000,category:'fermier'})
const workers=[worker('EmployeAlpha','f1'),worker('EmployeBeta','f2'),worker('AncienAlpha','f1',false),worker('SansFerme',null),worker('AutreClient','f3')]
const slips=workers.map((person,index)=>({id:`slip-${index}`,worker_id:person.id,workers:person,period_id:'period',gross_salary:100*(index+1),net_salary:90*(index+1),total_employer_cost:110*(index+1),status:'brouillon',cnss_employee:0,amo_employee:0,ir_amount:0}))
const tables={farms,workers,payslips:slips,payroll_periods:[{id:'period',code:'PAY-QA',period_year:2026,period_month:11,period_half:'first',status:'brouillon'}]}
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 const writes=[]
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').at(-1)
  let data=[]
  if(route.request().method()==='POST'&&table==='payslips'){writes.push(route.request().postDataJSON());await route.fulfill({status:201,contentType:'application/json',body:'[]'});return}
  if(url.pathname==='/auth/v1/user')data=user
  else if(table==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(table==='domain_memberships')data=[domain,other].map((id,index)=>({domain_id:id,role_id:role,is_default:index===0,domains:{name:index?'Autre client':'Client QA',code:index?'OTHER':'QA',is_active:true},roles:{name:'Admin'}}))
  else if(table==='roles')data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(tables[table]){
   data=tables[table].filter(row=>[...url.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(key.split('.').reduce((object,part)=>object?.[part],row))===value.slice(3)))
   data=data.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000))
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://localhost:3001/rh/employes',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByRole('row').filter({hasText:'EmployeAlpha'})).toHaveCount(1)
 await expect(page.getByRole('row').filter({hasText:'EmployeBeta'})).toHaveCount(1)
 await expect(page.getByRole('row').filter({hasText:/SansFerme|AutreClient/})).toHaveCount(0)
 await page.getByRole('combobox',{name:'Ferme',exact:true}).selectOption('f2')
 await expect(page.getByRole('row').filter({hasText:'EmployeAlpha'})).toHaveCount(0)
 await expect(page.getByRole('row').filter({hasText:'EmployeBeta'})).toHaveCount(1)
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('combobox',{name:'Société active',exact:true}).selectOption(other)])
 await expect(page.getByRole('row').filter({hasText:'AutreClient'})).toHaveCount(1)
 await expect(page.getByRole('row').filter({hasText:'EmployeBeta'})).toHaveCount(0)
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toHaveValue('')
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('combobox',{name:'Société active',exact:true}).selectOption(domain)])
 await page.goto('http://localhost:3001/rh/paie',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByRole('row').filter({hasText:/EmployeAlpha|EmployeBeta|AncienAlpha/})).toHaveCount(3)
 await expect(page.getByRole('row').filter({hasText:/SansFerme|AutreClient/})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Générer (2)',exact:true})).toBeEnabled()
 await page.getByRole('combobox',{name:'Ferme',exact:true}).selectOption('f2')
 await expect(page.getByRole('row').filter({hasText:'EmployeBeta'})).toHaveCount(1)
 await expect(page.getByRole('row').filter({hasText:/EmployeAlpha|AncienAlpha/})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Générer (1)',exact:true})).toBeEnabled()
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Générer (1)',exact:true}).click()
 await expect.poll(()=>writes.length).toBe(1)
 expect(writes[0].map(row=>row.worker_id)).toEqual(['EmployeBeta'])
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('combobox',{name:'Société active',exact:true}).selectOption(other)])
 await expect(page.getByRole('row').filter({hasText:'AutreClient'})).toHaveCount(1)
 await expect(page.getByRole('row').filter({hasText:'EmployeBeta'})).toHaveCount(0)
 expect(errors).toEqual([])
 console.log('PASS employee and payroll tenant/farm filters, unattached exclusion, inactive payroll history, client switching and scoped generation. No real writes.')
}finally{await browser.close()}
