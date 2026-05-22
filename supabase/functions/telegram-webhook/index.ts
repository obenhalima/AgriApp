// ============================================================
// TELEGRAM WEBHOOK — saisie des récoltes par message
// V1 : texte + boutons (récoltes + journées sans récolte)
// V2 : message vocal → Gemini 2.5 Flash (transcription + extraction) → confirmation
//
// Setup :
//   1. Créer un bot via @BotFather → récupérer le BOT_TOKEN
//   2. Définir secrets Supabase :
//        supabase secrets set TELEGRAM_BOT_TOKEN=...
//        supabase secrets set TELEGRAM_WEBHOOK_SECRET=...
//        supabase secrets set GEMINI_API_KEY=...   # déjà fait
//   3. Déployer : supabase functions deploy telegram-webhook --no-verify-jwt
//   4. Configurer le webhook côté Telegram :
//        curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//          -d "url=https://<projet>.supabase.co/functions/v1/telegram-webhook" \
//          -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { t, buildMainMenu, reasonLabel, langInstructionForGemini, normalizeLang } from './i18n.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

// ─── Helpers Voice / Gemini ──────────────────────────────────

/** Télécharge un fichier audio Telegram et retourne base64 + mime. */
async function downloadTelegramAudio(fileId: string): Promise<{ data: string; mime: string }> {
  const fileInfo = await fetch(`${TG_API}/getFile?file_id=${fileId}`).then(r => r.json())
  if (!fileInfo.ok) throw new Error('Telegram getFile failed: ' + JSON.stringify(fileInfo))
  const filePath = fileInfo.result.file_path
  const r = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`)
  if (!r.ok) throw new Error('Telegram audio download failed: ' + r.status)
  const buf = await r.arrayBuffer()
  // Encode base64 (Deno-safe pour fichiers <20MB)
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return { data: btoa(binary), mime: 'audio/ogg' }
}

/** Transcription simple d'un audio en texte (pour les flows non-harvest).
 *  La transcription reste fidèle à la langue parlée (FR/AR/Darija/EN sont tous gérés). */
async function transcribeAudioOnly(audioB64: string, mime: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée')
  const body = {
    contents: [{
      parts: [
        { text: 'Transcris exactement ce que dit cette personne. Le locuteur peut parler en français, darija marocaine, arabe classique ou anglais. Garde la langue d\'origine. Pour la darija, utilise le script latin (Arabizi : "wakha", "safi", numbers in Latin). Réponds UNIQUEMENT avec la transcription, sans explication ni formattage.' },
        { inline_data: { mime_type: mime, data: audioB64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
  }
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const j = await r.json()
      if (!r.ok || j.error) continue
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text) return text
    } catch {}
  }
  throw new Error('Transcription Gemini échouée')
}

/** Convertit un texte FR (chiffres ou mots) en nombre. Ex: "cinq" → 5, "deux cents" → 200,
 *  "huit cinquante" → 850 (interprété comme un nombre composé), "8,50" → 8.5. */
function parseNumberFromText(text: string): number | null {
  const lower = text.toLowerCase().trim()
  // 1) Recherche directe d'un nombre avec décimales (priorité)
  const m = lower.match(/(\d+(?:[.,]\d+)?)/)
  if (m) {
    const v = Number(m[1].replace(',', '.'))
    if (Number.isFinite(v)) return v
  }
  // 2) Composition mots-nombres FR (gère 0-9999)
  const units: Record<string, number> = {
    'zero': 0, 'zéro': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3,
    'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9,
    'dix': 10, 'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14,
    'quinze': 15, 'seize': 16,
  }
  const tens: Record<string, number> = {
    'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50,
    'soixante': 60, 'soixante-dix': 70, 'septante': 70,
    'quatre-vingt': 80, 'quatre-vingts': 80, 'huitante': 80, 'octante': 80,
    'quatre-vingt-dix': 90, 'nonante': 90,
  }
  // Tokenize: split sur espaces et tirets
  const tokens = lower.replace(/[,;.]/g, ' ').split(/[\s\-]+/).filter(Boolean)
  let total = 0
  let group = 0   // accumulateur < 1000 en cours
  let saw = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    // "et" est un connecteur, on ignore
    if (t === 'et') continue
    if (t === 'cent' || t === 'cents') {
      group = (group === 0 ? 1 : group) * 100
      saw = true; continue
    }
    if (t === 'mille' || t === 'milles') {
      total += (group === 0 ? 1 : group) * 1000
      group = 0
      saw = true; continue
    }
    if (units[t] !== undefined) { group += units[t]; saw = true; continue }
    if (tens[t] !== undefined) { group += tens[t]; saw = true; continue }
    // mot non reconnu → on ignore
  }
  if (saw) return total + group
  return null
}

/** Type d'extraction conversationnelle (V3 : multi-récoltes + intention de fin). */
type ExtractedHarvest = {
  planting_id: string | null
  qty_kg: number | null
  notes: string | null
}
type VoiceExtraction = {
  transcription: string
  intent: 'harvest' | 'no_harvest' | 'done' | 'unknown'
  harvests: ExtractedHarvest[]
  reply_hint: string | null   // suggestion de réponse en français pour le bot
  confidence: number
}

/** Envoie l'audio à Gemini 2.5 Flash : transcription + extraction structurée (V3 conversationnel).
 *  La langue de l'ouvrier (FR/EN/AR/Darija) est passée pour adapter le reply_hint. */
async function transcribeAndExtract(audioB64: string, mime: string, plantings: any[], pendingCount: number = 0, userLang: string = 'fr'): Promise<VoiceExtraction & {
  // legacy fields pour compat V2 single-harvest
  planting_id: string | null
  qty_kg: number | null
  notes: string | null
}> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée')

  const plantingsList = plantings.map((p: any) => {
    const ferme = p.greenhouses?.farms?.code ?? '?'
    const serre = p.greenhouses?.code ?? '?'
    const variete = p.varieties?.code ?? '?'
    const nom = p.varieties?.commercial_name ?? '?'
    return `- planting_id="${p.id}" — ferme=${ferme}, serre=${serre}, variété=${variete} (${nom})`
  }).join('\n')

  const sessionContext = pendingCount > 0
    ? `\n\nL'ouvrier est dans une session de saisie groupée et a déjà dicté ${pendingCount} récolte(s). Il peut en ajouter d'autres OU dire qu'il a terminé.`
    : ''

  const langInstruction = langInstructionForGemini(userLang)

  const prompt = `Tu es l'assistant vocal d'une ferme de tomates au Maroc. Un ouvrier dicte ses récoltes en français, darija marocaine, arabe classique ou anglais. Ton rôle : transcrire fidèlement, extraire UNE OU PLUSIEURS récoltes du même message, ou détecter la fin de saisie.${sessionContext}

${langInstruction}

PLANTATIONS ACTIVES :
${plantingsList}

INSTRUCTIONS :
1. Transcris exactement ce que dit l'ouvrier dans sa langue d'origine. Pour la darija, utilise le script latin (Arabizi). Pour l'arabe classique, utilise le script arabe.
2. Détermine intent :
   - "harvest" : il annonce 1+ récolte(s) (qty + serre/variété)
   - "no_harvest" : il signale qu'il n'y a pas de récolte (panne, maladie, météo, etc.)
   - "done" : il signale qu'il a terminé sa saisie. Mots clés multilingues :
     · FR : "fini", "c'est tout", "voilà", "termine", "j'ai terminé", "rien d'autre", "non c'est tout"
     · Darija : "khlas", "safi", "barakallah", "wakha hadak chi", "ghir hadi"
     · Arabe : "انتهيت", "هذا كل شيء", "خلاص"
     · EN : "done", "that's all", "finished", "nothing else"
   - "unknown" : ambigu ou pas exploitable
3. Si "harvest" : remplis le tableau "harvests" avec autant d'éléments que de récoltes mentionnées (le message peut en contenir plusieurs : "150 sur S1 marquise et 200 sur S3 cherry").
   - planting_id : matche serre + variété aux plantations actives
   - qty_kg : convertir oralement → nombres :
     · FR : "cent cinquante" = 150, "deux quintaux" = 200, "un quintal et demi" = 150
     · Darija : "khamsin" = 50, "miya" = 100, "alf" = 1000, "miyatayn" = 200
     · Arabe : "خمسون" = 50, "مئة" = 100, "ألف" = 1000
   - notes : observations qualitatives (catégorie, déchets, etc.)
4. reply_hint : une réponse courte ADAPTÉE À LA LANGUE DE L'UTILISATEUR. Exemples :
   · FR après acquittement : "Noté ! D'autres récoltes ?"
   · Darija après acquittement : "Wakha ! Récoltes oukhrin ?"
   · AR après acquittement : "تم! محاصيل أخرى؟"
   · EN après acquittement : "Got it! Other harvests?"
5. confidence : ta confiance entre 0 et 1.`

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: audioB64 } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          transcription: { type: 'string' },
          intent: { type: 'string', enum: ['harvest', 'no_harvest', 'done', 'unknown'] },
          harvests: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                planting_id: { type: 'string', nullable: true },
                qty_kg: { type: 'number', nullable: true },
                notes: { type: 'string', nullable: true },
              },
            },
          },
          reply_hint: { type: 'string', nullable: true },
          confidence: { type: 'number' },
        },
        required: ['transcription', 'intent', 'harvests', 'confidence'],
      },
      temperature: 0.2,
    },
  }

  // Tente plusieurs modèles en cascade (tolérance aux changements de quota)
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
  let lastErr: any = null
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const j = await r.json()
      if (!r.ok || j.error) { lastErr = j.error ?? j; continue }
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = 'no text in response'; continue }
      const raw = JSON.parse(text)
      // Normalise + ajoute les champs legacy (1ère récolte, pour compat V2 callers)
      const harvests = Array.isArray(raw.harvests) ? raw.harvests : []
      const first = harvests[0] ?? {}
      return {
        transcription: raw.transcription ?? '',
        intent: raw.intent ?? 'unknown',
        harvests,
        reply_hint: raw.reply_hint ?? null,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
        // legacy
        planting_id: first.planting_id ?? null,
        qty_kg: first.qty_kg ?? null,
        notes: first.notes ?? null,
      }
    } catch (e) { lastErr = e }
  }
  throw new Error('Gemini failed for all models: ' + JSON.stringify(lastErr))
}

