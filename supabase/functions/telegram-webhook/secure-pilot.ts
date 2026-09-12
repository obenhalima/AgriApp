// Pilote inscription : aucune requête métier service_role n'est autorisée ici.
export function privateTelegramMessage(update: any) {
  const message = update?.message ?? update?.callback_query?.message
  const sender = update?.message?.from ?? update?.callback_query?.from
  if (message?.chat?.type !== 'private' || sender?.is_bot || !Number.isSafeInteger(sender?.id)
    || sender.id <= 0 || message.chat.id !== sender.id) return null
  return { chatId: String(sender.id), username: sender.username ?? null,
    text: typeof update.message?.text === 'string' ? update.message.text.trim() : '',
    callbackId: update.callback_query?.id ?? null }
}

export function createSecurePilot(db: any, token: string, secret: string, enabled: boolean, request = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (!secret || !token || !enabled) return new Response('Telegram pilot disabled', { status: 503 })
    if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('Forbidden', { status: 403 })
    const update = await req.json().catch(() => null)
    if (!update) return new Response('Invalid JSON', { status: 400 })
    const msg = privateTelegramMessage(update)
    if (!msg) return new Response('OK') // groupes et canaux jamais enrôlés
    const send = async (text: string) => {
      const result = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.chatId, text }), // texte brut : pas d'injection HTML
      })
      const body = await result.json()
      if (!result.ok || !body.ok) throw new Error('Telegram delivery failed')
    }
    try {
      const mobileStart = msg.text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+FP_([a-f0-9]{32})$/i)
      if (mobileStart) {
        const { data, error } = await db.rpc('mobile_telegram_enroll', { p_code: mobileStart[1].toLowerCase(), p_chat: msg.chatId })
        await send(!error && data === true ? 'FarmPilot : notifications personnelles reliées. Les décisions se prennent dans l’application après identification.' : 'Code invalide, expiré ou compte Telegram déjà associé. Générez un nouveau code depuis Mes validations.')
        return new Response('OK')
      }
      if (msg.callbackId) await request(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: msg.callbackId }),
      })
      const context = async () => {
        const { data, error } = await db.rpc('telegram_access_context', { p_chat_id: msg.chatId })
        if (error) throw new Error('Access check failed')
        return data?.[0] ?? null
      }
      // Vérifié à chaque message ; l'identité et le périmètre ne viennent jamais du message.
      let user = await context()
      if (!user) {
        const start = msg.text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9]{20})$/)
        if (start) {
          const { data, error } = await db.rpc('enroll_telegram_user', {
            p_code: start[1], p_chat_id: msg.chatId, p_username: msg.username,
          })
          if (error) throw new Error('Enrollment failed')
          if (data === true) user = await context()
        }
      }
      if (!user) {
        await send('Accès non autorisé ou invitation invalide/expirée. Demandez une invitation personnelle à votre administrateur, puis envoyez /start CODE en conversation privée.')
      } else {
        await send(`FarmPilot — accès identifié\n${user.worker_name}\nSociété : ${user.domain_name}\nFerme : ${user.farm_name}\n\nPilote sécurisé : inscription et vérification d’accès disponibles. Les saisies métier et les récapitulatifs seront ouverts après validation de leurs contrôles client/ferme. Utilisez /statut pour vérifier votre accès.`)
      }
      return new Response('OK')
    } catch {
      // Ne jamais journaliser jeton, code d'invitation, texte ou update Telegram brut.
      console.error('[telegram-pilot] Access or delivery failed')
      return new Response('Service unavailable', { status: 503 })
    }
  }
}
