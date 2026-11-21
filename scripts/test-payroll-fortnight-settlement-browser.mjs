// All Supabase traffic is mocked. This verifies client-specific menus and entry routes.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
const expect = baseExpect.configure({timeout: 120000})
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222'
const pilot = '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79', standard = 'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217'
const user = {id: uid, email: 'hr-menu@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [{alg: 'HS256', typ: 'JWT'}, {sub: uid, exp, role: 'authenticated'}, 'qa'].map(value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')).join('.')
const line = (id, name, net) => ({worker_id:id,worker_code:id,worker_name:name,source:'manual',normal_hours:8,overtime_hours:0,normal_rate:net/8,overtime_rate:0,normal_hourly_rate:net/8,original_normal_rate:net/8,original_overtime_rate:0,bonuses:0,advance:0,other_deductions:0,cnss_employee:0,amo_employee:0,ir_amount:0,cnss_employer:0,amo_employer:0,family_allowance_employer:0,prof_training_employer:0,deductions_confirmed:true,net_salary:net,gross_salary:net,total_employer_cost:net,is_declared:false})
const preparations=[
 {id:'p1',domain_id:pilot,farm_id:'farm1',start_date:'2026-09-01',end_date:'2026-09-15',pay_date:'2026-09-15',status:'validated',revision:1,rows:[line('EMP01','Employé A',100),line('EMP02','Employé B',50)]},
 {id:'p2',domain_id:pilot,farm_id:'farm1',start_date:'2026-09-16',end_date:'2026-09-30',pay_date:'2026-09-30',status:'validated',revision:1,rows:[line('EMP01','Employé A',100)]},
 {id:'p3',domain_id:pilot,farm_id:'farm2',start_date:'2026-10-01',end_date:'2026-10-15',pay_date:'2026-10-15',status:'draft',revision:1,rows:[line('EMP03','Employé C',20)]}]
const payments=[
 {id:'m1',preparation_id:'p1',worker_id:'EMP01',amount:100,payment_date:'2026-09-16',payment_method:'cash',reference:'PAY-1'},
 {id:'m2',preparation_id:'p1',worker_id:'EMP02',amount:20,payment_date:'2026-09-16',payment_method:'virement',reference:'PAY-2'},
 {id:'m3',preparation_id:'p2',worker_id:'EMP01',amount:100,payment_date:'2026-10-01',payment_method:'cash',reference:'PAY-3'}]
