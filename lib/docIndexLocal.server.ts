import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {DOCINDEX_ENDPOINT} from './erpConnector'
import {docIndexRequest} from './erpTransport.server'

export type LocalConnection={domain:string;recipient:string;space:string;enabled:boolean;apiKey:string;generation:string;fixtureNumber?:string;fixturePdf?:string;events:{at:string;actor:string;action:string;remoteId?:string}[];lastAttempt?:string;remoteId?:string;status?:string}
type Vault=Record<string,LocalConnection>
// DPAPI CurrentUser: no plaintext API key or application encryption key on disk.
export async function protectLocal(value:string,decrypt=false):Promise<string>{
 if(process.platform!=='win32')throw Error('LOCAL_VAULT_UNAVAILABLE')
 const operation=decrypt?'Unprotect':'Protect'
 const script=`[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=${decrypt?'[Convert]::FromBase64String($v)':'[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($r)':'[Convert]::ToBase64String($r)'})`
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  let output='';const timer=setTimeout(()=>{child.kill();reject(Error('LOCAL_VAULT_UNAVAILABLE'))},10000)
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk});child.stderr.resume()
  child.on('error',()=>{clearTimeout(timer);reject(Error('LOCAL_VAULT_UNAVAILABLE'))})
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('LOCAL_VAULT_UNAVAILABLE'))})
  child.stdin.on('error',()=>{});child.stdin.end(value)
 })
}
const file=path.join(process.cwd(),'tmp','docindex-local-private','vault.dpapi')
let pending:Promise<unknown>=Promise.resolve()
export function localVault<T>(work:(vault:Vault)=>Promise<T>):Promise<T>{
 const run=pending.then(async()=>{
  let vault:Vault={}
  try{vault=JSON.parse(await protectLocal(await readFile(file,'utf8'),true))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('LOCAL_VAULT_UNAVAILABLE')}
  const result=await work(vault)
  await mkdir(path.dirname(file),{recursive:true})
  const temp=file+'.'+randomUUID()+'.tmp'
  await writeFile(temp,await protectLocal(JSON.stringify(vault)),{mode:0o600})
  await rename(temp,file)
  return result
 })
 pending=run.catch(()=>{});return run
}
export function publicConnection(c?:LocalConnection){return c?{space:c.space,enabled:c.enabled,hasKey:true,fixtureNumber:c.fixtureNumber||null,reference:fixtureReference(c),remoteId:c.remoteId||null,status:c.status||null,events:c.events.slice(-30)}:{space:'',enabled:false,hasKey:false,fixtureNumber:null,reference:null,remoteId:null,status:null,events:[]}}
export function connectionKey(domain:string,recipient:string){return `${domain}:${recipient}`}
export function fixtureReference(c:LocalConnection){return 'itrix-test-'+createHash('sha256').update(`${c.domain}:${c.recipient}:${c.generation}`).digest('hex').slice(0,32)}
/** Constant fictional content only: callers cannot upload or select business PDFs. */
export function docIndexFixturePdf(reference:string,number?:string):Uint8Array{
 if(!/^itrix-test-[a-f0-9]{32}$/.test(reference))throw Error('INVALID_FIXTURE')
 if(number&&!/^DEMO-[A-Z0-9-]{1,60}$/.test(number))throw Error('INVALID_FIXTURE')
 const lines=['ITRIX FARM - FACTURE FICTIVE - TEST UNIQUEMENT',reference,'Fournisseur: Entreprise fictive ITRIX','Client: Destinataire fictif de recette','Date: 2026-01-01','Prestation fictive: 1 x 100.00 MAD','HT: 100.00 MAD - TVA: 0.00 MAD - TTC: 100.00 MAD','AUCUNE DONNEE CLIENT REELLE - NE PAS COMPTABILISER']
 if(number)lines.splice(1,0,`Numero de facture: ${number}`)
 const stream='BT /F1 12 Tf 50 790 Td '+lines.map((line,i)=>(i?'0 -28 Td ':'')+`(${line}) Tj`).join('\n')+' ET'
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
 let out='%PDF-1.4\n',offsets=[0]
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${object}\nendobj\n`})
 const offset=Buffer.byteLength(out)
 out+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`
 return new TextEncoder().encode(out)
}
export function newDocIndexFixture(c:LocalConnection,actor:string,at=new Date().toISOString()){
 const generation=randomUUID()
 const next:LocalConnection={...c,generation,fixtureNumber:`DEMO-${at.slice(0,10).replaceAll('-','')}-${generation.replaceAll('-','').toUpperCase()}`,remoteId:undefined,status:undefined}
 next.fixturePdf=Buffer.from(docIndexFixturePdf(fixtureReference(next),next.fixtureNumber)).toString('base64')
 next.events=[...c.events,{at,actor,action:`Nouvelle facture fictive créée : ${next.fixtureNumber} (non envoyée)`}].slice(-100)
 return next
}
export async function sendDocIndexFixture(c:LocalConnection,transport:typeof fetch=fetch){
 const reference=fixtureReference(c),pdf=c.fixturePdf?Buffer.from(c.fixturePdf,'base64'):docIndexFixturePdf(reference)
 const response=await transport(DOCINDEX_ENDPOINT,{...docIndexRequest({key:reference,filename:`${c.fixtureNumber||reference}.pdf`,pdf},c.apiKey),body:Buffer.from(pdf),signal:AbortSignal.timeout(15000),cache:'no-store'})
 if(response.status!==200&&response.status!==201)throw Error(`DOCINDEX_HTTP_${response.status}`)
 // Receipt and downstream processing status are independent. A successful
 // upload may return only an id, before document reading has begun.
 const body=await response.json().catch(()=>null)
 if(typeof body?.id!=='string'||!/^[-A-Za-z0-9_:]{1,150}$/.test(body.id))throw Error('RECEIPT_UNREADABLE')
 const processingStage=body.stage??body.status
 const status=['reading','to_review','validated','rejected'].includes(processingStage)?processingStage:'received'
 return {id:body.id as string,status:status as string}
}
export function docIndexFailureMessage(error:unknown){
 const code=error instanceof Error?error.message:''
 if(code==='RECEIPT_UNREADABLE')return 'DocIndex a répondu positivement, mais Itrix n’a pas pu lire l’identifiant de réception. Vérifiez DocIndex avant tout renvoi ; cela ne signifie pas que la facture a été refusée.'
 if(code==='DOCINDEX_HTTP_401'||code==='DOCINDEX_HTTP_403')return 'DocIndex a refusé l’accès (401/403). Vérifiez la clé et ses autorisations, sans la communiquer.'
 if(code==='DOCINDEX_HTTP_429')return 'DocIndex a atteint sa limite de réception (429). Attendez avant de réessayer.'
 if(code==='DOCINDEX_HTTP_413')return 'DocIndex a refusé la taille du document (413).'
 if(code==='DOCINDEX_HTTP_409')return 'DocIndex indique que cette référence correspond déjà à un autre fichier (409). Ne changez pas la référence pour contourner ce contrôle ; vérifiez le document déjà reçu.'
 if(code==='DOCINDEX_HTTP_415')return 'DocIndex a refusé le type du fichier (415). Un PDF est attendu.'
 if(code==='DOCINDEX_HTTP_422')return 'DocIndex signale une référence absente ou un fichier vide (422). Le document doit être vérifié avant un nouvel essai.'
 if(/^DOCINDEX_HTTP_\d{3}$/.test(code))return `DocIndex a répondu avec une erreur HTTP ${code.slice(-3)}. Vérifiez sa boîte de réception avant tout renvoi.`
 return 'Itrix n’a pas obtenu de confirmation exploitable (délai ou connexion interrompue). La facture peut avoir été reçue : vérifiez DocIndex avant tout renvoi.'
}
