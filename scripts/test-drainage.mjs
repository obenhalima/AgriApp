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
  else if(url.pathname.endsWith('/farms')){if(url.searchParams.get('domain_id')!==`eq.${domain}`)throw Error('Unscoped farms');result=data.farms}
  else if(url.pathname.endsWith('/greenhouses')){if(url.searchParams.get('farms.domain_id')!==`eq.${domain}`)throw Error('Unscoped greenhouses');result=[{id:'g1',farm_id:'f1',name:'Serre QA'},{id:'g2',farm_id:'f1',name:'Serre 2'}]}
  else if(url.pathname.endsWith('/irrigation_workspace'))result={farms:data.farms,greenhouses:[{id:'g1',farm_id:'f1',name:'Serre QA'}]}
  else if(url.pathname.endsWith('/fertigation_workspace'))result=data
  else if(url.pathname.endsWith('/cultural_workspace'))result={...data,farms:data.farms.map(f=>({...f,can_plan:f.can_prepare})),families:[{code:'fertigation',name:'Fertigation'}],campaigns:[],plantings:[],programs:[{id:'p1',family:'fertigation',title:'Fertigation QA',farm_id:'f1',recipe_id:'recipe1',targets:[{greenhouse_id:'g1'}],products:[{name:'Engrais QA'}],occurrences:[{id:'o1',planned_at:'2026-09-22T09:00:00Z',confirmed_at:null}]}],forecast:[],can_configure:false}
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

 await page.goto('http://localhost:3001/interventions/drainage',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByLabel('Ferme drainage').selectOption('f1')
 await expect(page.getByLabel('Station drainage')).toHaveCount(0)
 await page.getByLabel('Unité volumes').selectOption('mL')
 await page.getByLabel('Serre drainage').selectOption('g1')
 await page.getByRole('button',{name:'Ajouter un relevé'}).click()
 await page.getByLabel('Heure 1',{exact:true}).fill('09:00')
 await page.getByLabel('Volume goutteur 1',{exact:true}).fill('100')
 await page.getByLabel('Volume drain 1',{exact:true}).fill('0')
 await page.getByLabel('Drainage (%) 1',{exact:true}).fill('0')
 await page.getByRole('button',{name:'Ajouter un relevé'}).click()
 await page.getByLabel('Heure 2',{exact:true}).fill('12:00')
 await page.getByLabel('Volume goutteur 2',{exact:true}).fill('300')
 await page.getByLabel('Volume drain 2',{exact:true}).fill('1500')
 await page.getByLabel('Drainage (%) 2',{exact:true}).fill('32,5')
 await expect(page.getByText('32,50 %',{exact:true}).first()).toBeVisible()
 const day=await page.getByLabel('Date drainage',{exact:true}).inputValue()
 await page.getByLabel('Serre drainage').selectOption('g2')
 await expect(page.getByLabel('Volume drain 1',{exact:true})).toHaveCount(0)
 await page.getByLabel('Serre drainage').selectOption('g1')
 await expect(page.getByLabel('Volume drain 1',{exact:true})).toHaveValue('0')
 await page.getByLabel('Date drainage',{exact:true}).fill('2026-01-02')
 await expect(page.getByLabel('Volume drain 1',{exact:true})).toHaveCount(0)
 await page.getByLabel('Date drainage',{exact:true}).fill(day)
 await expect(page.getByLabel('Volume drain 1',{exact:true})).toHaveValue('0')
 await page.getByRole('button',{name:'Enregistrer la saisie',exact:true}).click()
 await page.reload({waitUntil:'domcontentloaded'})
 await expect(page.getByLabel('Volume drain 1',{exact:true})).toHaveValue('0')
 await expect(page.getByText('32,50 %',{exact:true}).first()).toBeVisible()
 await page.screenshot({path:'outputs/drainage-screen.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 await page.goto('http://localhost:3001/interventions/drainage?domain='+domain+'&occurrence=o1')
 await expect(page.getByLabel('Ferme drainage')).toHaveValue('f1')
 await expect(page.getByLabel('Ferme drainage')).toBeDisabled()
 await expect(page.getByLabel('Serre drainage')).toHaveValue('g1')
 await expect(page.getByLabel('Serre drainage').locator('option[value="g2"]')).toHaveCount(0)
 await expect(page.getByText('Produits du programme : Engrais QA',{exact:true})).toBeVisible()
 await page.getByLabel('Unité volumes').selectOption('mL')
 await page.getByRole('button',{name:'Ajouter un relevé',exact:true}).click()
 await page.getByRole('button',{name:'Sauvegarder le brouillon'}).click()
 const saved=await page.evaluate(()=>Object.entries(localStorage).find(([k])=>k.endsWith(':occurrence:o1'))?.[1])
 if(!saved||JSON.parse(saved).rows[0].intervention.occurrenceId!=='o1')throw Error('Missing occurrence link')
 page.once('dialog',dialog=>dialog.dismiss())
 await page.getByRole('button',{name:'Supprimer le relevé 1',exact:true}).click()
 await expect(page.getByLabel('Heure 1',{exact:true})).toHaveCount(1)
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Supprimer le relevé 1',exact:true}).click()
 await expect(page.getByLabel('Heure 1',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Enregistrer la saisie',exact:true}).click()
 await page.reload({waitUntil:'domcontentloaded'})
 await expect(page.getByLabel('Ferme drainage')).toHaveValue('f1')
 await expect(page.getByLabel('Heure 1',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Ouvrir l’intervention et ses consommations'})).toHaveAttribute('href',new RegExp('programme=p1'))
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS drainage: manual entries, weighted zero, local persistence, mobile. Mocked backend only.')
}finally{await browser.close()}
