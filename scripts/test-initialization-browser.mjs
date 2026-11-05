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
  const secondDomain='44444444-4444-4444-8444-444444444444'
  const clientRows = [{ id: domain, name: 'Client QA', code: 'QA', is_active: true },{id:secondDomain,name:'Client QB',code:'QB',is_active:true}]
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
    else if (path.endsWith('/domain_memberships')) data = clientRows.filter(row=>row.id===domain||row.id===secondDomain).map(row=>({domain_id:row.id,role_id:role,is_default:row.id===domain,domains:{name:row.name,code:row.code,is_active:true},roles:{name:'Admin',is_active:true}}))
    else if (path.endsWith('/roles')) data = [{ id: role, name: admin ? 'Admin' : 'Lecteur', is_admin: admin, is_active: true }]
    else if (path.endsWith('/crops')) data = [{ id: 'crop-qa', code: 'TOM', name: 'Tomate', is_active: true }]
    else if (path.endsWith('/varieties')) data = [{ id: 'variety-qa', code: 'MARQ', commercial_name: 'Marquise', crop_id: 'crop-qa', is_active: true }]
    else if (path.endsWith('/farms')) data = new URL(route.request().url()).searchParams.get('domain_id')===`eq.${secondDomain}` ? [{id:'farm-qb',domain_id:secondDomain,code:'FQB',name:'Ferme QB',is_active:true}] : []
    else if (path.endsWith('/initialization_drafts')) data = draft && new URL(route.request().url()).searchParams.get('domain_id')===`eq.${domain}` ? [{ payload: draft, revision }] : []
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
  await page.getByRole('button', { name: 'Continuer avec ce client', exact: true }).click().catch(async error=>{
    console.log('Mocked page diagnostic:',await page.locator('main').innerText().catch(()=>''),errors)
    throw error
  })
  await expect(page.getByRole('heading',{name:'Reprise progressive des données',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Préparer ce module',exact:true}).nth(1).click()
  const moduleNav=page.getByRole('navigation',{name:'Étapes d’initialisation'})
  await expect(moduleNav.getByRole('button')).toHaveCount(3)
  await expect(moduleNav).not.toContainText('Personnel')
  await page.getByRole('button',{name:'Retour aux modules',exact:true}).click()
  await page.getByRole('button',{name:'Accéder au dossier complet existant',exact:true}).click()
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
  await page.getByRole('button',{name:'Accéder au dossier complet existant',exact:true}).click()
  await expect(page.getByLabel('Nom, ligne 1', { exact: true })).toHaveValue('Ferme QA')
  expect(writes).toEqual(['/rest/v1/rpc/save_initialization_draft'])
  await page.getByRole('button',{name:'Changer de client',exact:true}).click()
  await page.getByLabel('Client ItriX Farm à initialiser').selectOption(secondDomain)
  await page.getByRole('button',{name:'Continuer avec ce client',exact:true}).click()
  await page.getByRole('button',{name:'Accéder au dossier complet existant',exact:true}).click()
  await expect(page.getByLabel('Nom, ligne 1',{exact:true})).toHaveValue('Ferme QB')
  await expect(page.getByLabel('Nom, ligne 1',{exact:true})).toHaveAttribute('readonly','')
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Retour aux modules',exact:true}).click()
  await page.getByRole('button',{name:'Choisir un autre client',exact:true}).click()
  await page.getByLabel('Client ItriX Farm à initialiser').selectOption(domain)
  await page.getByRole('button',{name:'Continuer avec ce client',exact:true}).click()
  await page.getByRole('button',{name:'Accéder au dossier complet existant',exact:true}).click()
  await expect(page.getByLabel('Nom, ligne 1',{exact:true})).toHaveValue('Ferme QA')
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
  page.once('dialog',dialog=>dialog.dismiss())
  await page.getByRole('button',{name:'Changer de client',exact:true}).click()
  await expect(page.getByLabel('Code culture, ligne 2',{exact:true})).toHaveValue('TOM')
  await expect(page.getByLabel('Client ItriX Farm à initialiser')).toHaveCount(0)
  expect(errors).toEqual([])
  page.on('dialog', d => d.accept())
  admin = false; await page.reload()
  await expect(page.getByText(/L’initialisation est réservée aux administrateurs du client\.|Vous n’avez pas les droits nécessaires pour ce module\./)).toBeVisible()
  await expect(page.getByRole('button',{name:'+ Ajouter une ligne',exact:true})).toHaveCount(0)
  admin = true; platform = true; await page.reload()
  await page.getByRole('button', { name: 'Nouveau client ItriX Farm', exact: true }).click()
  await page.getByLabel('Nom du client *', { exact: true }).fill('Nouvelle société QA')
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click()
  await expect(page.getByLabel('Client ItriX Farm à initialiser')).toHaveValue('55555555-5555-4555-8555-555555555555')
  await page.getByRole('button', { name: 'Continuer avec ce client', exact: true }).click()
  await page.getByRole('button',{name:'Accéder au dossier complet existant',exact:true}).click()
  await expect(page.getByRole('heading', { name: 'Initialiser l’exploitation', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('PASS: preparation, review, save, reload, access control; no operational writes')
} finally { await browser.close() }
