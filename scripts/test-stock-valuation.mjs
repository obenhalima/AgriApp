// Browser acceptance tests with a mocked backend; never changes real stock.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-stock@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const inventory=[{warehouse_id:'44444444-4444-4444-8444-444444444444',stock_item_id:'55555555-5555-4555-8555-555555555555',warehouse_name:'Entrepôt QA',item_name:'Produit sans prix',qty:2.26,unit:'L',value:null,verified:false},
 {warehouse_id:'44444444-4444-4444-8444-444444444444',stock_item_id:'66666666-6666-4666-8666-666666666666',warehouse_name:'Entrepôt QA',item_name:'Produit prix à confirmer',qty:10,unit:'kg',value:150,verified:false}]
let calls=0,rejectNext=true
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/get_production_cost_data'))data={basis:'surface',plantings:[],costs:[],harvests:[],pending_movements:[],inventory,transit:0}
  else if(url.pathname.endsWith('/confirm_inventory_value')){
   calls++;const body=route.request().postDataJSON(),item=inventory.find(i=>i.stock_item_id===body.p_item)
   if(!item||body.p_warehouse!==item.warehouse_id||body.p_expected_qty!==item.qty||body.p_reason.length<5)throw Error('Wrong confirmation scope')
   if(rejectNext){rejectNext=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Le stock a changé : actualisez avant de valoriser'})});return}
   item.value=item.qty*body.p_unit_cost;item.verified=true;data=null
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/couts/pilotage',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByText('Stock actuel au bilan de gestion — hors filtre campagne/période',{exact:true}).click()
 await page.getByRole('row').filter({hasText:'Produit sans prix'}).getByRole('button',{name:'Valoriser',exact:true}).click()
 const modal=page.getByRole('dialog',{name:'Valoriser / confirmer le stock'})
 await modal.waitFor()
 const confirm=modal.getByRole('button',{name:'Confirmer la valorisation',exact:true})
 await confirm.click()
 await modal.getByText('Renseignez un nombre positif ou nul, sans unité (exemple : 125,50).',{exact:true}).waitFor()
 if(calls)throw Error('Invalid form submitted')
 await modal.getByLabel(/Coût unitaire/).fill('52,50')
 await modal.getByLabel(/Justificatif/).fill('abc')
 await confirm.click()
 if(calls)throw Error('Short reason submitted')
 await modal.getByLabel(/Justificatif/).fill('Facture fournisseur QA')
 await confirm.click();await modal.getByRole('alert').filter({hasText:'Le stock a changé'}).waitFor()
 if(await modal.getByLabel(/Coût unitaire/).inputValue()!=='52,50')throw Error('Form values lost')
 await confirm.click();await modal.waitFor({state:'hidden'})
 await page.getByRole('row').filter({hasText:'Produit sans prix'}).getByText('Confirmé',{exact:false}).waitFor()
 await page.getByRole('row').filter({hasText:'Produit prix à confirmer'}).getByRole('button',{name:'Valoriser',exact:true}).click()
 if(await modal.getByLabel(/Coût unitaire/).inputValue()!=='15')throw Error('Known price not prefilled')
 await modal.getByLabel(/Justificatif/).fill('Prix historique vérifié')
 await confirm.click();await modal.waitFor({state:'hidden'})
 if(calls!==3||inventory.some(i=>!i.verified)||errors.length)throw Error(errors.join('\n')||'Unexpected confirmation result')
 console.log('PASS: visible dialog, missing price/reason validation, French decimal, server error in dialog, retained fields, known price confirmation and refreshed statuses. No real writes.')
}finally{await browser.close()}
