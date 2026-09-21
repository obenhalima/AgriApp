// Local browser only; every Supabase call intercepted, no business writes.
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import dotenv from 'dotenv'
const env=dotenv.parse(fs.readFileSync('.env.local')),host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
const uid='11111111-1111-4111-8111-111111111111',domain='22222222-2222-4222-8222-222222222222',role='33333333-3333-4333-8333-333333333333',poId='44444444-4444-4444-8444-444444444444'
const user={id:uid,email:'qa-substitution@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const po={id:poId,po_number:'QA-130',status:'envoye',currency:'MAD',order_date:'2026-09-14',suppliers:{name:'Fournisseur QA'},total_amount:100,domain_id:domain}
const line={id:'line1',po_id:poId,item_description:'Produit commandé',stock_item_id:'old',unit:'l',quantity:10,received_qty:0,unit_price:100,line_total:1000}
let requests=[],receipt=null,failOnce=true,requestIds=[],revisionIds=[],revisionFail=true
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session:{access_token:token,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}})
 await context.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/auth/v1/user')data=user
  else if(url.pathname.endsWith('/profiles'))data=[{...user,full_name:'QA',role_id:role,is_active:true,must_change_password:false}]
  else if(url.pathname.endsWith('/domain_memberships'))data=[{domain_id:domain,role_id:role,is_default:true,domains:{name:'Recette',code:'QA'},roles:{name:'Admin'}}]
  else if(url.pathname.endsWith('/roles'))data=[{id:role,name:'Admin',is_admin:true,is_active:true}]
  else if(url.pathname.endsWith('/purchase_orders'))data=[po]
  else if(url.pathname.endsWith('/purchase_order_lines'))data=[line]
  else if(url.pathname.endsWith('/warehouses'))data=[{id:'wh1',name:'Entrepôt ferme QA',farms:{name:'Ferme QA'}}]
  else if(url.pathname.endsWith('/stock_items'))data=[{id:'old',name:'Produit commandé',unit:'l',plant_protection_product_id:'prod1'},{id:'new',name:'Produit livré QA',unit:'kg',plant_protection_product_id:'prod2'}]
  else if(url.pathname.endsWith('/phyto_positive_lists'))data=[{id:'list'}]
  else if(url.pathname.endsWith('/phyto_targets'))data=[{id:'target',canonical_name:'Cible QA'},{id:'other-target',canonical_name:'Autre cible'}]
  else if(url.pathname.endsWith('/phyto_positive_list_entries'))data=[{id:'original-entry',list_id:'list',product_id:'prod1',target_id:'target',authorized_use_id:'original-use'},{id:'entry',list_id:'list',product_id:'prod2',target_id:'target',authorized_use_id:'use'},{id:'wrong-entry',list_id:'list',product_id:'prod2',target_id:'other-target',authorized_use_id:'other-use'}]
  else if(url.pathname.endsWith('/purchase_phyto_substitutions')){if(url.searchParams.get('domain_id')!==`eq.${domain}`)throw Error('Missing domain scope');data=requests}
  else if(url.pathname.endsWith('/request_purchase_substitution')){
   const input=route.request().postDataJSON().p_input;requestIds.push(input.id)
   if(input.ordered_qty!==5||input.delivered_qty!==2.5||input.unit_price!==120)throw Error('Wrong quantities/price')
   if(failOnce){failOnce=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Erreur simulée, conserver les saisies'})});return}
   requests=[{...input,id:input.id,po_id:poId,domain_id:domain,status:'en_attente',requested_by:uid,requested_at:'2026-09-14T10:00:00Z',snapshot:{ordered:{unit:'l',currency:'MAD',unit_price:10},replacement:{name:'Produit livré QA',unit:'kg'},target:'Cible QA',use:{dose_min:1,dose_max:2,dose_unit:'kg_ha',phi_days:3}}}];data=input.id
  }
  else if(url.pathname.endsWith('/receive_costed_purchase')){receipt=route.request().postDataJSON().p_receipt;data={new_status:'partiellement_recu',movements_created:1,warnings:[]};requests[0].status='receptionne';line.received_qty=5;po.status='partiellement_recu'}
  else if(url.pathname.endsWith('/preview_substitution_prescriptions')){const dose=route.request().postDataJSON().p_dose??100;data={source_fingerprint:'source',product_name:'Produit livré QA',target_name:'Cible QA',unit:'kg',dose,dose_min:100,dose_max:200,dose_unit:'g_100l',phi_days:3,rei_hours:null,candidates:['future1','future2'].map((id,i)=>({id,fingerprint:id,planned_at:`2026-12-${10+i}T09:00:00Z`,area:10000,water:1000,old_quantity:2,old_unit:'l',new_quantity:dose/100,greenhouses:'S1',products:[{name:'Produit commandé',dose:100,dose_unit:'ml_100l',quantity:2,unit:'l',replaced:true}]}))}}
  else if(url.pathname.endsWith('/revise_substitution_prescriptions')){const body=route.request().postDataJSON();revisionIds.push(body.p_id);if(body.p_input.occurrences.length!==1||body.p_input.occurrences[0].id!=='future2'||body.p_input.dose!==200||!body.p_input.confirmed)throw Error('Incorrect partial revision');if(revisionFail){revisionFail=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Erreur de révision simulée'})});return}data=[{old_request_id:'future2',new_request_id:'new-future2'}]}
  if(route.request().headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`http://localhost:3001/achats/${poId}`,{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('button',{name:'Proposer un remplacement'}).click()
 await page.getByLabel('Ligne commandée',{exact:true}).selectOption('line1')
 await expect(page.getByLabel('Cible biologique du produit commandé')).toHaveValue('target')
 await expect(page.getByLabel('Cible / produit réellement livré').locator('option[value="wrong-entry:new"]')).toHaveCount(0)
 await page.getByLabel('Entrepôt de destination',{exact:true}).selectOption('wh1')
 await page.getByLabel('Cible / produit réellement livré',{exact:true}).selectOption('entry:new')
 await page.getByLabel('Quantité du bon remplacée',{exact:true}).fill('5')
 await page.getByLabel('Quantité réellement livrée',{exact:true}).fill('2,5')
 await page.getByLabel('Prix par unité livrée',{exact:true}).fill('120')
 await page.getByLabel('Motif du remplacement',{exact:true}).fill('Produit proposé par le fournisseur')
 await page.getByRole('button',{name:'Demander la validation phyto'}).click()
 await expect(page.getByRole('alert').filter({hasText:'Erreur simulée'})).toBeVisible()
 await expect(page.getByLabel('Quantité réellement livrée',{exact:true})).toHaveValue('2,5')
 await page.getByRole('button',{name:'Demander la validation phyto'}).click()
 await expect(page.getByText('Demande enregistrée.',{exact:false})).toBeVisible()
 if(requestIds[0]!==requestIds[1])throw Error('Retry identity changed')
 await expect(page.getByRole('button',{name:'Accepter le remplacement'})).toHaveCount(0)
 requests[0].status='approuve';requests[0].reviewed_by='reviewer';requests[0].review_reason='Accord vérifié'
 await page.getByRole('button',{name:'Actualiser les demandes'}).click()
 await page.getByText('approuve',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Réceptionner',exact:true}).click()
 await page.getByRole('combobox').filter({has:page.locator('option[value="'+requests[0].id+'"]')}).selectOption(requests[0].id)
 await page.getByRole('button',{name:'VALIDER LA RÉCEPTION',exact:true}).click()
 await page.getByText('receptionne',{exact:true}).waitFor()
 if(receipt?.lines[0].substitutionId!==requests[0].id||receipt?.lines[0].qtyReceived!==5||receipt?.warehouse_id!=='wh1')throw Error('Wrong receipt replacement payload')
 await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:3001/achats/remplacements')
 await page.getByText('receptionne',{exact:true}).waitFor()
 fs.mkdirSync('tmp/substitutions',{recursive:true});await page.screenshot({path:'tmp/substitutions/mobile.png',fullPage:true})
 await page.getByRole('button',{name:'Réviser les prescriptions concernées'}).click()
 await page.getByLabel('Dose de révision').fill('200')
 await expect(page.getByRole('button',{name:'Soumettre les prescriptions révisées'})).toBeDisabled()
 await page.getByRole('button',{name:'Recalculer les quantités'}).click()
 await page.getByLabel('Réviser future2',{exact:true}).check()
 await page.getByLabel('Justification de révision').fill('Utiliser le produit livré sur cette occurrence')
 await page.getByLabel('Confirmer la révision').check()
 await page.getByRole('button',{name:'Soumettre les prescriptions révisées'}).click()
 await expect(page.getByText('Erreur de révision simulée',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Soumettre les prescriptions révisées'}).click()
 await expect(page.getByText('1 nouvelle(s) prescription(s) soumise(s)',{exact:false})).toBeVisible()
 if(revisionIds.length!==2||revisionIds[0]!==revisionIds[1])throw Error('Revision retry identity changed')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS: local mocked request, French quantities, retry, no self-review UI, approved replacement receipt, domain filter, mobile queue. SQL security NOT executed.')
}finally{await browser.close()}
