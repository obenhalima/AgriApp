// All Supabase requests are mocked. This test never changes business data.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import ts from 'typescript'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const require=createRequire(import.meta.url)
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)
const {stockHistoryWorkbook}=require(resolve('lib/stockHistoryWorkbook.ts'))
const {HISTORY_COLUMNS}=require(resolve('lib/stockHistory.ts'))
const ExcelJS=require('exceljs')
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3001'
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'stock-history@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
const catalog={items:[{id:'i',code:'E1',name:'Engrais QA',unit:'kg',category:'engrais'}],warehouses:[{id:'w',code:'D1',name:'Principal',farm_id:'f',farm_code:'F1',farm_name:'501'}],suppliers:[],plantings:[{ref:'P-one',id:'p',campaign:'C1',campaign_name:'2026',farm:'F1',greenhouse:'S1',variety:'Tomate',area:100}],balances:[],movement_count:48}
const calls=[],resetCalls=[],errors=[]
let blockReset=false,identityReads=0
const methodCalls=[],productCalls=[]
let productApplied=false, blockMethod=true
const productContext={method:'cump',version:'c'.repeat(64),plantings:[],movements:[
 {id:'44444444-4444-4444-8444-444444444444',item:'i',code:'E1',name:'Engrais QA',unit:'kg',quantity:10,date:'2026-10-01',reference:'BL1',warehouse:'Principal',farm:'f',price:null,fixed:true,linked:false},
 {id:'55555555-5555-4555-8555-555555555555',item:'i',code:'E1',name:'Engrais QA',unit:'kg',quantity:20,date:'2026-10-02',reference:'BL2',warehouse:'Principal',farm:'f',price:null,fixed:true,linked:false}
]}

