// No real login or database writes: ALL Supabase requests are fixtures.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3102'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const domains=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
const user={id:uid,email:'qa-audit@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 for(const mode of ['admin','missing','reader']){
  const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
  let calls=0,slow=false
  await context.route(`https://${host}/**`,async route=>{
   const path=new URL(route.request().url()).pathname;let data=[],status=200
   if(path==='/auth/v1/user')data=user
   else if(path.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
   else if(path.endsWith('/domain_memberships'))data=domains.map((domain_id,i)=>({domain_id,role_id:role,is_default:i===0,domains:{name:'Client '+i,code:'QA'+i,is_active:true},roles:{name:'Admin'}}))
   else if(path.endsWith('/roles'))data=[{id:role,name:mode==='reader'?'Lecteur':'Admin',is_admin:mode!=='reader',is_active:true}]
   else if(path.endsWith('/role_permissions'))data=[{granted:true,permissions:{code:'users.view'}}]
   else if(path.endsWith('/audit_entity_history')){
    const b=route.request().postDataJSON();expect(domains).toContain(b.p_domain);expect(b.p_table).toBe('greenhouses')
    data={events:[{event_id:'tx:80000000-0000-4000-8000-000000000001',cursor_id:'80000000-0000-4000-8000-000000000001',occurred_at:'2026-10-15T10:00:00Z',actor_id:uid,actor_label:'QA Admin',action:'create',category:'transaction',table_name:'greenhouses',entity_id:b.p_entity||'80000000-0000-4000-8000-000000000003',transaction_id:'123',changed_fields:['code','name','total_area','farm_id'],before_values:null,after_values:{code:'S06',name:'S1',total_area:5000,farm_id:domains[0],_labels:{[domains[0]]:'Ferme Nord'}}}],has_more:false,total:1}
   }
   else if(path.endsWith('/audit_report')){
    calls++;const b=route.request().postDataJSON();expect(domains).toContain(b.p_domain)
    if(mode==='missing'){status=404;data={code:'PGRST202',message:'missing'}}
    else{
     const client=domains.indexOf(b.p_domain),more=Boolean(b.p_before),name=`Author client ${client}`
     const event=(n,action='create')=>({event_id:`tx:${client}-${n}`,occurred_at:`2026-10-15T10:00:0${n}Z`,actor_id:uid,actor_label:name,action,category:'transaction',table_name:'greenhouses',entity_id:`80000000-0000-4000-8000-00000000000${n}`,transaction_id:'123',changed_fields:['code','name','total_area'],before_values:null,after_values:{code:'S06',name:'S1',total_area:5000}})
     data={events:more?[event(1)]:[event(3),event(2,'validate')],has_more:!more,summary:{total:3,transactions:3,validations:1,logins:0,actors:1},coverage:['farms','greenhouses'],auth_source_present:true,started_at:'2026-10-15T09:00:00Z',unassigned_events:null,actor_options:[{actor_id:uid,actor_label:name}]}
     if(slow)await new Promise(r=>setTimeout(r,700))
    }
   }else if(route.request().method()!=='GET'&&!path.startsWith('/auth/'))throw Error('Unexpected write '+path)
   if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
   try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})}catch(error){if(!slow)throw error}
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/admin/audit',{waitUntil:'networkidle'})
  if(mode==='reader'){
   await expect(page.getByText('Rapport réservé aux administrateurs du client actif.')).toBeVisible();expect(calls).toBe(0)
  }else{
   await page.getByRole('button',{name:'Afficher le rapport',exact:true}).click()
   if(mode==='missing')await expect(page.locator('main [role="alert"]')).toContainText('Piste d’audit non activée')
   else{
    await expect(page.getByText('Lignes chargées / événements filtrés')).toContainText('2 / 3')
    await page.getByText('Voir les changements',{exact:true}).first().click()
    await expect(page.getByText('Surface totale',{exact:true}).first()).toBeVisible()
    await expect(page.getByText('5 000 m²',{exact:true}).first()).toBeVisible()
    await page.getByRole('button',{name:'Historique de cette fiche',exact:true}).first().click()
    const history=page.getByRole('dialog');await expect(history).toContainText('Historique de la fiche')
    await history.getByText('Voir les changements',{exact:true}).click()
    await expect(history.getByText('Ferme Nord',{exact:true})).toBeVisible()
    await history.getByRole('button',{name:'Fermer la fenêtre'}).click()
    await page.getByRole('button',{name:'Charger la suite'}).click()
    await expect(page.getByText('Lignes chargées / événements filtrés')).toContainText('3 / 3')
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter les lignes chargées (CSV)'}).click()
    const file=await download;expect(file.suggestedFilename()).toContain('audit-QA0')
    const stream=await file.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk)
    expect(Buffer.concat(chunks).toString('utf8')).toContain('Author client 0')
    slow=true
    await page.getByRole('button',{name:'Afficher le rapport',exact:true}).click()
    const selector=page.locator('select').filter({has:page.locator(`option[value="${domains[1]}"]`)})
    await selector.selectOption(domains[1]);await page.waitForTimeout(900)
    await expect(page.getByText('Author client 0',{exact:true})).toHaveCount(0)
    await page.getByRole('button',{name:'Afficher le rapport',exact:true}).click()
    await expect(page.getByRole('cell').filter({hasText:'Author client 1'}).first()).toBeVisible()
    await expect(page.getByText('Author client 0',{exact:true})).toHaveCount(0)
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
    await page.screenshot({path:'outputs/audit-report-mobile.png',fullPage:true})
    await page.goto(base+'/serres',{waitUntil:'networkidle'})
    await page.getByRole('button',{name:'Historique de ce module',exact:true}).click()
    await expect(page.getByRole('dialog')).toContainText('Historique du module')
    await page.getByRole('dialog').getByRole('button',{name:'Historique de cette fiche'}).click()
    await expect(page.getByRole('dialog')).toContainText('Historique de la fiche')
    await expect(page.getByRole('dialog')).toContainText('Code utilisateur (identifiant unique)')
    await expect(page.getByRole('dialog')).toContainText('Date et heure de l’action')
    await expect(page.getByRole('dialog')).toContainText('Africa/Casablanca')
    await page.getByRole('dialog').getByRole('button',{name:'Toutes les fiches du module'}).click()
    await expect(page.getByRole('dialog')).toContainText('Historique du module')
   }
  }
  expect(errors).toEqual([]);await context.close()
 }
 console.log('PASS audit: admin report, denied reader, missing migration, pagination, CSV, late-response tenant switch, mobile. Mocked backend only.')
}finally{await browser.close()}
