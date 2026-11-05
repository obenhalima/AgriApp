// UI integration with mocked Supabase. Never sends business writes to the real project.
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-stock@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const expires=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:expires,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
let applies=0,previews=0,serverEnabled=false
try {
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:expires,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  let result=[]
  if(path==='/auth/v1/user')result=user
  else if(path.endsWith('/profiles'))result=[{...user,full_name:'QA Stock',role_id:role,is_active:true,must_change_password:false}]
  else if(path.endsWith('/domain_memberships'))result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Domaine QA 501',code:'QA501',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(path.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/farms'))result=[{id:'farm1',code:'F01',name:'501',domain_id:domain,is_active:true}]
  else if(path.endsWith('/warehouses'))result=[{id:'wh1',code:'D1',name:'Principal',domain_id:domain,farm_id:'farm1',is_active:true}]
  else if(path.endsWith('/reference_values')){
   result=[{id:'r1',list_key:'stock_category',code:'engrais',label:'Engrais',is_active:true},{id:'r2',list_key:'unit',code:'kg',label:'Kilogramme',is_active:true}]
   if(url.searchParams.get('list_key')?.startsWith('eq.'))result=result.filter(r=>'eq.'+r.list_key===url.searchParams.get('list_key'))
  }
  else if(path.endsWith('/rpc/initialize_stock_inventory')){
   if(!serverEnabled){await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'Function not installed'})});return}
   const payload=route.request().postDataJSON()
   expect(payload.p_domain).toBe(domain);expect(payload.p_rows).toHaveLength(1);expect(payload.p_rows[0]).toMatchObject({code:'ENG01',quantity:'10.00',warehouse:'D1',price:''})
   if(payload.p_apply)applies++;else previews++
   result={status:payload.p_apply?'applied':'preview',created:1,reused:0,positive:1,zero:0,unvalued:1,operation_id:payload.p_apply?'44444444-4444-4444-8444-444444444444':null}
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
 await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/stocks/reprise',{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByRole('heading',{name:/Articles et stock initial/})).toBeVisible()
 await expect(page.getByRole('button',{name:'Valider la création des articles et du stock',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Valider la création des articles et du stock',exact:true})).toBeDisabled()
 await page.locator('select').filter({has:page.locator('option[value="D1"]')}).selectOption('D1')
 await page.locator('input[type=date]').fill('2020-01-01')
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('button',{name:/Exporter le modèle articles et stock/i}).click()
 const download=await downloadPromise,stream=await download.createReadStream(),chunks=[]
 for await(const chunk of stream)chunks.push(chunk)
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.concat(chunks))
 const sheet=wb.getWorksheet('Articles_Stock');expect(sheet.getCell('A2').value).toBe('')
 expect(wb.getWorksheet('Ref_Unites').getCell('A2').value).toBe('kg')
 sheet.getRow(2).values=['ENG01','Engrais test','engrais','kg','D1',new Date('2020-01-01T00:00:00Z'),10,null,'','']
 await page.locator('input[type=file]').setInputFiles({name:'inventaire.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await wb.xlsx.writeBuffer())})
 const confirm=page.getByRole('button',{name:'Valider la création des articles et du stock',exact:true})
 await expect(page.getByRole('region',{name:'4. Valider la création des articles et du stock'}).getByRole('alert')).toContainText('164_stock_initialization.sql')
 await expect(confirm).toBeVisible();await expect(confirm).toBeDisabled();expect(applies).toBe(0)
 serverEnabled=true
 await page.getByRole('button',{name:'Recontrôler les références et stocks en base',exact:true}).click()
 await expect(page.getByText('Contrôle serveur réussi.',{exact:false})).toBeVisible()
 expect(applies).toBe(0);expect(previews).toBe(1)
 await expect(confirm).toBeDisabled();await page.getByRole('checkbox').check();await confirm.click()
 await expect(page.getByText('Reprise enregistrée — ne pas réimporter',{exact:true})).toBeVisible();expect(applies).toBe(1)
 await page.reload({waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByRole('heading',{name:/Articles et stock initial/})).toBeVisible()
 await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/admin/initialisation',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Continuer avec ce client',exact:true}).click()
 await page.getByRole('button',{name:'Préparer les articles et le stock',exact:true}).click()
 await expect(page.getByRole('heading',{name:/Articles et stock initial/})).toBeVisible()
 await expect(page.getByRole('button',{name:'Retour aux modules',exact:true})).toBeVisible()
 expect(errors).toEqual([])
 console.log(JSON.stringify({emptyClientExport:true,previewWithoutWrites:true,explicitApply:applies,initializationIntegrated:true,pageErrors:errors}))
} finally {await browser.close()}
