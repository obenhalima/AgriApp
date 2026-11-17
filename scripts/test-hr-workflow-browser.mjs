// All Supabase traffic is mocked. This verifies client-specific menus and entry routes.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
const expect = baseExpect.configure({timeout: 120000})
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222'
const pilot = '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79', rollout = 'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217', standard = '99999999-9999-4999-8999-999999999999'
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
   {domain_id: rollout, role_id: role, is_default: false, domains: {name: 'Domaine BENHALIMA 501', code: 'DOMBEN501', is_active: true}, roles: {name: 'Admin'}},
   {domain_id: standard, role_id: role, is_default: false, domains: {name: 'STALSON', code: 'STALSON', is_active: true}, roles: {name: 'Admin'}},
  ]
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page = await context.newPage(); page.setDefaultTimeout(120000)
 const errors = []; page.on('pageerror', error => errors.push(error.message))
 await page.goto('http://localhost:3001/rh', {waitUntil: 'domcontentloaded', timeout: 180000})
 await expect(page.getByRole('heading', {name: 'Ressources humaines', exact: true})).toBeVisible()
 const sidebar = page.locator('aside').first()
 await sidebar.getByRole('button', {name: /RESSOURCES HUMAINES/}).click()
 await sidebar.getByRole('button', {name: /^PRODUCTION/}).click()
 await expect(sidebar.locator('a[href="/rh/employes"]')).toHaveCount(1)
 await expect(sidebar.locator('a[href="/pointage"]')).toHaveCount(1)
 await expect(sidebar.locator('a[href="/rh/paie"]')).toHaveText('Paie & paiements')
 await expect(sidebar.locator('a[href="/rh/conges"],a[href="/rh/cnss"]')).toHaveCount(0)
 await page.screenshot({path: path.join(os.tmpdir(), 'itrix-hr-pilot-menu.png'), fullPage: false})
 await page.locator('a[href="/rh/paie"]').last().click()
 await expect(page.getByRole('heading', {name: 'Préparer la paie de la quinzaine', exact: true})).toBeVisible()
 await expect(page.getByRole('button', {name: 'Nouvelle période', exact: true})).toHaveCount(0)
 await page.goto('http://localhost:3001/pointage', {waitUntil: 'domcontentloaded', timeout: 180000})
 await expect(page.getByRole('heading', {name: 'Pointage par quinzaine', exact: true})).toBeVisible()
 await expect(page.getByRole('link', {name: 'Pointage par tâche', exact: true})).toHaveCount(0)
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:180000}),page.getByRole('combobox',{name:'Société active',exact:true}).selectOption(rollout)])
 await expect(page.getByRole('heading',{name:'Pointage par quinzaine',exact:true})).toBeVisible()
 await expect(page.getByText('Parcours quinzaine · DOMBEN501',{exact:true})).toBeVisible()
 await Promise.all([page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 180000}), page.getByRole('combobox', {name: 'Société active', exact: true}).selectOption(standard)])
 await expect(page.getByRole('heading', {name: 'Pointage', exact: true})).toBeVisible()
 await expect(page.getByText('Module RH standard', {exact: true})).toBeVisible()
 await sidebar.getByRole('button', {name: /RESSOURCES HUMAINES/}).click()
 await expect(sidebar.locator('a[href="/rh/conges"]')).toBeVisible()
 await expect(sidebar.locator('a[href="/rh/cnss"]')).toBeVisible()
 await expect(sidebar.locator('a[href="/rh/paie"]')).toHaveText('Paie')
 await page.goto('http://localhost:3001/rh/paie', {waitUntil: 'domcontentloaded', timeout: 180000})
 await expect(page.getByRole('button', {name: 'Nouvelle période', exact: true})).toBeVisible()
 await expect(page.getByRole('heading', {name: 'Préparer la paie de la quinzaine', exact: true})).toHaveCount(0)
 expect(errors).toEqual([])
 expect(writes.every(requestPath => requestPath === '/rest/v1/profiles')).toBe(true)
 console.log('PASS pilot RH menu (4 entries), unique attendance, adapted payroll/attendance routes, 501 fortnight rollout and standard STALSON payroll, client switching and breadcrumbs. No real writes.')
} finally {await browser.close()}
