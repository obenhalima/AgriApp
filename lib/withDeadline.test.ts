import { afterEach, expect, it, vi } from 'vitest'
import { withDeadline } from './withDeadline'
afterEach(()=>vi.useRealTimers())
it('ends even when SDK work never settles or ignores abort',async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined
 const work=withDeadline(s=>{signal=s;return new Promise(()=>{})},30000,'Session bloquée')
 const check=expect(work).rejects.toThrow('Session bloquée')
 await vi.advanceTimersByTimeAsync(30000);await check
 expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0)
})
it('returns successful results and clears its timer',async()=>{
 vi.useFakeTimers();expect(await withDeadline(()=>Promise.resolve(42),30000,'timeout')).toBe(42)
 expect(vi.getTimerCount()).toBe(0)
})
it('propagates failures without waiting for the deadline',async()=>{
 vi.useFakeTimers();await expect(withDeadline(()=>Promise.reject(new Error('server')),30000,'timeout')).rejects.toThrow('server')
 expect(vi.getTimerCount()).toBe(0)
})
