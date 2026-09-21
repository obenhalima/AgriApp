// Mock-only browser regression. No request reaches the shared database.
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host = new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid = '11111111-1111-4111-8111-111111111111', domain = '22222222-2222-4222-8222-222222222222', role = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, email: 'qa@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: uid, exp, role: 'authenticated' }, 'qa'].map(x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')).join('.')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${host.split('.')[0]}-auth-token`, session: { access_token: token, refresh_token: 'qa', expires_at: exp, expires_in: 3600, token_type: 'bearer', user } })
  let draft = null, revision = 0, admin = true, platform = false
  const clientRows = [{ id: domain, name: 'Client QA', code: 'QA', is_active: true }]
  const writes = []
  await context.route(`https://${host}/**`, async route => {
    const path = new URL(route.request().url()).pathname; let data = []
    if (path === '/auth/v1/user') data = user
    else if (path.endsWith('/profiles')) data = [{ ...user, full_name: 'QA', role_id: role, is_active: true, is_platform_admin: platform, must_change_password: false }]
    else if (path.endsWith('/domains')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        expect(body.name).toBe('Nouvelle société QA'); expect(body.id).toBeUndefined(); expect(body.code).toMatch(/^DOM-[A-F0-9]{12}$/)
        data = { ...body, id: '55555555-5555-4555-8555-555555555555' }; clientRows.push(data)
      } else data = clientRows
    }
    else if (path.endsWith('/domain_memberships')) data = [{ domain_id: domain, role_id: role, is_default: true, domains: { name: 'Client QA', code: 'QA' }, roles: { name: 'Admin' } }]
    else if (path.endsWith('/roles')) data = [{ id: role, name: admin ? 'Admin' : 'Lecteur', is_admin: admin, is_active: true }]
    else if (path.endsWith('/crops')) data = [{ id: 'crop-qa', code: 'TOM', name: 'Tomate', is_active: true }]
    else if (path.endsWith('/varieties')) data = [{ id: 'variety-qa', code: 'MARQ', commercial_name: 'Marquise', crop_id: 'crop-qa', is_active: true }]
    else if (path.endsWith('/initialization_drafts')) data = draft ? [{ payload: draft, revision }] : []
    else if (path.endsWith('/save_initialization_draft')) {
      const body = route.request().postDataJSON()
      expect(body.p_domain).toBe(domain); expect(body.p_revision).toBe(revision)
      draft = body.p_payload; revision++; data = revision; writes.push(path)
    } else if (route.request().method() !== 'GET' && !path.startsWith('/auth/')) throw new Error('Unexpected mutation: ' + path)
    if (route.request().headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000)
  await page.goto('http://localhost:3001/admin/initialisation', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByRole('button', { name: 'Continuer avec ce client', exact: true }).click()
  await page.getByRole('button', { name: '+ Ajouter une ligne', exact: true }).click()
  await expect(page.getByLabel('Code métier (proposé automatiquement), ligne 1', { exact: true })).toHaveValue('FER-0001')
  await page.getByLabel('Code métier (proposé automatiquement), ligne 1', { exact: true }).fill('F01')
  await page.getByLabel('Nom, ligne 1', { exact: true }).fill('Ferme QA')
  await page.getByRole('button', { name: 'Marquer comme relu et continuer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Serres', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sauvegarder le brouillon', exact: true }).click()
  await expect(page.getByText('Version sauvegardée : 1')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continuer avec ce client', exact: true }).click()
  await expect(page.getByLabel('Nom, ligne 1', { exact: true })).toHaveValue('Ferme QA')
  expect(writes).toEqual(['/rest/v1/rpc/save_initialization_draft'])
  await page.getByRole('button', { name: '5. Cultures et variétés', exact: true }).click()
  await page.getByLabel('Filtrer les variétés par culture').selectOption('TOM')
  await page.getByLabel('Variété existante', { exact: true }).selectOption('variety-qa')
  await page.getByRole('button', { name: 'Utiliser cette variété', exact: true }).click()
  await expect(page.getByLabel('Nom, ligne 1', { exact: true })).toHaveValue('Marquise')
  await expect(page.getByLabel('Nom, ligne 1', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Code culture, ligne 1', { exact: true })).toHaveValue('TOM')
  await page.getByRole('button', { name: '+ Préparer une nouvelle variété', exact: true }).click()
  await page.getByLabel('Code culture, ligne 2', { exact: true }).selectOption('TOM')
  await expect(page.getByLabel('Code culture, ligne 2', { exact: true })).toHaveValue('TOM')
  expect(errors).toEqual([])
  page.on('dialog', d => d.accept())
  admin = false; await page.reload()
  await expect(page.getByText('L’initialisation est réservée aux administrateurs du client.')).toBeVisible()
  admin = true; platform = true; await page.reload()
  await page.getByRole('button', { name: 'Nouveau client FarmPilot', exact: true }).click()
  await page.getByLabel('Nom du client *', { exact: true }).fill('Nouvelle société QA')
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click()
  await expect(page.getByLabel('Client FarmPilot à initialiser')).toHaveValue('55555555-5555-4555-8555-555555555555')
  await page.getByRole('button', { name: 'Continuer avec ce client', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Initialiser l’exploitation', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('PASS: preparation, review, save, reload, access control; no operational writes')
} finally { await browser.close() }
