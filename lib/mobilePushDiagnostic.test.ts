import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../app/api/mobile/test/route'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('push diagnostic proxy',()=>{
 it('rejects unauthenticated requests without contacting a server',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
  const response=await POST(new Request('https://app.test/api/mobile/test',{method:'POST'}))
  expect(response.status).toBe(401);expect(fetch).not.toHaveBeenCalled()
 })
 it('rejects invalid payloads',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co')
  const response=await POST(new Request('https://app.test/api/mobile/test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({endpoint:42,domain:'d'})}))
  expect(response.status).toBe(400)
 })
 it('forwards only the caller token and device fields to the fixed Edge service',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co')
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'accepted'}),{status:200}));vi.stubGlobal('fetch',fetch)
  const response=await POST(new Request('https://app.test/api/mobile/test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({endpoint:'https://web.push.apple.com/device',domain:'d',user_id:'other',message:'injected'})}))
  expect(response.status).toBe(200)
  expect(fetch.mock.calls[0][0]).toBe('https://project.supabase.co/functions/v1/mobile-dispatch?action=test')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({endpoint:'https://web.push.apple.com/device',domain:'d'})
 })
 it('preserves server rejection and does not claim delivery after timeout',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co')
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:'limited'}),{status:429})).mockRejectedValueOnce(new Error('timeout'));vi.stubGlobal('fetch',fetch)
  const request=()=>new Request('https://app.test/api/mobile/test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({endpoint:'https://web.push.apple.com/device',domain:'d'})})
  expect((await POST(request())).status).toBe(429)
  const result=await POST(request());expect(result.status).toBe(503);expect((await result.json()).error).toContain('inconnu')
 })
})
