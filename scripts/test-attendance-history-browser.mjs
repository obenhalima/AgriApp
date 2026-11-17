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
  if (table === 'farms') data = [{id:'farm1',code:'FS',name:'Ferme Sud'}]
  if (table === 'employee_attendance_periods') {
    data = [
      {id:'a1',domain_id:pilot,farm_id:'farm1',start_date:'2026-09-01',end_date:'2026-09-15',status:'validated',revision:1},
      {id:'a2',domain_id:pilot,farm_id:'farm1',start_date:'2026-09-16',end_date:'2026-09-30',status:'validated',revision:1},
      {id:'a3',domain_id:pilot,farm_id:'farm1',start_date:'2026-10-01',end_date:'2026-10-15',status:'draft',revision:1}]
    const start = url.searchParams.get('start_date')
    if(start) data = data.filter(item => 'eq.' + item.start_date === start)
  }
  if (table === 'payroll_preparations') data = [
    {id:'p1',farm_id:'farm1',start_date:'2026-09-01',attendance_period_id:'a1',status:'validated',rows:[{worker_id:'w1',net_salary:100}]},
    {id:'p2',farm_id:'farm1',start_date:'2026-09-16',attendance_period_id:'a2',status:'validated',rows:[{worker_id:'w1',net_salary:100}]}]
  if (table === 'payroll_preparation_payments') data = [{id:'m1',preparation_id:'p1',worker_id:'w1',amount:100},{id:'m2',preparation_id:'p2',worker_id:'w1',amount:40}]
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page = await context.newPage(); page.setDefaultTimeout(120000)
 const errors = []; page.on('pageerror', error => errors.push(error.message))
 await page.goto('http://localhost:3001/pointage', {waitUntil:'domcontentloaded',timeout:180000})
 const history=page.getByRole('region',{name:'Historique des pointages',exact:true})
 await expect(history.getByRole('cell',{name:'Payé',exact:true})).toBeVisible()
 await expect(history.getByRole('cell',{name:'Partiellement payé',exact:true})).toBeVisible()
 await expect(history.getByRole('cell',{name:'Paie à préparer',exact:true})).toBeVisible()
 await expect(history.locator('tbody tr')).toHaveCount(3)
 await history.getByRole('button',{name:'Ouvrir le pointage',exact:true}).first().click()
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toHaveValue('farm1')
 await expect(page.getByRole('combobox',{name:'Mois',exact:true})).toHaveValue('9')
 await expect(page.getByRole('combobox',{name:'Quinzaine',exact:true})).toHaveValue('first')
 await expect(history.locator('a[href*="month=9&half=first"]')).toHaveCount(1)
 await page.screenshot({path:path.join(os.tmpdir(),'itrix-attendance-history.png'),fullPage:false})
 expect(errors).toEqual([])
 expect(writes.every(requestPath=>requestPath==='/rest/v1/profiles')).toBe(true)
 console.log('PASS attendance history: paid, partial, unprepared, opening saved fortnight and payroll link. All requests mocked.')
} finally {await browser.close()}
