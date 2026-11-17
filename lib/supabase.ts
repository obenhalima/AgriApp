import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js'
import { requireReferenceDomain, requireClientReferenceWrite, clientReferenceIsolationEnabled } from './clientReferenceScope'
import { assertClientReferenceIsolation } from './clientReferenceReadiness'
import {withDeletionFeedback,DELETION_BLOCKED_EVENT} from './deletionFeedback'
import {withAuthRequestDeadline} from './authInitialization'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Variables d\'environnement Supabase manquantes. ' +
    'Définissez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.'
  )
}

// Keep one browser client across Next.js hot reloads. Every client installs its
// own refresh timer and visibility listener, even when it shares the same token.
const browserState=globalThis as typeof globalThis & {
  __itrixSupabaseClient?:{version:number;url:string;key:string;client:SupabaseClient}
}
const cachedClient=typeof window==='undefined'?undefined:browserState.__itrixSupabaseClient
const createSupabaseClient=()=>createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global:{fetch:withDeletionFeedback(withAuthRequestDeadline((input,init)=>fetch(input,init)),message=>{
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(DELETION_BLOCKED_EVENT,{detail:message}))
  })},
  auth: {
    // Refresh retries can hold the lock for 30s before a getUser HTTP request.
    lock: (name,timeout,work)=>processLock(name,timeout>0?Math.max(timeout,45000):timeout,work),
  },
})
export const supabase=cachedClient?.version===1&&cachedClient.url===SUPABASE_URL&&cachedClient.key===SUPABASE_ANON_KEY?cachedClient.client:createSupabaseClient()
if(typeof window!=='undefined')browserState.__itrixSupabaseClient={version:1,url:SUPABASE_URL,key:SUPABASE_ANON_KEY,client:supabase}

/* ── FERMES ── */
export const getFarms = async (domainId?: string) => {
  let query = supabase.from('farms').select('*').eq('is_active', true)
  if (domainId) query = query.eq('domain_id', domainId)
  const { data, error } = await query.order('name')
  if (error) throw error; return data ?? []
}
export const createFarm = async (p: { code:string; name:string; city?:string; region?:string; total_area?:number; domain_id:string }) => {
  const { data, error } = await supabase.from('farms').insert({ ...p, is_active: true, country: 'Maroc' }).select().single()
  if (error) throw error; return data
}

