// All Supabase traffic is intercepted. No real records are changed.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
import * as XLSX from 'xlsx'
const expect = baseExpect.configure({timeout: 60000})
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain = 'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217', uid = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222', farm = '33333333-3333-4333-8333-333333333333'
const worker = '55555555-5555-4555-8555-555555555555'
const user = {id: uid, email: 'attendance@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [{alg: 'HS256', typ: 'JWT'}, {sub: uid, exp, role: 'authenticated'}, 'qa'].map(value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')).join('.')
let period = null, records = [], saves = 0
const saved = new Map(), attempts = new Map(), requestIds = new Map()
const browser = await chromium.launch({channel: 'msedge', headless: true})
try {
 const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1500, height: 1000}})
 await context.addInitScript(({key, session}) => localStorage.setItem(key, JSON.stringify(session)), {key: `sb-${host.split('.')[0]}-auth-token`, session: {access_token: token, refresh_token: 'qa', expires_at: exp, expires_in: 3600, token_type: 'bearer', user}})
 await context.route(`https://${host}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
  let data = []
  if (url.pathname === '/auth/v1/user') data = user
  else if (table === 'profiles') data = [{...user, full_name: 'QA', role_id: role, is_active: true, must_change_password: false}]
  else if (table === 'domain_memberships') data = [{domain_id: domain, role_id: role, is_default: true, domains: {name: 'BENHALIMA', code: 'DOMBEN501', is_active: true}, roles: {name: 'Admin'}}]
  else if (table === 'roles') data = [{id: role, name: 'Admin', is_admin: true, is_active: true}]
  else if (table === 'farms') data = [{id: farm, domain_id: domain, code: 'FS', name: 'Ferme QA', is_active: true}]
  else if (table === 'workers') data = [{id: worker, farm_id: farm, farms: {id: farm, domain_id: domain}, first_name: '', last_name: 'EMPLOYE TEST', matricule: 'EMP01', is_active: true}]
  else if (table === 'employee_attendance_periods') {const start=url.searchParams.get('start_date')?.replace('eq.','');data=[...saved.values()].map(x=>x.period).filter(x=>!start||x.start_date===start)}
  else if (table === 'employee_attendance_records') {const id=url.searchParams.get('period_id')?.replace('eq.','');data=[...saved.values()].find(x=>x.period.id===id)?.rows||[]}
  else if (table === 'save_employee_attendance') {
   const body = request.postDataJSON()
   expect(body.p_domain).toBe(domain); expect(body.p_farm).toBe(farm)
   requestIds.set(body.p_start,[...(requestIds.get(body.p_start)||[]),body.p_request])
   const previous=saved.get(body.p_start)
   expect(body.p_revision).toBe(previous?.period.revision||0)
   const n=(attempts.get(body.p_start)||0)+1;attempts.set(body.p_start,n)
   if(body.p_start==='2026-08-16'&&n===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Erreur QA réessayable'})});return}
   saves++
   period = {id:body.p_start,domain_id:domain,farm_id:farm,start_date:body.p_start,end_date:body.p_end,status:body.p_action==='validate'?'validated':'draft',revision:(previous?.period.revision||0)+1,validated_at:null}
   records=body.p_rows;saved.set(body.p_start,{period,rows:records})
   data = period
  }
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page = await context.newPage(); page.setDefaultTimeout(60000)
 const errors = []; page.on('pageerror', error => errors.push(error.message))
 page.on('dialog', dialog => dialog.accept())
 await page.goto('http://localhost:3001/login', {waitUntil: 'domcontentloaded', timeout: 120000})
 await page.waitForURL(url => !url.pathname.includes('/login'), {timeout: 90000})
 await page.goto('http://localhost:3001/pointage', {waitUntil: 'domcontentloaded', timeout: 120000})
 await page.getByRole('heading', {name: 'Pointage par quinzaine', exact: true}).waitFor().catch(async error => {console.log('PAGE',page.url(),(await page.locator('body').innerText()).slice(-7000),errors);throw error})
 await page.getByRole('combobox', {name: 'Ferme', exact: true}).selectOption(farm)
 await page.getByLabel('Année', {exact: true}).selectOption('2026')
 await page.getByLabel('Mois', {exact: true}).selectOption('11')
 await page.getByLabel('Quinzaine', {exact: true}).selectOption('first')

 await page.getByRole('button',{name:'Importer plusieurs quinzaines',exact:true}).click()
 function sheet(start,month){const end=start===1?15:new Date(2026,month,0).getDate();const ws=XLSX.utils.aoa_to_sheet([]);ws.C2={t:'s',v:`QUINZAINE DU ${start}/${month}/2026 AU ${end}/${month}/2026`};for(let d=start;d<=end;d++)ws[XLSX.utils.encode_cell({r:5,c:d-start+3})]={t:'n',v:d};Object.assign(ws,{B10:{t:'s',v:'Alias source'},C10:{t:'s',v:'N'},C11:{t:'s',v:'S'},D10:{t:'n',v:16},D11:{t:'n',v:2},'!ref':'B2:Z20'});return ws}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet(1,7),'01.07.2026');XLSX.utils.book_append_sheet(wb,sheet(16,8),'16.08.2026')
 await page.getByLabel('Classeur de plusieurs quinzaines',{exact:true}).setInputFiles({name:'multi.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
 await expect(page.getByLabel('Choisir 2026-07-01',{exact:true})).toBeDisabled()
 await page.getByText('Employés à identifier (1)',{exact:true}).click()
 await page.getByLabel('Alias source',{exact:true}).selectOption(worker)
 await expect(page.getByRole('button',{name:'Valider les quinzaines sélectionnées',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Actualiser l’aperçu',exact:true}).click()
 await expect(page.getByLabel('Choisir 2026-07-01',{exact:true})).toBeChecked()
 await expect(page.getByLabel('Choisir 2026-08-16',{exact:true})).toBeChecked()
 await page.getByRole('button',{name:'Valider les quinzaines sélectionnées',exact:true}).click()
 await expect(page.getByText('Complétez les heures manquantes ou confirmez les cellules vides à zéro.',{exact:true}).first()).toBeVisible()
 expect(saves).toBe(0)
 await page.getByLabel('Je confirme que les cellules vides correspondent à zéro heure.',{exact:true}).check()
 await page.getByRole('button',{name:'Valider les quinzaines sélectionnées',exact:true}).click()
 await expect(page.getByText('Erreur QA réessayable',{exact:true})).toBeVisible()
 expect(saves).toBe(1)
 await expect(page.getByLabel('Choisir 2026-07-01',{exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Valider les quinzaines sélectionnées',exact:true}).click()
 await expect(page.getByLabel('Choisir 2026-08-16',{exact:true})).toBeDisabled()
 expect(saves).toBe(2);expect(attempts.get('2026-07-01')).toBe(1);expect(attempts.get('2026-08-16')).toBe(2)
 expect(new Set(requestIds.get('2026-08-16')).size).toBe(1)
 expect([...saved.values()].every(x=>x.rows.every(r=>r.normal_hours!==null&&r.overtime_hours!==null))).toBe(true)
 await page.getByRole('button',{name:'Actualiser l’aperçu',exact:true}).click()
 await expect(page.getByLabel('Choisir 2026-07-01',{exact:true})).toBeDisabled()
 await page.screenshot({path:path.join(os.tmpdir(),'itrix-attendance-batch-local.png'),fullPage:false})
 expect(errors).toEqual([])
 console.log('PASS DOMBEN501 multi-period preview, employee alias mapping, explicit zero confirmation, partial failure, retry of failed period only, validated lock. All writes mocked.')
}finally{await browser.close()}
