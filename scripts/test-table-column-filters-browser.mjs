// Focus regression: mocked Supabase only, no stock writes.
import { chromium, expect as baseExpect } from '@playwright/test'
const expect=baseExpect.configure({timeout:30000})
import fs from 'node:fs'
import ts from 'typescript'
import dotenv from 'dotenv'
const env = dotenv.parse(fs.readFileSync('.env.local'))
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid = '11111111-1111-4111-8111-111111111111', domain = '22222222-2222-4222-8222-222222222222', role = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, email: 'qa-focus@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const expires = Math.floor(Date.now()/1000)+3600
const token = [{alg:'HS256',typ:'JWT'},{sub:uid,exp:expires,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const submissions=[]
const reviews=[]
const costCategory={id:'cat',parent_id:'root',label:'Engrais',code:'ENG',type:'charge_variable',level:2,is_active:true}
const costEntry={id:'cost',domain_id:domain,campaign_id:'campaign',greenhouse_id:'s0',account_category_id:'cat',amount:25,entry_date:'2026-11-05',description:'Consommation test',is_planned:false,source_stock_movement_id:'source-movement',cost_quality:'verified',allocation_method:'surface_plantee_confirmee',campaigns:{name:'2026'},greenhouses:{code:'S1',farm_id:'farm'},account_categories:costCategory}

let cancelled=false
const cancellationCalls=[]
const catalog=['p1','p2'].map((id,i)=>({id,campaign_id:'campaign',campaign_name:'2026',greenhouse_id:'s'+i,greenhouse_name:'S'+(i+1),variety_name:'Tomate',farm_id:'farm',farm_name:'501',area:i?300:100}))
const browser = await chromium.launch({channel:'msedge',headless:true})
try {
  const context = await browser.newContext({serviceWorkers:'block'})
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:expires,expires_in:3600,token_type:'bearer',user}})
  await context.route(`https://${host}/**`,async route=>{
    const path = new URL(route.request().url()).pathname
    let result=[]
    if(path.endsWith('/cost_entries')) result=[costEntry]
    else if(path.endsWith('/account_categories')) result=[{id:'root',label:'Charges variables',code:'CV',parent_id:null,type:'charge_variable',level:1,is_active:true},costCategory]
    else if(path.endsWith('/campaigns')) result=[{id:'campaign',name:'2026',farm_id:'farm'}]
    else if(path.endsWith('/farms')) result=[{id:'farm',name:'501'}]
    else if(path.endsWith('/greenhouses')) result=[{id:'s0',code:'S1',farm_id:'farm',exploitable_area:100}]
    else if(path.endsWith('/stock_movements')) result=[{id:'source-movement',stock_item_id:'qa-stock',warehouse_id:'warehouse',quantity:10,unit_cost:10,movement_date:'2026-11-05',reference:'SORTIE-TEST'}]
    else if(path.endsWith('/inventory_consumption_reviews')) result=[]
    else if(path.endsWith('/stock_exit_requests')) result=[{id:'own-pending',requested_by:uid,status:cancelled?'annulee':'soumise',quantity:1,stock_items:{name:'Demande personnelle',unit:'kg'}},{id:'other-pending',requested_by:'other-user',status:'approuvee',stock_movement_id:'already-posted',quantity:1,stock_items:{name:'Demande autre utilisateur',unit:'kg'}}]
    else if(path.endsWith('/rpc/cancel_stock_exit_request')) {cancellationCalls.push(route.request().postDataJSON());cancelled=true;result=null}
    else if(path.endsWith('/rpc/get_production_cost_data')) result={basis:'surface',plantings:catalog.map(p=>({...p,variety_id:'v',target_kg:null})),harvests:[],costs:[],inventory:[],transit:0,pending_movements:[{id:'movement',reference:'SORTIE TEST',quantity:40,amount:null,date:'2026-11-05',reason:'Test'}]}
    else if(path.endsWith('/rpc/stock_consumption_allocation_context')) result={domain_id:domain,farm_id:'farm',farm_name:'501',warehouse_name:'Principal',fixed:false,linked:false,targets:[],plantings:catalog}
    else if(path.endsWith('/rpc/review_inventory_consumption_multi')) {reviews.push(route.request().postDataJSON());result=null}
    else if(path.endsWith('/rpc/get_stock_allocation_catalog')) result=catalog
    else if(path.endsWith('/rpc/submit_allocated_stock_exit')) {submissions.push(route.request().postDataJSON());result='request'}
    else if(path.endsWith('/warehouses')) result=[{id:'warehouse',farm_id:'farm',name:'Principal',is_default:true,is_active:true}]
    else if(path==='/auth/v1/user') result=user
    else if(path.endsWith('/profiles')) result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
    else if(path.endsWith('/domain_memberships')) result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA'},roles:{name:'Admin'}}]
    else if(path.endsWith('/roles')) result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
    else if(path.endsWith('/stock_items')) result=['Alpha','Bravo','Charlie','Delta'].map((name,index)=>({id:'stock-'+index,code:'ST'+index,name,category:index<2?'engrais':'emballages',unit:'kg',current_qty:10,min_qty:0,unit_cost:12,is_active:true}))
    if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result)) result=result[0]||null
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.setDefaultTimeout(20000)
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/stocks',{waitUntil:'domcontentloaded',timeout:120000})
  const helper=ts.transpileModule(fs.readFileSync('lib/tableColumnFilters.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const complex=await page.evaluate(code=>{
    const exported={}
    new Function('exports',code)(exported)
    const table=document.createElement('table')
    table.innerHTML='<thead><tr><th><button>Catégorie</button></th><th colspan="2">Mois</th><th>Total</th></tr><tr><th></th><th>B</th><th>R</th><th></th></tr></thead><tbody><tr><td>Tomate</td><td>10</td><td>8</td><td>18</td></tr><tr><td>Poivron</td><td>20</td><td>9</td><td>29</td></tr></tbody>'
    const model=exported.readFilterTable(table)
    exported.applyTableSelections(model.rows,{'0':['Tomate']})
    return {labels:model.columns.map(c=>c.label),visible:model.rows.filter(r=>!r.element.hasAttribute('data-column-filter-hidden')).length}
  },helper)
  expect(complex.labels).toEqual(['Catégorie','Mois · B','Mois · R','Total'])
  expect(complex.visible).toBe(1)
  const table=page.locator('table').filter({has:page.locator('th',{hasText:'Coût unit.'})})
  await expect(table.getByRole('button',{name:'Filtrer la colonne Article',exact:true})).toBeVisible()
  const visibleNames=()=>table.locator('tbody tr:not([data-column-filter-hidden]) td:nth-child(2)').allTextContents()
  async function choose(column,values) {
    await table.getByRole('button',{name:'Filtrer la colonne '+column,exact:true}).click()
    const popup=page.getByRole('dialog',{name:'Filtre de la colonne '+column,exact:true})
    await popup.getByRole('button',{name:'Tout désélectionner',exact:true}).click()
    for(const value of values)await popup.getByRole('checkbox',{name:value,exact:true}).check()
    await popup.getByRole('button',{name:'Appliquer',exact:true}).click()
  }
  await choose('Article',['Alpha','Charlie'])
  await expect.poll(visibleNames).toEqual(['Alpha','Charlie'])
  await choose('Catégorie',['emballages'])
  await expect.poll(visibleNames).toEqual(['Charlie'])
  await table.getByRole('button',{name:'Filtrer la colonne Article',exact:true}).click()
  let popup=page.getByRole('dialog',{name:'Filtre de la colonne Article',exact:true})
  await popup.getByRole('textbox',{name:'Rechercher une valeur'}).fill('ALP')
  await expect(popup.getByRole('checkbox',{name:'Alpha',exact:true})).toBeVisible()
  await expect(popup.getByRole('checkbox',{name:'Bravo',exact:true})).toHaveCount(0)
  await page.keyboard.press('Escape')
  await choose('Article',[])
  await expect.poll(visibleNames).toEqual([])
  await page.getByRole('button',{name:'Effacer tous les filtres',exact:true}).click()
  await expect.poll(visibleNames).toEqual(['Alpha','Bravo','Charlie','Delta'])
  await expect(table.getByRole('button',{name:'Filtrer la colonne Actions',exact:true})).toHaveCount(0)
  // Existing rows can be replaced without unmounting the table.
  await table.locator('tbody tr').first().evaluate(row=>{const replacement=row.cloneNode(true);replacement.cells[1].textContent='Updated';row.replaceWith(replacement)})
  await choose('Article',['Updated'])
  await expect.poll(visibleNames).toEqual(['Updated'])
  await page.getByRole('button',{name:'Effacer tous les filtres',exact:true}).click()
  // Narrow mobile screen: popup remains within the viewport.
  await page.setViewportSize({width:390,height:844})
  await table.getByRole('button',{name:'Filtrer la colonne Code',exact:true}).click()
  popup=page.getByRole('dialog',{name:'Filtre de la colonne Code',exact:true})
  const box=await popup.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x+box.width).toBeLessThanOrEqual(391)
  fs.mkdirSync('outputs',{recursive:true})
  await page.screenshot({path:'outputs/table-column-filters-mobile.png'})
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1440,height:1000})
  // Grouped costs and source detail dialog use the same filters.
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3001')+'/couts/reel',{waitUntil:'domcontentloaded',timeout:120000})
  await page.getByRole('button',{name:/Tout déplier/}).click()
  await expect(page.getByRole('button',{name:'Filtrer la colonne Campagne',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Voir les détails'}).first().evaluate(button=>button.scrollIntoView({block:'center',inline:'center'}))
  await page.getByRole('button',{name:'Voir les détails'}).first().click()
  await expect(page.getByRole('dialog',{name:'Détails du coût'})).toContainText('SORTIE-TEST')
  await page.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click()
  await page.getByRole('combobox',{name:'Langue',exact:true}).selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  await page.getByRole('button',{name:/^Filter column /}).first().click()
  await expect(page.getByRole('textbox',{name:'Search values'})).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('ar')
  await expect(page.locator('html')).toHaveAttribute('dir','rtl')
  await page.getByRole('button',{name:/^تصفية العمود /}).first().click()
  await expect(page.getByRole('textbox',{name:'البحث عن قيمة'})).toBeVisible()
  await page.keyboard.press('Escape')
  if(errors.length)throw Error(errors.join('\n'))
  fs.mkdirSync('outputs',{recursive:true})
  await page.screenshot({path:'outputs/table-column-filters.png'})
  console.log('PASS table filters: multi-choice, intersected columns, search, empty selection, reset, replaced rows, mobile and grouped costs')
} finally {await browser.close()}
