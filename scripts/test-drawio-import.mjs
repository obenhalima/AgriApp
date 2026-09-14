// Mocked browser acceptance tests. No writes to the real backend.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import ts from 'typescript'
import dotenv from 'dotenv'
import zlib from 'node:zlib'
const input=process.argv[2]
const xml=input?fs.readFileSync(input,'utf8'):'<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" parent="1" vertex="1" value="S1"><mxGeometry x="0" y="0" width="100" height="100"/></mxCell><mxCell id="b" parent="1" vertex="1" value="S2"><mxGeometry x="200" y="0" width="100" height="100"/></mxCell></root></mxGraphModel>'
const code=ts.transpileModule(fs.readFileSync('lib/drawioFarmPlan.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'')+'\nwindow.readDrawioPlan=readDrawioPlan;'
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const parser=await browser.newPage();await parser.addScriptTag({content:code})
 const plan=await parser.evaluate(xml=>window.readDrawioPlan(xml),xml)
 if(!plan.greenhouses.length)throw Error('No greenhouse')
 for(const invalid of ['<!DOCTYPE x><mxGraphModel/>',xml.replace('value="S2"','value="S1"')]){
  if(invalid===xml)continue
  if(await parser.evaluate(async text=>{try{await window.readDrawioPlan(text);return true}catch{return false}},invalid))throw Error('Unsafe or duplicate plan accepted')
 }
 const small='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" parent="1" vertex="1" value="S1"><mxGeometry width="100" height="100"/></mxCell></root></mxGraphModel>'
 const compressed='<mxfile><diagram>'+zlib.deflateRawSync(Buffer.from(encodeURIComponent(small))).toString('base64')+'</diagram></mxfile>'
 if((await parser.evaluate(xml=>window.readDrawioPlan(xml),compressed)).greenhouses.length!==1)throw Error('Compressed page failed')
 await parser.close()
 const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
 const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333',farm='44444444-4444-4444-8444-444444444444'
 const user={id:uid,email:'qa-drawio@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
 const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
 let greenhouses=plan.greenhouses.slice(0,-1).map((g,i)=>({id:`55555555-5555-4555-8555-${String(i).padStart(12,'0')}`,code:g.code,name:g.code,farm_id:farm,total_area:1000}))
 let calls=0,stored=null,payload=null,failOnce=true
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+(process.argv.includes('--expired-session')?-1:3600),expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname==='/auth/v1/token')data={access_token:token,refresh_token:'qa-new',expires_in:3600,token_type:'bearer',user}
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/farms'))data=[{id:farm,code:'QA',name:'Ferme de recette'}]
  else if(url.pathname.endsWith('/greenhouses'))data=greenhouses
  else if(url.pathname.endsWith('/reference_values'))data=[{code:url.searchParams.get('list_key')==='eq.greenhouse_type'?'tunnel':'active',label:'Valeur de recette',is_default:true}]
  else if(url.pathname.endsWith('/farm_schematic_plans'))data=stored
  else if(url.pathname.endsWith('/import_farm_drawio_plan')){
   const body=route.request().postDataJSON();calls++
   if(payload&&JSON.stringify(payload)!==JSON.stringify(body))throw Error('Retry changed its id or payload')
   payload=body
   if(body.p_farm!==farm||body.p_rows.length!==plan.greenhouses.length||body.p_elements.length!==plan.elements.length)throw Error('Incomplete import payload')
   const creations=body.p_rows.filter(r=>r.new_greenhouse)
   if(creations.length!==1||creations[0].new_greenhouse.total_area!==7360.25||creations[0].new_greenhouse.exploitable_area!==7360.25)throw Error('Missing official area')
   if(failOnce){failOnce=false;await route.abort('failed');return}
   const id='66666666-6666-4666-8666-666666666666'
   greenhouses.push({id,farm_id:farm,...creations[0].new_greenhouse})
   stored={revision:1,elements:body.p_elements,shapes:body.p_rows.map(r=>({greenhouse_id:r.greenhouse_id||id,x:r.x,y:r.y,width:r.width,height:r.height,rotation:r.rotation}))}
   data={revision:1,created_count:1,linked_count:body.p_rows.length-1}
  }else if(route.request().method()!=='GET'&&route.request().method()!=='HEAD'&&!url.pathname.includes('/rpc/')&&!url.pathname.includes('/auth/'))throw Error('Unexpected table mutation: '+url.pathname)
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto('http://localhost:3001/plan-culture',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Plan de la ferme',exact:true}).click()
 await page.locator('select').filter({has:page.locator(`option[value="${farm}"]`)}).selectOption(farm)
 await page.getByLabel('Fichier draw.io').setInputFiles({name:'ferme.drawio',mimeType:'application/xml',buffer:Buffer.from(xml)})
 const last=plan.greenhouses.at(-1).code
 await page.getByLabel(`Rattachement ${last}`,{exact:true}).waitFor({timeout:60000})
 const save=page.getByRole('button',{name:'Enregistrer le plan et les serres',exact:true})
 if(await save.isEnabled())throw Error('Unmatched greenhouse not blocked')
 await page.getByLabel(`Rattachement ${last}`,{exact:true}).selectOption('new')
 if(await save.isEnabled())throw Error('Missing surface not blocked')
 await page.getByLabel(`Surface officielle ${last}`,{exact:true}).fill('7 360,25')
 if(calls)throw Error('Import wrote before confirmation')
 await save.click();await page.getByRole('alert').filter({hasText:'Enregistrement non confirmé'}).first().waitFor()
 await page.getByRole('button',{name:'Réessayer le même import',exact:true}).click()
 await page.getByText('Plan importé et serres rattachées.',{exact:true}).waitFor()
 await page.getByRole('button',{name:`Consulter ${last}`,exact:true}).waitFor()
 if(calls!==2||errors.length)throw Error(errors.join('\n')||'Unexpected retry count')
 fs.mkdirSync('tmp/plan114',{recursive:true});await page.screenshot({path:'tmp/plan114/drawio-import-browser.png',fullPage:true})
 console.log(`PASS: ${plan.greenhouses.length} greenhouses, ${plan.elements.length} other elements, compressed XML, create/link, official area, atomic submit, idempotent retry, clickable new greenhouse. No real writes.`)
}finally{await browser.close()}
