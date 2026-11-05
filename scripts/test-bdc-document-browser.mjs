import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const domain='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const user={id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1100}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let writes=0
 await context.route(`https://${host}/**`,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=[]
  if(['POST','DELETE'].includes(req.method()))writes++
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'Test',role_id:role,is_active:true}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{code:'TEST',name:'Ferme fictive',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(path.endsWith('/roles'))data=[{id:role,is_admin:true,is_active:true}]
  else if(path.endsWith('/domains'))data=[{id:domain,name:'Ferme fictive',legal_name:'Exploitation DEMO',address:'Adresse fictive'}]
  else if(path.endsWith('/suppliers'))data=[{name:'Fournisseur DEMO',address:'Adresse de test'}]
  else if(path.endsWith('/purchase_orders'))data=[{id,supplier_id:'33333333-3333-4333-8333-333333333333',po_number:'BDC-TEST-001',currency:'MAD',status:'brouillon',order_date:'2026-10-16',expected_delivery:'2026-10-30',subtotal:4500,tax_amount:900,total_amount:5400}]
  else if(path.endsWith('/purchase_order_lines'))data=[{id:'44444444-4444-4444-8444-444444444444',item_description:'Caisses de récolte',quantity:100,unit:'pièce',unit_price:35,line_total:3500},{id:'55555555-5555-4555-8555-555555555555',item_description:'Plateaux de semis',quantity:50,unit:'pièce',unit_price:20,line_total:1000}]
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage()
 await page.goto(`http://localhost:3104/achats/document/${id}?domain=${domain}`,{waitUntil:'networkidle'})
 await expect(page.getByRole('heading',{name:'BON DE COMMANDE',exact:true})).toBeVisible()
 await expect(page.getByText('BROUILLON - bon non validé',{exact:false})).toBeVisible()
 await expect(page.getByText('Journal des paiements')).toHaveCount(0)
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger PDF'}).click()
 const file=await download;expect(file.suggestedFilename()).toBe('ITRIX-BDC-BDC-TEST-001.pdf')
 fs.mkdirSync('tmp/bdc-test',{recursive:true});await file.saveAs('tmp/bdc-test/BDC-TEST-001.pdf')
 await page.screenshot({path:'tmp/bdc-test/consultation.png',fullPage:true})
 await page.emulateMedia({media:'print'});await expect(page.getByRole('button',{name:'Imprimer',exact:true})).toBeHidden()
 await page.emulateMedia({media:'screen'})
 await page.goto(`http://localhost:3104/achats/document/${id}?domain=99999999-9999-4999-8999-999999999999`)
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Télécharger PDF'})).toBeDisabled()
 expect(writes).toBe(0);console.log('PASS: scoped preview, PDF download, print CSS, mismatched tenant denied; no business writes')
}finally{await browser.close()}
