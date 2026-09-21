// Focus regression: mocked Supabase only, no stock writes.
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env = dotenv.parse(fs.readFileSync('.env.local'))
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid = '11111111-1111-4111-8111-111111111111', domain = '22222222-2222-4222-8222-222222222222', role = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, email: 'qa-focus@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const expires = Math.floor(Date.now()/1000)+3600
const token = [{alg:'HS256',typ:'JWT'},{sub:uid,exp:expires,role:'authenticated'},'qa'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const browser = await chromium.launch({channel:'msedge',headless:true})
try {
  const context = await browser.newContext({serviceWorkers:'block'})
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:expires,expires_in:3600,token_type:'bearer',user}})
  await context.route(`https://${host}/**`,async route=>{
    const path = new URL(route.request().url()).pathname
    let result=[]
    if(path==='/auth/v1/user') result=user
    else if(path.endsWith('/profiles')) result=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
    else if(path.endsWith('/domain_memberships')) result=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'QA',code:'QA'},roles:{name:'Admin'}}]
    else if(path.endsWith('/roles')) result=[{id:role,name:'Admin',is_admin:true,is_active:true}]
    else if(path.endsWith('/stock_items')) result=[{id:'qa-stock',code:'QA-001',name:'Article QA',category:'engrais',unit:'kg',current_qty:0,min_qty:0,unit_cost:12,is_active:true}]
    if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(result)) result=result[0]||null
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)})
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.setDefaultTimeout(20000)
  await page.goto('http://localhost:3001/stocks',{waitUntil:'domcontentloaded',timeout:120000})
  await page.getByRole('button',{name:/NOUVEL ARTICLE/i}).first().click()
  async function checkFields() {
    const modal=page.locator('.modal-box')
    for(const [selector,value] of [['input[placeholder="NPK 20-20-20"]','Engrais test'],['input[placeholder="100"]','123'],['input[placeholder="12.50"]','12.50'],['input[placeholder="Entrepôt A / Rayon 3"]','Rayon ABC']]) {
      const input=modal.locator(selector)
      await input.fill('')
      await input.pressSequentially(value,{delay:60})
      await expect(input).toBeFocused()
      await expect(input).toHaveValue(value)
    }
    await expect(modal.locator('input[placeholder="NPK 20-20-20"]')).toHaveValue('Engrais test')
  }
  await checkFields()
  await page.getByRole('button',{name:'ANNULER',exact:true}).click()
  await page.locator('tr').filter({hasText:'Article QA'}).getByRole('button').last().click()
  await checkFields()
  if(errors.length) throw Error(errors.join('\n'))
  console.log('PASS stock form: creation and edit retain focus and complete values during typing. Mocked HTTP only.')
} finally { await browser.close() }
