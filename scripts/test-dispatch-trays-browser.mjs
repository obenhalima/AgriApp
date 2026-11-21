// Browser acceptance only: every Supabase request is mocked, no production data changes.
import {chromium,expect as baseExpect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
const expect=baseExpect.configure({timeout:90000})
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217',role='22222222-2222-4222-8222-222222222222'
const user={id:uid,email:'harvest-qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
const p={id:'p1',campaign_id:'c1',campaigns:{name:'Campagne QA'},greenhouse_id:'s1',greenhouses:{code:'S1',farm_id:'f1',farms:{name:'Ferme QA'}},variety_id:'v1',varieties:{commercial_name:'Tomate QA',avg_price_export:8,avg_price_local:3}}
const harvest=(id,date,qty,planting=p)=>({id,domain_id:domain,lot_number:id.toUpperCase(),harvest_date:date,total_qty:qty,estimated_kg:qty,qty_category_1:qty,qty_category_2:0,qty_category_3:0,campaign_plantings:planting})
const h1=harvest('h1','2026-09-30',25),h2=harvest('h2','2026-10-01',75),h3=harvest('h3','2026-09-28',100),h4=harvest('h4','2026-09-29',10,{...p,varieties:{...p.varieties,avg_price_export:0}})
const invoice={id:'i1',invoice_number:'FAC-QA',invoice_type:'vente',currency:'MAD',total_amount:1000,paid_amount:0,status:'validee'}
const lots=[{id:'l1',domain_id:domain,category:'station_dispatch',lot_number:'ENVOI-OCT',harvest_date:'2026-10-02',harvest_id:'h1',harvests:h1,tri_status:'priced',qty_acceptee_kg:100,ca_amount:1000,markets:{name:'Station QA',type:'export',currency:'MAD',client_id:'cl1',clients:{name:'Station QA'}},campaign_plantings:p,invoices:invoice},
{id:'l2',domain_id:domain,category:'station_dispatch',lot_number:'ENVOI-SANS-PRIX',harvest_date:'2026-10-03',harvest_id:'h3',harvests:h3,tri_status:'tried',estimated_kg:100,qty_acceptee_kg:90,ca_amount:null,markets:{type:'export',currency:'MAD'},campaign_plantings:p}]
const sources=[h1,h2].map((h,i)=>({id:`source-${i}`,harvest_lot_id:'l1',harvest_id:h.id,qty_contributed_kg:h.total_qty,harvests:h,harvest_lots:{domain_id:domain}}))
const cats=[{id:'prod',code:'PRODUITS',label:'Produits',type:'produit',is_active:true,parent_id:null,level:1,display_order:1},{id:'exp',code:'CA_EXPORT',label:'CA export QA',type:'produit',is_active:true,parent_id:'prod',level:2,display_order:2},{id:'local',code:'CA_LOCAL',label:'CA local QA',type:'produit',is_active:true,parent_id:'prod',level:2,display_order:3}]
const writes=[],errors=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1500,height:1100},acceptDownloads:true})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),name=url.pathname.split('/').pop();let data=[]
  if(!['GET','HEAD','OPTIONS'].includes(request.method())&&!(name==='profiles'&&request.method()==='PATCH'&&Object.keys(request.postDataJSON()||{}).join(',')==='last_login_at'))writes.push(name)
  if(name==='user')data=user
  else if(name==='profiles')data={...user,full_name:'Recette',role_id:role,is_active:true,is_platform_admin:true,must_change_password:false}
  else if(name==='domain_memberships')data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'DOMBEN501 QA',code:'DOMBEN501',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(name==='roles')data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(name==='campaigns')data=[{id:'c1',domain_id:domain,name:'Campagne QA',code:'CQA',farm_id:'f1',preparation_start:'2026-07-01',planting_start:'2026-08-01',campaign_end:'2027-06-30'}]
  else if(name==='farms')data=[{id:'f1',name:'Ferme QA',code:'501'}]
  else if(name==='greenhouses')data=[{id:'s1',code:'S1',name:'S1',farm_id:'f1'}]
  else if(name==='budget_versions')data=[{id:'b1',campaign_id:'c1',name:'Budget QA',status:'valide',is_active:true}]
  else if(name==='account_categories')data=cats
  else if(name==='harvest_tray_lines')data=[{id:'t1',harvest_id:'h1',poids_unitaire_kg:10,tray_type_code:'10',tray_type_label:'Plateau 10 kg',nb_trays:2,harvests:{domain_id:domain}},{id:'t2',harvest_id:'h2',poids_unitaire_kg:25,tray_type_code:'25',tray_type_label:'Caisse 25 kg',nb_trays:3,harvests:{domain_id:domain}},{id:'t4',harvest_id:'h4',poids_unitaire_kg:10,tray_type_code:'10',tray_type_label:'Plateau 10 kg',nb_trays:1,harvests:{domain_id:domain}},{id:'t3',harvest_id:'h3',poids_unitaire_kg:10,tray_type_code:'10',tray_type_label:'Plateau 10 kg',nb_trays:10,harvests:{domain_id:domain}}]
  else if(name==='harvests')data=[h1,h2,h3,h4]
  else if(name==='harvest_lots')data=lots
  else if(name==='harvest_lot_sources')data=sources
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/recoltes',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:/À tarifer/}).click()
 const pendingRow=page.getByRole('row').filter({hasText:'ENVOI-SANS-PRIX'});await expect(pendingRow).toContainText('Plateau 10 kg')
 await page.getByLabel('Filtrer les envois par type de plateau',{exact:true}).selectOption('25');await expect(pendingRow).toHaveCount(0)
 await page.getByLabel('Filtrer les envois par type de plateau',{exact:true}).selectOption('10');await expect(pendingRow).toHaveCount(1)
 await page.getByRole('button',{name:/À envoyer/}).click()
 await page.getByRole('button',{name:'📦 COMPOSER UN ENVOI',exact:true}).click()
 const composition=page.getByRole('dialog');await expect(composition.getByRole('columnheader',{name:/Types de plateau/})).toBeVisible()
 await composition.getByLabel('Filtrer les récoltes disponibles par type de plateau',{exact:true}).selectOption('10');await expect(composition.getByRole('row').filter({hasText:'H4'})).toContainText('Plateau 10 kg')
 page.once('dialog',dialog=>dialog.accept())
 await composition.getByRole('button',{name:/Fermer/}).click();await expect(composition).not.toBeVisible()
 await page.getByRole('button',{name:'Envois tarifés · Récapitulatif',exact:true}).click()
 const report=page.getByRole('region',{name:'Récapitulatif des envois tarifés'})
 await expect(report.getByRole('row').filter({hasText:'ENVOI-OCT'})).toHaveCount(2)
 await expect(report.getByRole('row').filter({hasText:'ENVOI-OCT'}).first()).toContainText('Plateau 10 kg')
 await expect(report.getByRole('row').filter({hasText:'ENVOI-OCT'}).first()).toContainText('Caisse 25 kg')
 await report.getByLabel('Types de plateau',{exact:true}).selectOption('25');await expect(report.getByRole('row').filter({hasText:'ENVOI-OCT'})).toHaveCount(2)
 const from=report.getByLabel('Du',{exact:true}),to=report.getByLabel('Au',{exact:true})
 await from.fill('2026-09-01');await to.fill('2026-09-30')
 const sep=report.getByRole('row').filter({hasText:'ENVOI-OCT'})
 await expect(sep).toHaveCount(1);await expect(sep).toContainText('2026-09-30');await expect(sep).toContainText('2026-10-02');await expect(sep).toContainText('250')
 const excelEvent=page.waitForEvent('download');await report.getByRole('button',{name:'Exporter Excel',exact:true}).click();const excel=await excelEvent;await excel.saveAs('tmp/harvest-revenue/envois-septembre.xlsx')
 const wb2=new ExcelJS.Workbook();await wb2.xlsx.readFile('tmp/harvest-revenue/envois-septembre.xlsx')
 expect(wb2.worksheets[0].getRow(2).values).toContain('2026-09-30');expect(wb2.worksheets[0].getRow(2).values).toContain(250)
 expect(wb2.worksheets[1].rowCount).toBe(3) // one full invoice, not multiplied per source.
 await page.screenshot({path:'tmp/harvest-revenue/dated-report.png',fullPage:true})
 if(writes.length||errors.length)throw Error(JSON.stringify({writes,errors}))
 console.log('PASS: actual vs forecast, missing price, per-harvest date split, price/quantity detail, exports and invoice deduplication; zero backend writes.')
}catch(error){const page=browser.contexts()[0]?.pages()[0];if(page){fs.mkdirSync('tmp/harvest-revenue',{recursive:true});await page.screenshot({path:'tmp/harvest-revenue/tray-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-6000))}throw error}finally{await browser.close()}
