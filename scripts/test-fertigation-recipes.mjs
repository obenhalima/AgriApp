// Browser regression, all Supabase HTTP mocked. No business writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-fertigation@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const data={farms:[{id:'f1',name:'Ferme QA',can_prepare:true},{id:'f2',name:'Autre ferme',can_prepare:false}],warehouses:[{id:'w1',farm_id:'f1',name:'Entrepôt QA'},{id:'w2',farm_id:'f2',name:'Autre entrepôt'}],items:[{id:'i1',name:'Engrais QA',unit:'kg'},{id:'i2',name:'Engrais liquide QA',unit:'L'},{id:'i3',name:'Article en sac',unit:'sac'}],recipes:[]}
const ids=[];let fail=true
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1366,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let result=[]
  if(url.pathname==='/auth/v1/user')result=user
  else if(url.pathname.endsWith('/profiles'))result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/fertigation_workspace'))result=data
  else if(url.pathname.endsWith('/cultural_workspace'))result={...data,farms:data.farms.map(f=>({...f,can_plan:f.can_prepare})),families:[{code:'fertigation',name:'Fertigation'}],campaigns:[],plantings:[],programs:[],forecast:[],can_configure:false}
  else if(url.pathname.endsWith('/save_fertigation_recipe')){
   const {p_id,p_input}=route.request().postDataJSON();ids.push(p_id)
   if(p_input.lines[0].dose!==1.25||p_input.lines[0].dose_unit!=='kg_m3'||p_input.basis!=='final_solution'||p_input.domain_id!==domain)throw Error('Wrong recipe payload')
   if(fail){fail=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Erreur simulée : réessayer'})});return}
   data.recipes=[{id:p_id,...p_input,created_at:new Date().toISOString(),lines:p_input.lines.map(l=>({...l,name:'Engrais QA',stock_unit:'kg'}))}];result=p_id
  }else if(url.pathname.endsWith('/preview_fertigation_recipe')){
   const p=route.request().postDataJSON();if(p.p_farm!=='f1'||p.p_warehouse!=='w1'||p.p_liters!==10000||p.p_domain!==domain)throw Error('Wrong simulation scope')
   result={liters:10000,calculated_at:new Date().toISOString(),lines:[{stock_item_id:'i1',name:'Engrais QA',stock_unit:'kg',quantity:12.5,available:5,missing:7.5}]}
  }
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
 page.on('console',message=>{if(message.type()==='error')console.log('Browser:',message.text())})
 await page.goto('http://localhost:3001/interventions/fertigation',{waitUntil:'domcontentloaded',timeout:120000})
 try{await page.getByLabel('Ferme *',{exact:true}).selectOption('f1')}catch(e){console.log('Diagnostics',page.url(),(await page.locator('body').innerText()).slice(0,6000),errors);throw e}
 await page.getByLabel('Nom de la recette *').fill('Recette QA')
 await page.getByLabel('Engrais 1 *',{exact:true}).selectOption('i1')
 await expect(page.getByLabel('Unité de concentration 1').locator('option')).toHaveCount(2)
 await page.getByLabel('Concentration 1 *',{exact:true}).fill('1,25')
 await page.getByLabel('Volume global de solution finale (L) *').fill('10 000')
 await expect(page.getByLabel('Entrepôt de la ferme *').locator('option')).toHaveCount(2)
 await page.getByLabel('Entrepôt de la ferme *').selectOption('w1')
 await page.getByRole('button',{name:'Calculer et vérifier le stock'}).click()
 await expect(page.getByText(/À approvisionner : 7,50 kg/)).toBeVisible()
 await page.getByRole('button',{name:'Ajouter un engrais'}).click()
 await page.getByLabel('Engrais 2 *',{exact:true}).selectOption('i2')
 await page.getByRole('button',{name:'Supprimer l’engrais 2',exact:true}).click()
 await expect(page.getByLabel('Engrais 2 *',{exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Engrais 1 *',{exact:true})).toHaveValue('i1')
 await page.getByRole('button',{name:'Calculer et vérifier le stock'}).click()
 await page.getByRole('button',{name:'Supprimer l’engrais 1',exact:true}).click()
 await expect(page.getByText(/À approvisionner/)).toHaveCount(0)
 await expect(page.getByText(/Aucun engrais dans cette recette/)).toBeVisible()
 await page.getByRole('button',{name:'Enregistrer la recette',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'au moins un engrais'})).toBeVisible()
 await page.getByRole('button',{name:'Ajouter un engrais'}).click()
 await page.getByLabel('Engrais 1 *',{exact:true}).selectOption('i1')
 await page.getByLabel('Concentration 1 *',{exact:true}).fill('1,25')
 await page.getByLabel('Volume global de solution finale (L) *').fill('20 000')
 await expect(page.getByText(/À approvisionner/)).toHaveCount(0)
 await page.getByRole('button',{name:'Enregistrer la recette',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'Erreur simulée'})).toBeVisible()
 await expect(page.getByLabel('Concentration 1 *',{exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Réessayer le même enregistrement'}).click()
 await expect(page.getByRole('status')).toContainText('Recette enregistrée')
 if(ids.length!==2||ids[0]!==ids[1])throw Error('Non-idempotent retry')
 await expect(page.getByLabel('Solution à simuler')).toHaveValue(ids[0])
 await expect(page.getByRole('link',{name:'Planifier Recette QA',exact:true})).toBeVisible()
 await expect(page.getByLabel('Engrais 1 *',{exact:true})).toHaveValue('i1')
 await expect(page.getByLabel('Concentration 1 *',{exact:true})).toHaveValue('1,25')
 await page.getByLabel('Volume global de solution finale (L) *').fill('10000')
 await page.getByRole('button',{name:'Calculer et vérifier le stock'}).click()
 await expect(page.getByText(/À approvisionner : 7,50 kg/)).toBeVisible()
 if(ids.length!==2)throw Error('Simulation must not save a recipe')
 const planningHref=await page.getByRole('link',{name:'Planifier cette solution'}).getAttribute('href')
 await page.getByRole('button',{name:'Charger / copier Recette QA'}).click()
 await expect(page.getByLabel('Nom de la recette *')).toHaveValue('Recette QA — copie')
 await page.getByRole('textbox',{name:'Rechercher une recette'}).fill('introuvable')
 await expect(page.getByText('Aucune recette ne correspond à votre recherche.')).toBeVisible()
 await page.getByRole('textbox',{name:'Rechercher une recette'}).fill('')
 await expect(page.getByRole('navigation',{name:'Parcours fertigation'})).toBeVisible()
 await page.screenshot({path:'outputs/fertigation-redesign.png',fullPage:true})
 await page.getByLabel('Ferme *',{exact:true}).selectOption('f2')
 await expect(page.getByLabel('Solution à simuler')).toHaveValue('')
 await expect(page.getByLabel('Solution à simuler').locator('option')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Enregistrer la recette',exact:true})).toBeDisabled()
 await expect(page.getByLabel('Entrepôt de la ferme *')).toHaveValue('')
 await page.setViewportSize({width:390,height:844})
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),{timeout:5000}).toBe(true)
 await page.goto('http://localhost:3001'+planningHref,{waitUntil:'domcontentloaded',timeout:120000})
 await expect(page.getByLabel('Famille',{exact:true})).toHaveValue('fertigation')
 await expect(page.getByLabel('Ferme',{exact:true})).toHaveValue('f1')
 await expect(page.getByLabel('Eau prévue',{exact:true})).toHaveValue('10000')
 await expect(page.getByLabel('Entrepôt',{exact:true})).toHaveValue('w1')
 await expect(page.getByLabel('Titre',{exact:true})).toHaveValue('Recette QA')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS fertigation UI: scoped warehouses, compatible units, French decimals, stock warning, invalidated preview, retry same ID, copy, capability, mobile 390px. Mocked HTTP only.')
}finally{await browser.close()}
