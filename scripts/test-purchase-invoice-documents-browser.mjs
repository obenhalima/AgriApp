// Fully isolated fixture browser: every Supabase and document API call is mocked.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname,base=process.env.TEST_BASE_URL||'http://localhost:3104'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',domain='11111111-1111-4111-8111-111111111111',poId='22222222-2222-4222-8222-222222222222'
const user={id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const po={id:poId,domain_id:domain,po_number:'BA-FICTIF-001',supplier_id:'33333333-3333-4333-8333-333333333333',currency:'MAD',status:'recu',order_date:'2026-01-01',subtotal:100,tax_amount:0,total_amount:100,suppliers:{name:'Fournisseur fictif'},campaign_id:null,greenhouse_id:null,cost_category:'services'}
const pdf=fs.readFileSync('tmp/pdfs/docindex-fictional-test.pdf')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1350,height:1100}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let inserts=0,external=0,entries=[],sends=0,checks=0
 await context.route('https://docindex-phi.vercel.app/**',route=>{external++;return route.abort()})
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let data=[]
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'Administrateur fictif',role_id:role,is_active:true}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{code:'TEST',name:'Client fictif',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(path.endsWith('/roles'))data=[{id:role,is_admin:true,is_active:true}]
  else if(path.endsWith('/purchase_orders'))data=[po]
  else if(path.endsWith('/purchase_order_lines'))data=[{id:'44444444-4444-4444-8444-444444444444',po_id:poId,item_description:'Prestation fictive',quantity:1,received_qty:1,unit_price:100,line_total:100}]
  else if(path.endsWith('/supplier_invoices')&&request.method()==='POST'){
   const body=request.postDataJSON();expect(body.domain_id).toBe(domain);expect(body.po_id).toBe(poId);expect(body.currency).toBe('MAD');expect(body.invoice_number).toBe('FF-FICTIVE-TEST-001');inserts++
  }
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 await context.route('**/api/purchases/invoice-documents?**',async route=>{
  const request=route.request(),url=new URL(request.url());expect(url.searchParams.get('domain')).toBe(domain);expect(url.searchParams.get('po')).toBe(poId)
  if(url.searchParams.get('action')==='connections')return route.fulfill({contentType:'application/json',body:JSON.stringify({connections:[{recipient:'fixture-recipient-A',space:'Espace fictif'}]})})
  if(request.method()==='PATCH'){
   const body=request.postDataJSON();expect(body.document).toBe('a'.repeat(64));expect(body.recipient).toBe('fixture-recipient-A')
   if(body.action==='send'){sends++;expect(body.confirmFictitious).toBe(true);expect(body.confirmSend).toBe(true);entries[0].docindex={recipient:body.recipient,remoteId:'3f6c2a1e-0000-4000-a000-000000000000',events:[]}}
   else if(body.action==='rebind'){expect(body.confirmNewKey).toBe(true);expect(body.confirmSameSpace).toBe(true)}
   else {checks++;entries[0].docindex.summary={id:entries[0].docindex.remoteId,stage:checks===1?'to_review':'validated',flow:'purchase',invoice_number:'FF-FICTIVE-TEST-001',supplier:'Fournisseur fictif',currency:'MAD',total:'100.00',document_type:'invoice'}}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({document:entries[0],message:body.action==='rebind'?'Nouvelle clé associée au même destinataire. Référence conservée ; aucune facture envoyée par cette action.':undefined})})
  }
  if(request.method()==='POST'){
   expect(request.postDataBuffer().subarray(0,5).toString()).toBe('%PDF-')
   const document={id:'a'.repeat(64),name:'facture-fictive.pdf',mime:'application/pdf',size:pdf.length,uploadedAt:'2026-01-01T12:00:00Z',uploadedBy:uid};entries=[document]
   return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({document})})
  }
  if(url.searchParams.has('document'))return route.fulfill({contentType:'application/pdf',body:pdf})
  return route.fulfill({contentType:'application/json',body:JSON.stringify({documents:entries})})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto(base+'/achats/'+poId,{waitUntil:'networkidle'})
 await page.getByLabel('Ajouter la facture fournisseur').setInputFiles({name:'facture-fictive.pdf',mimeType:'application/pdf',buffer:pdf})
 await expect(page.getByRole('button',{name:'Visualiser facture-fictive.pdf'})).toBeVisible({timeout:15000})
 const canvas=page.getByLabel('Aperçu de la facture PDF')
 await expect.poll(()=>canvas.evaluate(element=>element.width>300&&element.height>150&&element.getContext('2d').getImageData(0,0,1,1).data[3]>0),{timeout:20000}).toBe(true)
 expect(inserts).toBe(0);expect(external).toBe(0)
 if(process.env.DOCINDEX_PURCHASE_TEST==='1'){
  expect(sends).toBe(0)
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Envoyer cette facture à DocIndex',exact:true}).click()
  await expect(page.getByText('Réception confirmée :',{exact:false})).toBeVisible()
  expect(sends).toBe(1);expect(inserts).toBe(0)
  page.once('dialog',dialog=>dialog.dismiss())
  await page.getByRole('button',{name:'Utiliser la nouvelle clé pour ce destinataire',exact:true}).click()
  await expect(page.getByText('Nouvelle clé associée au même destinataire.',{exact:false})).toHaveCount(0)
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Utiliser la nouvelle clé pour ce destinataire',exact:true}).click()
  await expect(page.getByText('Nouvelle clé associée au même destinataire.',{exact:false})).toBeVisible()
  expect(sends).toBe(1);expect(inserts).toBe(0)
  await page.getByRole('button',{name:'Actualiser le statut',exact:true}).click()
  await expect(page.getByText('À vérifier et valider dans DocIndex',{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'Vérifier le préremplissage et créer la facture'})).toHaveCount(0)
  await page.getByRole('button',{name:'Actualiser le statut',exact:true}).click()
  await expect(page.getByText('Validé dans DocIndex',{exact:false})).toBeVisible()
  const prefill=page.getByRole('button',{name:'Vérifier le préremplissage et créer la facture'})
  await expect(prefill).toBeDisabled()
  await page.getByRole('checkbox',{name:'Je confirme que',exact:false}).check()
  await prefill.click();expect(inserts).toBe(0)
  await expect(page.getByPlaceholder('FF-2026-12345',{exact:true})).toHaveValue('FF-FICTIVE-TEST-001')
  await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('')
  await page.locator('input[type="date"]').nth(0).fill('2026-10-16')
  await page.locator('input[type="date"]').nth(1).fill('2026-11-16')
 }else{
 await page.getByRole('button',{name:'Vérifier les informations et créer la facture'}).click()
 expect(inserts).toBe(0)
 await page.getByRole('button',{name:'CONFIRMER ET CRÉER LA FACTURE',exact:true}).click()
 await expect(page.getByText('Saisissez le numéro figurant sur la facture originale du fournisseur.',{exact:false})).toBeVisible()
 expect(inserts).toBe(0)
 await page.getByPlaceholder('FF-2026-12345',{exact:true}).fill('FF-FICTIVE-TEST-001')
 }
 await page.getByRole('button',{name:'CONFIRMER ET CRÉER LA FACTURE',exact:true}).click()
 await expect(page.getByText('Facture créée après confirmation.',{exact:false})).toBeVisible({timeout:10000})
 expect(inserts).toBe(1);expect(external).toBe(0);expect(errors).toEqual([])
 fs.mkdirSync('tmp/purchase-invoice-documents',{recursive:true});await page.screenshot({path:'tmp/purchase-invoice-documents/preview.png',fullPage:true})
 await page.reload({waitUntil:'networkidle'})
 await expect(page.getByRole('button',{name:'Visualiser facture-fictive.pdf'})).toBeVisible()
 console.log('PASS upload, PDF preview, persistence, original invoice number required, explicit confirmation, correct tenant/currency. Mock DB insert only; ZERO external document transmissions.')
}finally{await browser.close()}
