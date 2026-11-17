// All Supabase traffic is intercepted. No real records are changed.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
import * as XLSX from 'xlsx'
const expect = baseExpect.configure({timeout: 60000})
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain = '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79', uid = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222', farm = '33333333-3333-4333-8333-333333333333'
const worker = '55555555-5555-4555-8555-555555555555'
const user = {id: uid, email: 'attendance@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [{alg: 'HS256', typ: 'JWT'}, {sub: uid, exp, role: 'authenticated'}, 'qa'].map(value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')).join('.')
let period = null, records = [], saves = 0
const browser = await chromium.launch({channel: 'msedge', headless: true})
try {
 const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1500, height: 1000}})
 await context.addInitScript(({key, session}) => localStorage.setItem(key, JSON.stringify(session)), {key: `sb-${host.split('.')[0]}-auth-token`, session: {access_token: token, refresh_token: 'qa', expires_at: exp, expires_in: 3600, token_type: 'bearer', user}})
 await context.route(`https://${host}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
  let data = []
  if (url.pathname === '/auth/v1/user') data = user
  else if (table === 'profiles') data = [{...user, full_name: 'QA', role_id: role, is_active: true, must_change_password: false}]
  else if (table === 'domain_memberships') data = [{domain_id: domain, role_id: role, is_default: true, domains: {name: 'BENHALIMA', code: 'DOM-BENHALIMA', is_active: true}, roles: {name: 'Admin'}}]
  else if (table === 'roles') data = [{id: role, name: 'Admin', is_admin: true, is_active: true}]
  else if (table === 'farms') data = [{id: farm, domain_id: domain, code: 'FS', name: 'Ferme QA', is_active: true}]
  else if (table === 'workers') data = [{id: worker, farm_id: farm, farms: {id: farm, domain_id: domain}, first_name: '', last_name: 'EMPLOYE TEST', matricule: 'EMP01', is_active: true}]
  else if (table === 'employee_attendance_periods') data = period ? [period] : []
  else if (table === 'employee_attendance_records') data = records
  else if (table === 'save_employee_attendance') {
   const body = request.postDataJSON()
   expect(body.p_domain).toBe(domain); expect(body.p_farm).toBe(farm)
   expect(body.p_revision).toBe(period?.revision || 0)
   saves++
   period = {id: 'period-1', domain_id: domain, farm_id: farm, start_date: body.p_start, end_date: body.p_end, status: body.p_action === 'validate' ? 'validated' : 'draft', revision: (period?.revision || 0) + 1, validated_at: body.p_action === 'validate' ? new Date().toISOString() : null}
   records = body.p_rows
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
 const normal = page.getByRole('textbox', {name: 'EMP01 · N · 2026-11-01', exact: true})
 const overtime = page.getByRole('textbox', {name: 'EMP01 · S · 2026-11-01', exact: true})
 await normal.fill('16'); await overtime.fill('2')
 await page.getByRole('button', {name: 'Enregistrer le brouillon', exact: true}).click()
 await expect(page.getByRole('status').filter({hasText: 'Brouillon enregistré'})).toBeVisible()
 expect(records[0]).toMatchObject({normal_hours: 16, overtime_hours: 2})
 await page.getByRole('button', {name: 'Recharger', exact: true}).click()
 await expect(normal).toHaveValue('16')
 const downloaded = page.waitForEvent('download')
 await page.getByRole('button', {name: 'Exporter le modèle pointage', exact: true}).click()
 const template = XLSX.read(fs.readFileSync(await (await downloaded).path()), {type: 'buffer'})
 expect(template.Sheets._Contexte.B3.v).toBe(domain)
 template.Sheets.Pointage.E2 = {t: 'n', v: 7.5}
 template.Sheets.Pointage.E3 = {t: 'n', v: 0}
 await page.locator('input[type=file]').setInputFiles({name: 'pointage.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(template, {type: 'buffer', bookType: 'xlsx'})})
 await expect(page.getByRole('status').filter({hasText: 'Fichier contrôlé'})).toBeVisible()
 await expect(page.getByRole('textbox', {name: 'EMP01 · N · 2026-11-02', exact: true})).toHaveValue('7.5')
 await page.getByRole('button', {name: 'Valider la quinzaine', exact: true}).click()
 await expect(page.getByRole('alert').filter({hasText: 'cellules vides'})).toBeVisible()
 expect(saves).toBe(1)
 await page.getByRole('button', {name: 'Confirmer les cellules vides à zéro', exact: true}).click()
 await page.getByRole('button', {name: 'Valider la quinzaine', exact: true}).click()
 await expect(page.getByRole('status').filter({hasText: 'Quinzaine validée'})).toBeVisible()
 await expect(normal).toBeDisabled()
 expect(records).toHaveLength(15)
 expect(records.every(row => row.normal_hours !== null && row.overtime_hours !== null)).toBe(true)
 await page.getByRole('button', {name: 'Rouvrir pour correction', exact: true}).click()
 await expect(normal).toBeEnabled()
 template.Sheets._Contexte.B3.v = 'other-domain'
 await page.locator('input[type=file]').setInputFiles({name: 'wrong.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(template, {type: 'buffer', bookType: 'xlsx'})})
 await expect(page.getByRole('alert').filter({hasText: 'autre client'})).toBeVisible()
 const screenshot = path.join(os.tmpdir(), 'itrix-attendance-local.png')
 await page.screenshot({path: screenshot, fullPage: false})
 console.log('Screenshot', screenshot)
 expect(errors).toEqual([])
 console.log('PASS local attendance entry N16/S2, draft reload, template export/import, blank validation, confirmed zero, validation lock, reopening and tenant mismatch. All writes mocked.')
} finally {await browser.close()}
