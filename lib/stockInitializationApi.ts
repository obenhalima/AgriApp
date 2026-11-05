import { supabase } from './supabase'
import { stockPayload, type StockInput } from './stockInitialization'
export type StockInitializationResult = { status: 'preview' | 'applied'; created: number; reused: number; positive: number; zero: number; unvalued: number; operation_id: string | null }
export async function stockInitializationRequest(domain: string, request: string, rows: StockInput[], apply = false): Promise<StockInitializationResult> {
  const { data, error } = await supabase.rpc('initialize_stock_inventory', { p_domain: domain, p_request: request, p_rows: stockPayload(rows), p_apply: apply })
  if (error) {
    if (['PGRST202','42883','42P01'].includes(error.code)) throw new Error('Validation serveur non activée : appliquer la migration 164_stock_initialization.sql. Le modèle reste exportable et contrôlable localement.')
    throw new Error(error.message)
  }
  if (!data || !['preview','applied'].includes(data.status) || ['created','reused','positive','zero','unvalued'].some(key => !Number.isInteger(data[key]) || data[key] < 0) || (data.status === 'applied' && !/^[0-9a-f-]{36}$/i.test(data.operation_id || ''))) throw new Error('Résultat serveur invalide : ne relancez pas avec un nouveau fichier ; contrôlez le journal de reprise.')
  return data
}
