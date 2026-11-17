import {afterEach,beforeEach,expect,it,vi} from 'vitest'

const factory=vi.hoisted(()=>vi.fn(()=>({marker:'browser-client'})))
vi.mock('@supabase/supabase-js',async importOriginal=>({
 ...(await importOriginal<typeof import('@supabase/supabase-js')>()),createClient:factory,
}))

beforeEach(()=>{
 vi.resetModules();factory.mockClear()
 Reflect.deleteProperty(globalThis,'__itrixSupabaseClient')
 vi.stubGlobal('window',{})
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co')
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture-public-key')
})
afterEach(()=>{
 vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()
 Reflect.deleteProperty(globalThis,'__itrixSupabaseClient')
})

it('reuses the same browser auth client when Next.js reloads the module',async()=>{
 const first=await import('./supabase')
 vi.resetModules()
 const second=await import('./supabase')
 expect(second.supabase).toBe(first.supabase)
 expect(factory).toHaveBeenCalledTimes(1)
})

it('allows a queued auth operation to wait for a ten-second request while staying serialized',async()=>{
 await import('./supabase')
 const options=(factory.mock.calls[0] as unknown as [string,string,{auth:{lock:typeof import('@supabase/supabase-js').processLock}}])[2]
 vi.useFakeTimers()
 const calls:string[]=[]
 const first=options.auth.lock('auth-regression',5000,async()=>{
  calls.push('first');await new Promise(resolve=>setTimeout(resolve,10000));return 'first'
 })
 const second=options.auth.lock('auth-regression',5000,async()=>{calls.push('second');return 'second'})
 const result=expect(Promise.all([first,second])).resolves.toEqual(['first','second'])
 await vi.advanceTimersByTimeAsync(6000)
 expect(calls).toEqual(['first'])
 await vi.advanceTimersByTimeAsync(4000);await result
 expect(calls).toEqual(['first','second'])
})
