import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function loadEdge(name: string, createClient?: (...args: any[]) => any) {
  const source = readFileSync(new URL('../supabase/functions/' + name + '/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  let handler: (req: Request) => Promise<Response> | Response = () => { throw Error('No handler') }
  runInNewContext(js, { Request, Response, serve: (fn: typeof handler) => { handler = fn }, createClient,
    Deno: { env: { get: (name: string) => name === 'SUPABASE_ANON_KEY' ? 'public-key' : 'https://example.invalid' } } })
  return handler
}
describe('security Edge entrypoints', () => {
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
