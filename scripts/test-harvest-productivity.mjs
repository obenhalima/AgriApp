// Browser test: all Supabase calls intercepted; no shared database writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333'
const user={id:uid,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let rows=[],targets=[],writes=0
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;let data=[]
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA'},roles:{name:'Admin'}}]
  else if(path.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(path.endsWith('/farms'))data=[{id:'f',name:'Ferme QA'}]
  else if(path.endsWith('/campaigns'))data=[{id:'c',name:'Campagne QA',status:'en_cours'}]
  else if(path.endsWith('/greenhouses')){
   const query=new URL(route.request().url()).searchParams
   expect(query.has('domain_id')).toBe(false)
   expect(query.get('farms.domain_id')).toBe(`eq.${domain}`)
   expect(query.get('select')).toContain('farms!inner(domain_id)')
   data=[{id:'g',code:'S01',farm_id:'f'}]
  }
  else if(path.endsWith('/campaign_plantings'))data=[{id:'p',campaign_id:'c',greenhouse_id:'g'}]
  else if(path.endsWith('/harvests'))data=[{id:'h',lot_number:'LOT-QA',harvest_date:'2026-09-21',total_qty:2400,campaign_planting_id:'p'}]
  else if(path.endsWith('/teams'))data=[{id:'t',name:'Équipe QA',farm_id:'f'},{id:'other',name:'Équipe autre ferme',farm_id:'f2'}]
  else if(path.endsWith('/harvest_labor_targets'))data=targets
  else if(path.endsWith('/harvest_labor_allocations'))data=rows
  else if(path.endsWith('/set_harvest_labor_target')){
   const b=route.request().postDataJSON();expect(b.p_rate).toBe(50)
   targets=[{id:'target',farm_id:b.p_farm,effective_from:b.p_from,kg_per_person_hour:b.p_rate}];data='target'
  }else if(path.endsWith('/record_harvest_labor')){
   const b=route.request().postDataJSON();expect(b).toMatchObject({p_harvest:'h',p_team:'t',p_count:8,p_hours:5,p_kg:2400});writes++
   rows=[{id:b.p_id,harvest_id:'h',farm_id:'f',greenhouse_id:'g',campaign_id:'c',team_id:'t',work_date:'2026-09-21',worker_count:8,hours_per_person:5,person_hours:40,quantity_kg:2400,target_rate:50}];data=b.p_id
  }else if(path.endsWith('/cancel_harvest_labor')){rows=rows.map(r=>({...r,cancelled_at:new Date().toISOString()}));data=null}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
 await page.goto('http://localhost:3001/pointage/recolte',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Historique / mode avancé par équipe'}).click()
 await expect(page.getByLabel('Campagne')).toHaveValue('c',{timeout:60000})
 await page.getByText('Objectifs de récolte par ferme',{exact:true}).click()
 await page.getByLabel('Ferme de l’objectif').selectOption('f')
 await page.getByLabel('Date d’effet').fill('2026-09-01')
 await page.getByLabel('Objectif kg/h-personne').fill('50')
 await page.getByRole('button',{name:'Enregistrer l’objectif',exact:true}).click()
 await expect(page.getByText('Nouvelle version de l’objectif enregistrée.',{exact:true})).toBeVisible()
 await page.getByLabel('Récolte *').selectOption('h')
 await expect(page.getByRole('combobox',{name:/^Équipe \*/}).locator('option')).toHaveCount(2)
 await page.getByRole('combobox',{name:/^Équipe \*/}).selectOption('t')
 await page.getByLabel('Effectif présent').fill('8')
 await page.getByLabel('Heures travaillées par personne').fill('5')
 await page.getByLabel('Kilos de cette récolte').fill('2401')
 await page.getByRole('button',{name:'Enregistrer le pointage récolte'}).click()
 await expect(page.locator('main').getByRole('alert')).toContainText('solde disponible');expect(writes).toBe(0)
 await page.getByLabel('Kilos de cette récolte').fill('2400')
 await page.getByRole('button',{name:'Enregistrer le pointage récolte'}).click()
 await expect(page.getByText('120,00 %',{exact:true}).first()).toBeVisible();expect(writes).toBe(1)
 await page.setViewportSize({width:390,height:844})
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 await page.screenshot({path:'outputs/harvest-productivity-mobile.png',fullPage:true})
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'Annuler',exact:true}).click()
 await expect(page.getByText('Attribution annulée ; historique conservé.',{exact:true})).toBeVisible()
 await expect(page.getByText('Aucun pointage récolte rapproché sur ce périmètre.',{exact:true})).toBeVisible()
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS harvest team objective, scope, allocation, overflow validation, mobile and cancellation. Mocked backend only.')
}finally{await browser.close()}
