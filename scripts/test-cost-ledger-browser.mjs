// Read-only UI regression tests. Every Supabase request is intercepted with test fixtures.
import {chromium,expect as baseExpect} from '@playwright/test'
const expect=baseExpect.configure({timeout:60000})
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base='http://localhost:3001'
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'cost-ledger@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
const category={id:'cat',parent_id:'root',code:'ENGRAIS',label:'Engrais',type:'charge_variable',level:2,is_active:true,display_order:1}
const campaign={id:'campaign',domain_id:domain,name:'Campagne QA',code:'C26',farm_id:'farm',preparation_start:'2026-08-01',planting_start:'2026-08-01',campaign_end:'2027-07-31'}
const costs=Array.from({length:501},(_,i)=>({id:`cost-${String(i).padStart(4,'0')}`,domain_id:domain,campaign_id:'campaign',greenhouse_id:'serre',account_category_id:'cat',cost_category:'engrais',amount:2,is_planned:false,entry_date:i<300?'2026-09-25':'2026-10-12',created_at:'2026-11-17T07:00:00Z',description:'Consommation historique QA',source_stock_movement_id:`m-${i}`,cost_quality:'verified',campaigns:{name:'Campagne QA',farm_id:'farm'},greenhouses:{code:'S1',name:'Serre 1',farm_id:'farm'},account_categories:category}))
costs[1].source_stock_movement_id=costs[0].source_stock_movement_id
const movements=costs.filter((cost,index)=>index!==1).map(c=>({id:c.source_stock_movement_id,domain_id:domain,stock_item_id:'item',warehouse_id:'warehouse',movement_date:c.entry_date,quantity:c.id==='cost-0000'?2:1,unit_cost:2,total_cost:c.id==='cost-0000'?4:2,reference:`HIST-${String(Number(c.id.slice(5))+1).padStart(4,'0')}`,costing_method:'cump'}))
const reviews=movements.map(m=>({movement_id:m.id,domain_id:domain,unit_cost:2,reason:'Importé par QA · 2026-11-17 · Prix_CUMP.xlsx'}))
const tables={cost_entries:[...costs,{...costs[0],id:'foreign',domain_id:'another',amount:99999}],campaigns:[campaign],farms:[{id:'farm',domain_id:domain,code:'501',name:'Ferme QA',is_active:true}],greenhouses:[{id:'serre',farm_id:'farm',code:'S1',name:'Serre 1',farms:{domain_id:domain}}],account_categories:[{...category,id:'root',parent_id:null,code:'CHARGES',label:'Charges variables',level:1},category],budget_versions:[{id:'budget',campaign_id:'campaign',status:'valide',is_active:true}],stock_movements:movements,stock_items:[{id:'item',domain_id:domain,code:'ENG01',name:'Acide sulfurique QA',unit:'L'}],warehouses:[{id:'warehouse',domain_id:domain,name:'Principal'}],inventory_consumption_reviews:reviews}
function filter(data,url){
 let rows=data.filter(row=>[...url.searchParams].every(([key,value])=>{
  if(value.startsWith('eq.'))return String(key.split('.').reduce((o,k)=>o?.[k],row))===value.slice(3)
  if(value.startsWith('is.'))return value==='is.null'?row[key]==null:true
  if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(String(row[key]))
  return true
 }))
 const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000)
 return rows.slice(offset,offset+limit)
}
const browser=await chromium.launch({channel:'msedge',headless:true})
console.log('Browser ready')
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').at(-1)
  let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(table==='profiles')data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(table==='domain_memberships')data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA',is_active:true},roles:{name:'Admin'}}]
  else if(table==='roles')data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(tables[table])data=filter(tables[table],url)
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage();page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:120000})
 await page.waitForURL(url=>!url.pathname.includes('/login'),{timeout:90000})
 await page.goto(base+'/couts/reel',{waitUntil:'domcontentloaded',timeout:120000})
 console.log('Checking client overview')
 await expect(page.getByText('Total des écritures affichées',{exact:false})).toContainText('1')
 await expect(page.getByText('Total des écritures affichées',{exact:false})).toContainText('501')
 await expect(page.getByText('Total des écritures affichées',{exact:false})).toContainText('500 lignes regroupées')
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toBeVisible()
 await expect(page.getByRole('combobox',{name:'Serre',exact:true})).toBeEnabled()
 await page.getByRole('combobox',{name:'Serre',exact:true}).selectOption('serre')
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toHaveValue('farm')
 await expect(page.getByLabel('Périmètre des coûts')).toContainText('Serre · S1')
 await page.getByLabel('Périmètre des coûts').getByRole('button',{name:'Ferme · Ferme QA',exact:true}).click()
 await expect(page.getByRole('combobox',{name:'Serre',exact:true})).toHaveValue('')
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toHaveValue('farm')
 await page.getByRole('button',{name:/^Vue globale client/}).click()
 await expect(page.getByRole('combobox',{name:'Ferme',exact:true})).toHaveValue('')
 await expect(page.getByRole('combobox',{name:'Serre',exact:true})).toHaveValue('')
 const grouped=page.getByRole('row').filter({hasText:'HIST-0001'})
 await expect(grouped).toContainText('4,00')
 await grouped.getByRole('button',{name:'Voir les affectations',exact:true}).click()
 await expect(page.getByLabel('Affectations du mouvement')).toContainText('S1')
 await expect(page.getByLabel('Affectations du mouvement').getByRole('button',{name:'Voir les détails',exact:true})).toHaveCount(2)
 await page.getByRole('button',{name:/^Ferme QA/}).click()
 await page.getByRole('button',{name:/^S1/}).click()
 await expect(page.getByLabel('Périmètre des coûts')).toContainText('Serre · S1')
 await page.getByRole('button',{name:/^Vue globale client/}).click()
 console.log('Scope navigation and grouped allocations verified')
 await page.getByLabel('Article, référence ou description',{exact:true}).fill('HIST-0501')
 await expect(page.getByText('Total des écritures affichées',{exact:false})).toContainText('2,00')
 await page.getByRole('row').filter({hasText:'HIST-0501'}).getByRole('button',{name:'Voir les détails',exact:true}).click()
 const detail=page.getByRole('dialog',{name:'Détails du coût',exact:true})
 await expect(detail).toContainText('Prix_CUMP.xlsx')
 await detail.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click()
 await page.goto(base+'/admin/compte-exploitation',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Mensuel',exact:true}).click()
 await page.getByRole('button',{name:'Voir les écritures de Engrais · 2026-9',exact:true}).click()
 const breakdown=page.getByRole('dialog',{name:'Écritures derrière ce montant',exact:true})
 await expect(breakdown.getByText('Total des écritures affichées',{exact:false})).toContainText('600,00')
 await expect(breakdown.getByText('Total des écritures affichées',{exact:false})).toContainText('300')
 await expect(breakdown.getByRole('row').filter({hasText:'HIST-0301'})).toHaveCount(0)
 await expect(breakdown.getByRole('row').filter({hasText:'HIST-0001'})).toContainText('Acide sulfurique QA')
 expect(errors).toEqual([])
 console.log('PASS complete cost ledger beyond 300 rows, source/reference search, valuation evidence, monthly category drill-down and matching totals. No real writes.')
}finally{await browser.close()}
