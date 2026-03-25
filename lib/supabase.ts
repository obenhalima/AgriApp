import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anon)

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
  // mettre à jour le stock courant
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
  const { error: e1 } = await supabase.from('payments_received').insert({ invoice_id: p.invoice_id, payment_date: new Date().toISOString().slice(0,10), amount: p.amount, payment_method: p.payment_method, reference: p.reference })
  if (e1) throw e1
  const inv = await supabase.from('invoices').select('paid_amount, total_amount').eq('id', p.invoice_id).single()
  if (inv.data) {
    const newPaid = (inv.data.paid_amount || 0) + p.amount
    const status = newPaid >= inv.data.total_amount ? 'paye' : 'partiellement_paye'
    await supabase.from('invoices').update({ paid_amount: newPaid, status }).eq('id', p.invoice_id)
  }
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

/* ── RÉCOLTES ── */
export const getRecoltes = async () => {
  const { data, error } = await supabase.from('harvests').select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))').order('harvest_date', { ascending: false }).limit(100)
  if (error) throw error; return data ?? []
}
export const createRecolte = async (p: { campaign_planting_id:string; harvest_date:string; qty_category_1:number; qty_category_2:number; qty_category_3?:number; qty_waste?:number; notes?:string }) => {
  const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
  const { data, error } = await supabase.from('harvests').insert({ ...p, qty_category_3: p.qty_category_3 ?? 0, qty_waste: p.qty_waste ?? 0, lot_number: lot }).select().single()
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
