// Every Supabase request is mocked. No invoice or payment is created by this test.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3103'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',domain='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
const user={id:uid,email:'qa-invoice@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
const invoice={id,domain_id:domain,invoice_number:'FD-2026-TEST-PDF',invoice_type:'vente',client_id:'client',supplier_id:'supplier',invoice_date:'2026-10-15',due_date:'2026-11-15',subtotal:720,tax_amount:0,total_amount:720,paid_amount:0,status:'en_attente',currency:'MAD',notes:'Facture de recette - aucune donnée réelle.'}
try{
 const context=await browser.newContext({viewport:{width:1300,height:1000},serviceWorkers:'block',acceptDownloads:true})
 await context.addInitScript(({key,session})=>{
  localStorage.setItem(key,JSON.stringify(session));window.__invoicePrints=0;window.print=()=>{window.__invoicePrints++}
 },{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let denied=false
 await context.route(`https://${host}/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let data=[],status=200
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Ferme de recette',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/domains'))data=[{id:domain,name:'Ferme de recette',legal_name:'Exploitation agricole de recette',address:'Route agricole, zone de test',city:'Casablanca',country:'Maroc'}]
  else if(path.endsWith('/invoices')||path.endsWith('/supplier_invoices')){
   expect(url.searchParams.get('domain_id')).toBe('eq.'+domain)
   if(denied){status=403;data={code:'42501',message:'fixture denied'}}else data=[invoice]
  }
  else if(path.endsWith('/clients'))data=[{id:'client',name:'Client de recette / عميل تجريبي',address:'Adresse de démonstration',city:'Rabat',country:'Maroc'}]
  else if(path.endsWith('/suppliers'))data=[{id:'supplier',name:'Fournisseur de recette'}]
  else if(path.endsWith('/harvest_lots')){
   expect(url.searchParams.get('invoice_id')).toBe('eq.'+id);expect(url.searchParams.get('domain_id')).toBe('eq.'+domain)
   data=Array.from({length:72},(_,i)=>({id:`lot-${i}`,lot_number:`LOT-RECETTE-${String(i+1).padStart(3,'0')}`,harvest_date:'2026-09-01',qty_acceptee_kg:1,price_per_kg:10,ca_amount:10,varieties:{commercial_name:i===0?'Tomate - variété à nom long, qualité supérieure, conditionnement sélectionné':'Tomate'}}))
  }
  if(!['GET','HEAD'].includes(request.method())&&!path.startsWith('/auth/')&&!path.endsWith('/profiles'))throw Error('Unexpected write '+path)
  if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${base}/factures`,{waitUntil:'networkidle'})
 const row=page.locator(`[data-invoice-id="${id}"]`)
 await expect(row.getByRole('link',{name:'Consulter',exact:true})).toBeVisible()
 await expect(row.getByRole('button')).toHaveCount(0)
 await expect(row.getByRole('link')).toHaveCount(1)
 await row.getByRole('link',{name:'Consulter',exact:true}).click()
 await expect(page.locator('.invoice-sheet')).toContainText('720,00 MAD')
 await expect(page.locator('.invoice-sheet')).toContainText('LOT-RECETTE-072')
 await expect(page.locator('.invoice-sheet')).toContainText('عميل تجريبي')
 await expect(page.getByRole('button',{name:'Ouvrir le menu'})).toHaveCount(0)
 await page.getByRole('link',{name:'Encaisser',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Encaisser une facture client',exact:true})).toBeVisible()
 await page.goto(`${base}/factures/document/${id}?type=client&domain=${domain}`,{waitUntil:'networkidle'})
 await expect(page.locator('.invoice-sheet')).toContainText('720,00 MAD')
 fs.mkdirSync('tmp/pdfs',{recursive:true})
 await page.screenshot({path:'tmp/pdfs/invoice-document-desktop.png',fullPage:false})
 const downloaded=page.waitForEvent('download')
 await page.getByRole('button',{name:'Télécharger PDF',exact:true}).click()
 const file=await downloaded;expect(file.suggestedFilename()).toBe('ITRIX-client-FD-2026-TEST-PDF.pdf')
 await file.saveAs('tmp/pdfs/invoice-document-test.pdf')
 expect(fs.readFileSync('tmp/pdfs/invoice-document-test.pdf').subarray(0,8).toString()).toBe('%PDF-1.4')
 await page.getByRole('button',{name:'Imprimer',exact:true}).click()
 expect(await page.evaluate(()=>window.__invoicePrints)).toBe(1)
 await page.setViewportSize({width:390,height:844})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 await page.screenshot({path:'tmp/pdfs/invoice-document-mobile.png',fullPage:false})
 await page.goto(`${base}/factures/document/${id}?type=fournisseur&domain=${domain}&action=print`,{waitUntil:'networkidle'})
 await expect(page.locator('.invoice-sheet')).toContainText('FACTURE FOURNISSEUR')
 await expect(page.locator('.invoice-sheet')).toContainText('Fournisseur de recette')
 await expect.poll(()=>page.evaluate(()=>window.__invoicePrints)).toBe(1)
 denied=true;await page.reload({waitUntil:'networkidle'})
 await expect(page.locator('.invoice-document-page [role="alert"]')).toContainText('Impossible de consulter cette facture')
 await expect(page.getByRole('button',{name:'Télécharger PDF'})).toBeDisabled()
 expect(errors).toEqual([])
 console.log('PASS invoice preview, client/supplier identity, real PDF download, printing, mobile, denied reads, no business writes. Mocked backend only.')
}finally{await browser.close()}
