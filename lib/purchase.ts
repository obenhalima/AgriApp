import { supabase } from './supabase'

export type PurchaseOrderLine = {
  id: string
  po_id: string
  item_description: string
  unit: string | null
  quantity: number
  unit_price: number
  line_total: number | null
  received_qty: number
  stock_item_id: string | null
}

export type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string
  campaign_id: string | null
  greenhouse_id: string | null
  cost_category: string | null
  status: string
  order_date: string
  expected_delivery: string | null
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

async function invokeExtractingError<T = any>(fnName: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body: body as any })
  if (error) {
    let detail = error.message
    try {
      const ctx: any = (error as any).context
      if (ctx?.res && typeof ctx.res.text === 'function') {
        const text = await ctx.res.text()
        if (text) {
          try { detail = JSON.parse(text).error ?? text } catch { detail = text }
        }
      }
    } catch {}
    throw new Error(detail)
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as T
}

/** Réception (partielle ou totale) d'un bon d'achat existant. */
export function receivePurchaseOrder(input: {
  poId: string
  receptionDate?: string
  reference?: string
  notes?: string
  lines: { lineId: string; qtyReceived: number }[]
}) {
  return invokeExtractingError<{ new_status: string; lines_updated: number; movements_created: number; warnings: string[] }>(
    'purchase-order-receive', input
  )
}

/** Crée un bon d'achat directement en état 'recu' (parcours achat direct). */
export function createDirectPurchase(input: {
  supplierId: string
  orderDate?: string
  costCategory?: string
  campaignId?: string
  greenhouseId?: string
  currency?: string
  notes?: string
  reference?: string
  lines: {
    itemDescription: string
    unit?: string
    quantity: number
    unitPrice: number
    stockItemId?: string | null
  }[]
}) {
  return invokeExtractingError<{ po_id: string; po_number: string; movements_created: number; warnings: string[] }>(
    'purchase-order-direct', input
  )
}

/** CRUD simple des lignes d'un bon d'achat (parcours BO formel). */
export async function getPurchaseOrderLines(poId: string): Promise<PurchaseOrderLine[]> {
  const { data, error } = await supabase
    .from('purchase_order_lines').select('*').eq('po_id', poId).order('id')
  if (error) throw error
  return (data ?? []) as PurchaseOrderLine[]
}

export async function addPurchaseOrderLine(poId: string, input: {
  itemDescription: string
  unit?: string
  quantity: number
  unitPrice: number
  stockItemId?: string | null
}) {
  const line_total = Number(input.quantity) * Number(input.unitPrice || 0)
  const { data, error } = await supabase
    .from('purchase_order_lines').insert({
      po_id: poId,
      item_description: input.itemDescription,
      unit: input.unit ?? null,
      quantity: Number(input.quantity),
      unit_price: Number(input.unitPrice || 0),
      line_total,
      received_qty: 0,
      stock_item_id: input.stockItemId ?? null,
    }).select().single()
  if (error) throw error
  await recomputePOSubtotal(poId)
  return data as PurchaseOrderLine
}

export async function updatePurchaseOrderLine(lineId: string, patch: Partial<{
  itemDescription: string
  unit: string | null
  quantity: number
  unitPrice: number
  stockItemId: string | null
}>) {
  const dbPatch: any = {}
  if (patch.itemDescription !== undefined) dbPatch.item_description = patch.itemDescription
  if (patch.unit !== undefined) dbPatch.unit = patch.unit
  if (patch.quantity !== undefined) dbPatch.quantity = Number(patch.quantity)
  if (patch.unitPrice !== undefined) dbPatch.unit_price = Number(patch.unitPrice)
  if (patch.stockItemId !== undefined) dbPatch.stock_item_id = patch.stockItemId

  if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
    const { data: cur } = await supabase
      .from('purchase_order_lines').select('quantity, unit_price, po_id').eq('id', lineId).maybeSingle()
    if (cur) {
      const q = patch.quantity !== undefined ? Number(patch.quantity) : Number(cur.quantity)
      const p = patch.unitPrice !== undefined ? Number(patch.unitPrice) : Number(cur.unit_price)
      dbPatch.line_total = q * p
    }
  }

  const { data, error } = await supabase
    .from('purchase_order_lines').update(dbPatch).eq('id', lineId).select().single()
  if (error) throw error
  if (data?.po_id) await recomputePOSubtotal(data.po_id)
  return data as PurchaseOrderLine
}

export async function deletePurchaseOrderLine(lineId: string) {
  const { data: cur } = await supabase
    .from('purchase_order_lines').select('po_id').eq('id', lineId).maybeSingle()
  const { error } = await supabase.from('purchase_order_lines').delete().eq('id', lineId)
  if (error) throw error
  if (cur?.po_id) await recomputePOSubtotal(cur.po_id)
}

async function recomputePOSubtotal(poId: string) {
  const { data } = await supabase
    .from('purchase_order_lines').select('line_total').eq('po_id', poId)
  const subtotal = (data ?? []).reduce((s: number, l: any) => s + Number(l.line_total || 0), 0)
  await supabase.from('purchase_orders')
    .update({ subtotal, total_amount: subtotal, updated_at: new Date().toISOString() })
    .eq('id', poId)
}
