// All Supabase requests are mocked. No real stock, cost, or approval writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa-cultural@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const data={can_configure:true,families:[{code:'travaux',name:'Travaux culturaux',levels:1,alert_days:15},{code:'amendement',name:'Amendement',levels:2,alert_days:15}],farms:[{id:'f1',name:'Ferme QA',can_plan:true,can_execute:true,can_validate:true}],campaigns:[{id:'c1',name:'Campagne QA',farm_id:'f1'}],plantings:[{id:'t1',campaign_id:'c1',farm_id:'f1',name:'Serre QA',area:10000,variety:'Tomate QA'}],warehouses:[{id:'w1',farm_id:'f1',name:'Entrepôt QA'},{id:'w2',farm_id:'other',name:'Entrepôt autre ferme'}],items:[{id:'i1',name:'Engrais QA',unit:'kg'}],recipes:[],forecast:[],programs:[]}
let first=true,ids=[],confirmations=0,mobileDecisions=0
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
  else if(url.pathname.endsWith('/cultural_workspace'))result=data
  else if(url.pathname.endsWith('/save_cultural_program')){
   const {p_id,p_input}=route.request().postDataJSON();ids.push(p_id)
   if(p_input.domain_id!==domain||p_input.products[0].dose!==1.25||p_input.dates.length!==3)throw Error('Wrong creation payload')
   if(first){first=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Réponse incertaine QA'})});return}
   data.programs=[{id:p_id,...p_input,input:p_input,products:[{...p_input.products[0],name:'Engrais QA',unit:'kg',quantity:1.25}],targets:[{planting_id:'t1',area:10000,greenhouse:'Serre QA'}],requested_by:uid,status:'brouillon',current_level:1,required_levels:2,can_review:false,occurrences:p_input.dates.map((planned_at,i)=>({id:`o${i}`,planned_at})),audit:[]}];result=p_id
  }else if(url.pathname.endsWith('/cultural_action')){
   const p=route.request().postDataJSON(),program=data.programs[0]
   if(p.p_action==='submit'){program.status='soumise';data.forecast=[{program_id:program.id,occurrence_id:'o2',missing:1,product:'Engrais QA',unit:'kg',item:'i1'}]}
   else if(p.p_action==='approve'){program.status='approuvee';program.can_review=false}
   else throw Error('Unexpected action');result=null
  }else if(url.pathname.endsWith('/confirm_cultural_occurrence')){
   const {p_id,p_actual}=route.request().postDataJSON();if(p_actual.products[0].quantity!==1.5||p_actual.deviation_reason!=='Quantité réellement pesée')throw Error('Wrong actual quantities')
   confirmations++;Object.assign(data.programs[0].occurrences.find(o=>o.id===p_id),{actual:p_actual,performed_at:p_actual.performed_at,confirmed_at:new Date().toISOString()});result=null
  }else if(url.pathname.endsWith('/mobile_approval_items')){
   result=mobileDecisions?[]:[{id:'mobile1',kind:'cultural',process:'cultural',domain_id:domain,company:'Client QA',reference:'Nutrition QA',level:2,levels:2,created_at:new Date().toISOString(),requester:'Autre responsable',farm:'Ferme QA',entity:{family:'Nutrition',notes:'Consignes de nutrition',water_liters:2000,warehouse:'Entrepôt QA',targets:[{planting_id:'t1',greenhouse:'Serre QA',area:10000}],dates:['2027-01-01T09:00:00Z']},lines:[{product_name:'Engrais QA',planned_quantity:1.5,unit:'kg'}],history:[],href:'/interventions/programmes?programme=mobile1'}]
  }else if(url.pathname.endsWith('/mobile_review')){const p=route.request().postDataJSON();if(p.p_kind!=='cultural'||p.p_level!==2)throw Error('Wrong mobile level');mobileDecisions++;result=null}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
 })
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto('http://localhost:3001/interventions/programmes',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Nouvelle intervention'}).click()
 await page.getByLabel('Titre',{exact:true}).fill('Programme QA')
 await page.getByLabel('Famille',{exact:true}).selectOption('amendement')
 await page.getByLabel('Ferme',{exact:true}).selectOption('f1');await page.getByLabel('Campagne',{exact:true}).selectOption('c1')
 await page.getByRole('checkbox',{name:/Serre QA/}).check()
 await page.getByLabel('Consignes',{exact:true}).fill('Consignes QA validées')
 await page.getByLabel('Planification',{exact:true}).selectOption('recurring')
 await page.getByLabel('Date 1',{exact:true}).fill('2027-01-01T10:00')
 await page.getByLabel('Occurrences',{exact:true}).fill('3')
 await page.getByRole('button',{name:'Ajouter un produit / consommable'}).click()
 await page.getByLabel('Produit 1',{exact:true}).selectOption('i1');await page.getByLabel('Dose 1',{exact:true}).fill('1,25')
 await expect(page.getByLabel('Entrepôt',{exact:true}).locator('option')).toHaveCount(2)
 await page.getByLabel('Entrepôt',{exact:true}).selectOption('w1')
 await page.getByRole('checkbox',{name:/Je confirme que ces produits/}).check()
 await page.getByRole('button',{name:'Enregistrer le brouillon'}).click()
 await page.getByRole('button',{name:'Réessayer le même programme'}).click()
 await expect.poll(()=>ids.length).toBe(2)
 if(ids[0]!==ids[1])throw Error('Retry id mismatch')
 await page.getByRole('button',{name:'Soumettre',exact:true}).click()
 await expect(page.getByText(/En attente d’une autre personne/)).toBeVisible()
 await expect(page.getByRole('button',{name:/Approuver niveau/})).toHaveCount(0)
 await expect(page.getByText(/À approvisionner : Engrais QA/)).toBeVisible()
 data.programs[0].requested_by='other';data.programs[0].can_review=true
 await page.locator('.modal-close').click();await page.getByRole('button',{name:'Actualiser',exact:true}).click()
 await page.getByRole('button',{name:'Ouvrir Programme QA'}).click();await page.getByRole('button',{name:'Approuver niveau 1'}).click()
 await page.getByRole('button',{name:'Confirmer le réel',exact:true}).first().click()
 await page.getByLabel('Date réelle',{exact:true}).fill(new Date(Date.now()-60000).toISOString().slice(0,16))
 await page.getByRole('checkbox',{name:/Ajuster manuellement/}).check()
 await page.getByLabel('Quantité réelle Engrais QA',{exact:true}).fill('1,50')
 await page.getByLabel('Justificatif',{exact:true}).fill('Quantité réellement pesée')
 await page.getByLabel('Observation',{exact:true}).fill('Travaux réalisés QA')
 await page.getByRole('checkbox',{name:/Je confirme la réalisation/}).check()
 await page.getByRole('button',{name:'Confirmer les consommations'}).click()
 await expect(page.getByText(/Réalisée/).first()).toBeVisible();if(confirmations!==1)throw Error('Confirmation count')
 await page.locator('.modal-close').click();await page.setViewportSize({width:390,height:844})
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 await page.goto('http://localhost:3001/validations',{waitUntil:'domcontentloaded',timeout:60000})
 await expect(page.getByRole('heading',{name:'Nutrition QA',exact:true})).toBeVisible()
 await expect(page.getByText('Consignes de nutrition',{exact:true})).toBeVisible()
 await expect(page.getByText(/Niveau 2 \/ 2/)).toBeVisible()
 await page.getByRole('textbox').fill('non');await page.getByRole('button',{name:'Refuser',exact:true}).click()
 await expect(page.getByRole('alert').filter({hasText:'5 caractères'})).toBeVisible()
 await page.getByRole('button',{name:'Approuver',exact:true}).click()
 await expect(page.getByText('Aucune demande à valider avec vos habilitations actuelles.')).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 if(mobileDecisions!==1||errors.length)throw Error(errors.join('\n')||'Wrong mobile decision count')
 console.log('PASS cultural UI: create, dates, unit/quantity, farm warehouse, retry, shortage, self-approval hidden, actual, 390px mobile N2 review; mocked backend only.')
}finally{await browser.close()}
