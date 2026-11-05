import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function loadEdge(name: string, createClient?: (...args: any[]) => any, providerFetch?: typeof fetch) {
  const source = readFileSync(new URL('../supabase/functions/' + name + '/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  let handler: (req: Request) => Promise<Response> | Response = () => { throw Error('No handler') }
  runInNewContext(js, { Request, Response, console, fetch: providerFetch, serve: (fn: typeof handler) => { handler = fn }, createClient,
    Deno: { env: { get: (name: string) => name === 'SUPABASE_ANON_KEY' ? 'public-key' : 'https://example.invalid' } } })
  return handler
}
describe('security Edge entrypoints', () => {
  const domainId = '22222222-2222-4222-8222-222222222222'
  function aiClient(active: boolean, allowed: boolean, calls: string[]) {
    return (_url: string, key: string, options: any) => {
      expect(key).toBe('public-key')
      expect(options.global.headers.Authorization).toBe('Bearer user-jwt')
      return {
        auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
        from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'profiles' ? { is_active: active } : { is_active: true, currency: 'MAD' } }) }) }) }),
        rpc: async (_name: string, args: any) => { calls.push(args.p_module_code); expect(args.p_user_id).toBe('user'); expect(args.p_domain_id).toBe(domainId); return { data: allowed } },
      }
    }
  }
  const aiRequest = (body: any) => new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer user-jwt' }, body: JSON.stringify(body) })
  it('AI rejects inactive profiles before provider access', async () => {
    const handle = loadEdge('ai-analyze-cpc', aiClient(false, true, []), async () => { throw Error('Provider must not be called') })
    expect((await handle(aiRequest({ domainId, mode: 'cost-variance' }))).status).toBe(403)
  })
  it('AI rejects denied client/module permissions in both modes', async () => {
    const calls: string[] = []
    const handle = loadEdge('ai-analyze-cpc', aiClient(true, false, calls), async () => { throw Error('Provider must not be called') })
    for (const mode of ['cost-variance', 'chat']) expect((await handle(aiRequest({ domainId, mode }))).status).toBe(403)
    expect(calls).toEqual(['couts', 'compte_exploitation'])
  })
  it('AI rejects missing domain and honors database currency for authorized comparisons', async () => {
    let providerCalls = 0
    const handle = loadEdge('ai-analyze-cpc', aiClient(true, true, []), async (_url, init) => {
      providerCalls++
      expect(String(init?.body)).toContain('MAD')
      expect(String(init?.body)).not.toContain('"currency":"EUR"')
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Analyse vérifiée' }] } }] }), { status: 200 })
    })
    expect((await handle(aiRequest({ mode: 'cost-variance' }))).status).toBe(400)
    expect(providerCalls).toBe(0)
    const response = await handle(aiRequest({ domainId, mode: 'cost-variance', comparison: { currency: 'EUR' } }))
    expect(response.status).toBe(200)
    expect((await response.json()).reply).toBe('Analyse vérifiée')
    expect(providerCalls).toBe(1)
  })
  for (const name of ['purchase-order-direct', 'purchase-order-receive']) {
    it(name + ' never performs a write', async () => {
      const handle = loadEdge(name, () => { throw Error('Must not create a privileged client') })
      expect((await handle(new Request('https://example.invalid', { method: 'POST', body: '{}' }))).status).toBe(410)
      expect((await handle(new Request('https://example.invalid', { method: 'OPTIONS' }))).status).toBe(200)
    })
  }
  it('workflow rejects missing authentication', async () => {
    const handle = loadEdge('workflow-transition')
    expect((await handle(new Request('https://example.invalid', { method: 'POST', body: '{}' }))).status).toBe(401)
  })
  it('workflow forwards caller identity and returns database refusal', async () => {
    const handle = loadEdge('workflow-transition', (_url, key, options) => {
      expect(key).toBe('public-key')
      expect(options.global.headers.Authorization).toBe('Bearer user-jwt')
      return { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
        rpc: async (name: string) => {
          expect(name).toBe('apply_authorized_workflow_transition')
          return { error: { code: '42501', message: 'Entité inaccessible' } }
        } }
    })
    expect((await handle(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer user-jwt' }, body: '{}' }))).status).toBe(403)
  })
})
