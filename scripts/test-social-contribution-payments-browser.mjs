// Every Supabase request is intercepted. No real data or costs are modified.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
const expect=baseExpect.configure({timeout:60000})
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain='f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217',uid='11111111-1111-4111-8111-111111111111',role='22222222-2222-4222-8222-222222222222'
const user={id:uid,email:'cnss@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.')
const makeMonth=(month,total=280)=>({id:null,domain_id:domain,period_year:2026,period_month:month,revision:0,source:{nb_workers:2,nb_periods:2,total_gross:1000,total_cnss_employee:50,total_amo_employee:30,total_cnss_employer:100,total_amo_employer:40,total_family_allowance:50,total_prof_training:10,total_employee:80,total_employer:200,total_due:total,fingerprint:`v1-${month}`,open_correction:false},declared_at:null,declaration_number:null,stale:false,paid:0,remaining:total,overpaid:0,last_payment_date:null,payments:[]})
const september=makeMonth(9), august=makeMonth(8,100);august.source.open_correction=true
let months=[august,september],recorded=0,changeOnPay=false
const writes=[],browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1650,height:1050}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1)
  let data=[]
  if(request.method()!=='GET')writes.push(url.pathname)
  if(url.pathname==='/auth/v1/user')data=user
  else if(table==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(table==='domain_memberships')data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Domaine BENHALIMA - 501',code:'DOMBEN501',is_active:true},roles:{name:'Admin'}}]
  else if(table==='roles')data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(table==='list_social_contributions'){
   const body=request.postDataJSON();expect(body.p_domain).toBe(domain);data=body.p_year===2026?months:[]
  }else if(table==='save_social_contribution_declaration'){
   const body=request.postDataJSON();expect(body.p_domain).toBe(domain)
   const row=months.find(row=>row.period_month===body.p_month);expect(body.p_revision).toBe(row.revision);expect(body.p_fingerprint).toBe(row.source.fingerprint)
   row.id||=`declaration-${row.period_month}`;row.revision++;row.stale=false
   row.declared_at=body.p_declare?new Date().toISOString():null;row.declaration_number=body.p_declare?body.p_reference:null;data={}
  }else if(table==='record_social_contribution_payment'){
   const body=request.postDataJSON();expect(body.p_domain).toBe(domain);expect(body.p_request).toBeTruthy()
   const row=months.find(row=>row.period_month===body.p_month)
   if(changeOnPay){changeOnPay=false;row.source.total_due=300;row.source.total_employee=100;row.source.total_cnss_employee=70;row.source.fingerprint='v2-9';row.remaining=200;row.stale=true
    await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Les cotisations ont changé. Actualisez le mois avant de continuer.'})});return}
   expect(body.p_revision).toBe(row.revision);expect(body.p_fingerprint).toBe(row.source.fingerprint);expect(body.p_amount).toBeGreaterThan(0);expect(body.p_amount).toBeLessThanOrEqual(row.remaining)
   row.id||=`declaration-${row.period_month}`;row.revision+=row.revision?1:2
   data={id:`payment-${++recorded}`,amount:body.p_amount,payment_date:body.p_date,payment_method:body.p_method,reference:body.p_reference,created_at:new Date().toISOString(),created_by:uid}
   row.payments.push(data);row.paid+=body.p_amount;row.remaining=row.source.total_due-row.paid;row.last_payment_date=body.p_date
  }
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 page.setDefaultTimeout(60000)
 await page.goto('http://localhost:3001/rh/cnss',{waitUntil:'domcontentloaded',timeout:300000})
 await page.getByRole('heading',{name:'CNSS et charges patronales',exact:true}).waitFor()
 await page.getByRole('combobox',{name:'Mois',exact:true}).selectOption('8')
 await expect(page.getByRole('button',{name:'Payer les cotisations 8/2026',exact:true})).toBeDisabled()
 await page.getByRole('combobox',{name:'Mois',exact:true}).selectOption('9')
 const table=page.getByRole('table',{name:'Suivi mensuel des cotisations',exact:true})
 await expect(table).toContainText('280,00')
 await page.getByRole('button',{name:'Payer les cotisations 9/2026',exact:true}).click()
 let modal=page.getByRole('dialog')
 await modal.getByRole('spinbutton',{name:'Montant du paiement',exact:true}).fill('100')
 await modal.getByRole('textbox',{name:'Date de paiement',exact:true}).fill('2026-10-10')
 await modal.getByRole('textbox',{name:'Référence (facultative)',exact:true}).fill('VIR-CNSS-1')
 await modal.getByRole('button',{name:'Confirmer le paiement',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(table).toContainText('Partiellement payé');await expect(table).toContainText('180,00')
 console.log('Partial settlement recorded')
 await page.getByRole('button',{name:'Payer les cotisations 9/2026',exact:true}).click()
 modal=page.getByRole('dialog')
 await modal.getByRole('spinbutton',{name:'Montant du paiement',exact:true}).fill('200')
 await modal.getByRole('button',{name:'Confirmer le paiement',exact:true}).click()
 await expect(modal.getByRole('alert')).toContainText('inférieur ou égal');expect(recorded).toBe(1)
 changeOnPay=true
 await modal.getByRole('spinbutton',{name:'Montant du paiement',exact:true}).fill('20')
 await modal.getByRole('button',{name:'Confirmer le paiement',exact:true}).click()
 await expect(modal.getByRole('alert')).toContainText('cotisations ont changé')
 await modal.getByRole('button',{name:'Annuler',exact:true}).click()
 await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await expect(table).toContainText('À actualiser')
 await expect(page.getByRole('button',{name:'Payer les cotisations 9/2026',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Recalculer',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Cotisations actualisées'})).toBeVisible()
 await page.getByRole('button',{name:'Payer les cotisations 9/2026',exact:true}).click()
 modal=page.getByRole('dialog');await modal.getByRole('spinbutton',{name:'Montant du paiement',exact:true}).fill('200')
 await modal.getByRole('textbox',{name:'Date de paiement',exact:true}).fill('2026-10-12')
 await modal.getByRole('combobox',{name:'Mode de paiement',exact:true}).selectOption('cheque')
 await modal.getByRole('textbox',{name:'Référence (facultative)',exact:true}).fill('CH-CNSS-2')
 await modal.getByRole('button',{name:'Confirmer le paiement',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(table.getByRole('cell',{name:'Payé',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Payer les cotisations 9/2026',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Déclarer',exact:true}).click()
 modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Référence (facultative)',exact:true}).fill('DAMANCOM-9')
 await modal.getByRole('button',{name:'Confirmer la déclaration',exact:true}).click()
 await expect(table).toContainText('Déclarée')
 await page.getByRole('button',{name:'Détails',exact:true}).click()
 modal=page.getByRole('dialog');await expect(modal).toContainText('VIR-CNSS-1');await expect(modal).toContainText('CH-CNSS-2');await expect(modal).toContainText('10/10/2026');await expect(modal).toContainText('12/10/2026');await expect(modal).toContainText('DAMANCOM-9')
 await modal.getByRole('button',{name:'Fermer',exact:true}).click()
 september.source.total_due=250;september.source.total_employer=150;september.source.total_cnss_employer=50;september.source.fingerprint='v3-9';september.stale=true;september.overpaid=50;september.remaining=0
 await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await expect(table).toContainText('Trop-perçu à régulariser')
 expect(recorded).toBe(2);expect(errors).toEqual([])
 expect(writes.every(name=>name==='/rest/v1/profiles'||['list_social_contributions','record_social_contribution_payment','save_social_contribution_declaration'].some(rpc=>name.endsWith('/'+rpc)))).toBe(true)
 const screenshot=path.join(os.tmpdir(),'itrix-social-contribution-payments-local.png');await page.screenshot({path:screenshot,fullPage:false})
 console.log('Screenshot',screenshot)
 console.log('PASS client-scoped CNSS, month filter, active correction blocking, partial/full payments, dates, references, overpayment rejection, stale source rejection, declaration independence, payment history and overpaid revision. All requests mocked.')
}finally{await browser.close()}
