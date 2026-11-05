// UI test with isolated fictitious identity. Every API response is mocked.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname,base=process.env.TEST_BASE_URL||'http://localhost:3104'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',domain='11111111-1111-4111-8111-111111111111'
const user={id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1300,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 const receiptOnly=process.env.DOCINDEX_RECEIPT_ONLY==='1'
 const newFixtureOnly=process.env.DOCINDEX_NEW_FIXTURE_ONLY==='1'
 let external=0,sends=0,generated=0;const states=receiptOnly||newFixtureOnly?{'fixture-recipient-A':{space:'Espace fictif',enabled:true,hasKey:true,remoteId:'fixture-receipt',status:'received',events:[]}}:{}
 await context.route('https://docindex-phi.vercel.app/**',route=>{external++;return route.abort()})
 await context.route(`https://${host}/**`,async route=>{
  const path=new URL(route.request().url()).pathname;let data=[]
  if(path==='/auth/v1/user')data=user
  else if(path.endsWith('/profiles'))data=[{...user,full_name:'Administrateur fictif',role_id:role,is_active:true}]
  else if(path.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{code:'TEST',name:'Client fictif',is_active:true},roles:{name:'Admin',is_active:true}}]
  else if(path.endsWith('/roles'))data=[{id:role,is_admin:true,is_active:true}]
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 await context.route('**/api/integrations/docindex/local?**',async route=>{
  const recipient=new URL(route.request().url()).searchParams.get('recipient')
  let state=states[recipient]||{space:'',enabled:false,hasKey:false,remoteId:null,status:null,events:[]}
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON()
   if(body.action==='configure'){expect(body.apiKey).toBe('dik_fixture_only_123456');state={...state,space:body.space,enabled:body.enabled,hasKey:true}}
   else if(body.action==='new_fixture'){expect(body.confirmNew).toBe(true);generated++;state={...state,fixtureNumber:`DEMO-TEST-${generated}`,reference:`fixture-ref-${generated}`,remoteId:null,status:null}}
   else{expect(body.action).toBe('send_fixture');expect(body.confirmFictitious).toBe(true);sends++;state={...state,remoteId:'fixture-receipt',status:'to_review'}}
  }
  states[recipient]=state
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)})
 })
 const page=await context.newPage()
 await page.goto(base+'/factures/integrations',{waitUntil:'networkidle'})
 await expect(page.getByRole('heading',{name:'Configuration DocIndex',exact:true})).toBeVisible()
 await expect(page.getByRole('note')).toContainText('Environnement local — tests sur données fictives.')
 await expect(page.getByRole('heading',{name:'Simulation ERP — sans envoi externe',exact:true})).toBeVisible()
 if(newFixtureOnly){
  page.on('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Nouvelle facture fictive',exact:true}).click()
  await expect(page.getByText('DEMO-TEST-1',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Nouvelle facture fictive',exact:true}).click()
  await expect(page.getByText('DEMO-TEST-2',{exact:true})).toBeVisible()
  await page.reload({waitUntil:'networkidle'})
  await expect(page.getByText('DEMO-TEST-2',{exact:true})).toBeVisible()
  expect(generated).toBe(2);expect(sends).toBe(0);expect(external).toBe(0)
  console.log('PASS new fixture button, distinct numbers, persistence; ZERO send actions and ZERO external requests.')
 }else if(receiptOnly){
  await expect(page.getByRole('status').filter({hasText:'Facture reçue par DocIndex'})).toContainText('fixture-receipt')
  await expect(page.getByRole('status').filter({hasText:'Facture reçue par DocIndex'})).toContainText('Traitement non renseigné')
  expect(sends).toBe(0);expect(external).toBe(0)
  console.log('PASS receipt with no processing stage displayed as received. ZERO send actions; ZERO external requests.')
 }else{
 await page.getByLabel('Nom de l’espace DocIndex destinataire').fill('Espace de recette fictif')
 const secret=page.getByLabel('Clé API DocIndex',{exact:true})
 await secret.fill('dik_fixture_only_123456')
 await page.getByLabel('Activer la connexion DocIndex pour ce destinataire').check()
 await page.getByRole('button',{name:'Enregistrer la configuration sécurisée'}).click()
 await expect(secret).toHaveValue('')
 const stored=await page.evaluate(()=>JSON.stringify({...localStorage}))
 expect(stored).not.toContain('dik_fixture_only_123456')
 page.on('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Envoyer la facture fictive à DocIndex',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Facture reçue par DocIndex'})).toContainText('fixture-receipt')
 await page.getByRole('button',{name:'Renvoyer la même facture fictive à DocIndex'}).click()
 expect(sends).toBe(2);expect(external).toBe(0)
 await page.locator('select:has(option[value="fixture-recipient-A"])').selectOption('fixture-recipient-B')
 await expect(page.getByLabel('Nom de l’espace DocIndex destinataire')).toHaveValue('')
 await expect(page.getByRole('button',{name:'Envoyer la facture fictive à DocIndex',exact:true})).toBeDisabled()
 fs.mkdirSync('tmp/docindex-local',{recursive:true});await page.screenshot({path:'tmp/docindex-local/configuration.png',fullPage:true})
 console.log('PASS secure input cleared, no API key in browser storage, explicit send confirmation, receipt and resend, recipient isolation. Mock API; ZERO external transmissions.')
 }
}finally{await browser.close()}
