// Recette isolée : toutes les requêtes Supabase sont simulées, aucune donnée réelle modifiée.
import { chromium,expect } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-alerts@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'})
 await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}))
 await context.route('https://fonts.gstatic.com/**',r=>r.abort())
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 let saved=null,config=[]
 const yesterday=new Date(Date.now()-86400000).toISOString()
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  const name=url.pathname.split('/').at(-1)
  if(url.pathname==='/auth/v1/user')data=user
  else if(name==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,is_platform_admin:false,must_change_password:false}]
  else if(name==='domain_memberships')data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Client QA',code:'QA'},roles:{name:'Administrateur'}}]
  else if(name==='roles')data=[{id:role,name:'Administrateur',is_admin:true,is_active:true}]
  else if(name==='stock_items')data=[{id:'s',name:'Produit QA',unit:'l',current_qty:0,min_qty:5,is_active:true}]
  else if(name==='warehouses')data=[{id:'w',name:'Entrepôt QA',farm_id:'f',is_active:true,farms:{name:'Ferme QA'}}]
  else if(name==='warehouse_stocks')data=[{warehouse_id:'w',stock_item_id:'s',current_qty:0,min_qty:1}]
  else if(name==='treatment_requests')data=[{id:'r',planned_at:yesterday,status:'approuvee',target_name:'Cible QA',warehouse_id:'w'}]
  else if(name==='get_treatment_stock_forecast')data=[{request_id:'r',stock_status:'non_disponible',shortages:[{product:'Produit QA',missing:10,unit:'l'}]}]
  else if(name==='cultural_workspace')data={families:[{code:'amendement',alert_days:15}],farms:[{id:'f',name:'Ferme QA'}],programs:[{id:'cp',title:'Amendement QA',family:'amendement',farm_id:'f',warehouse_id:'w',status:'approuvee',occurrences:[{id:'co',planned_at:yesterday}]}],forecast:[{occurrence_id:'co',product:'Engrais QA',missing:2,unit:'kg'}]}
  else if(name==='operational_alert_settings'){
   if(route.request().method()==='POST'){saved=route.request().postDataJSON();config=[saved]}
   data=config
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/alertes',{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('heading',{name:'Produit QA — stock épuisé'}).first().waitFor({timeout:45000})
 await page.getByRole('button',{name:'Paramétrer',exact:true}).click()
 await page.getByLabel('Anticipation du stock des traitements (jours)').fill('20')
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click()
 await page.getByText('Paramètres enregistrés pour ce client.').waitFor()
 if(saved?.domain_id!==domain||saved?.treatment_horizon_days!==20)throw Error('Incorrect settings payload')
 await page.getByRole('combobox',{name:'Type d’alerte'}).selectOption('treatment_late')
 await expect(page.locator('article')).toHaveCount(1)
 await page.getByRole('combobox',{name:'Type d’alerte'}).selectOption('cultural_stock')
 await expect(page.locator('article')).toHaveCount(1)
 await expect(page.locator('article')).toContainText('Engrais QA : 2,00 kg')
 await page.getByRole('combobox',{name:'Type d’alerte'}).selectOption('cultural_late')
 await expect(page.locator('article')).toHaveCount(1)
 await expect(page.locator('article')).toContainText('Amendement QA')
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))throw Error('Horizontal mobile overflow')
 if(errors.length)throw Error(errors.join('\n'))
 fs.mkdirSync('tmp/alerts',{recursive:true});await page.screenshot({path:'tmp/alerts/mobile.png',fullPage:true})
 console.log('Alertes mobile 390px : affichage, filtre, paramètres client et absence d’erreur : OK')
}finally{await browser.close()}
