// Every Supabase request is mocked. The real workbook is read without modification.
import {chromium,expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import * as XLSX from 'xlsx'
const expect=baseExpect.configure({timeout:60000})
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79',uid='11111111-1111-4111-8111-111111111111',role='22222222-2222-4222-8222-222222222222',farm='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'employee-import@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.')
let workers=[],patches=0,imports=0
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1500,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1)
  let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(table==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(table==='domain_memberships')data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'BENHALIMA',code:'DOM-BENHALIMA',is_active:true},roles:{name:'Admin'}}]
  else if(table==='roles')data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(table==='farms')data=[{id:farm,domain_id:domain,code:'FS',name:'Ferme QA',is_active:true}]
  else if(table==='workers'){
   if(request.method()==='PATCH'){
    patches++;const payload=request.postDataJSON();const id=url.searchParams.get('id')?.slice(3)
    workers=workers.map(worker=>worker.id===id?{...worker,...payload}:worker)
   }
   data=workers
  } else if(table==='import_employee_recovery'){
   const body=request.postDataJSON()
   expect(body.p_domain).toBe(domain);expect(body.p_farm).toBe(farm)
   expect(body.p_rows).toHaveLength(body.p_filename==='filled_model.xlsx'?1:55)
   if(body.p_filename==='filled_model.xlsx')expect(body.p_rows[0].profile).toMatchObject({first_name:'Jean',last_name:'Exemple',cin:'AB001'})
   const exists=workers.length>0
   data={created:exists?0:body.p_rows.length,skipped:exists?body.p_rows.length:0,conflicts:0,applied:body.p_apply,rows:body.p_rows.map(row=>({...row,status:exists?'skip':'create'}))}
   if(body.p_apply&&!exists){
    imports++
    workers=body.p_rows.map((row,index)=>({id:`worker-${index}`,farm_id:farm,farms:{id:farm,domain_id:domain},first_name:'',last_name:row.source_name,
     matricule:`EMP-${index}`,normal_hourly_rate:row.normal_hourly_rate,overtime_hourly_rate:row.overtime_hourly_rate,
     daily_rate:row.daily_rate,seniority_rate:row.seniority_rate,is_active:row.is_active,base_salary:null,
     employee_import:{filename:body.p_filename,imported_at:new Date().toISOString(),source_record:row}}))
   }
  }
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://localhost:3001/rh/employes',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Importer les employés',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Importer les employés',exact:true})
 await dialog.getByLabel('Ferme destinataire').selectOption(farm)
 const downloadEvent=page.waitForEvent('download')
 await dialog.getByRole('button',{name:'Exporter le modèle employés',exact:true}).click()
 const download=await downloadEvent
 const template=XLSX.read(fs.readFileSync(await download.path()),{type:'buffer'})
 expect(template.Sheets['_Contexte'].B3.v).toBe(domain)
 expect(template.Sheets['_Contexte'].B4.v).toBe(farm)
 const templateSheet=template.Sheets['Employes_Import']
 for(const [cell,value] of Object.entries({B2:'Exemple',C2:'Jean',D2:12.5,F2:15,H2:'Actif',J2:'AB001'}))templateSheet[cell]={t:typeof value==='number'?'n':'s',v:value}
 await dialog.getByLabel('Classeur des employés').setInputFiles({name:'filled_model.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(template,{type:'buffer',bookType:'xlsx'})})
 await expect(dialog).toContainText('1 employés lus')
 await dialog.getByRole('button',{name:'Contrôler le fichier',exact:true}).click()
 await expect(dialog).toContainText('1 employés à créer')
 template.Sheets['_Contexte'].B3.v='foreign-client'
 await dialog.getByLabel('Classeur des employés').setInputFiles({name:'wrong_client.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(template,{type:'buffer',bookType:'xlsx'})})
 await expect(dialog.getByRole('alert')).toContainText('autre client')
 await dialog.getByLabel('Classeur des employés').setInputFiles('C:/Users/Othman BENHALIMA/Downloads/Paie_Quinzaines_2026-27_consolide.xlsx')
 await expect(dialog).toContainText('55 employés lus')
 await dialog.getByRole('button',{name:'Contrôler le fichier',exact:true}).click()
 await expect(dialog).toContainText('55 employés à créer')
 await dialog.getByRole('button',{name:'Valider l’import des employés',exact:true}).click()
 await expect(dialog).toContainText('55 employés créés')
 await dialog.getByRole('button',{name:'Fermer',exact:true}).click()
 expect(imports).toBe(1)
 await page.getByRole('button',{name:/^Employés à compléter/}).click()
 await expect(page.getByRole('row')).toHaveCount(56)
 const first=page.getByRole('row').filter({hasText:'EMP-0'}).first()
 await first.getByText('À compléter',{exact:false}).click()
 await expect(first).toContainText('CIN')
 await first.getByRole('button',{name:'Éditer',exact:true}).click()
 const edit=page.getByRole('dialog').filter({hasText:'Source de la reprise'})
 await expect(edit.getByLabel('Nom complet source',{exact:true})).toHaveCount(0)
 await expect(edit.getByLabel('Nom sur émargement',{exact:true})).toHaveCount(0)
 await expect(edit.getByLabel('Prénom',{exact:true})).toHaveValue('')
 await edit.getByLabel('Nom',{exact:true}).fill('')
 await edit.getByRole('button',{name:'ENREGISTRER',exact:true}).click()
 await expect(edit.getByRole('alert')).toContainText('Le nom est requis')
 expect(patches).toBe(0)
 await edit.getByLabel('Nom',{exact:true}).fill(workers[0].employee_import.source_record.source_name)
 await expect(edit.getByRole('combobox',{name:'Employé déclaré',exact:true})).toHaveValue('true')
 await edit.getByRole('combobox',{name:'Employé déclaré',exact:true}).selectOption('true')
 await edit.getByRole('button',{name:'ENREGISTRER',exact:true}).click()
 await expect(edit).toHaveCount(0)
 expect(patches).toBe(1)
 expect(workers[0].is_declared).toBe(true)
 expect(workers[0].first_name).toBe('')
 expect(workers[0].base_salary).toBeNull()
 expect(workers[0].employee_import.source_record.source_name).toBe(workers[0].last_name)
 expect(errors).toEqual([])
 console.log('PASS local employee model export/refill/import, wrong-client rejection, 55 consolidated rows, completion tab, edit controls and provenance. All database writes mocked.')
} finally {await browser.close()}
