// All Supabase requests are intercepted. No real data is modified.
import {chromium, expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
import * as XLSX from 'xlsx'
import {calculateNetPayroll} from '../lib/netPayroll.ts'
const expect = baseExpect.configure({timeout: 60000})
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain = '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79', uid = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222', farm = '33333333-3333-4333-8333-333333333333'
const worker = '55555555-5555-4555-8555-555555555555', manualWorker = '77777777-7777-4777-8777-777777777777', campaign = '88888888-8888-4888-8888-888888888888'
const workers = [
 {id: worker, farm_id: farm, farms: {id: farm, domain_id: domain}, first_name: '', last_name: 'EMPLOYE POINTE', is_declared: true, dependents: 0, matricule: 'EMP01', normal_hourly_rate: 11.9345625, overtime_hourly_rate: 15, is_active: true},
 {id: manualWorker, farm_id: farm, farms: {id: farm, domain_id: domain}, first_name: '', last_name: 'EMPLOYE MANUEL', is_declared: false, dependents: 0, matricule: 'EMP02', normal_hourly_rate: 10, overtime_hourly_rate: 15, is_active: true},
]
const user = {id: uid, email: 'payroll@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [{alg: 'HS256', typ: 'JWT'}, {sub: uid, exp, role: 'authenticated'}, 'qa'].map(value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')).join('.')
const attendance = {id: 'attendance-1', domain_id: domain, farm_id: farm, start_date: '2026-11-01', end_date: '2026-11-15', status: 'validated', revision: 1, validated_at: '2026-11-16'}
const attendanceRows = Array.from({length: 15}, (_, index) => ({worker_id: worker, work_date: `2026-11-${String(index + 1).padStart(2, '0')}`, normal_hours: index ? 0 : 16, overtime_hours: index ? 0 : 2, entry_source: 'manual', source_filename: null}))
let preparation = null, payments = [], saves = 0
const browser = await chromium.launch({channel: 'msedge', headless: true})
try {
 const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1550, height: 1050}})
 await context.addInitScript(({key, session}) => localStorage.setItem(key, JSON.stringify(session)), {key: `sb-${host.split('.')[0]}-auth-token`, session: {access_token: token, refresh_token: 'qa', expires_at: exp, expires_in: 3600, token_type: 'bearer', user}})
 await context.route(`https://${host}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
  let data = []
  if (url.pathname === '/auth/v1/user') data = user
  else if (table === 'profiles') data = [{...user, full_name: 'QA', role_id: role, is_active: true, must_change_password: false}]
  else if (table === 'domain_memberships') data = [{domain_id: domain, role_id: role, is_default: true, domains: {name: 'BENHALIMA', code: 'DOM-BENHALIMA', is_active: true}, roles: {name: 'Admin'}}]
  else if (table === 'roles') data = [{id: role, name: 'Admin', is_admin: true, is_active: true}]
  else if (table === 'farms') data = [{id: farm, domain_id: domain, code: 'FS', name: 'Ferme QA', is_active: true}]
  else if (table === 'workers') data = workers
  else if (table === 'campaigns') data = [{id: campaign, farm_id: farm, code: 'CAMP-QA', name: 'Campagne QA', status: 'en_cours'}]
  else if (table === 'employee_attendance_periods') data = [attendance]
  else if (table === 'employee_attendance_records') data = attendanceRows
  else if (table === 'payroll_net_context') data = workers.map(item => ({worker_id: item.id, is_declared: item.is_declared, dependents: 0, prior_gross: 0, cnss_employee: 0, amo_employee: 0, ir_amount: 0, cnss_employer: 0, amo_employer: 0, family_allowance_employer: 0, prof_training_employer: 0, has_later_payroll: false, fingerprint: 'mock-month'}))
  else if (table === 'payroll_preparations') data = preparation ? [preparation] : []
  else if (table === 'payroll_preparation_payments') data = payments
  else if (table === 'save_payroll_preparation') {
   const body = request.postDataJSON()
   expect(body.p_domain).toBe(domain); expect(body.p_farm).toBe(farm); expect(body.p_start).toBe('2026-11-01'); expect(body.p_attendance_revision).toBe(1)
   expect(body.p_revision).toBe(preparation?.revision || 0)
   expect(body.p_rows[0]).toMatchObject({source: 'attendance', normal_hours: 16, overtime_hours: 2, normal_rate: 12.5})
   expect(body.p_rows[1]).toMatchObject({source: 'manual', normal_hours: 8, overtime_hours: 1})
   saves++
   const rows = body.p_rows.map(line => {
    const original = workers.find(item => item.id === line.worker_id)
    const base = Math.round(line.normal_hours * line.normal_rate * 100) / 100, overtime = Math.round(line.overtime_hours * line.overtime_rate * 100) / 100
    const gross = base + overtime + line.bonuses
    const automatic = calculateNetPayroll(gross, original.is_declared, body.p_start, 0, line.tax_context)
    return {...line, ...automatic, original_normal_rate: original.normal_hourly_rate, original_overtime_rate: original.overtime_hourly_rate, base_amount: base, overtime_amount: overtime, net_salary: gross - line.advance - line.other_deductions}
   })
   preparation = {id: 'prep-1', domain_id: domain, farm_id: farm, campaign_id: body.p_campaign, start_date: body.p_start, end_date: body.p_end, pay_date: body.p_pay_date, status: body.p_action === 'validate' ? 'validated' : 'draft', revision: (preparation?.revision || 0) + 1, attendance_period_id: attendance.id, attendance_revision: 1, payroll_period_id: body.p_action === 'validate' ? 'payroll-1' : null, rows, validated_at: body.p_action === 'validate' ? new Date().toISOString() : null}
   data = preparation
  } else if (table === 'record_payroll_preparation_payment') {
   const body = request.postDataJSON(), line = preparation.rows.find(item => item.worker_id === body.p_worker)
   const paid = payments.filter(item => item.worker_id === body.p_worker).reduce((sum, item) => sum + item.amount, 0)
   if (paid + body.p_amount > line.net_salary) {
    await route.fulfill({status: 400, contentType: 'application/json', body: JSON.stringify({code: 'P0001', message: 'Le paiement dépasse le net restant à payer'})}); return
   }
   data = {id: `payment-${payments.length + 1}`, preparation_id: preparation.id, worker_id: body.p_worker, amount: body.p_amount, payment_date: body.p_date, payment_method: body.p_method, reference: body.p_reference}
   payments.push(data)
  }
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page = await context.newPage(); page.setDefaultTimeout(120000)
 const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
 await page.goto(`http://localhost:3001/rh/paie/preparation?farm=${farm}&year=2026&month=11&half=first`, {waitUntil: 'domcontentloaded', timeout: 120000})
 console.log('Opened payroll preparation')
 await page.getByRole('heading', {name: 'Préparer la paie de la quinzaine', exact: true}).waitFor({timeout:120000}).catch(async error => {console.log('PAGE',page.url(),(await page.locator('body').innerText()).slice(-3500),errors);throw error})
 await expect(page.getByRole('spinbutton', {name: 'EMP01 Heures normales', exact: true})).toHaveValue('16')
 await expect(page.getByRole('spinbutton', {name: 'EMP01 Heures normales', exact: true})).toBeDisabled()
 await page.getByRole('spinbutton', {name: 'EMP01 Taux normal', exact: true}).fill('12.5')
 await expect(page.locator('tr').filter({hasText: 'EMPLOYE POINTE'})).toContainText('0,5654375')
 await page.getByRole('combobox', {name: 'EMP02 Unité de saisie', exact: true}).selectOption('days')
 await page.getByRole('spinbutton', {name: 'EMP02 Heures normales', exact: true}).fill('1')
 await page.getByRole('combobox', {name: 'EMP02 Unité de saisie', exact: true}).selectOption('hours')
 await expect(page.getByRole('spinbutton', {name: 'EMP02 Heures normales', exact: true})).toHaveValue('8')
 await page.getByRole('spinbutton', {name: 'EMP02 Heures supplémentaires', exact: true}).fill('1')
 await page.getByRole('combobox', {name: 'Campagne des coûts', exact: true}).selectOption(campaign)
 await page.getByRole('button', {name: 'Détails EMP01', exact: true}).click()
 const detail = page.getByRole('dialog')
 await detail.getByRole('spinbutton', {name: 'Avances à récupérer', exact: true}).fill('10')
 await expect(detail.getByRole('spinbutton', {name: 'CNSS salarié', exact: true})).toHaveValue('11.05')
 await expect(detail.getByRole('spinbutton', {name: 'CNSS salarié', exact: true})).toBeDisabled()
 await expect(detail.getByRole('spinbutton', {name: 'CNSS employeur', exact: true})).toHaveValue('22.15')
 await detail.getByRole('button', {name: 'Fermer', exact: true}).click()
 await page.getByRole('button', {name: 'Valider la paie et générer les coûts', exact: true}).click()
 await expect(page.getByRole('alert').filter({hasText: 'Retenues et charges à confirmer'})).toBeVisible()
 expect(saves).toBe(0)
 await page.getByRole('checkbox', {name: 'Je confirme les primes nettes, avances et autres retenues de tous les employés.', exact: true}).check()
 await page.getByRole('button', {name: 'Enregistrer le brouillon', exact: true}).click()
 await expect(page.getByRole('status').filter({hasText: 'Préparation enregistrée'})).toBeVisible()
 await page.getByRole('button', {name: 'Recharger', exact: true}).click()
 await expect(page.getByRole('spinbutton', {name: 'EMP02 Heures normales', exact: true})).toHaveValue('8')
 await expect(page.getByRole('region', {name: 'Historique des paies', exact: true}).getByText('Provisoire', {exact:true})).toBeVisible()
 console.log('Draft saved and reloaded')
 await page.getByRole('button', {name: 'Valider la paie et générer les coûts', exact: true}).click()
 await expect(page.getByRole('status').filter({hasText: 'Paie validée et coûts générés'})).toBeVisible()
 await expect(page.getByRole('spinbutton', {name: 'EMP01 Taux normal', exact: true})).toBeDisabled()
 await page.getByRole('button', {name: 'Enregistrer un paiement EMP01', exact: true}).click()
 let payment = page.getByRole('dialog')
 await payment.getByRole('spinbutton', {name: 'Montant du paiement', exact: true}).fill('25')
 await payment.getByRole('button', {name: 'Confirmer le paiement', exact: true}).click()
 await expect(payment).toHaveCount(0)
 await expect(page.getByRole('region', {name: 'Historique des paies', exact: true}).getByRole('cell', {name:'Partiellement payé',exact:true})).toBeVisible()
 await page.getByRole('button', {name: 'Enregistrer un paiement EMP01', exact: true}).click()
 payment = page.getByRole('dialog')
 await payment.getByRole('spinbutton', {name: 'Montant du paiement', exact: true}).fill('200')
 await payment.getByRole('button', {name: 'Confirmer le paiement', exact: true}).click()
 await expect(payment.getByRole('alert')).toContainText('dépasse')
 await payment.getByRole('spinbutton', {name: 'Montant du paiement', exact: true}).fill('195')
 await payment.getByRole('button', {name: 'Confirmer le paiement', exact: true}).click()
 await expect(payment).toHaveCount(0)
 await expect(page.getByRole('button', {name: 'Enregistrer un paiement EMP01', exact: true})).toHaveCount(0)
 await page.getByRole('button', {name: 'Enregistrer un paiement EMP02', exact: true}).click()
 await page.getByRole('dialog').getByRole('button', {name: 'Confirmer le paiement', exact: true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.getByRole('region', {name: 'Historique des paies', exact: true}).getByRole('cell', {name:'Payé',exact:true})).toBeVisible()
 const downloadEvent = page.waitForEvent('download')
 await page.getByRole('button', {name: 'Exporter état de paie et émargement', exact: true}).click()
 const book = XLSX.read(fs.readFileSync(await (await downloadEvent).path()), {type: 'buffer'})
 expect(book.Sheets.Etat_Paie.U5.v).toBe(220)
 expect(book.Sheets.Emargement.F5.v).toBe(220)
 expect(book.Sheets.Emargement.G5.v).toBe(0)
 expect(payments).toHaveLength(3)
 expect(errors).toEqual([])
 const screenshot = path.join(os.tmpdir(), 'itrix-payroll-preparation-local.png'); await page.screenshot({path: screenshot, fullPage: false})
 console.log('Screenshot', screenshot)
 console.log('PASS automatic declared net payroll, readonly contributions, explicit undeclared status, pointage-to-payroll link, locked attendance, editable reference rates and differences, manual days/hours, draft reload, deductions review, validation, partial/full payment, overpayment rejection and payroll/signature export. All writes mocked.')
} finally {await browser.close()}
