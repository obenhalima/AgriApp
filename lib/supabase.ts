import { createClient } from '@supabase/supabase-js'

// Variables injectées directement pour éviter les problèmes de runtime
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dlisonvsphybjiyxoymk.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsaXNvbnZzcGh5YmppeXhveW1rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAxODc2MCwiZXhwIjoyMDg5NTk0NzYwfQ.fpBd0uwdGAwRUOSNSmYA4f97haFu4fGiK_8TmWuJfvM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ── FERMES ── */
export const getFarms = async () => {
  const { data, error } = await supabase.from('farms').select('*').eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createFarm = async (p: { code:string; name:string; city?:string; region?:string; total_area?:number }) => {
  const { data, error } = await supabase.from('farms').insert({ ...p, is_active: true, country: 'Maroc' }).select().single()
  if (error) throw error; return data
}

/* ── SERRES ── */
export const getSerres = async () => {
  const { data, error } = await supabase.from('greenhouses').select('*, farms(name)').order('code')
  if (error) throw error; return data ?? []
}
export const createSerre = async (p: { farm_id:string; code:string; name:string; type:string; status:string; total_area:number; exploitable_area:number; notes?:string }) => {
  const { data, error } = await supabase.from('greenhouses').insert(p).select().single()
  if (error) throw error; return data
}
export const deleteSerre = async (id: string) => {
  const { error } = await supabase.from('greenhouses').delete().eq('id', id)
  if (error) throw error
}

/* ── VARIETES ── */
export const getVarietes = async () => {
  const { data, error } = await supabase.from('varieties').select('*').eq('is_active', true).order('commercial_name')
  if (error) throw error; return data ?? []
}
export const createVariete = async (p: { code:string; commercial_name:string; type:string; destination:string; theoretical_yield_per_m2:number; theoretical_cost_per_m2:number; avg_price_local:number; avg_price_export:number; estimated_cycle_days?:number; technical_notes?:string }) => {
  const { data, error } = await supabase.from('varieties').insert({ ...p, is_active: true }).select().single()
  if (error) throw error; return data
}
export const deleteVariete = async (id: string) => {
  const { error } = await supabase.from('varieties').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

/* ── CAMPAGNES ── */
export const getCampagnes = async () => {
  const { data, error } = await supabase.from('campaigns').select('*, farms(name)').order('created_at', { ascending: false })
  if (error) throw error; return data ?? []
}
export const createCampagne = async (p: { farm_id:string; code:string; name:string; planting_start?:string; harvest_start?:string; campaign_end?:string; budget_total?:number; production_target_kg?:number }) => {
  const { data, error } = await supabase.from('campaigns').insert({ ...p, status: 'planification' }).select().single()
  if (error) throw error; return data
}

/* ── MARCHES ── */
export const getMarches = async () => {
  const { data, error } = await supabase.from('markets').select('*').eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createMarche = async (p: { code:string; name:string; type:string; country?:string; currency:string; avg_price_per_kg?:number; avg_logistics_cost_per_kg?:number; notes?:string }) => {
  const { data, error } = await supabase.from('markets').insert({ ...p, is_active: true }).select().single()
  if (error) throw error; return data
}

/* ── CLIENTS ── */
export const getClients = async () => {
  const { data, error } = await supabase.from('clients').select('*').eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createClient_ = async (p: { code:string; name:string; type:string; city?:string; country?:string; email?:string; phone?:string; payment_terms_days?:number; credit_limit?:number }) => {
  const { data, error } = await supabase.from('clients').insert({ ...p, is_active: true, currency: 'MAD' }).select().single()
  if (error) throw error; return data
}
export const deleteClient = async (id: string) => {
  const { error } = await supabase.from('clients').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

/* ── FOURNISSEURS ── */
export const getFournisseurs = async () => {
  const { data, error } = await supabase.from('suppliers').select('*').eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createFournisseur = async (p: { code:string; name:string; category:string; city?:string; email?:string; phone?:string; payment_terms_days?:number; notes?:string }) => {
  const { data, error } = await supabase.from('suppliers').insert({ ...p, is_active: true, currency: 'MAD' }).select().single()
  if (error) throw error; return data
}

/* ── STOCKS ── */
export const getStocks = async () => {
  const { data, error } = await supabase.from('stock_items').select('*').eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createStockItem = async (p: { code:string; name:string; category:string; unit:string; min_qty:number; unit_cost?:number; location?:string }) => {
  const { data, error } = await supabase.from('stock_items').insert({ ...p, current_qty: 0, is_active: true }).select().single()
  if (error) throw error; return data
}
export const createMouvement = async (p: { stock_item_id:string; movement_type:string; quantity:number; movement_date:string; reference?:string; notes?:string }) => {
  const { data, error } = await supabase.from('stock_movements').insert(p).select().single()
  if (error) throw error
  const item = await supabase.from('stock_items').select('current_qty').eq('id', p.stock_item_id).single()
  if (item.data) {
    const delta = p.movement_type === 'sortie' ? -p.quantity : p.quantity
    await supabase.from('stock_items').update({ current_qty: (item.data.current_qty || 0) + delta }).eq('id', p.stock_item_id)
  }
  return data
}

/* ── FACTURES ── */
export const getFactures = async () => {
  const { data, error } = await supabase.from('invoices').select('*, clients(name)').order('invoice_date', { ascending: false }).limit(100)
  if (error) throw error; return data ?? []
}
export const createFacture = async (p: { client_id:string; invoice_date:string; due_date:string; subtotal:number; total_amount:number; notes?:string }) => {
  const num = `FV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
  const { data, error } = await supabase.from('invoices').insert({ ...p, invoice_number: num, invoice_type: 'vente', tax_amount: 0, paid_amount: 0, status: 'en_attente', currency: 'MAD' }).select().single()
  if (error) throw error; return data
}
export const payerFacture = async (p: { invoice_id:string; amount:number; payment_method:string; reference?:string }) => {
  const inv = await supabase.from('invoices').select('paid_amount, total_amount').eq('id', p.invoice_id).single()
  if (inv.error) throw inv.error
  if (!inv.data) throw new Error('Facture introuvable')

  const amount = Number(p.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant du paiement doit etre superieur a zero')
  }

  const currentPaid = Number(inv.data.paid_amount || 0)
  const totalAmount = Number(inv.data.total_amount || 0)
  const remaining = totalAmount - currentPaid

  if (remaining <= 0) {
    throw new Error('Cette facture est deja soldee')
  }
  if (amount > remaining) {
    throw new Error(`Le paiement depasse le reste a encaisser (${remaining.toFixed(2)} MAD)`)
  }

  const { error: e1 } = await supabase.from('payments_received').insert({
    invoice_id: p.invoice_id,
    payment_date: new Date().toISOString().slice(0,10),
    amount,
    payment_method: p.payment_method,
    reference: p.reference,
  })
  if (e1) throw e1

  const newPaid = currentPaid + amount
  const status = newPaid >= totalAmount ? 'paye' : 'partiellement_paye'
  const { error: e2 } = await supabase.from('invoices').update({ paid_amount: newPaid, status }).eq('id', p.invoice_id)
  if (e2) throw e2
}

export const getFacturesFournisseurs = async () => {
  const { data, error } = await supabase
    .from('supplier_invoices')
    .select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)')
    .order('invoice_date', { ascending: false })
    .limit(100)
  if (error) throw error; return data ?? []
}
export const createFactureFournisseur = async (p: {
  supplier_id:string
  invoice_date:string
  due_date:string
  subtotal:number
  total_amount:number
  campaign_id?:string
  greenhouse_id?:string
  cost_category?:string
  notes?:string
}) => {
  const num = `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
  const { data, error } = await supabase.from('supplier_invoices').insert({
    ...p,
    invoice_number: num,
    tax_amount: 0,
    paid_amount: 0,
    status: 'en_attente',
    currency: 'MAD',
  }).select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)').single()
  if (error) throw error; return data
}
export const payerFactureFournisseur = async (p: { supplier_invoice_id:string; amount:number; payment_method:string; reference?:string }) => {
  const inv = await supabase.from('supplier_invoices').select('paid_amount, total_amount').eq('id', p.supplier_invoice_id).single()
  if (inv.error) throw inv.error
  if (!inv.data) throw new Error('Facture fournisseur introuvable')

  const amount = Number(p.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant du paiement doit etre superieur a zero')
  }

  const currentPaid = Number(inv.data.paid_amount || 0)
  const totalAmount = Number(inv.data.total_amount || 0)
  const remaining = totalAmount - currentPaid

  if (remaining <= 0) {
    throw new Error('Cette facture fournisseur est deja soldee')
  }
  if (amount > remaining) {
    throw new Error(`Le paiement depasse le reste a regler (${remaining.toFixed(2)} MAD)`)
  }

  const { error: e1 } = await supabase.from('payments_made').insert({
    supplier_invoice_id: p.supplier_invoice_id,
    payment_date: new Date().toISOString().slice(0,10),
    amount,
    payment_method: p.payment_method,
    reference: p.reference,
  })
  if (e1) throw e1

  const newPaid = currentPaid + amount
  const status = newPaid >= totalAmount ? 'paye' : 'partiellement_paye'
  const { error: e2 } = await supabase.from('supplier_invoices').update({ paid_amount: newPaid, status }).eq('id', p.supplier_invoice_id)
  if (e2) throw e2
}

/* ── COUTS ── */
export const getCouts = async (campaign_id?: string) => {
  let q = supabase.from('cost_entries').select('*, campaigns(name), greenhouses(code)').order('entry_date', { ascending: false }).limit(100)
  if (campaign_id) q = q.eq('campaign_id', campaign_id)
  const { data, error } = await q
  if (error) throw error; return data ?? []
}
export const createCout = async (p: { campaign_id:string; cost_category:string; amount:number; entry_date:string; description?:string; greenhouse_id?:string; is_planned?:boolean }) => {
  const { data, error } = await supabase.from('cost_entries').insert({ ...p, is_planned: p.is_planned ?? false }).select().single()
  if (error) throw error; return data
}

/* ── ALERTES ── */
export const getAlertes = async () => {
  const { data, error } = await supabase.from('alerts').select('*').eq('is_resolved', false).order('created_at', { ascending: false })
  if (error) throw error; return data ?? []
}
export const resolveAlerte = async (id: string) => {
  const { error } = await supabase.from('alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
