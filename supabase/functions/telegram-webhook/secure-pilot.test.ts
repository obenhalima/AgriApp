import { describe, it, expect, vi } from 'vitest'
import { createSecurePilot, privateTelegramMessage } from './secure-pilot'

const message = (text = '/statut', chat: any = { id: 123, type: 'private' }) => ({ message: { chat, from: { id: 123 }, text } })
const req = (body: any, secret = 'secret') => new Request('https://example.test', {
  method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(body),
})
const access = { worker_name: 'Employé A', farm_name: 'Ferme A', domain_name: 'Client A' }
const setup = (data: any[] = [access], enabled = true) => {
  const rpc = vi.fn().mockResolvedValue({ data, error: null })
  const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  return { rpc, send, handler: createSecurePilot({ rpc }, 'token', 'secret', enabled, send as any) }
}
describe('Telegram : pilote fermé aux parcours métier', () => {
  it('associe une notification mobile uniquement via son code personnel', async () => {
    const s=setup();s.rpc.mockResolvedValueOnce({data:true,error:null})
    await s.handler(req(message('/start FP_0123456789abcdef0123456789abcdef')))
    expect(s.rpc).toHaveBeenCalledWith('mobile_telegram_enroll',{p_code:'0123456789abcdef0123456789abcdef',p_chat:'123'})
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).toContain('notifications personnelles reliées')
  })
  it('ne confirme pas une association mobile refusée', async () => {
    const s=setup();s.rpc.mockResolvedValueOnce({data:false,error:null})
    await s.handler(req(message('/start FP_0123456789abcdef0123456789abcdef')))
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).toContain('Code invalide')
  })
  it('refuse les groupes même avec un code valide', async () => {
    const s = setup(); await s.handler(req(message('/start ABCDEF12345678901234', { id: -123, type: 'group' })))
    expect(s.rpc).not.toHaveBeenCalled(); expect(s.send).not.toHaveBeenCalled()
  })
  it('refuse une identité différente du chat privé', () => {
    expect(privateTelegramMessage(message('/statut', { id: 124, type: 'private' }))).toBeNull()
  })
  it('refuse les expéditeurs bots', () => {
    const u = message(); (u.message.from as any).is_bot = true
    expect(privateTelegramMessage(u)).toBeNull()
  })
  it('refuse le mauvais secret avant toute requête', async () => {
    const s = setup(); expect((await s.handler(req(message(), 'wrong'))).status).toBe(403)
    expect(s.rpc).not.toHaveBeenCalled()
  })
  it('reste désactivé par défaut de configuration', async () => {
    const s = setup([access], false); expect((await s.handler(req(message()))).status).toBe(503)
    expect(s.rpc).not.toHaveBeenCalled()
  })
  it('refuse la configuration sans secret', async () => {
    const s = setup(); const h = createSecurePilot({ rpc: s.rpc }, 'token', '', true, s.send as any)
    expect((await h(req(message()))).status).toBe(503); expect(s.rpc).not.toHaveBeenCalled()
  })
  it('ne montre aucune ferme à un compte révoqué', async () => {
    const s = setup([]); await s.handler(req(message()))
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).not.toContain('Ferme A')
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).toContain('Accès non autorisé')
  })
  it('enrôle via RPC puis revérifie le rattachement', async () => {
    const s = setup([])
    s.rpc.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: [access] })
    await s.handler(req(message('/start ABCDEF12345678901234')))
    expect(s.rpc.mock.calls.map(c => c[0])).toEqual(['telegram_access_context','enroll_telegram_user','telegram_access_context'])
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).toContain('Client A')
  })
  it('ne confirme pas un code refusé par la base', async () => {
    const s = setup([]); s.rpc.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: false })
    await s.handler(req(message('/start ABCDEF12345678901234')))
    expect(JSON.parse(s.send.mock.calls[0][1].body).text).toContain('Accès non autorisé')
  })
  it('ne transmet pas un code malformé à la base', async () => {
    const s = setup([]); await s.handler(req(message('/start bad')))
    expect(s.rpc).toHaveBeenCalledTimes(1)
  })
  it('ignore les anciens boutons métier sans lire ni écrire des récoltes', async () => {
    const s = setup(); await s.handler(req({ callback_query: { id: 'cb', from: { id: 123 },
      message: { chat: { id: 123, type: 'private' } }, data: 'harvest:trays_done' } }))
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(s.rpc.mock.calls[0][0]).toBe('telegram_access_context')
  })
  it('ne transmet pas le vocal à un fournisseur IA', async () => {
    const s = setup(); const u = message(); (u.message as any).voice = { file_id: 'voice' }
    await s.handler(req(u)); expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.send.mock.calls[0][0]).toContain('/sendMessage')
  })
  it('échoue fermé quand le contrôle SQL est indisponible', async () => {
    const s = setup(); s.rpc.mockResolvedValue({ error: { message: 'missing function' } })
    expect((await s.handler(req(message()))).status).toBe(503); expect(s.send).not.toHaveBeenCalled()
  })
})
