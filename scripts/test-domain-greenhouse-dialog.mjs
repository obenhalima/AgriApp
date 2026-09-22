// Read-only UI regression: every Supabase request uses fixtures.
import {chromium,expect} from '@playwright/test'
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
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());page.setDefaultTimeout(30000)
 await page.goto('http://localhost:3001/plan-culture',{waitUntil:'domcontentloaded',timeout:120000})

 await page.getByRole('button',{name:/Vue Domaine/}).click()
 await expect(page.getByLabel('Légende du calendrier prévisionnel').first()).toBeVisible()
 await expect(page.getByLabel('Légende du calendrier prévisionnel').first()).toContainText('Récolte prévue')
 await expect(page.getByLabel('Légende du calendrier prévisionnel').first()).toContainText('Aujourd’hui')
 const first=page.getByRole('button',{name:'Ouvrir la fiche serre S01',exact:true})
 await first.click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByRole('heading',{name:'S01 — Serre Nord'})).toBeVisible()
 await expect(dialog.getByText('25,00 %',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Coût total',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Nutrition QA',{exact:true})).toBeVisible()
 await expect(dialog.getByText('01/04/2026',{exact:true})).toBeVisible()
 await page.keyboard.press('Escape')
 await expect(dialog).toHaveCount(0)
 await expect(first).toBeFocused()
 await first.press('Enter')
 await expect(dialog).toBeVisible()
 await dialog.getByRole('button',{name:'Fermer la fiche serre'}).click()
 await page.getByRole('button',{name:'Ouvrir la fiche serre S02',exact:true}).click()
 await expect(dialog.getByText('Aucune plantation sur cette campagne.')).toBeVisible()
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS domain view uses full greenhouse dialog, dates, harvest, costs, interventions, keyboard, empty greenhouse. Mocked backend.')
}finally{await browser.close()}
