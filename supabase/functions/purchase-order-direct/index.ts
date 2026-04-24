// Edge Function : purchase-order-direct
// Crée un bon d'achat directement en état 'recu' (parcours "achat direct") :
//   1. Crée le purchase_order avec status='recu'
//   2. Crée les purchase_order_lines avec received_qty = quantity
//   3. Crée les stock_movements + met à jour stock_items
//   4. Écrit une entrée d'historique ∅ → recu
//
// Entrée:
//   {
//     supplierId: string,
//     orderDate?: string,            // défaut aujourd'hui
//     costCategory?: string,
//     campaignId?: string,
//     greenhouseId?: string,
//     currency?: string,              // défaut MAD
//     notes?: string,
//     reference?: string,
//     lines: [{
//       itemDescription: string,
//       unit?: string,
//       quantity: number,
//       unitPrice: number,
//       stockItemId?: string | null
//     }]
//   }
//
// Sortie:
//   { po_id: string, po_number: string, movements_created: number }

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée' }, 405)

  try {
    const body = await req.json()
    const {
      supplierId, orderDate, costCategory, campaignId, greenhouseId,
      currency = 'MAD', notes, reference, lines,
    } = body

    if (!supplierId) return jsonResponse({ error: 'supplierId requis' }, 400)
    if (!Array.isArray(lines) || lines.length === 0) return jsonResponse({ error: 'Au moins une ligne requise' }, 400)
    for (const l of lines) {
      if (!l.itemDescription || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0) {
        return jsonResponse({ error: 'Chaque ligne doit avoir un libellé et une quantité > 0' }, 400)
      }
    }

    // @ts-ignore
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // User ID pour traçabilité
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.slice(7))
        userId = data?.user?.id ?? null
      } catch {}
    }

    const orderIso = orderDate ?? new Date().toISOString().slice(0, 10)
    const poNumber = `BA-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`

    // Calcul des totaux
    const subtotal = lines.reduce((s: number, l: any) =>
      s + Number(l.quantity) * Number(l.unitPrice || 0), 0)

    // 1. Créer le PO en état 'recu' directement
    const { data: po, error: poe } = await supabase.from('purchase_orders').insert({
      po_number: poNumber,
      supplier_id: supplierId,
      campaign_id: campaignId ?? null,
      greenhouse_id: greenhouseId ?? null,
      cost_category: costCategory ?? null,
      status: 'recu',
      order_date: orderIso,
      expected_delivery: orderIso,
      currency,
      subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      notes: notes ?? null,
      created_by: userId,
    }).select('id, po_number').single()

    if (poe) throw poe

    // 2. Créer les lignes avec received_qty = quantity
    const lineInserts = lines.map((l: any) => ({
      po_id: po.id,
      item_description: l.itemDescription,
      unit: l.unit ?? null,
      quantity: Number(l.quantity),
      unit_price: Number(l.unitPrice || 0),
      line_total: Number(l.quantity) * Number(l.unitPrice || 0),
      received_qty: Number(l.quantity),
      stock_item_id: l.stockItemId ?? null,
    }))
    const { data: insertedLines, error: le } = await supabase
      .from('purchase_order_lines').insert(lineInserts).select('id, stock_item_id, quantity, item_description')
    if (le) throw le

    // 3. Créer les stock_movements pour chaque ligne avec stock_item_id défini
    let movementsCreated = 0
    const warnings: string[] = []
    for (const line of insertedLines ?? []) {
      if (!line.stock_item_id) {
        warnings.push(`Ligne "${line.item_description}" : pas d'article de stock lié — aucun mouvement créé`)
        continue
      }
      const { error: sme } = await supabase.from('stock_movements').insert({
        stock_item_id: line.stock_item_id,
        movement_type: 'entree',
        quantity: Number(line.quantity),
        movement_date: orderIso,
        reference: reference ?? null,
        notes: notes ?? `Achat direct BO ${poNumber}`,
        po_id: po.id,
      })
      if (sme) throw sme

      const { data: item } = await supabase.from('stock_items').select('current_qty').eq('id', line.stock_item_id).maybeSingle()
      if (item) {
        await supabase.from('stock_items')
          .update({ current_qty: Number(item.current_qty || 0) + Number(line.quantity) })
          .eq('id', line.stock_item_id)
      }
      movementsCreated++
    }

    // 4. Écrire historique (création directe en 'recu')
    const { data: def } = await supabase
      .from('workflow_definitions').select('id')
      .eq('entity_type', 'purchase_order').eq('is_default', true).eq('is_active', true)
      .maybeSingle()

    await supabase.from('workflow_history').insert({
      entity_type: 'purchase_order',
      entity_id: po.id,
      definition_id: def?.id ?? null,
      transition_id: null,
      from_state_code: null,
      to_state_code: 'recu',
      performed_by: userId,
      comment: `Achat direct : ${movementsCreated} mouvement(s) stock créé(s)`,
    })

    return jsonResponse({
      po_id: po.id,
      po_number: po.po_number,
      movements_created: movementsCreated,
      warnings,
    })
  } catch (e: any) {
    console.error('[po-direct] exception:', e?.message, e)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
