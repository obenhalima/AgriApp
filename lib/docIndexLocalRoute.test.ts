import {beforeEach,expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({vault:{} as Record<string,any>,identity:true,admin:true,send:vi.fn(),vaultCalls:0}))
const domain='11111111-1111-4111-8111-111111111111'
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:fixture.identity?{id:'fixture-actor'}:null},error:null})},from:(table:string)=>{
 const filters:Record<string,unknown>={},q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q},maybeSingle:async()=>({error:null,data:table==='profiles'?{is_active:true,is_platform_admin:false}:table==='domains'?(filters.id==='11111111-1111-4111-8111-111111111111'?{id:filters.id}:null):{roles:{is_active:true,is_admin:fixture.admin}}})};return q
}})}))
vi.mock('./docIndexLocal.server',async(importOriginal)=>({...await importOriginal<any>(),localVault:async(work:any)=>{fixture.vaultCalls++;return work(fixture.vault)},sendDocIndexFixture:(...args:any[])=>fixture.send(...args)}))
import {GET,POST} from '../app/api/integrations/docindex/local/route'
function request(body?:unknown,tenant=domain){return new Request(`http://localhost:3103/api/integrations/docindex/local?domain=${tenant}&recipient=fixture-recipient-A`,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture-token',Origin:'http://localhost:3103','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}
beforeEach(()=>{vi.stubEnv('ITRIX_LOCAL_DOCINDEX_ENABLED','1');vi.stubEnv('VERCEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture');fixture.vault={};fixture.vaultCalls=0;fixture.identity=true;fixture.admin=true;fixture.send.mockReset().mockResolvedValue({id:'fixture-receipt',status:'to_review'})})
it('denies unauthenticated, non-admin and other-tenant access before reading the vault',async()=>{
 fixture.identity=false;expect((await GET(request())).status).toBe(401)
 fixture.identity=true;fixture.admin=false;expect((await GET(request())).status).toBe(403)
 fixture.admin=true;expect((await GET(request(undefined,'22222222-2222-4222-8222-222222222222'))).status).toBe(403)
 expect(fixture.vaultCalls).toBe(0)
})
it('stores a key without returning it; requires enablement and explicit fixture confirmation',async()=>{
 let response=await POST(request({action:'configure',space:'Fixture space',enabled:false,apiKey:'dik_fixture_only_123456'}))
 const data=await response.json();expect(data.hasKey).toBe(true);expect(JSON.stringify(data)).not.toContain('dik_')
 await POST(request({action:'send_fixture',confirmFictitious:true}));expect(fixture.send).not.toHaveBeenCalled()
 await POST(request({action:'configure',space:'Fixture space',enabled:true,apiKey:''}))
 expect((await POST(request({action:'send_fixture'}))).status).toBe(400)
 response=await POST(request({action:'send_fixture',confirmFictitious:true}));expect((await response.json()).remoteId).toBe('fixture-receipt')
 await POST(request({action:'send_fixture',confirmFictitious:true}));expect(fixture.send).toHaveBeenCalledTimes(1)
})
it('rejects production activation and cross-origin writes',async()=>{
 vi.stubEnv('VERCEL','1');expect((await GET(request())).status).toBe(503)
 vi.stubEnv('VERCEL','');const r=request({action:'configure'});r.headers.set('origin','https://other.example');expect((await POST(r)).status).toBe(403)
})
it('preserves the resend reference across API key rotation',async()=>{
 await POST(request({action:'configure',space:'Fixture space',enabled:true,apiKey:'dik_fixture_only_123456'}))
 const generation=Object.values(fixture.vault)[0].generation
 await POST(request({action:'configure',space:'Fixture space',enabled:true,apiKey:'dik_rotated_fixture_123456'}))
 expect(Object.values(fixture.vault)[0].generation).toBe(generation)
})
it('generates new fixture numbers without sending and rejects stale-tab sends',async()=>{
 await POST(request({action:'configure',space:'Fixture space',enabled:true,apiKey:'dik_fixture_only_123456'}))
 const first=await (await POST(request({action:'new_fixture',confirmNew:true}))).json()
 const second=await (await POST(request({action:'new_fixture',confirmNew:true}))).json()
 expect(first.fixtureNumber).not.toBe(second.fixtureNumber)
 expect(first.reference).not.toBe(second.reference)
 expect(fixture.send).not.toHaveBeenCalled()
 const stale=await (await POST(request({action:'send_fixture',confirmFictitious:true,reference:first.reference}))).json()
 expect(stale.error).toContain('autre onglet');expect(fixture.send).not.toHaveBeenCalled()
 await POST(request({action:'configure',space:'Fixture space',enabled:true,apiKey:''}))
 expect((await (await GET(request())).json()).fixtureNumber).toBe(second.fixtureNumber)
})
