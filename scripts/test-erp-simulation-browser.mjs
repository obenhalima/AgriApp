// Isolated browser with fabricated identity and intercepted Supabase responses.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const host=new URL(dotenv.parse(fs.readFileSync('.env.local')).NEXT_PUBLIC_SUPABASE_URL).hostname
const base=process.env.TEST_BASE_URL||'http://localhost:3104'
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='cccccccc-cccc-4ccc-8ccc-cccccccccccc',domain='11111111-1111-4111-8111-111111111111'
const user={id:uid,email:'erp-fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:uid,exp,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1300,height:1000}})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}})
 let external=0
 await context.route('**/api/integrations/docindex/local?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({space:'',enabled:false,hasKey:false,remoteId:null,status:null,events:[]})}))
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
 const page=await context.newPage()
 await page.goto(base+'/factures/integrations',{waitUntil:'networkidle'})
 await expect(page.getByRole('heading',{name:'Intégrations — DocIndex et ERP'})).toBeVisible()
 const validate=page.getByRole('button',{name:'Valider une facture fictive',exact:true})
 await expect(validate).toBeDisabled()
 await page.getByLabel('Activer la simulation pour ce destinataire').check()
 await page.getByRole('button',{name:'Enregistrer les paramètres locaux'}).click()
 await validate.click()
 await expect(page.getByText('Réception simulée — à vérifier humainement',{exact:false})).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'Renvoyer en simulation'}).click()
 await expect(page.getByText('2 tentative(s)',{exact:false})).toBeVisible({timeout:15000})
 await page.locator('select:has(option[value="fixture-recipient-A"])').selectOption('fixture-recipient-B')
 await expect(validate).toBeDisabled()
 await expect(page.getByText('Aucune transmission simulée.',{exact:true})).toBeVisible()
 await page.getByLabel('Activer la simulation pour ce destinataire').check()
 await page.getByLabel('Simuler une panne du destinataire').check()
 await validate.click()
 await expect(page.getByText('Échec simulé — renvoi possible',{exact:false})).toBeVisible({timeout:15000})
 await page.getByLabel('Simuler une panne du destinataire').uncheck()
 await page.getByRole('button',{name:'Renvoyer en simulation'}).click()
 await expect(page.getByText('Réception simulée — à vérifier humainement',{exact:false})).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'Vérifier l’exclusion de l’historique'}).click()
 await expect(page.locator('p[role="alert"]')).toContainText('Historique ignoré')
 await page.reload({waitUntil:'networkidle'})
 await expect(page.getByText('Réception simulée — à vérifier humainement',{exact:false})).toBeVisible()
 expect(external).toBe(0)
 fs.mkdirSync('tmp/erp-simulation',{recursive:true})
 await page.screenshot({path:'tmp/erp-simulation/workbench.png',fullPage:true})
 console.log('PASS disabled default, validation, resend, recipient isolation, failure recovery, persistence, no history scan, ZERO DocIndex calls. Fixtures only.')
}finally{await browser.close()}
