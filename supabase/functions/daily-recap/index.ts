// ============================================================
// DAILY RECAP — récap quotidien envoyé via Telegram
// Agrège récoltes / dispatches / en-attente / alertes du jour
// et envoie à tous les chatbot_users qui ont receive_recap = TRUE.
//
// Déclenchement :
//   - Cron Supabase quotidien (voir migration 022)
//   - Manuel : POST /functions/v1/daily-recap (bouton "envoyer maintenant"
//     côté UI) — peut accepter { date: 'YYYY-MM-DD', dryRun: bool, target_user_ids: [] }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

async function sendTelegram(chatId: string, text: string) {
  const r = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  return r.json()
}

/** Agrège les données pour une date donnée (format YYYY-MM-DD). */
async function buildRecap(date: string): Promise<string> {
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // 1) Récoltes du jour
  const { data: harvests } = await supabase.from('harvests')
    .select('id, lot_number, total_qty, notes, campaign_plantings(greenhouses(code), varieties(code, commercial_name))')
    .eq('harvest_date', date)
  const hList = (harvests ?? []) as any[]
  const totalKg = hList.reduce((s, h) => s + Number(h.total_qty || 0), 0)
  const viaTelegram = hList.filter(h => (h.notes ?? '').includes('Telegram')).length

  // Top lots du jour
  const top = [...hList].sort((a, b) => Number(b.total_qty) - Number(a.total_qty)).slice(0, 3)

  // 2) Dispatches du jour (harvest_lots category=station_dispatch)
  const { data: dispatches } = await supabase.from('harvest_lots')
    .select('id, quantity_kg, certificate_number, market_id, markets(name, currency), harvest_date')
    .eq('category', 'station_dispatch')
    .eq('harvest_date', date)
  const dList = (dispatches ?? []) as any[]
  const totalDispatchKg = dList.reduce((s, d) => s + Number(d.quantity_kg || 0), 0)

  // Top marchés
  const byMarket = new Map<string, { name: string; kg: number }>()
  dList.forEach(d => {
    const id = d.market_id ?? '?'
    const cur = byMarket.get(id) ?? { name: d.markets?.name ?? '?', kg: 0 }
    cur.kg += Number(d.quantity_kg || 0)
    byMarket.set(id, cur)
  })
  const topMarkets = [...byMarket.values()].sort((a, b) => b.kg - a.kg).slice(0, 3)

  // 3) Récoltes du jour NON dispatchées (qty récolte > somme dispatches)
  const harvestIds = hList.map(h => h.id)
  let pendingDispatchKg = 0
  let pendingDispatchCount = 0
  if (harvestIds.length > 0) {
    const { data: dispOfHarvests } = await supabase.from('harvest_lots')
      .select('harvest_id, quantity_kg')
      .eq('category', 'station_dispatch')
      .in('harvest_id', harvestIds)
    const dispByHarvest = new Map<string, number>()
    ;(dispOfHarvests ?? []).forEach((d: any) => {
      dispByHarvest.set(d.harvest_id, (dispByHarvest.get(d.harvest_id) ?? 0) + Number(d.quantity_kg || 0))
    })
    hList.forEach(h => {
      const dispatched = dispByHarvest.get(h.id) ?? 0
      const remaining = Number(h.total_qty || 0) - dispatched
      if (remaining > 0.01) {
        pendingDispatchKg += remaining
        pendingDispatchCount++
      }
    })
  }

  // 4) Dispatches sans prix confirmé (toutes dates, pas juste aujourd'hui — backlog)
  const { data: noPrice } = await supabase.from('harvest_lots')
    .select('id, quantity_kg, harvest_date')
    .eq('category', 'station_dispatch')
    .is('certificate_number', null)
  const noPriceList = (noPrice ?? []) as any[]
  const noPriceCount = noPriceList.length
  const noPriceKg = noPriceList.reduce((s, d) => s + Number(d.quantity_kg || 0), 0)

  // 5) Alertes du jour (journées sans récolte)
  const { data: alerts } = await supabase.from('alerts')
    .select('id, title, message, created_at')
    .eq('type', 'no_harvest')
    .gte('created_at', date + 'T00:00:00')
    .lt('created_at', date + 'T23:59:59')
  const alertCount = (alerts ?? []).length

  // ─── Construction du message ────────────────────────
  const lines: string[] = []
  lines.push(`📊 <b>Récap journalier</b> — ${dateLabel}`)
  lines.push('')

  lines.push('🌿 <b>RÉCOLTES DU JOUR</b>')
  if (hList.length === 0) {
    lines.push('   <i>Aucune récolte saisie aujourd\'hui</i>')
  } else {
    lines.push(`   • <b>${hList.length}</b> lot(s) · <b>${fmt(totalKg)} kg</b> total`)
    if (viaTelegram > 0) lines.push(`   • ${viaTelegram} via Telegram 🤖`)
    if (top.length > 0) {
      lines.push('   • Top lots :')
      top.forEach(h => {
        const serre = h.campaign_plantings?.greenhouses?.code ?? '?'
        const variete = h.campaign_plantings?.varieties?.commercial_name ?? '?'
        lines.push(`     - ${serre} / ${variete} : <b>${fmt(h.total_qty)} kg</b>`)
      })
    }
  }
  lines.push('')

  lines.push('📦 <b>DISPATCHES DU JOUR</b>')
  if (dList.length === 0) {
    lines.push('   <i>Aucun dispatch effectué aujourd\'hui</i>')
  } else {
    lines.push(`   • <b>${dList.length}</b> dispatch(es) · <b>${fmt(totalDispatchKg)} kg</b>`)
    if (topMarkets.length > 0) {
      lines.push('   • Marchés :')
      topMarkets.forEach(m => lines.push(`     - ${m.name} : ${fmt(m.kg)} kg`))
    }
  }
  lines.push('')

  lines.push('⏳ <b>EN ATTENTE</b>')
  if (pendingDispatchCount === 0 && noPriceCount === 0) {
    lines.push('   <i>Tout est à jour ✓</i>')
  } else {
    if (pendingDispatchCount > 0) {
      lines.push(`   • ${pendingDispatchCount} récolte(s) du jour non dispatchée(s) · <b>${fmt(pendingDispatchKg)} kg</b>`)
    }
    if (noPriceCount > 0) {
      lines.push(`   • ${noPriceCount} dispatch(es) sans prix confirmé · ${fmt(noPriceKg)} kg <i>(tous dates)</i>`)
    }
  }

  if (alertCount > 0) {
    lines.push('')
    lines.push(`⚠️ <b>${alertCount} alerte(s) journée sans récolte</b> signalée(s)`)
  }

  return lines.join('\n')
}

