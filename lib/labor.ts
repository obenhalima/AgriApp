// ============================================================
// lib/labor — pointage du temps de travail (labor_entries).
// person_hours = hours_worked × worker_count ; total_cost généré en DB.
// ============================================================
import { supabase } from './supabase'

const SELECT = '*, greenhouses(code,name), workers(first_name,last_name), campaign_plantings(varieties(commercial_name))'

export type LaborEntryInput = {
  work_date: string
  campaign_id?: string | null
  greenhouse_id?: string | null
  campaign_planting_id?: string | null
  worker_id?: string | null
  worker_count?: number
  operation_type?: string | null
  hours_worked: number
  daily_rate?: number | null
  notes?: string | null
}

export async function listLaborEntries(params: { campaignId?: string; limit?: number } = {}): Promise<any[]> {
  let q = supabase.from('labor_entries')
    .select(SELECT)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 300)
  if (params.campaignId) q = q.eq('campaign_id', params.campaignId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createLaborEntry(input: LaborEntryInput) {
  const { data, error } = await supabase.from('labor_entries').insert({
    work_date: input.work_date,
    campaign_id: input.campaign_id || null,
    greenhouse_id: input.greenhouse_id || null,
    campaign_planting_id: input.campaign_planting_id || null,
    worker_id: input.worker_id || null,
    worker_count: input.worker_count && input.worker_count > 0 ? input.worker_count : 1,
    operation_type: input.operation_type || null,
    hours_worked: input.hours_worked,
    daily_rate: input.daily_rate ?? null,
    notes: input.notes || null,
    recorded_via: 'web',
  }).select(SELECT).single()
  if (error) throw error
  return data
}

export async function deleteLaborEntry(id: string) {
  const { error } = await supabase.from('labor_entries').delete().eq('id', id)
  if (error) throw error
}
