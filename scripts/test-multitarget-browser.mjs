// Every Supabase HTTP request is mocked. No real prescription or stock write.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const targets=[{id:'t1',canonical_name:'Botrytis'},{id:'t2',canonical_name:'Acariens'}]
const uses=[{id:'u1',product_id:'p1',target_name:'Botrytis',crop_name:'Tomate',dose_min:50,dose_max:100,dose_unit:'ml_100l',phi_days:3,rei_hours:12,is_active:true},{id:'u2',product_id:'p2',target_name:'Acariens',crop_name:'Tomate',dose_min:2,dose_max:3,dose_unit:'kg_ha',phi_days:7,rei_hours:24,is_active:true}]
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const mobile=process.argv.includes('--mobile')
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 let submitted
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').pop();let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(table==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,is_platform_admin:false,must_change_password:false}]
  else if(table==='domain_memberships')data=[{domain_id:domain,role_id:role,is_active:true,is_default:true,domains:{name:'Société QA',code:'QA'},roles:{name:'Administrateur'}}]
  else if(table==='roles')data=[{id:role,name:'Administrateur',is_admin:true,is_active:true}]
  else if(table==='has_business_capability')data=true
  else if(table==='campaign_plantings')data=[{id:'cp1',planted_area:10000,greenhouses:{id:'gh1',name:'Serre QA',farm_id:'f1',exploitable_area:10000,farms:{id:'f1',name:'Ferme QA'}},varieties:{commercial_name:'Tomate QA'}}]
  else if(table==='warehouses')data=[{id:'w1',farm_id:'f1',is_active:true,is_default:true,name:'Dépôt QA'}]
  else if(table==='phyto_targets')data=targets
  else if(table==='plant_protection_products')data=[{id:'p1',commercial_name:'Produit Botrytis QA',authorization_status:'autorise',is_active:true,safety_data_verified:true},{id:'p2',commercial_name:'Produit Acariens QA',authorization_status:'autorise',is_active:true,safety_data_verified:true}]
  else if(table==='product_authorized_uses')data=uses
  else if(table==='v_active_station_phyto_products')data=uses.map((u,i)=>({product_id:u.product_id,target_id:targets[i].id,target_name:u.target_name,authorized_use_id:u.id}))
  else if(table==='phyto_positive_lists')data=[{id:'list1'}]
  else if(table==='phyto_compliance_settings')data=[{default_spray_volume_l_ha:1000,require_reentry_delay:true}]
  else if(table==='submit_treatment_schedule_multitarget'){submitted=route.request().postDataJSON();data='schedule-QA'}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/agronomie/traitements',{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('button',{name:'Nouvelle prescription',exact:true}).click({timeout:45000})
 const dialog=page.locator('.modal-box'),selects=dialog.locator('select')
 await selects.nth(0).selectOption('f1');await selects.nth(1).selectOption('w1')
 await dialog.getByRole('checkbox',{name:'Sélectionner toutes les serres'}).check()
 await dialog.locator('input[type="datetime-local"]').first().fill('2026-10-01T09:00')
 await dialog.getByRole('combobox',{name:'Cible biologique 1',exact:true}).selectOption('Botrytis')
 const p1=dialog.getByRole('combobox',{name:'Produit 1',exact:true})
 if(await p1.locator('option[value="p2"]').count())throw Error('Wrong target product visible')
 await p1.selectOption('p1')
 await dialog.getByRole('button',{name:'Produit',exact:true}).click()
 await dialog.getByRole('combobox',{name:'Cible biologique 2',exact:true}).selectOption('Acariens')
 await dialog.getByRole('combobox',{name:'Produit 2',exact:true}).selectOption('p2')
 if(await p1.inputValue()!=='p1')throw Error('First product lost')
 if(!await dialog.locator('input').evaluateAll(inputs=>inputs.some(i=>i.value==='500,00')&&inputs.some(i=>i.value==='2,00')))throw Error('Quantities missing')
 await dialog.getByRole('checkbox',{name:'Usage, dose, DAR et délai de rentrée vérifiés sur l’étiquette.'}).nth(1).check()
 await dialog.getByRole('combobox',{name:'Cible biologique 2',exact:true}).selectOption('Botrytis')
 if(await dialog.getByRole('combobox',{name:'Produit 2',exact:true}).inputValue()!==''||await p1.inputValue()!=='p1')throw Error('Target reset affected wrong line')
 if(await dialog.getByRole('checkbox',{name:'Usage, dose, DAR et délai de rentrée vérifiés sur l’étiquette.'}).nth(1).isChecked())throw Error('Old label attestation retained')
 await dialog.getByRole('combobox',{name:'Cible biologique 2',exact:true}).selectOption('Acariens')
 await dialog.getByRole('combobox',{name:'Produit 2',exact:true}).selectOption('p2')
 await dialog.locator('textarea').nth(0).fill('Deux cibles observées — fixture QA')
 await dialog.locator('textarea').nth(1).fill('Justification QA')
 for(const check of await dialog.getByRole('checkbox',{name:'Usage, dose, DAR et délai de rentrée vérifiés sur l’étiquette.'}).all())await check.check()
 fs.mkdirSync('tmp/multitarget',{recursive:true});await page.screenshot({path:`tmp/multitarget/form${mobile?'-mobile':''}.png`,fullPage:true})
 await dialog.getByRole('button',{name:'SOUMETTRE À VALIDATION'}).click()
 await page.getByText('Plan de prescription généré et soumis à validation').waitFor()
 if(!submitted||submitted.p_products[0].biological_target_id!=='t1'||submitted.p_products[1].biological_target_id!=='t2'||submitted.p_products[0].planned_quantity!==500||submitted.p_products[1].planned_quantity!==2||submitted.p_products.some(p=>p.stock_item_id))throw Error('Invalid multicible/no-stock payload')
 if(errors.length)throw Error(errors.join(';'))
 console.log('Browser QA: per-line targets, filtered products, reset isolation, dose/quantity/DAR inheritance and submission without stock OK')
}finally{await browser.close()}
