// Edge Function : purchase-order-receive
// Enregistre une réception (partielle ou totale) sur un bon d'achat :
//   1. Met à jour purchase_order_lines.received_qty pour chaque ligne
//   2. Crée les stock_movements correspondants (type 'entree')
//   3. Met à jour stock_items.current_qty
//   4. Calcule et applique la transition workflow (partiellement_recu / recu)
//
// Entrée:
//   {
//     poId: string,
//     receptionDate?: string,  // ISO date, défaut aujourd'hui
//     reference?: string,
//     notes?: string,
//     lines: [{ lineId: string, qtyReceived: number }]
//   }
//
// Sortie:
//   { new_status: string, lines_updated: number, movements_created: number }

// @ts-ignore
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

async function findTransition(supabase: any, defEntityType: string, fromCode: string, toCode: string) {
  const { data: def } = await supabase
    .from('workflow_definitions')
    .select('id')
    .eq('entity_type', defEntityType).eq('is_default', true).eq('is_active', true)
    .maybeSingle()
  if (!def) return null

  const { data: fromState } = await supabase
    .from('workflow_states').select('id').eq('definition_id', def.id).eq('code', fromCode).maybeSingle()
  const { data: toState } = await supabase
    .from('workflow_states').select('id').eq('definition_id', def.id).eq('code', toCode).maybeSingle()
  if (!fromState || !toState) return null

  const { data: tr } = await supabase
    .from('workflow_transitions')
    .select('id')
    .eq('definition_id', def.id)
    .eq('from_state_id', fromState.id)
    .eq('to_state_id', toState.id)
    .eq('is_active', true)
    .maybeSingle()
  return tr ? { transitionId: tr.id, definitionId: def.id } : null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée' }, 405)

  try {
    const { poId, receptionDate, reference, notes, lines } = await req.json()
    if (!poId || !Array.isArray(lines) || lines.length === 0) {
      return jsonResponse({ error: 'Paramètres manquants (poId + lines[] requis)' }, 400)
    }

    // @ts-ignore
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Identification user (facultatif)
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.slice(7))
        userId = data?.user?.id ?? null
      } catch {}
    }

    // 1. Charger le PO + lignes concernées
    const { data: po, error: poe } = await supabase
      .from('purchase_orders').select('id, status').eq('id', poId).maybeSingle()
    if (poe) throw poe
    if (!po) return jsonResponse({ error: 'Bon d\'achat introuvable' }, 404)
    if (!['envoye', 'partiellement_recu'].includes(po.status)) {
      return jsonResponse({
        error: `Réception impossible : le bon doit être dans l'état "envoye" ou "partiellement_recu" (actuel: "${po.status}")`
      }, 409)
    }

    const lineIds = lines.map((l: any) => l.lineId)
    const { data: dbLines, error: le } = await supabase
      .from('purchase_order_lines')
      .select('id, po_id, quantity, received_qty, stock_item_id, item_description, unit')
      .in('id', lineIds)
    if (le) throw le

    // Vérifier que toutes les lignes appartiennent bien au PO
    for (const l of dbLines ?? []) {
      if (l.po_id !== poId) return jsonResponse({ error: `Ligne ${l.id} n'appartient pas à ce bon d'achat` }, 400)
    }

    const receptionIso = receptionDate ?? new Date().toISOString().slice(0, 10)
    let linesUpdated = 0
    let movementsCreated = 0
    const warnings: string[] = []

    // 2. Pour chaque ligne : MAJ received_qty + stock_movement + update stock_items
    for (const input of lines) {
      const qty = Number(input.qtyReceived)
      if (!Number.isFinite(qty) || qty <= 0) continue

      const dbLine = (dbLines ?? []).find((l: any) => l.id === input.lineId)
      if (!dbLine) { warnings.push(`Ligne ${input.lineId} introuvable`); continue }

      const newReceived = Number(dbLine.received_qty || 0) + qty
      if (newReceived > Number(dbLine.quantity || 0)) {
        warnings.push(`Ligne "${dbLine.item_description}" : reçu (${newReceived}) > commandé (${dbLine.quantity})`)
      }

      // MAJ received_qty sur la ligne
      const { error: ule } = await supabase
        .from('purchase_order_lines')
        .update({ received_qty: newReceived })
        .eq('id', input.lineId)
      if (ule) throw ule
      linesUpdated++

      // Créer un mouvement de stock si article lié
      if (dbLine.stock_item_id) {
        const { error: sme } = await supabase.from('stock_movements').insert({
          stock_item_id: dbLine.stock_item_id,
          movement_type: 'entree',
          quantity: qty,
          movement_date: receptionIso,
          reference: reference ?? null,
          notes: notes ?? `Réception BO (ligne ${input.lineId})`,
          po_id: poId,
        })
        if (sme) throw sme

        // Mettre à jour current_qty
        const { data: item } = await supabase
          .from('stock_items').select('current_qty').eq('id', dbLine.stock_item_id).maybeSingle()
        if (item) {
          await supabase.from('stock_items')
            .update({ current_qty: Number(item.current_qty || 0) + qty })
            .eq('id', dbLine.stock_item_id)
        }
        movementsCreated++
      } else {
        warnings.push(`Ligne "${dbLine.item_description}" : pas d'article de stock lié — aucun mouvement créé`)
      }
    }

    // 3. Déterminer le nouvel état du PO (reçu ou partiel)
    const { data: allLines } = await supabase
      .from('purchase_order_lines')
      .select('quantity, received_qty')
      .eq('po_id', poId)

    const totalOrdered = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.quantity || 0), 0)
    const totalReceived = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.received_qty || 0), 0)
    const isFullyReceived = totalOrdered > 0 && totalReceived >= totalOrdered

    const newStatus = isFullyReceived ? 'recu' : 'partiellement_recu'

    if (newStatus !== po.status) {
      // Appliquer la transition via l'historique + update direct
      const hit = await findTransition(supabase, 'purchase_order', po.status, newStatus)
      await supabase.from('purchase_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', poId)

      await supabase.from('workflow_history').insert({
        entity_type: 'purchase_order',
        entity_id: poId,
        definition_id: hit?.definitionId ?? null,
        transition_id: hit?.transitionId ?? null,
        from_state_code: po.status,
        to_state_code: newStatus,
        performed_by: userId,
        comment: `Réception : ${linesUpdated} ligne(s), ${movementsCreated} mouvement(s) stock`,
      })
    }

    return jsonResponse({
      new_status: newStatus,
      lines_updated: linesUpdated,
      movements_created: movementsCreated,
      warnings,
    })
  } catch (e: any) {
    console.error('[po-receive] exception:', e?.message, e)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