/** Liste les destinataires (chatbot_users opt-in + enrôlés). */
async function listRecipients(targetUserIds?: string[]) {
  let q = supabase.from('chatbot_users')
    .select('id, channel, channel_user_id, worker_id, workers(first_name, last_name)')
    .eq('is_active', true)
    .not('enrolled_at', 'is', null)
  if (targetUserIds && targetUserIds.length > 0) {
    q = q.in('id', targetUserIds)
  } else {
    q = q.eq('receive_recap', true)
  }
  const { data } = await q
  return (data ?? []).filter((u: any) => u.channel === 'telegram')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const date: string = body.date ?? new Date().toISOString().slice(0, 10)
    const dryRun: boolean = body.dryRun === true
    const targetUserIds: string[] | undefined = body.target_user_ids

    console.log('[daily-recap] date=', date, 'dryRun=', dryRun, 'targets=', targetUserIds)

    const recap = await buildRecap(date)
    const recipients = await listRecipients(targetUserIds)

    if (dryRun) {
      return new Response(JSON.stringify({ recap, recipients_count: recipients.length, recipients }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const results: any[] = []
    for (const r of recipients) {
      try {
        const res = await sendTelegram((r as any).channel_user_id, recap)
        results.push({ user_id: (r as any).id, ok: res?.ok ?? false, error: res?.description ?? null })
      } catch (e: any) {
        results.push({ user_id: (r as any).id, ok: false, error: e?.message ?? String(e) })
      }
    }

    return new Response(JSON.stringify({
      sent: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      recipients_count: recipients.length,
      results,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (e: any) {
    console.error('[daily-recap] error:', e)
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
