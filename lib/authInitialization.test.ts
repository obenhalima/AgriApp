import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { withAuthDeadline,withAuthCancellation,withAuthRequestDeadline } from './authInitialization'

afterEach(() => vi.useRealTimers())
it('aborts scoped reads after timeout and suppresses late continuation',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let continued=false
 const pending=withAuthCancellation(async signal=>{await new Promise(resolve=>setTimeout(resolve,200));signal.throwIfAborted();continued=true},controller,100)
 const rejected=expect(pending).rejects.toThrow('AUTH_INITIALIZATION_TIMEOUT')
 await vi.advanceTimersByTimeAsync(100);await rejected;expect(controller.signal.aborted).toBe(true)
 await vi.advanceTimersByTimeAsync(200);expect(continued).toBe(false)
})
it('aborts underlying auth HTTP and clears timers before retry',async()=>{
 vi.useFakeTimers();let calls=0,active=0,max=0
 const fetcher=vi.fn((_input:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{calls++;active++;max=Math.max(max,active);init?.signal?.addEventListener('abort',()=>{active--;reject(new DOMException('Aborted','AbortError'))},{once:true})})) as unknown as typeof fetch
 const bounded=withAuthRequestDeadline(fetcher,100)
 for(let i=0;i<2;i++){const p=bounded('https://example.test/auth/v1/user');const rejection=expect(p).rejects.toThrow('Aborted');await vi.advanceTimersByTimeAsync(100);await rejection;expect(active).toBe(0)}
 expect(calls).toBe(2);expect(max).toBe(1);expect(vi.getTimerCount()).toBe(0)
})
it('keeps retries single-flight and suspends automatic checks after failure',()=>{
 const auth=readFileSync('lib/auth.ts','utf8'),shell=readFileSync('components/layout/AppShell.tsx','utf8')
 expect(auth).toContain('if (pending.current) return')
 expect(auth).toContain("!failedAttempt.current&&document.visibilityState")
 expect(auth).toContain('signal.throwIfAborted()')
 expect(shell).toContain('disabled={initializationBusy}')
})
it('bounds a stalled initialization', async () => {
  vi.useFakeTimers()
  const pending = withAuthDeadline(new Promise(() => {}), 100)
  const rejected = expect(pending).rejects.toThrow('AUTH_INITIALIZATION_TIMEOUT')
  await vi.advanceTimersByTimeAsync(100)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})
it('returns a successful identity without retaining the deadline timer', async () => {
  vi.useFakeTimers()
  await expect(withAuthDeadline(Promise.resolve('verified'), 100)).resolves.toBe('verified')
  expect(vi.getTimerCount()).toBe(0)
})
it('propagates failures and permits an independent retry', async () => {
  await expect(withAuthDeadline(Promise.reject(new Error('unavailable')))).rejects.toThrow('unavailable')
  await expect(withAuthDeadline(Promise.resolve('recovered'))).resolves.toBe('recovered')
})
it('blocks protected rendering on error and never clears the persisted session for retry', () => {
  const auth = readFileSync('lib/auth.ts', 'utf8')
  const refresh = auth.slice(auth.indexOf('const refresh ='), auth.indexOf('useEffect(() =>', auth.indexOf('const refresh =')))
  expect(refresh).not.toMatch(/signOut\(|removeItem\(|localStorage\.clear\(/)
  expect(refresh).toContain('version === authVersion.current')
  expect(refresh).toContain('loading: true')
  expect(refresh).toContain('if (error && error.name')
  const shell = readFileSync('components/layout/AppShell.tsx', 'utf8')
  expect(shell.indexOf('if (initializationError)')).toBeLessThan(shell.indexOf("if (gate === 'loading')"))
  expect(shell).toContain('retryInitialization()')
})