/* ── SERRES ── */
export const getSerres = async (domainId?: string) => {
  let query = supabase.from('greenhouses').select('*, farms!inner(name, domain_id)')
  if (domainId) query = query.eq('farms.domain_id', domainId)
  const { data, error } = await query.order('code')
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
export const getVarietes = async (domainId: string) => {
  const domain = requireReferenceDomain(domainId)
  let query = supabase.from('varieties').select('*').eq('is_active', true).order('commercial_name')
  if (clientReferenceIsolationEnabled()) query = query.eq('domain_id', domain)
  const { data, error } = await query
  if (error) throw error; return data ?? []
}
export const createVariete = async (p: { domain_id:string; code:string; commercial_name:string; type:string; destination:string; theoretical_yield_per_m2:number; theoretical_cost_per_m2:number; avg_price_local:number; avg_price_export:number; estimated_cycle_days?:number; technical_notes?:string; crop_id?:string }) => {
  await assertClientReferenceIsolation(p.domain_id, supabase)
  const { data, error } = await supabase.from('varieties').insert({ ...p, is_active: true }).select().single()
  if (error) throw error; return data
}
export const deleteVariete = async (id: string, domainId: string) => {
  const domain = await assertClientReferenceIsolation(domainId, supabase)
  const { data, error } = await supabase.from('varieties').update({ is_active: false }).eq('id', id).eq('domain_id', domain).select('id').single()
  if (error) throw error
  if (!data) throw new Error('Variété inaccessible pour ce client.')
}
export const updateVariete = async (id: string, patch: Record<string, unknown>, domainId: string) => {
  requireClientReferenceWrite(domainId)
  if ('domain_id' in patch || 'id' in patch) throw new Error('Le propriétaire et l’identifiant d’une variété ne peuvent pas être modifiés.')
  const domain = await assertClientReferenceIsolation(domainId, supabase)
  const { data, error } = await supabase.from('varieties').update(patch).eq('id', id).eq('domain_id', domain).select('id').single()
  if (error) throw error
  if (!data) throw new Error('Variété inaccessible pour ce client.')
}

/* ── CAMPAGNES ── */
export const getCampagnes = async (domainId?: string) => {
  let query = supabase.from('campaigns').select('*, farms(name)')
  if (domainId) query = query.eq('domain_id', domainId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error; return data ?? []
}
export const createCampagne = async (p: { farm_id:string; code:string; name:string; planting_start?:string; harvest_start?:string; campaign_end?:string; budget_total?:number; production_target_kg?:number }) => {
  const { data, error } = await supabase.from('campaigns').insert({ ...p, status: 'planification' }).select().single()
  if (error) throw error; return data
}

/* ── MARCHES ── */
export const getMarches = async (domainId:string) => {
  const { data, error } = await supabase.from('markets').select('*').eq('domain_id',requireReferenceDomain(domainId)).eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createMarche = async (p: { domain_id:string; code:string; name:string; type:string; country?:string; currency:string; avg_price_per_kg?:number; avg_logistics_cost_per_kg?:number; notes?:string }) => {
  const { data, error } = await supabase.from('markets').insert({ ...p, domain_id:requireReferenceDomain(p.domain_id), is_active: true }).select().single()
  if (error) throw error; return data
}

/* ── CLIENTS ── */
export const getClients = async (domainId:string) => {
  const { data, error } = await supabase.from('clients').select('*').eq('domain_id',requireReferenceDomain(domainId)).eq('is_active', true).order('name')
  if (error) throw error; return data ?? []
}
export const createClient_ = async (p: { domain_id:string; code:string; name:string; type:string; city?:string; country?:string; email?:string; phone?:string; payment_terms_days?:number; credit_limit?:number;is_ecart_buyer?:boolean }) => {
  const { data, error } = await supabase.from('clients').insert({ ...p, domain_id:requireReferenceDomain(p.domain_id), is_active: true, currency: 'MAD' }).select().single()
  if (error) throw error; return data
}
export const deleteClient = async (id: string,domainId:string) => {
  const { error } = await supabase.from('clients').update({ is_active: false }).eq('domain_id',requireReferenceDomain(domainId)).eq('id', id).select('id').single()
  if (error) throw error
}

/* ── FOURNISSEURS ── */
export const getFournisseurs = async (domainId?: string) => {
  let query = supabase.from('suppliers').select('*').eq('is_active', true)
  if (domainId) query = query.eq('domain_id', domainId)
  const { data, error } = await query.order('name')
  if (error) throw error; return data ?? []
}
export const createFournisseur = async (p: { code:string; name:string; category:string; city?:string; email?:string; phone?:string; payment_terms_days?:number; notes?:string; domain_id:string }) => {
  const { data, error } = await supabase.from('suppliers').insert({ ...p, is_active: true, currency: 'MAD' }).select().single()
  if (error) throw error; return data
}

/* ── STOCKS ── */
export const getStocks = async (domainId?: string) => {
  let query = supabase.from('stock_items').select('*').eq('is_active', true)
  if (domainId) query = query.eq('domain_id', domainId)
  const { data, error } = await query.order('name')
  if (error) throw error; return data ?? []
}
export const createStockItem = async (p: { code:string; name:string; category:string; unit:string; min_qty:number; unit_cost?:number; location?:string; domain_id:string; plant_protection_product_id?:string }) => {
  const { data, error } = await supabase.from('stock_items').insert({ ...p, current_qty: 0, is_active: true }).select().single()
  if (error) throw error; return data
}
export const createMouvement = async (p: { stock_item_id:string; warehouse_id?:string; movement_type:string; quantity:number; unit_cost?:number; movement_date:string; reference?:string; notes?:string }) => {
  const { data, error } = await supabase.from('stock_movements').insert(p).select().single()
  if (error) throw error
  return data
}

/* ── FACTURES ── */
export const getFactures = async (domainId: string) => {
  const domain = requireReferenceDomain(domainId)
  const rows: any[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('invoices')
      .select('*, clients!invoices_client_id_fkey(name)')
      .eq('domain_id', domain)
      .order('invoice_date', { ascending: false }).order('id').range(from, from + 499)
    if (error) throw error
    rows.push(...data || [])
    if (!data || data.length < 500) return rows
  }
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

export const getFacturesFournisseurs = async (domainId?: string) => {
  let query = supabase
    .from('supplier_invoices')
    .select('*, suppliers(name,category), campaigns(name), greenhouses(code,name), purchase_orders(po_number, total_amount)')
  if (domainId) query = query.eq('domain_id', domainId)
  const { data, error } = await query.order('invoice_date', { ascending: false }).limit(100)
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
  po_id?:string  // lien optionnel vers le bon d'achat
}) => {
  const num = `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
  const { data, error } = await supabase.from('supplier_invoices').insert({
    ...p,
    invoice_number: num,
    tax_amount: 0,
    paid_amount: 0,
    status: 'en_attente',
    currency: 'MAD',
  }).select('*, suppliers(name,category), campaigns(name), greenhouses(code,name), purchase_orders(po_number, total_amount)').single()
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
