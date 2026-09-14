import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../app/api/mobile/config/route'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function edge() {
 vi.stubEnv('VAPID_PRIVATE_KEY', '')
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
}
describe('Mobile public configuration', () => {
 it('uses the Edge public key without exposing server secrets', async () => {
  edge()
  const fetcher = vi.fn().mockResolvedValue(Response.json({ publicKey: 'A'.repeat(87), privateKey: 'never-return-this' }))
  vi.stubGlobal('fetch', fetcher)
  const response = await GET()
  expect(await response.json()).toEqual({ publicKey: 'A'.repeat(87) })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(fetcher.mock.calls[0][0]).toBe('https://example.supabase.co/functions/v1/mobile-dispatch')
 })
 it.each([null, 'invalid-key', 42])('rejects invalid public keys %s', async (publicKey) => {
  edge(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ publicKey })))
  expect(await (await GET()).json()).toEqual({ publicKey: null })
 })
 it('fails closed when the service is unavailable', async () => {
  edge(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('timeout')))
  expect(await (await GET()).json()).toEqual({ publicKey: null })
 })
 it('keeps a configured Vercel sender compatible', async () => {
  vi.stubEnv('VAPID_PRIVATE_KEY', 'secret'); vi.stubEnv('CRON_SECRET', 'secret')
  vi.stubEnv('APP_PUBLIC_URL', 'https://farm.example'); vi.stubEnv('VAPID_PUBLIC_KEY', 'public')
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  expect(await (await GET()).json()).toEqual({ publicKey: 'public' })
  expect(fetcher).not.toHaveBeenCalled()
 })
})
