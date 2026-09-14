// UI acceptance test: all backend calls are mocked, no real writes.
import {chromium} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-performance@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const report={basis:'surface',pending_movements:[],revenue_available:true,
plantings:[{id:'p1',campaign_id:'c1',greenhouse_id:'s1',variety_id:'v1',farm_id:'f1',farm_name:'Ferme A',greenhouse_name:'S1',area:100,target_kg:1000},{id:'p2',campaign_id:'c1',greenhouse_id:'s2',variety_id:'v2',farm_id:'f2',farm_name:'Ferme B',greenhouse_name:'S2',area:300,target_kg:2000}],
metadata:[{id:'p1',variety_name:'Variété A',status:'termine',start:'2026-01-01',end:'2026-08-01',price_export:10,price_local:5,export_share:70},{id:'p2',variety_name:'Variété B',status:'en_cours',start:'2026-01-01',end:null,price_export:10,price_local:5,export_share:70}],
costs:[{id:'c',campaign_id:'c1',greenhouse_id:null,variety_id:null,amount:1000,planned:false,category:'charges'}],
harvests:[{planting_id:'p1',gross_kg:1000,sorted_kg:1000},{planting_id:'p2',gross_kg:2000,sorted_kg:2000}],
harvest_details:[{id:'h0',planting_id:'p1',date:'2026-05-01',kg:100,cat1:100,local_kg:0},{id:'h01',planting_id:'p1',date:'2026-06-01',kg:300,cat1:300,local_kg:0},{id:'h1',planting_id:'p1',date:'2026-07-01',kg:600,cat1:600,local_kg:0},{id:'h2',planting_id:'p2',date:'2026-07-01',kg:2000,cat1:2000,local_kg:0}],
station_lots:[{id:'l1',planting_id:'p1',date:'2026-07-01',amount:9000,priced_kg:1000,accepted_kg:1000}]}
let pending=false,calls=0
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1500,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/campaigns'))data=[{id:'c1',name:'Campagne QA'}]
  else if(url.pathname.endsWith('/get_farm_performance_data')){calls++;const body=route.request().postDataJSON();if(body.p_domain!==domain)throw Error('Wrong domain');data={...report,pending_movements:pending?[{id:'m'}]:[]}}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/couts/performance',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('row').filter({hasText:'Variété A'}).waitFor()
 await page.getByLabel('Ferme',{exact:true}).selectOption('f1')
 const row=page.getByRole('row').filter({hasText:'Variété A'})
 if(!(await row.innerText()).includes('250,00'))throw Error('Filter reallocated shared costs')
 await page.getByRole('region',{name:'Progression des récoltes'}).getByText('Données de la courbe').click()
 if(!(await page.getByRole('region',{name:'Progression des récoltes'}).innerText()).includes('1\u202f000,00'))throw Error('Chart did not follow farm filter')
 await page.getByLabel('Granularité des courbes').selectOption('week')
 await page.getByRole('button',{name:'Cumulé',exact:true}).click()
 await page.getByRole('button',{name:'Par période',exact:true}).waitFor()
 await row.getByRole('button',{name:'Voir le détail'}).click()
 await page.getByRole('region',{name:'Détail de performance'}).waitFor()
 await page.getByLabel('Ferme',{exact:true}).selectOption('')
 await page.getByLabel('Comparer',{exact:true}).selectOption('greenhouse')
 await page.getByRole('row').filter({hasText:'Ferme A — S1'}).waitFor()
 await page.getByLabel('Comparer',{exact:true}).selectOption('farm')
 await page.getByLabel('Trier par',{exact:true}).selectOption('costKg')
 pending=true;await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await page.getByText('Aucun classement fiable pour ce critère.',{exact:false}).waitFor()
 if(calls<2||errors.length)throw Error(errors.join('\n')||'Refresh not requested')
 pending=false;await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await page.getByText('Meilleur résultat observé — provisoire :',{exact:false}).waitFor()
 await page.getByLabel('Trier par',{exact:true}).selectOption('yield')
 fs.mkdirSync('tmp/performance',{recursive:true});await page.screenshot({path:'tmp/performance/desktop.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 await page.getByLabel('Comparer',{exact:true}).selectOption('variety')
 await page.evaluate(()=>window.scrollTo(0,0))
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw Error('Mobile horizontal overflow')
 await page.screenshot({path:'tmp/performance/mobile.png',fullPage:true})
 console.log('PASS: domain scope, three comparison levels, allocation before filtering, detail, missing-cost ranking protection, desktop/mobile; no real writes.')
}finally{await browser.close()}