let settlements=[],rejectNext=true,recorded=0
const browser = await chromium.launch({channel: 'msedge', headless: true})
try {
 const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1500, height: 1000}})
 await context.addInitScript(({key, session}) => localStorage.setItem(key, JSON.stringify(session)), {key: `sb-${host.split('.')[0]}-auth-token`, session: {access_token: token, refresh_token: 'qa', expires_at: exp, expires_in: 3600, token_type: 'bearer', user}})
 const writes = []
 await context.route(`https://${host}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
  if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && !url.pathname.includes('/auth/')) writes.push(url.pathname)
  let data = []
  if (url.pathname === '/auth/v1/user') data = user
  else if (table === 'profiles') data = [{...user, full_name: 'QA', role_id: role, is_active: true, must_change_password: false}]
  else if (table === 'roles') data = [{id: role, name: 'Admin', is_admin: true, is_active: true}]
  else if (table === 'domain_memberships') data = [
   {domain_id: pilot, role_id: role, is_default: true, domains: {name: 'DOM-BENHALIMA', code: 'DOM-BENHALIMA', is_active: true}, roles: {name: 'Admin'}},
   {domain_id: standard, role_id: role, is_default: false, domains: {name: 'Domaine BENHALIMA 501', code: 'DOMBEN501', is_active: true}, roles: {name: 'Admin'}},
  ]
  if(table==='farms') data=[{id:'farm1',code:'FS',name:'Ferme Sud'},{id:'farm2',code:'FN',name:'Ferme Nord'}]
  if(table==='payroll_preparations') {
    expect(url.searchParams.get('domain_id')).toBe('eq.'+pilot)
    data=preparations.filter(item=>(!url.searchParams.get('farm_id') || url.searchParams.get('farm_id')==='eq.'+item.farm_id) && (!url.searchParams.get('start_date') || url.searchParams.get('start_date')==='eq.'+item.start_date))
  }
  if(table==='payroll_preparation_payments') {
    expect(url.searchParams.get('domain_id')).toBe('eq.'+pilot)
    data=payments.filter(item=>!url.searchParams.get('preparation_id')?.startsWith('eq.') || url.searchParams.get('preparation_id')==='eq.'+item.preparation_id)
  }

  if(table==='payroll_fortnight_settlements')data=settlements.filter(item=>url.searchParams.get('preparation_id')==='eq.'+item.preparation_id)
  if(table==='settle_payroll_fortnight'){
   const body=request.postDataJSON();expect(body.p_preparation).toBe('p1');expect(body.p_revision).toBe(1);expect(body.p_request).toBeTruthy()
   if(rejectNext){rejectNext=false;payments.push({id:'external',preparation_id:'p1',worker_id:'EMP02',amount:5,payment_date:'2026-09-18',payment_method:'cash',reference:'PARTIAL-EXTERNAL'})
    await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Les paiements ont changé. Actualisez la quinzaine avant de confirmer.'})});return}
   expect(body.p_expected_total).toBe(25);expect(body.p_date).toBe('2026-09-20');expect(body.p_method).toBe('cheque');expect(body.p_reference).toBe('SOLDE-QUINZAINE')
   const payment={id:'batch-payment',preparation_id:'p1',worker_id:'EMP02',amount:25,payment_date:body.p_date,payment_method:body.p_method,reference:body.p_reference}
   payments.push(payment);recorded++
   data={id:'batch-1',domain_id:pilot,preparation_id:'p1',amount:25,worker_count:1,payment_date:body.p_date,payment_method:body.p_method,reference:body.p_reference,payments:[payment],created_by:uid,created_at:new Date().toISOString()}
   settlements.push(data)
  }
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page=await context.newPage();page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://localhost:3001/rh/paie',{waitUntil:'domcontentloaded',timeout:300000})
 const history=page.getByRole('region',{name:'Historique des paies',exact:true})
 const partial=history.locator('tbody tr').filter({hasText:'01/09/2026'})
 await expect(partial.getByRole('button',{name:'Marquer la paie comme payée',exact:true})).toBeEnabled()
 await expect(history.locator('tbody tr').filter({hasText:'16/09/2026'}).getByRole('button',{name:'Marquer la paie comme payée',exact:true})).toBeDisabled()
 await expect(history.locator('tbody tr').filter({hasText:'01/10/2026'}).getByRole('button',{name:'Marquer la paie comme payée',exact:true})).toHaveCount(0)
 // Payment history is visible immediately instead of below the employee list.
 await partial.getByRole('button',{name:'Détail par employé',exact:true}).click()
 let modal=page.getByRole('dialog')
 await modal.getByRole('button',{name:'Paiements Employé B',exact:true}).click()
 await expect(modal.getByRole('heading',{name:'Historique des paiements',exact:true})).toBeInViewport()
 await expect(modal).toContainText('PAY-2')
 await modal.getByRole('button',{name:'Retour à la liste des employés',exact:true}).click()
 await expect(modal.getByRole('button',{name:'Paiements Employé A',exact:true})).toBeVisible()
 await modal.getByRole('button',{name:'Fermer',exact:true}).click()
 await partial.getByRole('button',{name:'Marquer la paie comme payée',exact:true}).click()
 modal=page.getByRole('dialog')
 await expect(modal).toContainText('30,00')
 await modal.getByRole('textbox',{name:'Date réelle du paiement',exact:true}).fill('')
 await expect(modal.getByRole('button',{name:'Confirmer le paiement de la quinzaine',exact:true})).toBeDisabled()
 await modal.getByRole('textbox',{name:'Date réelle du paiement',exact:true}).fill('2026-09-20')
 await modal.getByRole('combobox',{name:'Mode de paiement',exact:true}).selectOption('cheque')
 await modal.getByRole('textbox',{name:'Référence (facultative)',exact:true}).fill('SOLDE-QUINZAINE')
 await modal.getByRole('button',{name:'Confirmer le paiement de la quinzaine',exact:true}).click()
 await expect(modal.getByRole('alert')).toContainText('paiements ont changé')
 expect(recorded).toBe(0)
 await modal.getByRole('button',{name:'Actualiser les paiements',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(partial).toContainText('25,00')
 await partial.getByRole('button',{name:'Marquer la paie comme payée',exact:true}).click()
 modal=page.getByRole('dialog')
 await expect(modal).toContainText('25,00')
 await modal.getByRole('textbox',{name:'Date réelle du paiement',exact:true}).fill('2026-09-20')
 await modal.getByRole('combobox',{name:'Mode de paiement',exact:true}).selectOption('cheque')
 await modal.getByRole('textbox',{name:'Référence (facultative)',exact:true}).fill('SOLDE-QUINZAINE')
 await modal.getByRole('button',{name:'Confirmer le paiement de la quinzaine',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(partial.getByRole('cell',{name:'Payé',exact:true})).toBeVisible()
 await expect(partial.getByRole('button',{name:'Marquer la paie comme payée',exact:true})).toBeDisabled()
 expect(recorded).toBe(1)
 expect(payments.find(item=>item.id==='m2').amount).toBe(20)
 expect(payments.filter(item=>item.preparation_id==='p1'&&item.worker_id==='EMP01')).toHaveLength(1)
 await partial.getByRole('button',{name:'Règlements de la quinzaine',exact:true}).click()
 modal=page.getByRole('dialog')
 await modal.locator('summary').filter({hasText:'Historique des règlements collectifs'}).click()
 await expect(modal).toContainText('SOLDE-QUINZAINE')
 await expect(modal).toContainText('20/09/2026')
 await expect(modal.getByRole('button',{name:'Confirmer le paiement de la quinzaine',exact:true})).toHaveCount(0)
 await modal.getByRole('button',{name:'Fermer',exact:true}).click()
 await partial.getByRole('button',{name:'Détail par employé',exact:true}).click()
 modal=page.getByRole('dialog')
 await modal.getByRole('button',{name:'Paiements Employé B',exact:true}).click()
 await expect(modal).toContainText('PAY-2');await expect(modal).toContainText('PARTIAL-EXTERNAL');await expect(modal).toContainText('SOLDE-QUINZAINE')
 await page.screenshot({path:path.join(os.tmpdir(),'itrix-payroll-settlement-detail.png'),fullPage:false})
 expect(errors).toEqual([])
 expect(writes.every(p=>p==='/rest/v1/profiles'||p.endsWith('/payroll_net_context')||p.endsWith('/settle_payroll_fortnight'))).toBe(true)
 console.log('PASS fortnight button, draft/paid guards, required date, stale balance rejection, remaining-only settlement, preserved partials, paid status, batch audit and visible employee payment history. All writes mocked.')
}finally{await browser.close()}
