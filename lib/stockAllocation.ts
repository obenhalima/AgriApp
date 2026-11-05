import { supabase } from './supabase'

export type StockAllocationPlanting = {
  id: string
  campaign_id: string
  campaign_name: string
  greenhouse_id: string
  greenhouse_name: string
  variety_name: string
  farm_id: string
  farm_name: string
  area: number
}
export type StockAllocationTarget = {
  planting_id: string
  greenhouse_id: string
  variety_id: string
  campaign_id: string
  area: number
}
export type StockAllocationContext = {
  domain_id: string
  farm_id: string
  farm_name: string
  warehouse_name: string
  linked: boolean
  fixed: boolean
  targets: StockAllocationTarget[]
  plantings: StockAllocationPlanting[]
}

export function allocationPreview(plantings: StockAllocationPlanting[], ids: string[], quantity?: number) {
  const rows = ids.map(id => plantings.find(p => p.id === id))
    .filter((p): p is StockAllocationPlanting => !!p)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (
    !rows.length || rows.length !== ids.length || new Set(ids).size !== ids.length ||
    new Set(rows.map(p => p.farm_id)).size !== 1 ||
    new Set(rows.map(p => p.campaign_id)).size !== 1 ||
    rows.some(p => !Number.isFinite(Number(p.area)) || Number(p.area) <= 0)
  ) return []
  const total = rows.reduce((sum, p) => sum + Number(p.area), 0)
  return rows.map(p => ({
    ...p,
    share: Number(p.area) / total,
    quantity: quantity != null && Number.isFinite(quantity) ? quantity * Number(p.area) / total : null,
  }))
}

export async function stockAllocationRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(25000))
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) {
      throw new Error('Affectation multi-serres non activée : appliquer la migration stock_exit_multi_greenhouse avant de continuer.')
    }
    throw new Error(error.message)
  }
  return data as T
}
