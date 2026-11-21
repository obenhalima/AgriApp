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
  else if (table === 'employee_attendance_periods') {const start=url.searchParams.get('start_date')?.replace('eq.','');data=period&&(!start||period.start_date===start)?[period]:[]}
  else if (table === 'employee_attendance_records') data = records
  else if (table === 'save_employee_attendance') {
   const body = request.postDataJSON()
   expect(body.p_domain).toBe(domain); expect(body.p_farm).toBe(farm)
   expect(body.p_revision).toBe(period?.revision || 0)
   saves++
   period = {id: 'period-1', domain_id: domain, farm_id: farm, start_date: body.p_start, end_date: body.p_end, status: body.p_action === 'validate' ? 'validated' : 'draft', revision: (period?.revision || 0) + 1, validated_at: body.p_action === 'validate' ? new Date().toISOString() : null}
   records = body.p_rows.map(row=>{
    const previous=records.find(item=>item.worker_id===row.worker_id&&item.work_date===row.work_date)
    const changed=!!previous&&(row.normal_hours!==previous.normal_hours||row.overtime_hours!==previous.overtime_hours)
    const atypical=(row.normal_hours||0)+(row.overtime_hours||0)>24
    const pending=atypical&&(!previous||changed||previous.needs_review)||changed&&!!previous?.review_status
    return {...previous,...row,original_hours:previous?.original_hours||{normal_hours:row.normal_hours,overtime_hours:row.overtime_hours},needs_review:!!pending,review_status:pending?'pending':previous?.review_status||null,review_reason:pending?null:previous?.review_reason,review_note:pending?null:previous?.review_note,reviewed_by:pending?null:previous?.reviewed_by,reviewed_at:pending?null:previous?.reviewed_at}
   })
   data = period
  } else if(table==='review_employee_attendance'){
   const body=request.postDataJSON()
   expect(body.p_domain).toBe(domain);expect(body.p_revision).toBe(period.revision)
   expect(body.p_reason).toBeTruthy()
   if(body.p_action==='confirm'){expect(body.p_reason).toBe('other');expect(body.p_note).toBe('Valeur vérifiée dans le fichier source')}
   records=records.map(row=>row.worker_id===body.p_worker&&row.work_date===body.p_date?{...row,needs_review:false,review_status:body.p_action==='confirm'?'confirmed':'resolved',review_reason:body.p_reason,review_note:body.p_note,reviewed_by:uid,reviewed_at:new Date().toISOString()}:row)
   period={...period,revision:period.revision+1};data=period
  }
  if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)})
 })
 const page = await context.newPage(); page.setDefaultTimeout(60000)
 let cancelNextDialog=false
 const errors = []; page.on('pageerror', error => {errors.push(error.message);console.log('BROWSER ERROR',error.stack)})
 page.on('dialog', dialog => {if(cancelNextDialog){cancelNextDialog=false;return dialog.dismiss()}return dialog.accept()})
 await page.goto('http://localhost:3001/pointage', {waitUntil: 'domcontentloaded', timeout: 300000})
 await page.getByRole('heading', {name: 'Pointage par quinzaine', exact: true}).waitFor().catch(async error => {console.log('PAGE',page.url(),(await page.locator('body').innerText()).slice(-7000),errors);throw error})
 await page.getByRole('combobox', {name: 'Ferme', exact: true}).selectOption(farm)
 await page.getByLabel('Année', {exact: true}).selectOption('2026')
 await page.getByLabel('Mois', {exact: true}).selectOption('11')
 await page.getByLabel('Quinzaine', {exact: true}).selectOption('first')
 const namesGrid=page.locator('table').filter({has:page.getByRole('textbox',{name:'EMP01 · N · 2026-11-01',exact:true})})
 await namesGrid.getByRole('button',{name:'Filtrer la colonne Employé',exact:true}).click()
 const nameChoices=page.getByRole('group',{name:'Valeurs de la colonne',exact:true})
 await expect(nameChoices.getByRole('checkbox',{name:'EMPLOYE TEST',exact:true})).toBeVisible()
 await expect(nameChoices).not.toContainText('EMP01')
 await page.getByRole('button',{name:'Appliquer',exact:true}).click()
 const days=Array.from({length:15},(_,i)=>`2026-11-${String(i+1).padStart(2,'0')}`)
 const wb=XLSX.utils.book_new()
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Clé','Valeur'],['version','attendance-multi-1'],['client',domain],['ferme',farm]]),'_Contexte')
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code','ID','Nom'],['EMP01',worker,'EMPLOYE TEST']]),'Ref_Employes')
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Onglet','Début','Fin'],['Pointage',days[0],days.at(-1)]]),'Periodes')
 const normalLine=['EMP01','EMPLOYE TEST','N',16,...Array(14).fill(0)]
 const extra=['EMP01','EMPLOYE TEST','N',16,...Array(14).fill(0)]
 const overtime=['EMP01','EMPLOYE TEST','S',...Array(15).fill(0)]
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code employé','Nom','Type',...days],normalLine,overtime,extra]),'Pointage')
 for(const [month,label] of [[7,'July'],[10,'October']]){
  const dates=Array.from({length:16},(_,i)=>`2026-${String(month).padStart(2,'0')}-${String(i+16).padStart(2,'0')}`)
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code employé','Nom','Type',...dates],['EMP01','EMPLOYE TEST','N'],['EMP01','EMPLOYE TEST','S']]),label)
  XLSX.utils.sheet_add_aoa(wb.Sheets.Periodes,[[label,dates[0],dates.at(-1)]],{origin:-1})
 }
 const december=Array.from({length:15},(_,i)=>`2026-12-${String(i+1).padStart(2,'0')}`)
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code employé','Nom','Type',...december],['EMP01','EMPLOYE TEST','N',8,...Array(14).fill(0)],['EMP01','EMPLOYE TEST','S',...Array(15).fill(0)]]),'December')
 XLSX.utils.sheet_add_aoa(wb.Sheets.Periodes,[['December',december[0],december.at(-1)]],{origin:-1})
 wb.Sheets.Pointage.C2={t:'s',v:'0'}
 await page.getByRole('button',{name:'Importer plusieurs quinzaines',exact:true}).click()
 await page.getByLabel('Classeur de plusieurs quinzaines',{exact:true}).setInputFiles({name:'source-32h.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
 await expect(page.getByLabel('Choisir 2026-07-16',{exact:true})).toBeDisabled()
 await expect(page.getByLabel('Choisir 2026-10-16',{exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Corriger les anomalies dans l’application',exact:true}).click()
 await expect(page.getByLabel('Quinzaine à corriger',{exact:true})).toHaveValue('Pointage')
 await page.getByLabel('Pointage · 2 · N/S',{exact:true}).selectOption('N')
 await page.getByRole('button',{name:'Appliquer les corrections',exact:true}).click()
 await expect(page.getByLabel('Choisir 2026-07-16',{exact:true})).toBeDisabled()
 await expect(page.getByLabel('Choisir 2026-10-16',{exact:true})).toBeDisabled()
 await expect(page.getByText('Ignorée — aucune heure renseignée',{exact:true})).toHaveCount(2)
 await expect(page.getByText('Aucune heure exploitable pour les employés de cette ferme.',{exact:true})).toHaveCount(0)
 await page.getByLabel('Je confirme que les cellules vides correspondent à zéro heure.',{exact:true}).check()
 await expect(page.getByText('Import accepté en brouillon. Ces anomalies doivent être contrôlées avant validation et paie.',{exact:true})).toBeVisible()
 await expect(page.getByLabel('Choisir 2026-11-01',{exact:true})).toBeChecked()
 await expect(page.getByRole('button',{name:'Enregistrer puis contrôler les anomalies',exact:true})).toBeVisible()
 await expect(page.getByLabel('Choisir 2026-12-01',{exact:true})).toBeChecked()
 cancelNextDialog=true
 await page.getByRole('button',{name:'Enregistrer puis contrôler les anomalies',exact:true}).click()
 expect(saves).toBe(0)
 await page.getByRole('button',{name:'Enregistrer puis contrôler les anomalies',exact:true}).click()
 await expect(page.getByRole('button',{name:'Contrôler les anomalies',exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Anomalies de pointage à contrôler (1)',exact:true})).toBeVisible()
 await expect(page.locator('#attendance-review-panel')).toBeInViewport()
 expect(saves).toBe(1)
 expect(period.start_date).toBe('2026-11-01')
 expect(records[0].normal_hours).toBe(32);expect(records[0].needs_review).toBe(true)
 const normal=page.getByRole('textbox',{name:'EMP01 · N · 2026-11-01',exact:true})
 await expect(normal).toHaveValue('32')
 const prior=saves
 await page.getByRole('button',{name:'Valider la quinzaine',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'Des anomalies de pointage restent à contrôler'})).toBeVisible()
 expect(saves).toBe(prior)
 const reason=page.getByLabel(`Motif 2026-11-01 ${worker}`,{exact:true})
 const note=page.getByLabel(`Commentaire 2026-11-01 ${worker}`,{exact:true})
 await reason.selectOption('advance')
 await expect(page.getByRole('button',{name:'Confirmer la valeur',exact:true})).toBeDisabled()
 await reason.selectOption('other')
 await expect(page.getByRole('button',{name:'Confirmer la valeur',exact:true})).toBeDisabled()
 await note.fill('Valeur vérifiée dans le fichier source')
 await page.getByRole('button',{name:'Confirmer la valeur',exact:true}).click()
 await expect(page.getByText('Valeur confirmée',{exact:true})).toBeVisible().catch(async error=>{console.log('REVIEW DEBUG',records[0],(await page.locator('body').innerText()).slice(-8000),errors);throw error})
 const beforeCorrection=saves
 const panel=page.locator('#attendance-review-panel')
 await expect(panel.locator('input[inputmode=decimal]')).toHaveCount(0)
 await panel.getByRole('button',{name:'Modifier dans la grille',exact:true}).click()
 await expect(normal).toBeFocused()
 await normal.fill('-1')
 await expect(reason).toBeEnabled()
 await reason.selectOption('entry_error')
 await note.fill('Valeur à corriger')
 await panel.getByRole('button',{name:'Enregistrer et confirmer la valeur',exact:true}).click()
 await expect(panel.getByRole('alert')).toContainText('heures invalides')
 expect(saves).toBe(beforeCorrection)
 await normal.fill('16')
 await expect(reason).toBeEnabled()
 await expect(note).toHaveValue('Valeur à corriger')
 await reason.selectOption('duplicate')
 await note.fill('Doublon corrigé')
 await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click()
 await expect(reason).toHaveValue('duplicate')
 await expect(note).toHaveValue('Doublon corrigé')
 await expect(reason).toBeEnabled()
 await normal.fill('17')
 await expect(reason).toBeEnabled()
 await expect(note).toHaveValue('Doublon corrigé')
 await panel.getByRole('button',{name:'Enregistrer et résoudre l’anomalie',exact:true}).click()
 await expect(page.getByText('Anomalie résolue',{exact:true})).toBeVisible()
 expect(records[0].original_hours.normal_hours).toBe(32)
 expect(records[0].normal_hours).toBe(17)
 expect(records[0].review_note).toBe('Doublon corrigé')
 await page.getByRole('button',{name:'Valider la quinzaine',exact:true}).click()
 await expect(normal).toBeDisabled()
 await panel.getByRole('button',{name:'Rouvrir pour correction',exact:true}).click()
 await expect(normal).toBeEnabled()
 await panel.getByRole('button',{name:'Modifier dans la grille',exact:true}).click()
 await normal.fill('18')
 await expect(reason).toBeEnabled()
 await reason.selectOption('entry_error')
 await note.fill('Correction complémentaire')
 await panel.getByRole('button',{name:'Enregistrer et résoudre l’anomalie',exact:true}).click()
 await expect(page.getByText('Anomalie résolue',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Valider la quinzaine',exact:true}).click()
 await expect(normal).toBeDisabled()
 const savesBeforeReload=saves
 wb.Sheets.Pointage.C2={t:'s',v:'N'}
 await page.getByLabel('Classeur de plusieurs quinzaines',{exact:true}).setInputFiles({name:'source-32h-reloaded.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
 await page.getByRole('button',{name:'Ouvrir le pointage validé',exact:true}).click()
 expect(saves).toBe(savesBeforeReload)
 await expect(normal).toHaveValue('18')
 await expect(normal).toBeDisabled()
 await page.screenshot({path:path.join(os.tmpdir(),'itrix-attendance-review-local.png'),fullPage:false})
 expect(errors).toEqual([])
 console.log('PASS grid-only hour edits after confirmation, reason editable before saving, reason retained after draft save, save-and-resolve uses new revision, negative-value rejection, original-value retention, reopened validated-period grid edit; original 16+16 import as 32, nonblocking draft, payroll validation blocked, required reason/note, advance guard, explicit confirmation, edit invalidation, resolution and original-value retention. All writes mocked.')
} finally {await browser.close()}
