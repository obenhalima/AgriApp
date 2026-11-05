import {NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import {protectLocal,localVault,connectionKey,docIndexFailureMessage} from '../../../../lib/docIndexLocal.server'
import {parseDocIndexSummary,type DocIndexSummary} from '../../../../lib/docIndexPurchase'
import {invoiceFileType,PURCHASE_INVOICE_MAX_BYTES} from '../../../../lib/purchaseInvoiceDocument'
export const runtime='nodejs'
export const dynamic='force-dynamic'
type Link={recipient:string;binding:string;remoteId?:string;summary?:DocIndexSummary;lastAttempt?:number;lastCheck?:number;events:{at:string;actor:string;action:string}[]}
type Entry={id:string;name:string;mime:string;size:number;uploadedAt:string;uploadedBy:string;docindex?:Link}
function publicEntry(e:Entry){const {docindex,...entry}=e;return {...entry,docindex:docindex?{recipient:docindex.recipient,remoteId:docindex.remoteId,summary:docindex.summary,events:docindex.events}:null}}
const root=path.join(process.cwd(),'tmp','purchase-invoices-private')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})}
async function access(req:Request){
 const url=new URL(req.url),domain=url.searchParams.get('domain')||'',po=url.searchParams.get('po')||''
 if(process.env.VERCEL||process.env.ITRIX_LOCAL_DOCINDEX_ENABLED!=='1'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('LOCAL_ONLY')
 if(!uuid.test(domain)||!uuid.test(po))throw Error('INVALID_INPUT')
 if(req.method!=='GET'&&req.headers.get('origin')!==url.origin)throw Error('FORBIDDEN')
 const auth=req.headers.get('authorization')||'';if(!/^Bearer [^\s]+$/.test(auth))throw Error('UNAUTHORIZED')
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:auth},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})},auth:{persistSession:false,autoRefreshToken:false}})
 const identity=await db.auth.getUser(auth.slice(7));if(identity.error||!identity.data.user)throw Error('UNAUTHORIZED')
 const actor=identity.data.user.id
 const profile=await db.from('profiles').select('is_active').eq('id',actor).maybeSingle()
 if(profile.error||!profile.data?.is_active)throw Error('FORBIDDEN')
 const permission=await db.rpc('has_domain_permission',{p_domain_id:domain,p_user_id:actor,p_module_code:'achats',p_action:req.method==='GET'?'view':'edit'})
 if(permission.error||permission.data!==true)throw Error('FORBIDDEN')
 const purchase=await db.from('purchase_orders').select('id').eq('domain_id',domain).eq('id',po).maybeSingle()
 if(purchase.error||!purchase.data)throw Error('FORBIDDEN')
 return {dir:path.join(root,domain.toLowerCase(),po.toLowerCase()),actor,url}
}
async function index(dir:string):Promise<Entry[]>{try{return JSON.parse(await protectLocal(await readFile(path.join(dir,'index.dpapi'),'utf8'),true))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}}
async function encryptedWrite(file:string,value:string){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,await protectLocal(value),{mode:0o600});await rename(temp,file)}
let pending:Promise<unknown>=Promise.resolve()
function serial<T>(work:()=>Promise<T>){const run=pending.then(work);pending=run.catch(()=>{});return run}
function failed(error:unknown){const code=error instanceof Error?error.message:'';return json({error:code==='UNAUTHORIZED'?'Connexion requise.':code==='FORBIDDEN'?'Document ou achat inaccessible pour ce client et vos droits.':code==='LOCAL_ONLY'?'Stockage des factures disponible uniquement sur ce serveur local autorisé.':code==='INVALID_INPUT'?'Requête invalide.':'Impossible de charger ou conserver la facture. Réessayez ; aucun envoi à DocIndex n’a été effectué.'},code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='INVALID_INPUT'?400:503)}
export async function GET(req:Request){try{
 const {dir,url}=await access(req),entries=await index(dir),id=url.searchParams.get('document')
 if(url.searchParams.get('action')==='connections')return json({connections:await localVault(async vault=>Object.values(vault).filter(c=>c.domain===url.searchParams.get('domain')&&c.enabled&&c.apiKey).map(c=>({recipient:c.recipient,space:c.space})))})
 if(!id)return json({documents:entries.map(publicEntry)})
 const entry=entries.find(row=>row.id===id);if(!entry||!/^[-a-f0-9]{64}$/.test(id))return json({error:'Document introuvable pour cet achat.'},404)
 const bytes=Buffer.from(await protectLocal(await readFile(path.join(dir,id+'.dpapi'),'utf8'),true),'base64')
 return new Response(bytes,{headers:{'Content-Type':entry.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`attachment; filename="facture"; filename*=UTF-8''${encodeURIComponent(entry.name).replaceAll("'",'%27')}`}})
}catch(e){return failed(e)}}
export async function POST(req:Request){try{
 const {dir,actor}=await access(req)
 if(Number(req.headers.get('content-length')||0)>PURCHASE_INVOICE_MAX_BYTES)return json({error:'Maximum 4 Mo par document.'},413)
 const reader=req.body?.getReader();if(!reader)return json({error:'Fichier manquant.'},400)
 const chunks:Uint8Array[]=[];let size=0
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>PURCHASE_INVOICE_MAX_BYTES){await reader.cancel();return json({error:'Maximum 4 Mo par document.'},413)}chunks.push(part.value)}
 const bytes=Buffer.concat(chunks);let mime:string
 try{mime=invoiceFileType(bytes)}catch(e){return json({error:(e as Error).message},400)}
 const id=createHash('sha256').update(bytes).digest('hex')
 const rawName=decodeURIComponent(req.headers.get('x-filename')||'facture'),name=rawName.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu,'_').slice(0,160)||'facture'
 return await serial(async()=>{
  const entries=await index(dir),existing=entries.find(row=>row.id===id)
  if(existing)return json({document:publicEntry(existing),duplicate:true})
  if(entries.length>=10)return json({error:'Limite locale : 10 pièces par achat.'},409)
  const entry={id,name,mime,size:bytes.length,uploadedBy:actor,uploadedAt:new Date().toISOString()}
  await encryptedWrite(path.join(dir,id+'.dpapi'),bytes.toString('base64'))
  await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify([...entries,entry]))
  return json({document:publicEntry(entry),duplicate:false},201)
 })
}catch(e){return failed(e)}}

