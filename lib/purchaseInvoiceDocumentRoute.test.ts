import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({files:new Map<string,string>(),authorized:true,permission:true,key:'dik_FAKE_TEST_ONLY'}))
vi.mock('node:fs/promises',()=>({mkdir:async()=>{},readFile:async(file:string)=>{if(!fixture.files.has(file))throw Object.assign(new Error('missing'),{code:'ENOENT'});return fixture.files.get(file)},writeFile:async(file:string,value:string)=>{fixture.files.set(file,value)},rename:async(a:string,b:string)=>{fixture.files.set(b,fixture.files.get(a)!);fixture.files.delete(a)}}))
vi.mock('./docIndexLocal.server',()=>({protectLocal:async(value:string,decrypt=false)=>decrypt?Buffer.from(value,'base64').toString():Buffer.from(value).toString('base64'),connectionKey:(d:string,r:string)=>d+':'+r,localVault:async(work:any)=>work({'11111111-1111-4111-8111-111111111111:fixture-recipient-A':{domain:'11111111-1111-4111-8111-111111111111',recipient:'fixture-recipient-A',space:'Fake test space',enabled:true,apiKey:fixture.key}}),docIndexFailureMessage:()=> 'Transmission non confirmée'}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({error:null,data:{user:fixture.authorized?{id:'fixture-actor'}:null}})},rpc:async()=>({data:fixture.permission,error:null}),from:(table:string)=>{const filters:Record<string,unknown>={},q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q},maybeSingle:async()=>({error:null,data:table==='profiles'?{is_active:true}:filters.domain_id==='11111111-1111-4111-8111-111111111111'?{id:filters.id}:null})};return q}})}))
import {GET,POST,PATCH} from '../app/api/purchases/invoice-documents/route'
function req(file?:string,domain='11111111-1111-4111-8111-111111111111',document=''){return new Request(`http://localhost:3103/api/purchases/invoice-documents?domain=${domain}&po=22222222-2222-4222-8222-222222222222${document?'&document='+document:''}`,{method:file?'POST':'GET',headers:{Authorization:'Bearer fixture',Origin:'http://localhost:3103','X-Filename':'fixture.pdf'},body:file})}
beforeEach(()=>{fixture.files.clear();fixture.authorized=true;fixture.permission=true;fixture.key='dik_FAKE_TEST_ONLY';vi.stubEnv('ITRIX_LOCAL_DOCINDEX_ENABLED','1');vi.stubEnv('VERCEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture')})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
function patch(document:string,action='send',extra={}){return new Request(req().url,{method:'PATCH',headers:{Authorization:'Bearer fixture',Origin:'http://localhost:3103','Content-Type':'application/json'},body:JSON.stringify({document,action,recipient:'fixture-recipient-A',confirmSend:true,confirmFictitious:true,...extra})})}
it('rebinds an unconfirmed upload only after same-space confirmation without sending, preserving bytes/key/cooldown',async()=>{
 const {document}=await (await POST(req('%PDF-1.4\nfictional'))).json()
 let now=100000;vi.spyOn(Date,'now').mockImplementation(()=>now)
 const transport=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response(JSON.stringify({id:'3f6c2a1e-0000-4000-a000-000000000000'}),{status:201}));vi.stubGlobal('fetch',transport)
 expect((await PATCH(patch(document.id))).status).toBe(502)
 fixture.key='dik_NEW_FAKE_TEST_ONLY'
 expect((await PATCH(patch(document.id))).status).toBe(409)
 expect((await PATCH(patch(document.id,'rebind'))).status).toBe(400)
 expect((await PATCH(patch(document.id,'rebind',{confirmNewKey:true,confirmSameSpace:true,recipient:'fixture-recipient-B'}))).status).toBe(409)
 const rebound=await PATCH(patch(document.id,'rebind',{confirmNewKey:true,confirmSameSpace:true}));expect(rebound.status).toBe(200)
 expect(await rebound.text()).not.toContain('dik_');expect(transport).toHaveBeenCalledTimes(1)
 expect((await PATCH(patch(document.id))).status).toBe(429)
 now+=61000;expect((await PATCH(patch(document.id))).status).toBe(200)
 const old=transport.mock.calls[0][1],next=transport.mock.calls[1][1]
 expect(next.headers['Idempotency-Key']).toBe(old.headers['Idempotency-Key']);expect(next.body).toEqual(old.body)
 expect(next.headers.Authorization).not.toBe(old.headers.Authorization)
})
it('requires read access to an existing receipt before changing its key; never reposts the document',async()=>{
 const {document}=await (await POST(req('%PDF-1.4\nfictional'))).json(),id='3f6c2a1e-0000-4000-a000-000000000000'
 const transport=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id}),{status:201})).mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({id,stage:'reading',flow:'purchase'})))
 vi.stubGlobal('fetch',transport);await PATCH(patch(document.id));fixture.key='dik_NEW_FAKE_TEST_ONLY'
 const request=()=>patch(document.id,'rebind',{confirmNewKey:true,confirmSameSpace:true})
 expect((await PATCH(request())).status).toBe(409)
 expect((await PATCH(patch(document.id,'status'))).status).toBe(409)
 const rebound=await (await PATCH(request())).json();expect(rebound.document.docindex.remoteId).toBe(id)
 expect(transport.mock.calls.filter(c=>c[1].method==='POST')).toHaveLength(1)
 const count=transport.mock.calls.length;await PATCH(request());await PATCH(patch(document.id));expect(transport).toHaveBeenCalledTimes(count)
})
it('requires confirmation, sends the exact original once and reads a validated summary without exposing keys',async()=>{
 const {document}=await (await POST(req('%PDF-1.4\nfictional'))).json(),remoteId='3f6c2a1e-0000-4000-a000-000000000000'
 const transport=vi.fn(async(_url:unknown,init?:RequestInit)=>init?.method==='POST'?new Response(JSON.stringify({id:remoteId}),{status:201}):new Response(JSON.stringify({id:remoteId,stage:'validated',flow:'purchase',invoice_number:'TEST-001',supplier:'SAOS',currency:'MAD',total:'225.00'})))
 vi.stubGlobal('fetch',transport)
 expect((await PATCH(patch(document.id,'send',{confirmFictitious:false}))).status).toBe(400);expect(transport).not.toHaveBeenCalled()
 const sent=await (await PATCH(patch(document.id))).json();expect(sent.document.docindex.remoteId).toBe(remoteId)
 expect(JSON.stringify(sent)).not.toContain('dik_');expect(sent.document.docindex.binding).toBeUndefined()
 expect(Buffer.from((transport.mock.calls[0][1] as RequestInit).body as Uint8Array).toString()).toBe('%PDF-1.4\nfictional')
 await PATCH(patch(document.id));expect(transport).toHaveBeenCalledTimes(1)
 const checked=await (await PATCH(patch(document.id,'status'))).json();expect(checked.document.docindex.summary.stage).toBe('validated')
 await PATCH(patch(document.id,'status'));expect(transport).toHaveBeenCalledTimes(2)
})
it('rejects another client and changed recipient before transmission',async()=>{
 const transport=vi.fn();vi.stubGlobal('fetch',transport);fixture.permission=false
 expect((await PATCH(patch('a'.repeat(64)))).status).not.toBe(200);expect(transport).not.toHaveBeenCalled()
})
it('keeps the same idempotency key and bytes after an ambiguous failure and enforces cooldown',async()=>{
 const {document}=await (await POST(req('%PDF-1.4\nfictional'))).json()
 let now=100000;vi.spyOn(Date,'now').mockImplementation(()=>now)
 const transport=vi.fn().mockRejectedValueOnce(Error('timeout')).mockResolvedValueOnce(new Response(JSON.stringify({id:'3f6c2a1e-0000-4000-a000-000000000000'}),{status:201}))
 vi.stubGlobal('fetch',transport)
 expect((await PATCH(patch(document.id))).status).toBe(502)
 expect((await PATCH(patch(document.id))).status).toBe(429);expect(transport).toHaveBeenCalledTimes(1)
 now+=61000;expect((await PATCH(patch(document.id))).status).toBe(200)
 expect(transport.mock.calls[0][1].headers['Idempotency-Key']).toBe(transport.mock.calls[1][1].headers['Idempotency-Key'])
 expect(transport.mock.calls[0][1].body).toEqual(transport.mock.calls[1][1].body)
})
it('authorizes before private storage access and denies cross-tenant access',async()=>{
 fixture.authorized=false;expect((await GET(req())).status).toBe(401)
 fixture.authorized=true;fixture.permission=false;expect((await POST(req('%PDF-1.4'))).status).toBe(403)
 fixture.permission=true;expect((await GET(req(undefined,'33333333-3333-4333-8333-333333333333'))).status).toBe(403)
 expect(fixture.files.size).toBe(0)
})
it('uploads, lists, retrieves and deduplicates a document without database writes',async()=>{
 const response=await POST(req('%PDF-1.4\nfictional'));expect(response.status).toBe(201)
 const {document}=await response.json()
 expect((await (await GET(req())).json()).documents).toHaveLength(1)
 expect(await (await GET(req(undefined,undefined,document.id))).text()).toBe('%PDF-1.4\nfictional')
 expect((await (await POST(req('%PDF-1.4\nfictional'))).json()).duplicate).toBe(true)
 expect((await (await GET(req())).json()).documents).toHaveLength(1)
 expect((await GET(req(undefined,undefined,'0'.repeat(64)))).status).toBe(404)
})
it('rejects HTML disguised as a PDF without storing it',async()=>{
 expect((await POST(req('<html>not a PDF'))).status).toBe(400)
 expect(fixture.files.size).toBe(0)
})
