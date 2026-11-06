// Focus regression: mocked Supabase only, no stock writes.
import { chromium, expect as baseExpect } from '@playwright/test'
const expect=baseExpect.configure({timeout:90000})
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
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3004')+'/stocks',{waitUntil:'domcontentloaded',timeout:120000})

  const {createRequire}=await import('node:module')
  const {resolve}=await import('node:path')
  const translated={}
  const compiled=ts.transpileModule(fs.readFileSync('lib/i18nCatalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
  new Function('exports','require',compiled)(translated,createRequire(resolve('lib/i18nCatalog.cjs')))
  const base=process.env.TEST_BASE_URL||'http://localhost:3004'
  for(const locale of ['en','ar']){
    const t=source=>translated.translate(locale,source)
    await page.goto(base+'/stocks',{waitUntil:'domcontentloaded',timeout:120000})
    await page.locator('select').filter({has:page.locator('option[value="ar"]')}).selectOption(locale)
    await expect(page.locator('html')).toHaveAttribute('lang',locale)
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr')
    await page.getByRole('button',{name:t('Sortie'),exact:true}).first().click()
    await expect(page.getByText(t('Note de sortie (facultatif)'),{exact:true})).toBeVisible()
    await expect(page.getByText(t('La validation du responsable déduira le stock et générera les coûts si le prix est connu.'),{exact:true})).toBeVisible()
    await page.screenshot({path:'outputs/i18n-stock-'+locale+'.png',fullPage:true})
    await page.getByRole('button',{name:t('Fermer la fenêtre'),exact:true}).click()
    await page.goto(base+'/couts/reel',{waitUntil:'domcontentloaded',timeout:120000})
    await page.getByRole('main').getByRole('button',{name:t('⇓ Tout déplier'),exact:true}).click()
    const details=page.getByRole('button',{name:t('Voir les détails'),exact:true}).first()
    await details.evaluate(button=>button.scrollIntoView({block:'center',inline:'center'}))
    await details.click()
    const dialog=page.getByRole('dialog',{name:t('Détails du coût')})
    await expect(dialog).toContainText(t('Identifiant du coût'))
    await expect(dialog).toContainText(t('Au prorata des surfaces plantées'))
    await expect(dialog).toContainText(t('Mouvement de stock à l’origine du coût'))
    await expect(dialog).toContainText('SORTIE-TEST')
    await page.screenshot({path:'outputs/i18n-cost-'+locale+'.png',fullPage:true})
    await page.getByRole('button',{name:t('Fermer la fenêtre'),exact:true}).click()
    await page.goto(base+'/stocks/reprise',{waitUntil:'domcontentloaded',timeout:120000})
    await expect(page.getByRole('heading',{name:new RegExp(t('Articles et stock initial'))})).toBeVisible()
    await page.goto(base+'/guide?screen=/recoltes',{waitUntil:'domcontentloaded',timeout:120000})
    const wiki=page.locator('#wiki-search')
    await expect(wiki).toBeVisible()
    await expect(page.getByText(t('De la récolte à l’encaissement'),{exact:true})).toBeVisible()
    await expect(page.getByText(t('Un lot de récolte est enregistré. Le poids issu des plateaux est une estimation, pas une pesée station.'),{exact:false})).toBeVisible()
    await wiki.fill(t('Date réelle de la récolte, utilisée pour les historiques et les regroupements par jour ou semaine.').split(' ').slice(0,3).join(' '))
    await expect(page.getByRole('button',{name:new RegExp(t('Récoltes'))}).first()).toBeVisible()
    await wiki.fill('')
    await page.screenshot({path:'outputs/i18n-guide-'+locale+'.png',fullPage:true})
    console.log('PASS translated stock, cost details, initialization and searchable wiki '+locale)
  }
  if(errors.length)throw Error(errors.join('\n'))
} finally {await browser.close()}