// ─── Helpers Telegram ────────────────────────────────────────
async function sendMessage(chatId: number | string, text: string, replyMarkup?: any) {
  const r = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  })
  return r.json()
}

async function answerCallbackQuery(callbackId: string, text?: string) {
  return fetch(`${TG_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  })
}

// Boutons inline (fallback FR — utilisé seulement quand on n'a pas le contexte user.
// Préférer buildMainMenu(user.language) dès qu'on a accès au user enrôlé).
const mainMenuKeyboard = buildMainMenu('fr')

// ─── Logging des messages ────────────────────────────────────
async function logMessage(opts: {
  chatbot_user_id: string | null
  direction: 'in' | 'out'
  content: string
  intent?: string
  parsed_data?: any
  created_harvest_id?: string
  created_alert_id?: string
  raw_update?: any
}) {
  await supabase.from('chatbot_messages').insert({
    chatbot_user_id: opts.chatbot_user_id,
    direction: opts.direction,
    content: opts.content,
    intent: opts.intent,
    parsed_data: opts.parsed_data,
    created_harvest_id: opts.created_harvest_id,
    created_alert_id: opts.created_alert_id,
    raw_update: opts.raw_update,
  })
}

// ─── Handlers ────────────────────────────────────────────────

/** /start [code] : enrôle l'utilisateur si code valide, sinon affiche aide. */
async function handleStart(chatId: string, args: string[], from: any): Promise<string> {
  const code = args[0]?.trim().toUpperCase()
  if (code) {
    // Cherche un chatbot_user pré-créé avec ce code
    const { data: pending } = await supabase
      .from('chatbot_users').select('*, workers(first_name, last_name, matricule)')
      .eq('enrollment_code', code)
      .gt('enrollment_code_expires_at', new Date().toISOString())
      .maybeSingle()

    if (!pending) {
      // Code invalide → on n'a pas la langue du user, fallback FR
      await sendMessage(chatId, t('fr', 'enroll_invalid_code'))
      return 'enroll_failed'
    }

    const lang = normalizeLang((pending as any).language)
    const w: any = pending.workers
    const greet = w ? `${w.first_name} ${w.last_name}` : ''

    await supabase.from('chatbot_users').update({
      channel_user_id: chatId,
      channel_username: from.username ?? null,
      enrolled_at: new Date().toISOString(),
      enrollment_code: null,
      enrollment_code_expires_at: null,
      session_state: {},
    }).eq('id', pending.id)

    await sendMessage(chatId,
      t(lang, 'welcome_enrolled', { name: greet }),
      buildMainMenu(lang)
    )
    return 'enroll_success'
  }
  // Pas de code → on ne connaît pas la langue, on envoie en FR (défaut)
  await sendMessage(chatId, t('fr', 'welcome_no_code'))
  return 'enroll_request'
}

/** Identifie l'utilisateur authentifié (déjà enrôlé). La langue est normalisée. */
async function authUser(chatId: string) {
  const { data } = await supabase.from('chatbot_users')
    .select('*, workers(*)')
    .eq('channel', 'telegram')
    .eq('channel_user_id', chatId)
    .maybeSingle()
  if (data) {
    // Normalise la langue à 'fr' | 'en' | 'ar' | 'darija' pour tous les handlers
    ;(data as any).language = normalizeLang((data as any).language)
  }
  return data
}

/** Met à jour l'état conversationnel + last_message_at. */
async function updateSession(userId: string, state: any) {
  await supabase.from('chatbot_users').update({
    session_state: state,
    last_message_at: new Date().toISOString(),
  }).eq('id', userId)
}

/** Liste les plantings actifs (dernières 20) + ferme. */
async function listPlantings() {
  const { data } = await supabase.from('campaign_plantings')
    .select('id, planted_area, campaigns(code, name), greenhouses(code, name, farms(code, name)), varieties(code, commercial_name)')
    .order('planting_date', { ascending: false })
    .limit(20)
  return data ?? []
}

/** Démarre le flow "nouvelle récolte". */
async function startHarvestFlow(user: any) {
  const lang = user.language
  const plantings = await listPlantings()
  if (plantings.length === 0) {
    await sendMessage(user.channel_user_id, t(lang, 'no_active_planting'))
    return
  }
  await updateSession(user.id, { intent: 'new_harvest', step: 'pick_planting' })
  const buttons = plantings.map((p: any) => ([{
    text: `${p.greenhouses?.code ?? '?'} — ${p.varieties?.code ?? '?'}`,
    callback_data: `harvest:planting:${p.id}`,
  }]))
  buttons.push([{ text: t(lang, 'cancel'), callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(lang, 'pick_planting'), { inline_keyboard: buttons })
}

/** Continue le flow récolte après choix planting. */
async function continueHarvestPickPlanting(user: any, plantingId: string) {
  const lang = user.language
  const { data: planting } = await supabase.from('campaign_plantings')
    .select('id, campaigns(name), greenhouses(code, name), varieties(code, commercial_name)')
    .eq('id', plantingId)
    .maybeSingle()
  if (!planting) {
    await sendMessage(user.channel_user_id, t(lang, 'planting_not_found'))
    return
  }
  await updateSession(user.id, {
    intent: 'new_harvest', step: 'ask_qty', planting_id: plantingId,
  })
  const p: any = planting
  const label = `${p.greenhouses?.code} / ${p.varieties?.commercial_name}`
  await sendMessage(user.channel_user_id, t(lang, 'ask_quantity', { label }))
}

/** Reçoit la quantité, crée la récolte. */
async function continueHarvestSaveQty(user: any, text: string) {
  const lang = user.language
  const qty = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendMessage(user.channel_user_id, t(lang, 'invalid_quantity'))
    return null
  }
  const plantingId = user.session_state?.planting_id
  if (!plantingId) {
    await sendMessage(user.channel_user_id, t(lang, 'session_lost'))
    return null
  }
  // Création de la récolte
  const today = new Date().toISOString().slice(0, 10)
  const lot = `LOT-${today.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
  const { data: harvest, error } = await supabase.from('harvests').insert({
    campaign_planting_id: plantingId,
    harvest_date: today,
    qty_category_1: qty,
    qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
    lot_number: lot,
    notes: `Saisie via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`,
  }).select('id, lot_number').single()

  if (error) {
    await sendMessage(user.channel_user_id, t(lang, 'error_with_msg', { msg: error.message }))
    return null
  }
  // Reset session
  await updateSession(user.id, {})
  await sendMessage(user.channel_user_id,
    t(lang, 'harvest_saved', { lot: harvest!.lot_number, qty: String(qty), date: today }),
    buildMainMenu(lang)
  )
  return harvest!.id
}

/** Démarre flow "journée sans récolte". */
async function startNoHarvestFlow(user: any) {
  const lang = user.language
  await updateSession(user.id, { intent: 'no_harvest', step: 'pick_reason' })
  await sendMessage(user.channel_user_id, t(lang, 'ask_no_harvest_reason'), {
    inline_keyboard: [
      [{ text: t(lang, 'reason_panne_irrigation'), callback_data: 'no_harvest:reason:panne_irrigation' }],
      [{ text: t(lang, 'reason_meteo'), callback_data: 'no_harvest:reason:meteo' }],
      [{ text: t(lang, 'reason_main_oeuvre'), callback_data: 'no_harvest:reason:main_oeuvre' }],
      [{ text: t(lang, 'reason_maladie'), callback_data: 'no_harvest:reason:maladie' }],
      [{ text: t(lang, 'reason_maintenance'), callback_data: 'no_harvest:reason:maintenance' }],
      [{ text: t(lang, 'reason_other'), callback_data: 'no_harvest:reason:autre' }],
      [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
    ],
  })
}

/** Sauvegarde l'alerte journée sans récolte. */
async function saveNoHarvest(user: any, reason: string, notes: string | null = null) {
  const lang = user.language
  const today = new Date().toISOString().slice(0, 10)
  const rLabel = reasonLabel(lang, reason)
  // Le label en clair pour l'admin (toujours en FR pour cohérence DB/dashboard)
  const reasonFR = reasonLabel('fr', reason)
  const { data: alert, error } = await supabase.from('alerts').insert({
    type: 'no_harvest', severity: 'warning',
    title: `Journée sans récolte — ${today}`,
    message: `Motif: ${reasonFR}${notes ? ' — ' + notes : ''}\nSignalé via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`,
    entity_type: 'harvest', is_read: false, is_resolved: false,
  }).select('id').single()
  if (error) {
    await sendMessage(user.channel_user_id, t(lang, 'error_with_msg', { msg: error.message }))
    return null
  }
  await updateSession(user.id, {})
  const noteLine = notes ? `\n${t(lang, 'note_label')} : ${notes}` : ''
  await sendMessage(user.channel_user_id,
    t(lang, 'no_harvest_saved', { date: today, reason: rLabel, noteLine }),
    buildMainMenu(lang)
  )
  return alert!.id
}

/** Type pour récolte en attente dans une session vocale. */
type PendingHarvest = {
  planting_id: string
  qty_kg: number
  planting_label: string  // "F01-S01 / Marquise"
  notes?: string | null
  transcription?: string
}

/** Affiche le récap final de la session vocale + boutons confirm/cancel. */
async function showVoiceSessionRecap(chatId: string, pending: PendingHarvest[], lang: string = 'fr') {
  if (pending.length === 0) {
    await sendMessage(chatId,
      // Pas de strings i18n pour ce cas marginal — réutilise help/menu
      t(lang, 'menu_help'),
      buildMainMenu(lang)
    )
    return
  }
  const lines = pending.map((h, i) =>
    `<b>${i + 1}.</b> ${h.planting_label} — <b>${h.qty_kg} kg</b>${h.notes ? ` <i>(${h.notes})</i>` : ''}`
  ).join('\n')
  const total = pending.reduce((s, h) => s + h.qty_kg, 0)
  await sendMessage(chatId,
    `${t(lang, 'voice_recap_title')}\n\n${lines}\n` +
    `─────────────\n` +
    t(lang, 'voice_recap_total', { total: total.toLocaleString('fr-FR'), count: String(pending.length) }),
    {
      inline_keyboard: [
        [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:confirm_all' }],
        [{ text: t(lang, 'voice_continue'), callback_data: 'voice:continue' }],
        [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
      ],
    }
  )
}

/** Voix contextuelle : si l'utilisateur est dans un flow compose/tri/prix, on transcrit
 *  et on route comme du texte. Retourne true si traité. */
async function handleContextualVoice(user: any, voice: any): Promise<boolean> {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const chatId = user.channel_user_id
  const contextual = (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest')
    || (state.intent === 'tri' && (state.step === 'ask_freinte' || state.step === 'ask_ecart'))
    || (state.intent === 'confirm_price' && (state.step === 'ask_price' || state.step === 'ask_station_ref'))
  console.log('[ctx-voice] intent=', state.intent, 'step=', state.step, 'contextual=', contextual)
  if (!contextual) return false

  await sendMessage(chatId, t(lang, 'voice_listening'))
  let text: string
  try {
    const audio = await downloadTelegramAudio(voice.file_id)
    text = await transcribeAudioOnly(audio.data, audio.mime)
    console.log('[ctx-voice] transcription:', text)
  } catch (e: any) {
    console.error('[ctx-voice] transcription error:', e)
    await sendMessage(chatId, t(lang, 'voice_transcription_error', { msg: e?.message ?? '?' }))
    return true
  }
  await sendMessage(chatId, `🎤 <i>"${text}"</i>`)

  // Compose : qty à contribuer
  if (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest') {
    // Détecte "tout" (FR) / "all" (EN) / "kollou/kolha" (darija) / "الكل" (AR)
    if (/\b(tout|toute|kollou|kolha|all|الكل|كولو)\b/i.test(text)) {
      await continueComposeSaveQty(user, 'tout')
    } else {
      const n = parseNumberFromText(text)
      if (n == null || n <= 0) {
        await sendMessage(chatId, t(lang, 'voice_qty_unclear'))
        return true
      }
      await continueComposeSaveQty(user, String(n))
    }
    return true
  }

  // Tri : freinte
  if (state.intent === 'tri' && state.step === 'ask_freinte') {
    const v = parseNumberFromText(text)
    if (v == null || v < 0 || v > 100) {
      await sendMessage(chatId, t(lang, 'voice_pct_unclear'))
      return true
    }
    await continueTriSaveFreinte(user, v)
    return true
  }

  // Tri : écart
  if (state.intent === 'tri' && state.step === 'ask_ecart') {
    const v = parseNumberFromText(text)
    if (v == null || v < 0 || v > 100) {
      await sendMessage(chatId, t(lang, 'voice_pct_unclear'))
      return true
    }
    await continueTriFinalize(user, v)
    return true
  }

  // Confirm price : prix /kg
  if (state.intent === 'confirm_price' && state.step === 'ask_price') {
    const v = parseNumberFromText(text)
    if (v == null || v <= 0) {
      await sendMessage(chatId, t(lang, 'voice_price_unclear'))
      return true
    }
    await continuePriceSavePrice(user, String(v))
    return true
  }

  // Confirm price : station_ref (texte libre)
  if (state.intent === 'confirm_price' && state.step === 'ask_station_ref') {
    await continuePriceFinalize(user, text)
    return true
  }

  return false
}

/** Handler conversationnel d'un message vocal (V3 multi-récoltes). */
async function handleVoiceMessage(user: any, voice: any): Promise<void> {
  const chatId = user.channel_user_id
  const lang = user.language

  // Voix contextuelle : si dans un flow compose/tri/prix, on transcrit + route
  if (await handleContextualVoice(user, voice)) return

  await sendMessage(chatId, t(lang, 'voice_listening'))

  // Récupère ou initialise la session vocale
  const state = (user.session_state ?? {}) as any
  const pending: PendingHarvest[] = state.intent === 'voice_session' && Array.isArray(state.pending) ? state.pending : []

  let payload: any
  try {
    const audio = await downloadTelegramAudio(voice.file_id)
    const plantings = await listPlantings()
    if (plantings.length === 0) {
      await sendMessage(chatId, t(lang, 'voice_no_planting'))
      return
    }
    payload = await transcribeAndExtract(audio.data, audio.mime, plantings, pending.length, lang)
  } catch (e: any) {
    console.error('[voice] error:', e)
    await sendMessage(chatId, t(lang, 'voice_transcription_error', { msg: e?.message ?? '?' }), buildMainMenu(lang))
    return
  }

  console.log('[voice] result:', JSON.stringify(payload))

  // ─── INTENT : journée sans récolte ──────────────────
  if (payload.intent === 'no_harvest') {
    if (pending.length > 0) {
      // Si une session avait commencé, demander quoi faire (utilise reply_hint Gemini si dispo)
      const ack = payload.reply_hint ?? ''
      await sendMessage(chatId,
        `🎤 <i>"${payload.transcription}"</i>${ack ? '\n\n' + ack : ''}`,
        {
          inline_keyboard: [
            [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:confirm_then_no_harvest' }],
            [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
          ],
        })
      return
    }
    await sendMessage(chatId, `🎤 <i>"${payload.transcription}"</i>${payload.reply_hint ? '\n\n' + payload.reply_hint : ''}`)
    await startNoHarvestFlow(user)
    return
  }

  // ─── INTENT : done → afficher récap ─────────────────
  if (payload.intent === 'done') {
    if (pending.length === 0) {
      await sendMessage(chatId,
        `🎤 <i>"${payload.transcription}"</i>${payload.reply_hint ? '\n\n' + payload.reply_hint : ''}`,
        buildMainMenu(lang)
      )
      await updateSession(user.id, {})
      return
    }
    await showVoiceSessionRecap(chatId, pending, lang)
    return
  }

  // ─── INTENT : harvest → ajouter à la session ────────
  if (payload.intent === 'harvest' && Array.isArray(payload.harvests) && payload.harvests.length > 0) {
    // Filtre les récoltes valides (planting_id + qty_kg > 0)
    const valid: PendingHarvest[] = []
    const rejected: any[] = []
    for (const h of payload.harvests) {
      if (h.planting_id && h.qty_kg && Number(h.qty_kg) > 0) {
        // Vérifie le planting et récupère le label
        const { data: p } = await supabase.from('campaign_plantings')
          .select('id, greenhouses(code), varieties(code, commercial_name)')
          .eq('id', h.planting_id)
          .maybeSingle()
        if (p) {
          const pa: any = p
          valid.push({
            planting_id: h.planting_id,
            qty_kg: Number(h.qty_kg),
            planting_label: `${pa.greenhouses?.code ?? '?'} / ${pa.varieties?.commercial_name ?? '?'}`,
            notes: h.notes ?? null,
            transcription: payload.transcription,
          })
        } else { rejected.push(h) }
      } else { rejected.push(h) }
    }

    const merged = [...pending, ...valid]
    await updateSession(user.id, { intent: 'voice_session', pending: merged })

    if (valid.length === 0) {
      // Aucune récolte exploitée
      await sendMessage(chatId,
        t(lang, 'voice_extracted_unclear', { transcription: payload.transcription }),
        merged.length > 0 ? {
          inline_keyboard: [
            [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
            [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
          ],
        } : buildMainMenu(lang)
      )
      return
    }

    // Acquittement : liste des saisies de ce message + reply_hint Gemini (déjà dans la langue du user)
    const ackLines = valid.map(h => `✓ ${h.planting_label} — <b>${h.qty_kg} kg</b>${h.notes ? ` <i>(${h.notes})</i>` : ''}`).join('\n')
    // Gemini renvoie reply_hint adapté à la langue → on le garde tel quel
    const replyHint = payload.reply_hint ?? ''
    await sendMessage(chatId,
      `🎤 <i>"${payload.transcription}"</i>\n\n` +
      `${ackLines}` +
      (replyHint ? `\n\n💬 ${replyHint}` : ''),
      {
        inline_keyboard: [
          [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
          [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
        ],
      }
    )
    return
  }

  // ─── INTENT : unknown ───────────────────────────────
  await sendMessage(chatId,
    `🎤 <i>"${payload.transcription}"</i>` +
    (payload.reply_hint ? `\n\n❓ ${payload.reply_hint}` : `\n\n${t(lang, 'voice_extracted_unclear', { transcription: '' }).split('\n\n')[1] ?? ''}`),
    pending.length > 0 ? {
      inline_keyboard: [
        [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
        [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
      ],
    } : buildMainMenu(lang)
  )
}

/** Confirme la session vocale : crée toutes les récoltes en batch. */
async function confirmVoiceSession(user: any): Promise<{ inserted: number; lots: string[] }> {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const pending: PendingHarvest[] = Array.isArray(state.pending) ? state.pending : []
  if (pending.length === 0) {
    await sendMessage(user.channel_user_id, t(lang, 'compose_no_lots'), buildMainMenu(lang))
    return { inserted: 0, lots: [] }
  }
  const today = new Date().toISOString().slice(0, 10)
  const ts = String(Date.now())
  const noteAuthor = `Saisie vocale via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`

  const inserted: string[] = []
  for (let i = 0; i < pending.length; i++) {
    const h = pending[i]
    const lot = `LOT-${today.replace(/-/g, '')}-${ts.slice(-4)}-${String(i + 1).padStart(2, '0')}`
    const notes = noteAuthor +
      (h.transcription ? `\nTranscription : "${h.transcription}"` : '') +
      (h.notes ? `\nNote : ${h.notes}` : '')
    const { error, data } = await supabase.from('harvests').insert({
      campaign_planting_id: h.planting_id,
      harvest_date: today,
      qty_category_1: h.qty_kg,
      qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
      lot_number: lot,
      notes,
    }).select('lot_number').single()
    if (error) {
      console.error('[voice] insert error:', error)
      continue
    }
    inserted.push(data!.lot_number)
  }

  await updateSession(user.id, {})
  const total = pending.slice(0, inserted.length).reduce((s, h) => s + h.qty_kg, 0)
  await sendMessage(user.channel_user_id,
    t(lang, 'voice_session_saved', {
      inserted: String(inserted.length),
      total: String(pending.length),
      date: today,
      kg: total.toLocaleString('fr-FR'),
    }) +
    '\n\n' +
    inserted.map(l => `• <code>${l}</code>`).join('\n'),
    buildMainMenu(lang)
  )
  return { inserted: inserted.length, lots: inserted }
}

// ─── COMPOSE DISPATCH (multi-récoltes → 1 envoi station) ─────

/** Récupère les récoltes des 7 derniers jours avec qté restante. */
async function listHarvestsAvailable(): Promise<any[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data: harvests } = await supabase.from('harvests')
    .select('id, lot_number, harvest_date, total_qty, campaign_planting_id, campaign_plantings(variety_id, greenhouse_id, greenhouses(code), varieties(commercial_name, code))')
    .gte('harvest_date', since)
    .order('harvest_date', { ascending: false })
    .limit(30)
  const hList = (harvests ?? []) as any[]
  if (hList.length === 0) return []
  // Calcule la quantité déjà engagée dans des envois (sources)
  const ids = hList.map(h => h.id)
  const { data: sources } = await supabase.from('harvest_lot_sources')
    .select('harvest_id, qty_contributed_kg')
    .in('harvest_id', ids)
  const usedByH = new Map<string, number>()
  ;(sources ?? []).forEach((s: any) => usedByH.set(s.harvest_id, (usedByH.get(s.harvest_id) ?? 0) + Number(s.qty_contributed_kg || 0)))
  // Aussi : anciennes lignes legacy avec harvest_id direct
  const { data: legacy } = await supabase.from('harvest_lots')
    .select('harvest_id, quantity_kg')
    .eq('category', 'station_dispatch')
    .in('harvest_id', ids)
  ;(legacy ?? []).forEach((d: any) => {
    if (d.harvest_id) usedByH.set(d.harvest_id, (usedByH.get(d.harvest_id) ?? 0) + Number(d.quantity_kg || 0))
  })
  return hList.map((h: any) => {
    const used = usedByH.get(h.id) ?? 0
    return { ...h, used, remaining: Math.max(0, Number(h.total_qty || 0) - used) }
  }).filter(h => h.remaining > 0.01)
}

/** Démarre la composition d'un lot station (multi-récoltes). */
async function startComposeDispatch(user: any) {
  const usable = await listHarvestsAvailable()
  if (usable.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_harvest_available'), buildMainMenu(user.language))
    return
  }
  await updateSession(user.id, { intent: 'compose_dispatch', step: 'pick_harvest', sources: [] })
  await renderComposePickHarvest(user, usable)
}

/** Affiche la liste des récoltes disponibles avec quantités déjà sélectionnées. */
async function renderComposePickHarvest(user: any, usable: any[]) {
  const state = (user.session_state ?? {}) as any
  const selected: any[] = state.sources ?? []
  const selectedIds = new Set(selected.map(s => s.harvest_id))
  const totalSelected = selected.reduce((s, x) => s + Number(x.qty_kg), 0)

  const buttons = usable.slice(0, 12).map((h: any) => {
    const isSel = selectedIds.has(h.id)
    const lbl = `${isSel ? '✓ ' : ''}${h.lot_number} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'} · ${Math.round(h.remaining)}kg dispo`
    return [{ text: lbl, callback_data: `compose:add:${h.id}` }]
  })
  buttons.push([
    { text: `✅ Terminer (${selected.length} lots · ${Math.round(totalSelected)}kg)`, callback_data: 'compose:done' },
    { text: '✖ Annuler', callback_data: 'cancel' },
  ])

  const lines: string[] = []
  lines.push('🚚 <b>Compose ton envoi station</b>')
  if (selected.length > 0) {
    // Groupe par variété pour montrer le split à venir
    const byVariety = new Map<string, { code: string; total: number; n: number }>()
    selected.forEach(s => {
      const code = s.variety_code ?? '?'
      const cur = byVariety.get(code) ?? { code, total: 0, n: 0 }
      cur.total += Number(s.qty_kg); cur.n += 1
      byVariety.set(code, cur)
    })
    lines.push('')
    lines.push('Sélectionnés :')
    for (const s of selected) {
      lines.push(`  ✓ ${s.lot_number} <i>[${s.variety_code ?? '?'}]</i> — ${s.qty_kg} kg`)
    }
    lines.push(`<b>Total : ${Math.round(totalSelected)} kg sur ${selected.length} lot(s)</b>`)
    if (byVariety.size > 1) {
      lines.push(`⚠ ${byVariety.size} variétés → <b>${byVariety.size} envois distincts</b> seront créés (1 par variété)`)
      for (const [code, v] of byVariety.entries()) {
        lines.push(`   • ${code} : ${Math.round(v.total)} kg sur ${v.n} lot(s)`)
      }
    }
  }
  lines.push('')
  lines.push('Choisis un lot à ajouter (ou termine) :')
  await sendMessage(user.channel_user_id, lines.join('\n'), { inline_keyboard: buttons })
}

/** Étape : utilisateur clique sur un lot → demande la qty à ajouter. */
async function continueComposeAddHarvest(user: any, harvestId: string) {
  const state = (user.session_state ?? {}) as any
  const usable = await listHarvestsAvailable()
  const h: any = usable.find((x: any) => x.id === harvestId)
  if (!h) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_unavailable'))
    return
  }
  // Vérifie que pas déjà sélectionné
  const sources: any[] = state.sources ?? []
  if (sources.find(s => s.harvest_id === harvestId)) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_already_added'))
    return
  }
  await updateSession(user.id, {
    ...state,
    step: 'ask_qty_for_harvest',
    pending_harvest: {
      harvest_id: harvestId,
      lot_number: h.lot_number,
      max_qty: h.remaining,
      variety_id: h.campaign_plantings?.variety_id,
      variety_code: h.campaign_plantings?.varieties?.code,
      greenhouse_id: h.campaign_plantings?.greenhouse_id,
      campaign_planting_id: h.campaign_planting_id,
    },
  })
  await sendMessage(user.channel_user_id,
    `📦 ${h.lot_number} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'}\n` +
    `Disponible : <b>${Math.round(h.remaining)} kg</b>\n\n` +
    `Combien mettre dans l'envoi ? Tape la quantité (ou <code>tout</code> pour tout prendre).\n` +
    `🎤 Tu peux aussi répondre par message vocal.`
  )
}

/** Étape : reçoit la qty contributing, ajoute à la session. */
async function continueComposeSaveQty(user: any, text: string) {
  const state = (user.session_state ?? {}) as any
  const ph = state.pending_harvest
  if (!ph) { await sendMessage(user.channel_user_id, t(user.language, 'session_lost')); return }
  const max = Number(ph.max_qty)
  let qty: number
  if (text.toLowerCase().trim() === 'tout') {
    qty = max
  } else {
    qty = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_qty_invalid_or_all'))
    return
  }
  if (qty > max + 0.01) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_qty_exceeds', { max: String(Math.round(max)) }))
    return
  }
  const sources = [...(state.sources ?? []), {
    harvest_id: ph.harvest_id,
    lot_number: ph.lot_number,
    qty_kg: qty,
    variety_id: ph.variety_id,
    variety_code: ph.variety_code,
    greenhouse_id: ph.greenhouse_id,
    campaign_planting_id: ph.campaign_planting_id,
  }]
  await updateSession(user.id, { ...state, step: 'pick_harvest', sources, pending_harvest: null })

  // Acquittement explicite + invite claire à continuer
  await sendMessage(user.channel_user_id,
    `✓ Ajouté : <b>${qty} kg</b> du lot <code>${ph.lot_number}</code>` +
    (ph.variety_code ? ` <i>[${ph.variety_code}]</i>` : '') + '\n' +
    `📌 <b>Total session : ${sources.length} lot(s)</b>\n\n` +
    `Tu peux continuer à ajouter d'autres lots ou cliquer <b>✅ Terminer</b> ↓`
  )

  // Réaffiche la liste avec ✓ sur les lots déjà ajoutés
  const usable = await listHarvestsAvailable()
  await renderComposePickHarvest({ ...user, session_state: { ...state, sources, pending_harvest: null } }, usable)
}

/** Étape : utilisateur clique "Terminer la composition" → demande marché. */
async function continueComposePickMarket(user: any) {
  const state = (user.session_state ?? {}) as any
  const sources: any[] = state.sources ?? []
  if (sources.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_lots'), buildMainMenu(user.language))
    await updateSession(user.id, {})
    return
  }
  const { data: markets } = await supabase.from('markets')
    .select('id, code, name').eq('is_active', true).order('name').limit(15)
  const mList = (markets ?? []) as any[]
  if (mList.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_market'), buildMainMenu(user.language))
    await updateSession(user.id, {})
    return
  }
  const buttons = mList.map((m: any) => ([{
    text: `🌍 ${m.name}${m.code ? ' (' + m.code + ')' : ''}`,
    callback_data: `compose:market:${m.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await updateSession(user.id, { ...state, step: 'pick_market' })
  const total = sources.reduce((s, x) => s + Number(x.qty_kg), 0)
  await sendMessage(user.channel_user_id,
    `🚚 Envoi composé : <b>${sources.length} lot(s) · ${Math.round(total)} kg</b>\n\nVers quel marché ?`,
    { inline_keyboard: buttons }
  )
}

/** Étape : finalise — crée 1 harvest_lot PAR VARIÉTÉ + sources. */
async function continueComposeSaveMarket(user: any, marketId: string): Promise<string | null> {
  const state = (user.session_state ?? {}) as any
  const sources: any[] = state.sources ?? []
  if (sources.length === 0) { await sendMessage(user.channel_user_id, t(user.language, 'compose_session_empty')); return null }
  const { data: market } = await supabase.from('markets').select('name').eq('id', marketId).maybeSingle()
  const totalQty = sources.reduce((s, x) => s + Number(x.qty_kg), 0)
  const ts = String(Date.now())
  const today = new Date().toISOString().slice(0, 10)

  // Groupe les sources par variété (1 harvest_lot par variété, NOT NULL contrainte)
  const groups = new Map<string, any[]>()
  for (const s of sources) {
    const vid = s.variety_id
    if (!vid) {
      await sendMessage(user.channel_user_id, t(user.language, 'compose_no_variety', { lot: s.lot_number }))
      return null
    }
    const arr = groups.get(vid) ?? []
    arr.push(s); groups.set(vid, arr)
  }

  type Created = { lot_number: string; variety_code: string; total: number }
  const created: Created[] = []
  let groupIdx = 0
  let firstLotId: string | null = null
  for (const [varietyId, gSources] of groups.entries()) {
    groupIdx++
    const sub = gSources[0]
    const subTotal = gSources.reduce((s: number, x: any) => s + Number(x.qty_kg), 0)
    const dispLot = `D${ts.slice(-8)}-${String(groupIdx).padStart(2, '0')}`.slice(0, 50)

    const { data: lot, error } = await supabase.from('harvest_lots').insert({
      lot_number: dispLot,
      harvest_id: gSources.length === 1 ? gSources[0].harvest_id : null,
      campaign_planting_id: sub.campaign_planting_id,
      harvest_date: today,
      quantity_kg: subTotal,
      category: 'station_dispatch',
      variety_id: varietyId,
      greenhouse_id: sub.greenhouse_id,
      market_id: marketId,
      tri_status: 'pending',
      notes: `Envoi composite via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''} — ${gSources.length} récolte(s) variété ${sub.variety_code ?? '?'}`,
    }).select('id, lot_number').single()
    if (error) {
      await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_error', { idx: String(groupIdx), msg: error.message }))
      return null
    }
    if (!firstLotId) firstLotId = lot!.id

    const sourceRows = gSources.map((s: any) => ({
      harvest_lot_id: lot!.id, harvest_id: s.harvest_id, qty_contributed_kg: Number(s.qty_kg),
    }))
    const { error: srcErr } = await supabase.from('harvest_lot_sources').insert(sourceRows)
    if (srcErr) console.error('[compose] sources error:', srcErr)

    created.push({ lot_number: lot!.lot_number, variety_code: sub.variety_code ?? '?', total: subTotal })
  }

  await updateSession(user.id, {})
  const lotsList = created.map(c => `  • <code>${c.lot_number}</code> [${c.variety_code}] — ${Math.round(c.total)} kg`).join('\n')
  const message = created.length === 1
    ? `✅ <b>Envoi station créé</b>\n` +
      `Dispatch : <code>${created[0].lot_number}</code>\n` +
      `Marché : ${market?.name ?? '?'}\n` +
      `Variété : ${created[0].variety_code}\n` +
      `Total : <b>${Math.round(totalQty)} kg</b> sur ${sources.length} récolte(s)`
    : `✅ <b>${created.length} envois station créés</b>\n` +
      `Marché : ${market?.name ?? '?'}\n` +
      `(splittés automatiquement par variété)\n\n` +
      lotsList +
      `\n\n<b>Total : ${Math.round(totalQty)} kg</b> sur ${sources.length} récolte(s)`

  await sendMessage(user.channel_user_id,
    `${message}\n\n📌 Prochaine étape : <b>🔬 Saisir tri</b> (freinte + écart) après réception station.`,
    mainMenuKeyboard
  )
  return firstLotId
}

// ─── TRI FLOW (freinte + écart, sans prix) ───────────────────

/** Liste les dispatches en attente de tri (tri_status='pending'). */
async function startTriFlow(user: any) {
  const { data } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, harvest_date, market_id, markets(name), variety_id, varieties(code)')
    .eq('category', 'station_dispatch')
    .eq('tri_status', 'pending')
    .order('harvest_date', { ascending: false })
    .limit(15)
  const list = (data ?? []) as any[]
  if (list.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'tri_nothing_to_sort'), buildMainMenu(user.language))
    return
  }
  await updateSession(user.id, { intent: 'tri', step: 'pick_dispatch' })
  const buttons = list.map((d: any) => ([{
    text: `${d.lot_number} · ${d.markets?.name ?? '?'} · [${d.varieties?.code ?? '?'}] · ${Math.round(d.quantity_kg)}kg`,
    callback_data: `tri:dispatch:${d.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(user.language, 'tri_pick_dispatch'), { inline_keyboard: buttons })
}

async function continueTriPickDispatch(user: any, dispatchId: string) {
  const { data: d } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, markets(name), varieties(code, commercial_name)')
    .eq('id', dispatchId).maybeSingle()
  if (!d) { await sendMessage(user.channel_user_id, t(user.language, 'not_found')); return }
  const dd: any = d
  await updateSession(user.id, {
    intent: 'tri', step: 'ask_freinte',
    dispatch_id: dispatchId,
    dispatch_lot: dd.lot_number,
    qty_brute: Number(dd.quantity_kg),
    market_name: dd.markets?.name ?? '?',
    variety_code: dd.varieties?.code ?? '?',
  })
  await sendMessage(user.channel_user_id,
    `🔬 ${dd.lot_number} · ${dd.markets?.name ?? '?'} · [${dd.varieties?.code ?? '?'}] · ${Math.round(dd.quantity_kg)}kg brute\n\nFreinte (% perte au tri) ? Tape <b>0</b> si pas de freinte, utilise les boutons, ou 🎤 dicte :`,
    { inline_keyboard: [
      [{ text: '0%', callback_data: 'tri:freinte:0' }, { text: '3%', callback_data: 'tri:freinte:3' }, { text: '5%', callback_data: 'tri:freinte:5' }, { text: '10%', callback_data: 'tri:freinte:10' }],
      [{ text: '✖ Annuler', callback_data: 'cancel' }],
    ]}
  )
}

async function continueTriSaveFreinte(user: any, freinte: number) {
  const state = (user.session_state ?? {}) as any
  await updateSession(user.id, { ...state, step: 'ask_ecart', freinte_pct: freinte })
  await sendMessage(user.channel_user_id,
    `Freinte : <b>${freinte}%</b>\n\nÉcart qualité (%) ? Boutons, texte ou 🎤 vocal.`,
    { inline_keyboard: [
      [{ text: '0%', callback_data: 'tri:ecart:0' }, { text: '2%', callback_data: 'tri:ecart:2' }, { text: '5%', callback_data: 'tri:ecart:5' }, { text: '10%', callback_data: 'tri:ecart:10' }],
      [{ text: '✖ Annuler', callback_data: 'cancel' }],
    ]}
  )
}

async function continueTriFinalize(user: any, ecart: number) {
  const state = (user.session_state ?? {}) as any
  const qtyB = Number(state.qty_brute) || 0
  const fr = Number(state.freinte_pct) || 0
  const qtyN = Math.round(qtyB * (1 - fr / 100) * 100) / 100
  const qtyA = Math.round(qtyN * (1 - ecart / 100) * 100) / 100
  const { error } = await supabase.from('harvest_lots').update({
    freinte_pct: fr,
    ecart_pct: ecart,
    qty_nette_kg: qtyN,
    qty_acceptee_kg: qtyA,
    tri_status: 'tried',
  }).eq('id', state.dispatch_id)
  if (error) {
    await sendMessage(user.channel_user_id, t(user.language, 'error_with_msg', { msg: error.message }))
    return
  }
  await updateSession(user.id, {})
  await sendMessage(user.channel_user_id,
    `✅ <b>Tri enregistré</b>\n` +
    `${state.dispatch_lot}\n` +
    `Brute : ${qtyB} kg\n` +
    `Freinte : ${fr}% → Nette : ${qtyN} kg\n` +
    `Écart : ${ecart}% → <b>Acceptée : ${qtyA} kg</b>\n\n` +
    `📌 Prochaine étape : <b>💰 Confirmer prix</b>.`,
    mainMenuKeyboard
  )
}

// ─── CONFIRM PRICE FLOW (sans freinte/écart, déjà saisis au tri) ──

async function startConfirmPriceFlow(user: any) {
  const { data: disps } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, qty_acceptee_kg, harvest_date, market_id, markets(name, currency), variety_id, varieties(code)')
    .eq('category', 'station_dispatch')
    .eq('tri_status', 'tried')
    .order('harvest_date', { ascending: false })
    .limit(15)
  const list = (disps ?? []) as any[]
  if (list.length === 0) {
    await sendMessage(user.channel_user_id,
      '✅ Aucun envoi trié en attente de prix.\n\n' +
      '<i>Astuce : assure-toi d\'avoir saisi le tri (freinte + écart) avant le prix.</i>',
      mainMenuKeyboard
    )
    return
  }
  await updateSession(user.id, { intent: 'confirm_price', step: 'pick_dispatch' })
  const buttons = list.map((d: any) => ([{
    text: `${d.lot_number} · ${d.markets?.name ?? '?'} · [${d.varieties?.code ?? '?'}] · ${Math.round(d.qty_acceptee_kg ?? d.quantity_kg)}kg acceptée`,
    callback_data: `price:dispatch:${d.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(user.language, 'price_pick_dispatch'), { inline_keyboard: buttons })
}

async function continuePricePickDispatch(user: any, dispatchId: string) {
  const { data: d } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, qty_acceptee_kg, freinte_pct, ecart_pct, markets(name, currency), varieties(code, commercial_name)')
    .eq('id', dispatchId).maybeSingle()
  if (!d) { await sendMessage(user.channel_user_id, t(user.language, 'not_found')); return }
  const dd: any = d
  await updateSession(user.id, {
    intent: 'confirm_price', step: 'ask_price',
    dispatch_id: dispatchId,
    dispatch_lot: dd.lot_number,
    qty_acceptee: Number(dd.qty_acceptee_kg ?? dd.quantity_kg),
    qty_brute: Number(dd.quantity_kg),
    freinte_pct: Number(dd.freinte_pct ?? 0),
    ecart_pct: Number(dd.ecart_pct ?? 0),
    market_name: dd.markets?.name ?? '?',
    variety_code: dd.varieties?.code ?? '?',
    currency: dd.markets?.currency ?? 'MAD',
  })
  await sendMessage(user.channel_user_id,
    `💰 ${dd.lot_number} · ${dd.markets?.name ?? '?'} · <b>[${dd.varieties?.code ?? '?'}]</b>\n` +
    `Brute ${Number(dd.quantity_kg)} kg → Acceptée <b>${Number(dd.qty_acceptee_kg ?? dd.quantity_kg)} kg</b>\n` +
    `(freinte ${dd.freinte_pct}%, écart ${dd.ecart_pct}%)\n\n` +
    `Quel prix au kg pour <b>${dd.varieties?.code ?? '?'}</b> sur <b>${dd.markets?.name ?? '?'}</b> ? (en ${dd.markets?.currency ?? 'MAD'})\nExemple : <code>8.50</code> · 🎤 vocal accepté`
  )
}

async function continuePriceSavePrice(user: any, text: string) {
  const state = (user.session_state ?? {}) as any
  const price = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(price) || price <= 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'price_invalid'))
    return
  }
  await updateSession(user.id, { ...state, step: 'ask_station_ref', price })
  await sendMessage(user.channel_user_id,
    `Prix : <b>${price} ${state.currency}/kg</b>\n\nRéférence station / bordereau ? (tape <b>-</b> pour passer, ou 🎤 vocal)`
  )
}

async function continuePriceFinalize(user: any, stationRef: string) {
  const state = (user.session_state ?? {}) as any
  const ref = stationRef.trim() === '-' ? null : stationRef.trim()
  const today = new Date().toISOString().slice(0, 10)
  const qtyA = Number(state.qty_acceptee) || 0
  const ca = Math.round(qtyA * Number(state.price) * 100) / 100

  const { error } = await supabase.from('harvest_lots').update({
    price_per_kg: state.price,
    ca_amount: ca,
    station_ref: ref,
    receipt_date: today,
    periode_debut: today,
    periode_fin: today,
    certificate_number: String(qtyA), // legacy compat
    tri_status: 'priced',
  }).eq('id', state.dispatch_id)
  if (error) {
    await sendMessage(user.channel_user_id, t(user.language, 'error_with_msg', { msg: error.message }))
    return
  }
  await updateSession(user.id, {})
  await sendMessage(user.channel_user_id,
    `✅ <b>Prix confirmé</b>\n` +
    `Lot : <code>${state.dispatch_lot}</code>\n` +
    `Acceptée : ${qtyA} kg × <b>${state.price} ${state.currency}/kg</b>\n` +
    `<b>CA : ${ca.toLocaleString('fr-FR')} ${state.currency}</b>\n` +
    (ref ? `Réf. station : ${ref}` : ''),
    mainMenuKeyboard
  )
}

// ─── (legacy single-harvest dispatch supprimé : remplacé par compose) ───

// (startDispatchFlow legacy supprimée — remplacée par startComposeDispatch)
/** Liste les 5 derniers lots de l'utilisateur. */
async function showMyLots(user: any) {
  // Pour V1 : les lots récents de la dernière semaine, toutes plantations
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('harvests')
    .select('lot_number, harvest_date, total_qty, campaign_plantings(greenhouses(code), varieties(code))')
    .gte('harvest_date', since)
    .order('harvest_date', { ascending: false })
    .limit(10)
  if (!data || data.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'my_lots_empty'), buildMainMenu(user.language))
    return
  }
  const lines = data.map((h: any) =>
    `• ${h.harvest_date} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'} · ${Number(h.total_qty).toLocaleString('fr-FR')} kg · <code>${h.lot_number}</code>`
  ).join('\n')
  await sendMessage(user.channel_user_id, `${t(user.language, 'my_lots_title')}\n\n${lines}`, buildMainMenu(user.language))
}

// ─── Webhook handler ─────────────────────────────────────────
Deno.serve(async (req) => {
  // Vérification du secret Telegram
  if (TELEGRAM_WEBHOOK_SECRET) {
    const got = req.headers.get('x-telegram-bot-api-secret-token')
    if (got !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  try {
    const update = await req.json()
    // Logge tous les updates pour debug
    console.log('[telegram] update:', JSON.stringify(update).slice(0, 500))

    // Extrait chat_id et texte selon le type d'update
    let chatId: string | null = null
    let from: any = null
    let text: string | null = null
    let voice: any = null              // message vocal Telegram
    let callbackData: string | null = null
    let callbackId: string | null = null

    if (update.message) {
      chatId = String(update.message.chat.id)
      from = update.message.from
      text = update.message.text
      voice = update.message.voice ?? update.message.audio ?? null
    } else if (update.callback_query) {
      chatId = String(update.callback_query.from.id)
      from = update.callback_query.from
      callbackData = update.callback_query.data
      callbackId = update.callback_query.id
    } else {
      return new Response('OK', { status: 200 })
    }
    if (!chatId) return new Response('OK', { status: 200 })

    // ─── Cas /start ─────────────────────────────────────
    if (text?.startsWith('/start')) {
      const args = text.split(/\s+/).slice(1)
      const intent = await handleStart(chatId, args, from)
      await logMessage({
        chatbot_user_id: null, direction: 'in', content: text, intent, raw_update: update,
      })
      return new Response('OK', { status: 200 })
    }

    // ─── Authentification (chatbot_user existant et enrôlé) ──
    const user = await authUser(chatId)
    if (!user || !user.enrolled_at) {
      await sendMessage(chatId,
        "🔒 Tu n'es pas encore inscrit. Demande un code d'invitation à ton responsable et envoie :\n<code>/start TONCODE</code>"
      )
      return new Response('OK', { status: 200 })
    }

    // ─── Callbacks (boutons) ────────────────────────────
    if (callbackData) {
      if (callbackId) await answerCallbackQuery(callbackId)
      await logMessage({
        chatbot_user_id: user.id, direction: 'in', content: `[callback] ${callbackData}`, intent: 'callback', raw_update: update,
      })

      if (callbackData === 'cancel') {
        await updateSession(user.id, {})
        await sendMessage(chatId, t(user.language, 'cancelled_what_to_do'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'menu:voice_session') {
        await updateSession(user.id, { intent: 'voice_session', pending: [] })
        await sendMessage(chatId,
          t(user.language, 'voice_session_open'),
          {
            inline_keyboard: [
              [{ text: t(user.language, 'voice_show_recap'), callback_data: 'voice:show_recap' }],
              [{ text: t(user.language, 'cancel'), callback_data: 'cancel' }],
            ],
          }
        )
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'menu:harvest') { await startHarvestFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:compose_dispatch') { await startComposeDispatch(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:tri') { await startTriFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:confirm_price') { await startConfirmPriceFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:no_harvest') { await startNoHarvestFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:my_lots') { await showMyLots(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:help') {
        await sendMessage(chatId, t(user.language, 'help_text'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('harvest:planting:')) {
        const plantingId = callbackData.split(':')[2]
        await continueHarvestPickPlanting(user, plantingId)
        return new Response('OK', { status: 200 })
      }
      // Composition envoi station
      if (callbackData.startsWith('compose:add:')) {
        const harvestId = callbackData.split(':')[2]
        await continueComposeAddHarvest(user, harvestId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'compose:done') {
        await continueComposePickMarket(user)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('compose:market:')) {
        const marketId = callbackData.split(':')[2]
        await continueComposeSaveMarket(user, marketId)
        return new Response('OK', { status: 200 })
      }
      // Tri à la station
      if (callbackData.startsWith('tri:dispatch:')) {
        const dispatchId = callbackData.split(':')[2]
        await continueTriPickDispatch(user, dispatchId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('tri:freinte:')) {
        const v = Number(callbackData.split(':')[2]) || 0
        await continueTriSaveFreinte(user, v)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('tri:ecart:')) {
        const v = Number(callbackData.split(':')[2]) || 0
        await continueTriFinalize(user, v)
        return new Response('OK', { status: 200 })
      }
      // Confirmer prix (sans freinte/écart, déjà saisis au tri)
      if (callbackData.startsWith('price:dispatch:')) {
        const dispatchId = callbackData.split(':')[2]
        await continuePricePickDispatch(user, dispatchId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:show_recap') {
        const state = (user.session_state ?? {}) as any
        const pending = Array.isArray(state.pending) ? state.pending : []
        await showVoiceSessionRecap(chatId, pending)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:continue') {
        await sendMessage(chatId, t(user.language, 'voice_continue_dictating'))
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:confirm_all') {
        const r = await confirmVoiceSession(user)
        await logMessage({
          chatbot_user_id: user.id, direction: 'out', content: `voice batch saved: ${r.inserted} lots`,
          intent: 'harvest', parsed_data: { lots: r.lots },
        })
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:confirm_then_no_harvest') {
        await confirmVoiceSession(user)
        await startNoHarvestFlow(user)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('no_harvest:reason:')) {
        const reason = callbackData.split(':')[2]
        if (reason === 'autre') {
          await updateSession(user.id, { intent: 'no_harvest', step: 'ask_other_reason' })
          await sendMessage(chatId, t(user.language, 'specify_reason'))
        } else {
          const alertId = await saveNoHarvest(user, reason)
          await logMessage({
            chatbot_user_id: user.id, direction: 'out', content: 'no_harvest saved',
            intent: 'no_harvest', parsed_data: { reason }, created_alert_id: alertId ?? undefined,
          })
        }
        return new Response('OK', { status: 200 })
      }

      // Default
      await sendMessage(chatId, t(user.language, 'unknown_action'), buildMainMenu(user.language))
      return new Response('OK', { status: 200 })
    }

    // ─── Messages vocaux ────────────────────────────────
    if (voice) {
      await logMessage({
        chatbot_user_id: user.id, direction: 'in',
        content: `[voice ${voice.duration ?? '?'}s ${voice.file_size ?? '?'}b]`,
        intent: 'voice', raw_update: update,
      })
      await handleVoiceMessage(user, voice)
      return new Response('OK', { status: 200 })
    }

    // ─── Messages texte ─────────────────────────────────
    if (text) {
      await logMessage({
        chatbot_user_id: user.id, direction: 'in', content: text, intent: 'text', raw_update: update,
      })

      if (text === '/menu' || text === '/help') {
        await sendMessage(chatId, t(user.language, 'what_to_do'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }

      // Continuer un flow en cours
      const state = (user.session_state ?? {}) as any

      // Si session vocale active : détecter "fini" / "c'est tout" en texte → afficher récap
      if (state.intent === 'voice_session') {
        const lower = text.toLowerCase().trim()
        const doneKeywords = ['fini', "c'est tout", 'cest tout', 'cest fini', "c'est fini", 'termine', 'terminé', 'terminer', 'voila', 'voilà', 'khlas', 'rien dautre', "rien d'autre", 'non', 'non c\'est tout']
        if (doneKeywords.some(k => lower === k || lower.startsWith(k + ' ') || lower.endsWith(' ' + k))) {
          const pending = Array.isArray(state.pending) ? state.pending : []
          await showVoiceSessionRecap(chatId, pending)
          return new Response('OK', { status: 200 })
        }
      }

      if (state.intent === 'new_harvest' && state.step === 'ask_qty') {
        const harvestId = await continueHarvestSaveQty(user, text)
        if (harvestId) {
          await logMessage({
            chatbot_user_id: user.id, direction: 'out', content: 'harvest saved',
            intent: 'harvest', parsed_data: { qty: text }, created_harvest_id: harvestId,
          })
        }
        return new Response('OK', { status: 200 })
      }
      // Composer un envoi : reçoit la qty à contribuer pour un harvest
      if (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest') {
        await continueComposeSaveQty(user, text)
        return new Response('OK', { status: 200 })
      }
      // Tri : freinte/écart en texte si pas via boutons
      if (state.intent === 'tri' && state.step === 'ask_freinte') {
        const v = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          await sendMessage(chatId, t(user.language, 'invalid_input_pct'))
          return new Response('OK', { status: 200 })
        }
        await continueTriSaveFreinte(user, v)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'tri' && state.step === 'ask_ecart') {
        const v = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          await sendMessage(chatId, t(user.language, 'invalid_input_pct'))
          return new Response('OK', { status: 200 })
        }
        await continueTriFinalize(user, v)
        return new Response('OK', { status: 200 })
      }
      // Confirmer prix : prix puis station_ref
      if (state.intent === 'confirm_price' && state.step === 'ask_price') {
        await continuePriceSavePrice(user, text)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'confirm_price' && state.step === 'ask_station_ref') {
        await continuePriceFinalize(user, text)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'no_harvest' && state.step === 'ask_other_reason') {
        const alertId = await saveNoHarvest(user, 'autre', text)
        await logMessage({
          chatbot_user_id: user.id, direction: 'out', content: 'no_harvest saved (autre)',
          intent: 'no_harvest', parsed_data: { reason: 'autre', notes: text }, created_alert_id: alertId ?? undefined,
        })
        return new Response('OK', { status: 200 })
      }

      // Pas de flow en cours
      await sendMessage(chatId,
        'Je n\'ai pas compris. Utilise les boutons ou tape /menu.',
        mainMenuKeyboard
      )
      return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('[telegram] error:', e)
    return new Response('Internal error', { status: 500 })
  }
})