/** Explicit local-only upload or status check. Never creates an Itrix invoice. */
export async function PATCH(req:Request){try{
 const {dir,actor,url}=await access(req)
 const text=await req.text();if(text.length>2048)return json({error:'Requête trop longue.'},400)
 const body=JSON.parse(text)
 if(!['send','status','rebind'].includes(body.action)||!['fixture-recipient-A','fixture-recipient-B'].includes(body.recipient)||!/^[-a-f0-9]{64}$/.test(body.document))return json({error:'Requête invalide.'},400)
 if(body.action==='rebind'&&(body.confirmNewKey!==true||body.confirmSameSpace!==true))return json({error:'Confirmez que la nouvelle clé appartient à la même entreprise DocIndex et au même destinataire.'},400)
 if(body.action==='send'&&(body.confirmSend!==true||body.confirmFictitious!==true))return json({error:'Confirmez l’envoi de cette facture fictive au destinataire sélectionné.'},400)
 return await serial(async()=>{
  const entries=await index(dir),entry=entries.find(e=>e.id===body.document)
  if(!entry)return json({error:'Document introuvable pour cet achat.'},404)
  const connection=await localVault(async vault=>{const c=vault[connectionKey(url.searchParams.get('domain')!,body.recipient)];return c?.enabled?{apiKey:c.apiKey,space:c.space}:null})
  if(!connection?.apiKey)return json({error:'Configurez et activez ce destinataire dans Factures → Intégrations.'},409)
  const binding=createHash('sha256').update(connection.apiKey+':'+connection.space).digest('hex')
  if(entry.docindex?.recipient&&entry.docindex.recipient!==body.recipient)return json({error:'Le destinataire ne peut pas être changé pour ce document.'},409)
  if(body.action==='rebind'){
   const link=entry.docindex
   if(!link)return json({error:'Ce document n’a pas encore été associé à DocIndex.'},409)
   if(link.binding===binding)return json({document:publicEntry(entry),message:'La clé actuelle est déjà associée au document. Aucun envoi effectué.'})
   let summary:DocIndexSummary|undefined
   if(link.remoteId){
    try{
     const response=await fetch(`https://docindex-phi.vercel.app/api/v1/documents/${encodeURIComponent(link.remoteId)}`,{headers:{Authorization:`Bearer ${connection.apiKey}`},redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'})
     if(response.status!==200)throw Error('ACCESS_NOT_CONFIRMED')
     summary=parseDocIndexSummary(await response.json(),link.remoteId)
    }catch{return json({error:'La nouvelle clé ne permet pas de confirmer l’accès au document déjà reçu. Association inchangée ; aucun renvoi effectué. Vérifiez la clé et l’entreprise DocIndex.'},409)}
   }
   link.binding=binding
   if(summary){link.summary=summary;link.lastCheck=Date.now()}
   link.events=[...link.events,{at:new Date().toISOString(),actor,action:link.remoteId?'Nouvelle clé confirmée pour le même destinataire ; accès au document reçu vérifié, sans renvoi':'Nouvelle clé confirmée pour le même destinataire et la même entreprise déclarée ; fichier et référence conservés, sans envoi'}].slice(-30)
   await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries))
   return json({document:publicEntry(entry),message:'Nouvelle clé associée au même destinataire. Référence conservée ; aucune facture envoyée par cette action.'})
  }
  if(entry.docindex&&entry.docindex.binding!==binding)return json({error:'La clé configurée a changé. Utilisez « Utiliser la nouvelle clé pour ce destinataire », puis confirmez la même entreprise DocIndex. Aucun envoi effectué.'},409)
  const link:Link=entry.docindex||{recipient:body.recipient,binding,events:[]};entry.docindex=link
  const now=Date.now(),event=(action:string)=>{link.events=[...link.events,{at:new Date().toISOString(),actor,action}].slice(-30)}
  if(body.action==='send'){
   if(link.remoteId)return json({document:publicEntry(entry),message:'Document déjà reçu. Utilisez Actualiser le statut ; aucun nouvel envoi effectué.'})
   if(link.lastAttempt&&now-link.lastAttempt<60000)return json({error:'Attendez une minute avant de renvoyer la même facture.'},429)
   link.lastAttempt=now;event('Envoi DocIndex demandé');await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries))
   try{
    const bytes=Buffer.from(await protectLocal(await readFile(path.join(dir,entry.id+'.dpapi'),'utf8'),true),'base64')
    invoiceFileType(bytes)
    const reference='itrix-purchase-'+createHash('sha256').update(`${url.searchParams.get('domain')}:${url.searchParams.get('po')}:${entry.id}:${body.recipient}`).digest('hex')
    const response=await fetch('https://docindex-phi.vercel.app/api/v1/documents',{method:'POST',headers:{Authorization:`Bearer ${connection.apiKey}`,'Content-Type':entry.mime,'Idempotency-Key':reference,'X-Filename':encodeURIComponent(entry.name)},body:bytes,redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'})
    if(![200,201].includes(response.status))throw Error(`DOCINDEX_HTTP_${response.status}`)
    const received=await response.json()
    if(typeof received.id!=='string'||!uuid.test(received.id))throw Error('RECEIPT_UNREADABLE')
    link.remoteId=received.id;event('Réception DocIndex confirmée')
   }catch(e){event('Réception non confirmée - référence conservée pour le renvoi');await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries));return json({error:docIndexFailureMessage(e)},502)}
  }else{
   if(!link.remoteId)return json({error:'Aucun identifiant de réception. Vérifiez DocIndex avant un renvoi.'},409)
   if(link.lastCheck&&now-link.lastCheck<60000)return json({document:publicEntry(entry),cached:true})
   link.lastCheck=now;await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries))
   try{
    const response=await fetch(`https://docindex-phi.vercel.app/api/v1/documents/${encodeURIComponent(link.remoteId)}`,{headers:{Authorization:`Bearer ${connection.apiKey}`},redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'})
    if(response.status!==200)throw Error(`DOCINDEX_HTTP_${response.status}`)
    const summary=parseDocIndexSummary(await response.json(),link.remoteId)
    if(summary.stage!==link.summary?.stage)event('Statut DocIndex : '+summary.stage)
    link.summary=summary
   }catch(e){event('Lecture du statut non confirmée');await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries));return json({error:docIndexFailureMessage(e)},502)}
  }
  await encryptedWrite(path.join(dir,'index.dpapi'),JSON.stringify(entries))
  return json({document:publicEntry(entry)})
 })
}catch(e){if(e instanceof Error&&['UNAUTHORIZED','FORBIDDEN','LOCAL_ONLY','INVALID_INPUT'].includes(e.message))return failed(e);return json({error:'Accès au document ou au connecteur impossible. Aucun enregistrement de facture dans Itrix.'},503)}}
