// UI regression with intercepted Supabase HTTP calls; no real business writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-irrigation@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const data={validation_enabled:true,can_configure:true,farms:[{id:'f1',name:'Ferme QA',can_plan:true,can_validate:true,can_execute:true}],campaigns:[{id:'c1',farm_id:'f1',name:'Campagne QA'}],greenhouses:[{id:'g1',farm_id:'f1',name:'Serre QA',area:10000}],programs:[]}
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
  else if(url.pathname.endsWith('/irrigation_workspace')){if(route.request().postDataJSON().p_domain!==domain)throw Error('Domain missing');result=data}
  else if(url.pathname.endsWith('/save_irrigation_program')){
   const {p_id,p_input}=route.request().postDataJSON();ids.push(p_id)
   if(p_input.water.volume!==1200.5||p_input.dates.length!==3||p_input.greenhouse_ids[0]!=='g1')throw Error('Incorrect irrigation payload')
   if(fail){fail=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Erreur simulée : réessayer sans doublon'})});return}
   data.programs=[{id:p_id,...p_input,requested_by:uid,status:'brouillon',planned_liters:1200.5,input:p_input,requester:'QA',audit:[],occurrences:p_input.dates.map((planned_at,i)=>({id:`o${i}`,planned_at}))}];result=p_id
  }else if(url.pathname.endsWith('/irrigation_program_action')){const p=route.request().postDataJSON();if(!['submit','approve'].includes(p.p_action))throw Error('Unexpected action');data.programs[0].status=p.p_action==='submit'?'soumise':'approuvee';result=null}
  else if(url.pathname.endsWith('/confirm_irrigation_occurrence')){const {p_id,p_data}=route.request().postDataJSON();if(p_data.water.before!==100||p_data.water.after!==102.5||p_data.water.mode!=='meter')throw Error('Wrong measured water payload');Object.assign(data.programs[0].occurrences.find(o=>o.id===p_id),{actual_liters:2500,actual_data:p_data,confirmed_at:new Date().toISOString()});result=null}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3001/interventions',{waitUntil:'domcontentloaded',timeout:120000})
 try {await page.getByRole('button',{name:'Programme d’irrigation',exact:true}).click()} catch(e) {console.log('UI diagnostics:',page.url(),(await page.locator('body').innerText()).slice(0,5500),errors);throw e}
 const group=label=>page.locator('.form-group').filter({has:page.locator('.form-label',{hasText:label})})
 await group(/^Titre/).locator('input').fill('Irrigation recette')
 await group(/^Ferme/).locator('select').selectOption('f1')
 await group(/^Campagne/).locator('select').selectOption('c1')
 await page.getByLabel('Sélectionner toutes les serres').check()
 await group(/^Source d’eau/).locator('input').fill('Bassin QA')
 await group(/^Planification/).locator('select').selectOption('recurring')
 await page.getByLabel('Date prévue 1').fill('2027-01-31T10:00')
 await group(/^Fréquence/).locator('select').selectOption('monthly')
 await group(/^Occurrences/).locator('input').fill('3')
 await group(/^Volume global/).locator('input').fill('1 200,50')
 await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'Erreur simulée'}).last()).toBeVisible()
 await page.getByRole('button',{name:'Réessayer le même enregistrement'}).click()
 await page.getByRole('button',{name:'Soumettre le programme'}).click()
 await expect(page.getByText('Une autre personne habilitée doit valider ce programme.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Approuver le programme',exact:true})).toHaveCount(0)
 if(ids.length!==2||ids[0]!==ids[1])throw Error('Retry lost idempotency')
 // Simulate a different requester for UI review; distinct-user authorization is tested in SQL.
 data.programs[0].requested_by='another-prescriber'
 await page.locator('.modal-close').click()
 await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await page.getByRole('button',{name:'Ouvrir',exact:true}).click()
 page.on('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Approuver le programme',exact:true}).click()
 await page.getByRole('button',{name:'Confirmer le réalisé',exact:true}).first().click()
 await group(/^Date et heure réelles/).locator('input').fill(new Date(Date.now()-60000).toISOString().slice(0,16))
 await group(/^Compteur avant/).locator('input').fill('100')
 await group(/^Compteur après/).locator('input').fill('102,5')
 await group(/^Observation/).locator('textarea').fill('Compteur relevé après irrigation')
 await page.getByRole('button',{name:'Confirmer le réalisé',exact:true}).click()
 await expect(page.getByText('Compteur relevé après irrigation', {exact:true})).toBeVisible()
 await page.setViewportSize({width:390,height:844})
 await expect(page.getByText('Compteur relevé après irrigation', {exact:true})).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),{timeout:5000}).toBe(true)
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)){
  console.log('Overflow:',await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(-15).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),right:e.getBoundingClientRect().right}))))
  fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:'outputs/irrigation-mobile.png',fullPage:true});throw Error('Mobile page overflows')
 }
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS UI irrigation: dates, decimal comma, same retry ID, self-approval hidden, approval and meter confirmation, mobile 390px; mocked backend only.')
}finally{await browser.close()}
