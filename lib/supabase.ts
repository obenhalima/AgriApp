import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types pour les tables principales
export type Farm = {
  id: string
  code: string
  name: string
  city: string
  region: string
  country: string
  total_area: number
  is_active: boolean
  created_at: string
}

export type Greenhouse = {
  id: string
  farm_id: string
  code: string
  name: string
  type: string
  status: 'active' | 'en_preparation' | 'hors_service' | 'renovation'
  total_area: number
  exploitable_area: number
  commissioning_date: string
  notes: string
  created_at: string
}

export type Variety = {
  id: string
  code: string
  commercial_name: string
  type: string
  destination: string
  estimated_cycle_days: number
  theoretical_yield_per_m2: number
  theoretical_cost_per_m2: number
  planting_density: number
  avg_price_local: number
  avg_price_export: number
  is_active: boolean
}

export type Campaign = {
  id: string
  code: string
  name: string
  farm_id: string
  status: string
  planting_start: string
  harvest_start: string
  campaign_end: string
  budget_total: number
  production_target_kg: number
  revenue_target: number
}

export type CampaignPlanting = {
  id: string
  campaign_id: string
  greenhouse_id: string
  variety_id: string
  planted_area: number
  planting_date: string
  target_yield_per_m2: number
  target_total_production: number
  estimated_cost: number
  status: string
}

export type Harvest = {
  id: string
  campaign_planting_id: string
  harvest_date: string
  qty_category_1: number
  qty_category_2: number
  qty_category_3: number
  qty_waste: number
  total_qty: number
  lot_number: string
}

export type Client = {
  id: string
  code: string
  name: string
  type: string
  market_id: string
  city: string
  country: string
  email: string
  phone: string
  payment_terms_days: number
  credit_limit: number
  is_active: boolean
}

export type Invoice = {
  id: string
  invoice_number: string
  invoice_type: string
  client_id: string
  invoice_date: string
  due_date: string
  subtotal: number
  total_amount: number
  paid_amount: number
  balance: number
  status: string
}

export type Supplier = {
  id: string
  code: string
  name: string
  category: string
  city: string
  country: string
  email: string
  phone: string
  payment_terms_days: number
  is_active: boolean
}

export type StockItem = {
  id: string
  code: string
  name: string
  category: string
  unit: string
  current_qty: number
  min_qty: number
  unit_cost: number
  total_value: number
  is_active: boolean
}

export type Market = {
  id: string
  code: string
  name: string
  type: string
  country: string
  currency: string
  avg_price_per_kg: number
  avg_logistics_cost_per_kg: number
  is_active: boolean
}

export type CostEntry = {
  id: string
  campaign_id: string
  greenhouse_id: string
  variety_id: string
  cost_category: string
  description: string
  amount: number
  area_m2: number
  cost_per_m2: number
  entry_date: string
  is_planned: boolean
}

export type Alert = {
  id: string
  type: string
  severity: string
  title: string
  message: string
  is_read: boolean
  is_resolved: boolean
  created_at: string
}
