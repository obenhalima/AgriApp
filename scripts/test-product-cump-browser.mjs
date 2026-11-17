// Only mocked Supabase data. No real pricing, stock or costs are written.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import ts from 'typescript'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const require=createRequire(import.meta.url)
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)
require.cache[resolve('lib/supabase.ts')]={exports:{supabase:{}}}
const {productReviewWorkbook}=require(resolve('lib/stockProductReview.ts'))
const ExcelJS=require('exceljs')
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3001'
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'cump@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
const entry=(id,item,price,quantity=10)=>({id,item,code:item,name:item==='target'?'Acide sulfurique QA':`Produit ${item}`,unit:'L',quantity,date:'2026-10-01',reference:id,warehouse:'Principal',farm:'farm',price,fixed:true,linked:false,targets:[{area:100,campaign_id:'c',greenhouse_id:'g',planting_id:'p',variety_id:'v'}]})
let movements=[...Array.from({length:30},(_,i)=>entry(`other-${i}`,`P${i}`,null)),entry('target-1','target',null),entry('target-2','target',null,20),entry('target-priced','target',12,5)]
const initialMovements=[...movements]
const calls=[],errors=[]
let rejectApply=true
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;let data=[]
  if(path==='/auth/v1/token')data={access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}
  else if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/get_production_cost_data'))data={basis:'surface',plantings:[],costs:[],harvests:[],inventory:[],transit:0,pending_movements:movements}
  else if(path.endsWith('/stock_product_review_context')){
   const ids=route.request().postDataJSON().p_movements
   if(ids.some(id=>!movements.some(m=>m.id===id))){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Les sorties ont changé ou sont déjà rapprochées. Actualisez.'})});return}
   data={method:'cump',version:'c'.repeat(64),plantings:[],movements:movements.filter(m=>ids.includes(m.id))}
  }else if(path.endsWith('/review_stock_products')){
   const body=route.request().postDataJSON();calls.push(body)
   expect(body.p_domain).toBe(domain)
   expect(body.p_rows.map(r=>r.id)).toEqual(['target-1','target-2','target-priced'])
   expect(body.p_rows.map(r=>r.price)).toEqual(['8.5','8.5','12'])
   expect(body.p_rows.every(r=>r.plantings.length===0)).toBe(true)
   if(body.p_apply&&rejectApply){rejectApply=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Le stock a changé. Relancez le contrôle.'})});return}
   if(body.p_apply)movements=movements.filter(m=>m.item!=='target')
   data={status:body.p_apply?'applied':'preview',count:3,amount:315}
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:120000})
 await page.waitForURL(url=>!url.pathname.includes('/login'),{timeout:90000})
 await page.goto(base+'/couts/pilotage',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:/^Sorties à rapprocher/}).click()
 const card=page.locator('div.rounded-xl').filter({has:page.getByRole('heading',{name:'Acide sulfurique QA',exact:true})})
 await card.getByRole('button',{name:'Rapprocher cet article',exact:true}).click()
 const modal=page.getByRole('dialog',{name:'Rapprocher cet article',exact:true})
 await expect(modal).toBeVisible()
 const price=modal.getByLabel('CUMP confirmé (MAD)',{exact:true})
 await expect(price).toBeFocused()
 await expect(price).toBeInViewport()
 const check=modal.getByRole('button',{name:'Contrôler avant validation',exact:true})
 await check.click()
 await expect(modal.getByRole('alert')).toContainText('Renseignez un CUMP')
 const errorColor=await modal.getByRole('alert').evaluate(node=>getComputedStyle(node).color)
 expect(errorColor).not.toBe(await modal.evaluate(node=>getComputedStyle(node).color))
 expect(calls).toHaveLength(0)
 await price.fill('-1');await check.click()
 expect(calls).toHaveLength(0)
 await price.fill('8,5');await check.click()
 await expect(modal.getByRole('alert')).toContainText('source du CUMP')
 expect(calls).toHaveLength(0)
 await modal.getByLabel('Justificatif / source du prix',{exact:true}).fill('Prix confirmé par la ferme')
 await check.click()
 const apply=modal.getByRole('button',{name:'Valider les coûts',exact:true})
 await expect(modal.getByRole('heading',{name:'Synthèse avant validation',exact:true})).toBeVisible()
 await expect(apply).toBeDisabled()
 await modal.getByRole('checkbox',{name:'Je confirme les prix et les affectations de ces sorties.'}).check()
 await price.fill('9')
 await expect(apply).toHaveCount(0)
 await price.fill('8,5');await check.click()
 const confirmation=modal.getByRole('checkbox',{name:'Je confirme les prix et les affectations de ces sorties.'})
 await expect(confirmation).not.toBeChecked()
 await confirmation.check();await apply.click()
 await expect(modal.getByRole('alert')).toContainText('Le stock a changé')
 await expect(price).toHaveValue('8,5')
 await check.click();await confirmation.check()
 const colors=await apply.evaluate(button=>({foreground:getComputedStyle(button).color,background:getComputedStyle(button).backgroundColor}))
 expect(colors.background).not.toBe('rgba(0, 0, 0, 0)')
 expect(colors.foreground).not.toBe(colors.background)
 await apply.evaluate(button=>{button.click();button.click()})
 await expect(modal).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Acide sulfurique QA',exact:true})).toHaveCount(0)
 expect(calls.filter(c=>c.p_apply)).toHaveLength(2) // rejected attempt, then one guarded success
 // Fill just one product in the real application export and leave other products pending.
 movements=[...initialMovements]
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:/^Sorties à rapprocher/}).click()
 const exportedMovements=movements.map(m=>({...m,targets:m.targets.map(t=>({variety_id:t.variety_id,planting_id:t.planting_id,greenhouse_id:t.greenhouse_id,campaign_id:t.campaign_id,area:t.area}))}))
 const exported=await productReviewWorkbook(domain,{method:'cump',version:'d'.repeat(64),plantings:[],movements:[...exportedMovements,entry('already-processed','target',null,7)]})
 const book=new ExcelJS.Workbook();await book.xlsx.load(await exported.arrayBuffer())
 const products=book.getWorksheet('Produits')
 for(let row=2;row<=products.rowCount;row++)if(products.getCell(row,1).value==='target')products.getCell(row,5).value={formula:"VLOOKUP(B2,'[prices.xlsx]Prices'!B:D,3,0)",result:8.5}
 await page.getByLabel('Source commune du fichier',{exact:true}).fill('Prix confirmé par la ferme')
 const upload={name:'Prix_CUMP.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())}
 movements=movements.map(m=>m.id==='target-1'?{...m,quantity:11}:m)
 await page.getByLabel('Recharger le fichier Excel',{exact:false}).setInputFiles(upload)
 await expect(page.locator('[data-feedback="error"]')).toContainText('Les sorties restantes ont été modifiées')
 movements=[...initialMovements]
 await page.getByLabel('Recharger le fichier Excel',{exact:false}).setInputFiles(upload)
 await expect(page.getByRole('heading',{name:'Synthèse avant validation',exact:true})).toBeVisible()
 await expect(page.getByRole('status').filter({hasText:'Articles sans CUMP laissés en attente'})).toContainText('30')
 await expect(page.getByRole('status').filter({hasText:'Sorties déjà traitées ou hors périmètre ignorées'})).toContainText('1')
 const infoColor=await page.locator('[data-feedback="info"]').evaluate(node=>getComputedStyle(node).color)
 expect(infoColor).not.toBe(errorColor)
 const importApply=page.getByRole('button',{name:'Valider les coûts',exact:true})
 await expect(importApply).toBeDisabled()
 await page.getByRole('checkbox',{name:'Je confirme les prix et les affectations de ces sorties.'}).check()
 await importApply.click()
 expect(calls.at(-1).p_rows.every(row=>row.reason.includes('QA')&&row.reason.includes('Prix_CUMP.xlsx')&&/\d{4}-\d{2}-\d{2}T/.test(row.reason))).toBe(true)
 await expect(page.getByRole('heading',{name:'Acide sulfurique QA',exact:true})).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Produit P0',exact:true})).toBeVisible()
 expect(calls.filter(c=>c.p_apply)).toHaveLength(3)
 await page.getByLabel('Recharger le fichier Excel',{exact:false}).setInputFiles(upload)
 await expect(page.locator('[data-feedback="info"]')).toContainText('déjà traitées ou hors du périmètre affiché')
 await expect(page.getByRole('button',{name:'Valider les coûts',exact:true})).toHaveCount(0)
 expect(calls.filter(c=>c.p_apply)).toHaveLength(3)
 expect(errors).toEqual([])
 console.log('PASS manual and Excel product CUMP: visible modal and button colors, decimal comma, required source, partial upload with 30 unpriced products pending, scoped confirmation, preserved prices/allocations, server retry and double-click guard. No real writes.')
}finally{await browser.close()}