const wb=new ExcelJS.Workbook();await wb.xlsx.load(await(await stockHistoryWorkbook(domain,'QA',catalog)).arrayBuffer())
const sheet=wb.getWorksheet('Mouvements')
for(const [index,kind]of ['entree','sortie'].entries()){
 const row={external_id:'H'+index,date:'2026-09-01',order:String(index+1),type:kind,item:'E1',unit:'kg',warehouse:'D1',quantity:kind==='entree'?'100':'20',price:kind==='entree'?'2':'',reference:'FACT-QA',supplier:'',farm:'F1',campaign:kind==='sortie'?'C1':'',plantings:kind==='sortie'?'P-one':'',notes:''}
 HISTORY_COLUMNS.forEach(([key],i)=>sheet.getCell(index+2,i+1).value=row[key])
}
const bytes=Buffer.from(await wb.xlsx.writeBuffer())
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;let result=[]
  if(path.endsWith('/rpc/stock_product_review_context'))result=productContext
  else if(path.endsWith('/rpc/review_stock_products')){
   const data=route.request().postDataJSON();productCalls.push(data)
   expect(data.p_rows).toHaveLength(2)
   expect(data.p_rows.every(row=>row.price==='8.5')).toBe(true)
   if(data.p_apply)productApplied=true
   result={status:data.p_apply?'applied':'preview',count:2,amount:255}
  }
  else if(path.endsWith('/rpc/get_production_cost_data'))result={basis:'surface',plantings:[],costs:[],harvests:[],inventory:[],transit:0,pending_movements:productApplied?[]:productContext.movements}
  else if(path.endsWith('/rpc/change_inventory_cost_method_cutover')){
   const data=route.request().postDataJSON();methodCalls.push(data)
   result={status:data.p_apply?'applied':blockMethod?'blocked':'preview',mode:'cutover',effective_date:'2026-11-17',effective_at:'2026-11-17T10:00:00Z',blockers:blockMethod?[{code:'opening_unvalued',item_code:'E1',item_name:'Engrais QA',warehouse:'Principal',reference:null,message:'Complétez et confirmez la valeur CUMP du stock restant.'}]:[],opening_lots:1,historical_unpriced_receipts:2,domain_code:'QA',fingerprint:'b'.repeat(64),method:data.p_method,movements:3,exits:1,cost_before:1440,cost_after:1440,stock_before:960,stock_after:960,campaigns:[]}
  }
  else if(path.endsWith('/rpc/get_stock_history_catalog'))result=catalog
  else if(path.endsWith('/rpc/reset_stock_history')){
   const data=route.request().postDataJSON();resetCalls.push(data)
   if(data.p_apply){
    expect(data.p_confirmation).toBe('QA');expect(data.p_expected).toBe('a'.repeat(64))
    catalog.movement_count=0
   }
   result={status:data.p_apply?'applied':'preview',domain_code:'QA',fingerprint:'a'.repeat(64),operation_id:data.p_apply?'88888888-8888-4888-8888-888888888888':null,movements:48,costs:3,balances:1,items:1,blockers:{purchases:0,transfers:0,requests:blockReset?1:0,treatments:0,cultural:0,inconsistent:0}}
  }
  else if(path.endsWith('/rpc/import_stock_history')){
   const data=route.request().postDataJSON();calls.push(data)
   expect(data.p_domain).toBe(domain);expect(data.p_rows).toHaveLength(2)
   result={status:data.p_apply?'applied':'preview',entries:1,exits:1,skipped:0,unvalued:0,cost_total:40,cost_lines:1,operation_id:data.p_apply?'99999999-9999-4999-8999-999999999999':null,balances:[{item:'E1',warehouse:'D1',quantity:80,value:160,last_date:null}]}
  }else if(path==='/auth/v1/user'){identityReads++;result=user}
  else if(path.endsWith('/profiles'))result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/stocks/historique',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByRole('button',{name:'Exporter le modèle historique',exact:true})).toBeEnabled({timeout:60000})
 await expect(page.getByRole('button',{name:'Compléter l’historique existant',exact:true})).toHaveAttribute('aria-pressed','true')
 const initialIdentityReads=identityReads
 await page.evaluate(()=>{for(let index=0;index<5;index++)window.dispatchEvent(new Event('focus'))})
 await page.waitForTimeout(250)
 expect(identityReads).toBe(initialIdentityReads)
 expect(resetCalls).toHaveLength(0)
 await page.getByLabel('Fichier historique des stocks',{exact:true}).setInputFiles({name:'historique.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes})
 await expect(page.getByRole('heading',{name:'3. Synthèse avant import'})).toBeVisible({timeout:60000})
 expect(calls.every(c=>!c.p_apply)).toBe(true)
 const approve=page.getByRole('button',{name:'Valider les mouvements et générer les coûts',exact:true})
 await expect(approve).toBeDisabled()
 await page.getByRole('checkbox',{name:'Je confirme les dates, quantités, prix et affectations de cet historique déjà réalisé.'}).check()
 await approve.evaluate(button=>{button.click();button.click()})
 await expect(page.getByRole('heading',{name:'Import historique enregistré'})).toBeVisible()
 expect(calls.filter(c=>c.p_apply)).toHaveLength(1)
 expect(calls[0].p_request).toBe(calls.at(-1).p_request)
 await expect(page.getByText(/Lignes de coûts générées/)).toBeVisible()
 await page.getByRole('button',{name:'Repartir de zéro',exact:true}).click()
 expect(resetCalls).toHaveLength(0)
 await page.getByRole('button',{name:'Afficher l’aperçu de remise à zéro',exact:true}).click()
 const reset=page.getByRole('button',{name:'Remettre les mouvements et soldes à zéro',exact:true})
 await expect(reset).toBeVisible();await expect(reset).toBeDisabled()
 expect(resetCalls.every(c=>!c.p_apply)).toBe(true)
 await page.getByLabel(/Recopiez le code du client pour confirmer/).fill('WRONG')
 await page.getByRole('checkbox',{name:'Je confirme la suppression des mouvements et coûts affichés pour reconstruire cet historique par import.'}).check()
 await expect(reset).toBeDisabled()
 await page.getByLabel(/Recopiez le code du client pour confirmer/).fill('QA')
 await reset.evaluate(button=>{button.click();button.click()})
 await expect(page.getByRole('status').filter({hasText:'Stock remis à zéro.'})).toBeVisible()
 expect(resetCalls.filter(c=>c.p_apply)).toHaveLength(1)
 expect(resetCalls[0].p_request).toBe(resetCalls.at(-1).p_request)
 await expect(page.getByRole('button',{name:'Compléter l’historique existant',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByLabel('Fichier historique des stocks',{exact:true})).toBeEnabled()
 await expect(page.getByRole('heading',{name:'Import historique enregistré'})).toHaveCount(0)
 blockReset=true
 await page.getByRole('button',{name:'Repartir de zéro',exact:true}).click()
 await page.getByRole('button',{name:'Afficher l’aperçu de remise à zéro',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'Des opérations liées empêchent cette remise à zéro.'})).toBeVisible()
 await expect(reset).toBeDisabled()
 await page.getByLabel(/Recopiez le code du client pour confirmer/).fill('QA')
 await expect(reset).toBeDisabled()
 await page.goto(base+'/admin/parametres',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByLabel('Méthode de valorisation',{exact:true})).toBeEnabled()
 await page.getByLabel('Méthode de valorisation',{exact:true}).selectOption('fifo')
 await page.getByRole('button',{name:'Contrôler avant activation',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'Activation bloquée'})).toContainText('Engrais QA')
 await expect(page.getByRole('button',{name:'Activer la méthode pour les nouveaux mouvements',exact:true})).toHaveCount(0)
 expect(methodCalls.every(call=>!call.p_apply)).toBe(true)
 blockMethod=false
 await page.getByRole('button',{name:'Contrôler avant activation',exact:true}).click()
 await expect(page.getByText('Coûts historiques conservés',{exact:false})).toContainText('1')
 const applyMethod=page.getByRole('button',{name:'Activer la méthode pour les nouveaux mouvements',exact:true})
 await expect(applyMethod).toBeDisabled()
 expect(methodCalls).toHaveLength(2);expect(methodCalls[1].p_apply).toBe(false)
 await page.getByLabel(/Recopiez le code du client pour confirmer/).fill('QA')
 await page.getByRole('checkbox',{name:'Je confirme la bascule pour les nouveaux mouvements et la valeur du stock d’ouverture affichée.'}).check()
 await applyMethod.click()
 await expect(page.getByRole('status').filter({hasText:'Méthode activée. La valorisation de l’historique est conservée.'})).toBeVisible()
 expect(methodCalls.filter(call=>call.p_apply)).toHaveLength(1)
 expect(methodCalls[2].p_request).toBe(methodCalls[1].p_request)
 expect(methodCalls[2].p_expected).toBe('b'.repeat(64))
 await page.goto(base+'/couts/pilotage?tab=review',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Sorties \u00e0 rapprocher',exact:false}).click()
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('button',{name:'Exporter les articles / sorties \u00e0 rapprocher',exact:true}).click()
 const download=await downloadPromise
 fs.mkdirSync('outputs',{recursive:true})
 await download.saveAs('outputs/product-review-test.xlsx')
 const productBook=new ExcelJS.Workbook()
 await productBook.xlsx.readFile('outputs/product-review-test.xlsx')
 expect(productBook.getWorksheet('Produits').rowCount).toBe(2)
 productBook.getWorksheet('Produits').getCell('E2').value=8.5
 productBook.getWorksheet('Produits').getCell('F2').value='Facture QA'
 const productBytes=Buffer.from(await productBook.xlsx.writeBuffer())
 await page.getByLabel('Recharger le fichier Excel',{exact:false}).setInputFiles({name:'valorisation.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:productBytes})
 await expect(page.getByRole('heading',{name:'Synth\u00e8se avant validation',exact:true})).toBeVisible()
 const applyProducts=page.getByRole('button',{name:'Valider les co\u00fbts',exact:true})
 await expect(applyProducts).toBeDisabled()
 expect(productCalls.every(call=>!call.p_apply)).toBe(true)
 await page.getByRole('checkbox',{name:'Je confirme les prix et les affectations de ces sorties.'}).check()
 await applyProducts.evaluate(button=>{button.click();button.click()})
 await expect(page.getByText('Aucune sortie \u00e0 rapprocher sur ce p\u00e9rim\u00e8tre.',{exact:true})).toBeVisible()
 expect(productCalls.filter(call=>call.p_apply)).toHaveLength(1)
 expect(productCalls[0].p_request).toBe(productCalls.at(-1).p_request)
 expect(errors).toEqual([])
 fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:'outputs/stock-history-browser.png',fullPage:true})
 console.log('PASS complete/reset choice, import, typed confirmation, reset blockers, double-click guards and fresh import state')
}finally{await browser.close()}
