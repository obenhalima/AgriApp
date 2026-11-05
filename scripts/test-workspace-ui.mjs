// Read-only UI regression: every Supabase request uses fixtures.
import {chromium,expect as baseExpect} from '@playwright/test'
const expect=baseExpect.configure({timeout:30000})
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333',farm='44444444-4444-4444-8444-444444444444'
const user={id:uid,email:'qa-plan@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const greenhouses=[{id:'g1',code:'S01',name:'Serre Nord',farm_id:farm,total_area:1000,type:'Tunnel'},{id:'g2',code:'S02',name:'Serre Sud',farm_id:farm,total_area:2000,type:'Tunnel'}]
const planting={id:'p1',greenhouse_id:'g1',variety_id:'v1',planted_area:1000,planting_date:'2026-01-01',harvest_start_date:'2026-04-01',harvest_end_date:'2026-11-01',plant_count:2500,actual_density:2.5,status:'en_cours',target_total_production:10000,target_yield_per_m2:10}
const browser=await chromium.launch({channel:'msedge',headless:true})
let historicalConfirmed=false
let unavailableFinance=false
let adminAccess=true
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;let data=[]
  if(unavailableFinance&&path.endsWith('/get_farm_performance_data')){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Accès non autorisé'})});return}
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:adminAccess?'Admin':'Lecteur dashboard',is_admin:adminAccess,is_active:true}]
  else if(path.endsWith('/role_permissions'))data=[{granted:true,permissions:{code:'dashboard.view'}}]
  else if(path.endsWith('/farms'))data=[{id:farm,code:'QA',name:'Ferme QA'}]
  else if(path.endsWith('/campaigns'))data=[{id:'c1',name:'Campagne QA',code:'QA',farm_id:farm,status:'en_cours',preparation_start:'2026-01-01',campaign_end:'2026-12-31'}]
  else if(path.endsWith('/greenhouses'))data=greenhouses
  else if(path.endsWith('/varieties'))data=[{id:'v1',code:'V1',commercial_name:'Tomate QA'}]
  else if(path.endsWith('/campaign_plantings'))data=new URL(route.request().url()).searchParams.get('greenhouse_id')==='eq.g2'?[]:[planting]
  else if(path.endsWith('/v_planting_forecasts'))data=[{...planting,planting_id:'p1',campaign_id:'c1',farm_id:farm,greenhouse_code:'S01',greenhouse_name:'Serre Nord',variety_name:'Tomate QA',total_volume_kg:10000,export_share_pct:80,effective_price_export:5,effective_price_local:2,ca_export_total:40000,ca_local_total:4000}]
  else if(path.endsWith('/harvests'))data=new URL(route.request().url()).searchParams.get('campaign_plantings.greenhouse_id')==='eq.g2'?[]:[{id:'h1',campaign_planting_id:'p1',total_qty:2500,harvest_date:'2026-09-10'}]
  else if(path.endsWith('/treatment_requests'))data=[{id:'tr1',planned_at:'2026-01-10T12:00:00Z',status:'approuvee',target_name:'Acariens QA',treatment_request_products:[{product_name:'Produit phyto QA'}],treatment_applications:{application_status:'partielle',actual_started_at:'2026-01-11T12:00:00Z'}}]
  else if(path.endsWith('/cultural_workspace'))data={families:[{code:'fertigation',name:'Fertigation'}],programs:[{id:'cultural1',farm_id:farm,campaign_id:'c1',family:'fertigation',title:'Nutrition QA',targets:[{greenhouse_id:'g1',planting_id:'p1'}],status:'approuvee',products:[{name:'Engrais QA'}],occurrences:[{id:'o1',planned_at:'2026-01-10T12:00:00Z'}]},{id:'outside',farm_id:farm,campaign_id:'other',title:'HORS CAMPAGNE',targets:[{greenhouse_id:'g1',planting_id:'p1'}],occurrences:[{id:'o2',planned_at:'2026-01-10T12:00:00Z'}]}]}
  else if(path.endsWith('/irrigation_workspace'))data={programs:[{id:'irr1',farm_id:farm,campaign_id:'c1',title:'Arrosage QA',greenhouse_ids:['g1'],status:'approuvee',occurrences:[{id:'i1',planned_at:'2026-01-10T12:00:00Z',confirmed_at:'2026-01-10T12:00:00Z',performed_at:'2026-01-10T12:00:00Z'}]}]}
  else if(path.endsWith('/farm_schematic_plans'))data={revision:1,elements:[],shapes:greenhouses.map((g,i)=>({greenhouse_id:g.id,x:200+i*250,y:200,width:150,height:100,rotation:0}))}
  else if(path.endsWith('/get_production_cost_data'))data={basis:'surface',plantings:[{id:'p1',campaign_id:'c1',greenhouse_id:'g1',variety_id:'v1',farm_id:farm,farm_name:'Ferme QA',greenhouse_name:'S01',area:1000,target_kg:10000}],costs:[],harvests:[{planting_id:'p1',gross_kg:2500,sorted_kg:2400}],pending_movements:[],inventory:[{warehouse_id:'w1',stock_item_id:'s1',warehouse_name:'Entrepôt QA',item_name:'Article valorisé QA',qty:100,unit:'kg',value:1200,verified:true},{warehouse_id:'w1',stock_item_id:'s2',warehouse_name:'Entrepôt QA',item_name:'Article sans prix QA',qty:20,unit:'kg',value:null,verified:false}],transit:0}
  if(path.endsWith('/get_production_cost_data'))data.costs=[{id:'cost-provisional-qa',campaign_id:'c1',greenhouse_id:'g1',variety_id:'v1',amount:120,planned:false,quality:historicalConfirmed?'verified':'provisional',category:'phyto',source:'movement-qa'}]
  if(path.endsWith('/historical_cost_context'))data={product:'Engrais QA',reference:'OUT-QA',date:'2026-09-10',quantity:10,unit:'kg',unit_cost:12,needs_area:true,version:'qa-version',lines:[{id:'cost-provisional-qa',greenhouse:'S01',variety:'Tomate QA',amount:120,surface:1000}]}
  if(path.endsWith('/confirm_historical_consumption_cost')){
   const body=route.request().postDataJSON()
   if(body.p_unit_cost!==12.5||body.p_surfaces['cost-provisional-qa']!==1000||body.p_reason!=='Facture QA confirmée'||!body.p_id)throw Error('Invalid historical confirmation payload')
   historicalConfirmed=true;data=null
  }
  if(path.endsWith('/get_farm_performance_data'))data={basis:'surface',plantings:[{id:'p1',campaign_id:'c1',greenhouse_id:'g1',variety_id:'v1',farm_id:farm,farm_name:'Ferme QA',greenhouse_name:'S01',area:1000,target_kg:10000}],costs:[{id:'cost-qa',campaign_id:'c1',greenhouse_id:'g1',variety_id:'v1',amount:120,planned:false,quality:'verified',category:'phyto'}],harvests:[{planting_id:'p1',gross_kg:2500,sorted_kg:2400}],pending_movements:[],inventory:[],transit:0,metadata:[{id:'p1',variety_name:'Tomate QA',status:'en_cours',start:'2026-01-01',end:'2026-11-01'}],harvest_details:[{id:'h1',planting_id:'p1',date:'2026-09-10',kg:2500,cat1:2400,local_kg:100}],station_lots:[],revenue_available:false}
  if(process.env.UI_LOT==='harvest-lock') {
   if(path.endsWith('/harvests'))data=['unsent','partial','old'].map(id=>({id,lot_number:'LOCK-'+id,harvest_date:'2026-09-01',total_qty:1000,campaign_planting_id:'p1',campaign_plantings:{campaign_id:'c1',greenhouses:{code:'S01',farm_id:farm},varieties:{code:'QA'}}}))
   if(path.endsWith('/harvest_lot_sources'))data=[{harvest_id:'partial',harvest_lot_id:'lot-qa',qty_contributed_kg:100}]
   if(path.endsWith('/harvest_lots'))data=new URL(route.request().url()).searchParams.get('select')==='harvest_id'?[{harvest_id:'old'}]:[]
  }
  if(process.env.UI_LOT==='priced-report') {
   // Reproduce PostgREST ambiguity: clients must be joined via markets.client_id.
   const selection=new URL(route.request().url()).searchParams.get('select')||''
   if(path.endsWith('/harvest_lots')&&selection.includes('ca_amount')&&!selection.includes('clients!client_id(name,type)')) {
    await route.fulfill({status:300,contentType:'application/json',body:JSON.stringify({code:'PGRST201',message:"Could not embed because more than one relationship was found for 'markets' and 'clients'"})});return
   }
   if(path.endsWith('/harvest_lots')&&new URL(route.request().url()).searchParams.get('select')?.includes('ca_amount')) data=[
    {id:'priced-local',lot_number:'LOCAL-QA',harvest_date:'2025-01-01',tri_status:'priced',qty_acceptee_kg:100,ca_amount:500,markets:{name:'Local QA',type:'local',currency:'MAD',client_id:'client1',clients:{name:'Client QA'}}},
    {id:'priced-station',lot_number:'STATION-QA',harvest_date:'2025-01-02',tri_status:'tried',qty_acceptee_kg:100,ca_amount:1000,markets:{name:'Export QA',type:'export',currency:'EUR',client_id:'client2',clients:{name:'Station QA'}}}
   ]
   const linkedInvoice={id:'linked-invoice-qa',invoice_number:'FB-LINK-QA',invoice_type:'vente',currency:'MAD',total_amount:500,paid_amount:200,status:'partiellement_paye'}
   if(path.endsWith('/harvest_lots')&&selection.includes('ca_amount'))data[0].invoices=linkedInvoice
   if(path.endsWith('/station_settlement_allocations'))data=[{id:'allocation',harvest_lot_id:'priced-station',qty_allocated_kg:40,amount_allocated:80,price_per_kg:2,station_settlement_lines:{station_settlements:{code:'B-QA',status:'valide',invoices:linkedInvoice}}}]
  }
  if(process.env.UI_LOT==='phyto'&&path.endsWith('/treatment_requests'))data=[]
  if(path.endsWith('/invoices'))data=[{id:'invoice-qa',invoice_number:'FC-QA',client_id:'client-qa',invoice_date:'2026-09-01',due_date:'2026-10-15',total_amount:12000,paid_amount:2000,status:'partiellement_paye',clients:{name:'Client QA'}}]
  if(path.endsWith('/supplier_invoices'))data=[{id:'supplier-invoice-qa',invoice_number:'FF-QA',supplier_id:'supplier-qa',invoice_date:'2026-09-01',due_date:'2026-10-15',total_amount:5000,paid_amount:1000,status:'partiellement_paye',suppliers:{name:'Fournisseur QA'}}]
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());page.setDefaultTimeout(30000)

 for (const [path,title,action] of [
  ['/couts/reel','Coûts réels','+ SAISIR UN COÛT'],
  ['/admin/budgets','Budgets','+ NOUVELLE'],
  ['/recoltes','Récoltes','+ SAISIR RÉCOLTE'],
  ['/clients','Clients','Nouveau client'],
  ['/fournisseurs','Fournisseurs','Nouveau fournisseur'],
  ['/commandes','Commandes','Nouvelle commande'],
  ['/marches','Marchés','Nouveau marché'],
  ['/factures','Factures','Facture client'],
  ['/production','Suivi production','Nouvelle plantation'],
  ['/pointage','Pointage','Pointer'],
  ['/agronomie/traitements','Traitements phytosanitaires','Nouvelle prescription'],
  ['/agronomie/produits','Produits phytosanitaires','Nouveau produit'],
  ['/agronomie/cibles','Cibles biologiques','Nouvelle cible'],
 ]) {
  if(process.env.UI_LOT==='production'&&!['/production','/pointage','/recoltes'].includes(path))continue
  if(process.env.UI_LOT==='phyto'&&!path.startsWith('/agronomie/'))continue
  if(process.env.UI_LOT==='harvest-lock'&&path!=='/recoltes')continue
  if(process.env.UI_LOT==='priced-report'&&path!=='/recoltes')continue
  await page.setViewportSize({width:1400,height:1000})
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+path,{waitUntil:'domcontentloaded',timeout:120000})
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible()
  if(process.env.UI_LOT==='priced-report') {
   await page.getByRole('button',{name:'Envois tarifés · Récapitulatif'}).click()
   const report=page.getByRole('region',{name:'Récapitulatif des envois tarifés'})
   await expect(report).toContainText('2 envoi(s) · 140 kg tarifés')
   await expect(report).toContainText('Tarifé partiellement')
   const invoiceRow=report.locator('tr').filter({hasText:'FB-LINK-QA'})
   await expect(invoiceRow).toHaveCount(1)
   await expect(invoiceRow).toContainText('500')
   await expect(invoiceRow).toContainText('200')
   await expect(invoiceRow).toContainText('300')
   await report.getByLabel('Destination',{exact:true}).selectOption('Local')
   await expect(report).toContainText('1 envoi(s) · 100 kg tarifés')
   await expect(report).not.toContainText('STATION-QA')
   await report.getByRole('button',{name:'Réinitialiser'}).click()
   await report.locator('tr').filter({hasText:'STATION-QA'}).getByRole('button').click()
   await expect(report).toContainText('B-QA · 40 kg × 2 = 80 EUR')
   const download=page.waitForEvent('download')
   await report.getByRole('button',{name:'Exporter Excel'}).click()
   await (await download).saveAs('outputs/priced-dispatch-qa.xlsx')
   await page.setViewportSize({width:390,height:844})
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
   await page.screenshot({path:'outputs/priced-report-mobile.png',fullPage:true})
   continue
  }
  if(process.env.UI_LOT==='harvest-lock') {
   for(const id of ['partial','old']) {
    const row=page.locator('tr').filter({hasText:'LOCK-'+id})
    await expect(row.getByRole('button',{name:'Éditer',exact:true})).toBeDisabled()
    await expect(row.getByRole('button',{name:'Supprimer',exact:true})).toBeDisabled()
    await expect(row.getByRole('checkbox')).toBeDisabled()
   }
   await page.getByTitle('Tout sélectionner',{exact:true}).check()
   await expect(page.locator('tr').filter({hasText:'LOCK-unsent'}).getByRole('checkbox')).toBeChecked()
   for(const id of ['partial','old'])await expect(page.locator('tr').filter({hasText:'LOCK-'+id}).getByRole('checkbox')).not.toBeChecked()
   await page.getByTitle('Tout sélectionner',{exact:true}).uncheck()
   const edit=page.locator('tr').filter({hasText:'LOCK-unsent'}).getByRole('button',{name:'Éditer',exact:true})
   await expect(edit).toBeEnabled()
   await edit.click()
   await expect(page.getByRole('dialog')).toBeVisible()
   await page.getByRole('button',{name:'Fermer la fenêtre'}).click()
  }
  if(path==='/factures') {
   await expect(page.getByRole('button',{name:'Encaisser',exact:true}).first()).toBeVisible()
   await page.waitForTimeout(800)
   await page.screenshot({path:'outputs/commercial-factures-desktop.png',fullPage:true})
  }
  await page.locator('main').getByRole('button',{name:action,exact:true}).first().click()
  const dialog=page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await page.setViewportSize({width:390,height:844})
  await page.waitForTimeout(800)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
  await expect(dialog.getByRole('button',{name:'Fermer la fenêtre'})).toBeVisible()
  await page.screenshot({path:'outputs/workspace-'+path.replaceAll('/','-')+'-mobile.png',fullPage:true})
  await dialog.getByRole('button',{name:'Fermer la fenêtre'}).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
  await page.screenshot({path:'outputs/workspace-'+path.replaceAll('/','-')+'-page-mobile.png',fullPage:true})
  if(path==='/factures') {
   for(const [tab,action,title] of [['Crédit clients','Encaisser','Encaisser une facture client'],['Débit fournisseurs','Régler','Régler une facture fournisseur']]) {
    await page.getByRole('button',{name:tab,exact:true}).click()
    await page.getByRole('button',{name:action,exact:true}).first().click()
    const payment=page.getByRole('dialog')
    await expect(payment).toBeVisible()
    await expect(payment).toContainText(title)
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
    await page.screenshot({path:'outputs/commercial-'+action+'-mobile.png'})
    await payment.getByRole('button',{name:'Fermer la fenêtre'}).click()
   }
  }
 }
 if(process.env.UI_LOT==='production') {
  for(const [path,title] of [['/productivite','Productivité'],['/pointage/recolte','Récolte · Productivité par personne']]) {
   await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+path,{waitUntil:'domcontentloaded',timeout:120000})
   await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible()
   await page.waitForTimeout(800)
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
   await page.screenshot({path:'outputs/workspace-'+path.replaceAll('/','-')+'-page-mobile.png',fullPage:true})
  }
 }
 if(process.env.UI_LOT==='phyto') {
  for(const [path,title] of [['/agronomie/produits/listes','Contrôle des listes positives'],['/agronomie/produits/import','Importer une liste positive'],['/agronomie/produits/conformite','Conformité marchés et LMR'],['/validations','Mes validations']]) {
   await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+path,{waitUntil:'domcontentloaded',timeout:120000})
   await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible()
   await page.waitForTimeout(800)
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
   await page.screenshot({path:'outputs/workspace-'+path.replaceAll('/','-')+'-page-mobile.png',fullPage:true})
  }
 }
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS finance/production/commercial headers, modal opening/closing, mobile overflow. Mocked backend.')
}finally{await browser.close()}

