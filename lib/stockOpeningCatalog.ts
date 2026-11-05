import { supabase } from './supabase'
import type { InitCatalog } from './initialization'

/** Only tenant-owned inventory references; no writes or privileged credentials. */
export async function loadStockOpeningCatalog(domain: string): Promise<InitCatalog> {
  async function all(table: string) {
    const rows: any[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from(table).select('*').eq('domain_id', domain).order('id').range(offset, offset + 499)
      if (error) throw new Error(`${table} : ${error.message}`)
      rows.push(...(data || []).filter(row => table === 'stock_items' || row.is_active !== false))
      if (!data || data.length < 500) return rows
    }
  }
  const [products, warehouses, farms] = await Promise.all([all('stock_items'), all('warehouses'), all('farms')])
  const referenceRows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('reference_values').select('id,list_key,code,label').in('list_key', ['stock_category', 'unit']).eq('is_active', true).order('id').range(offset, offset + 499)
    if (error) throw new Error(`Référentiels : ${error.message}`)
    referenceRows.push(...(data || []))
    if (!data || data.length < 500) break
  }
  return { crops: [], varieties: [],
    products: products.map(row => ({ code: row.code, name: row.name, category: row.category, unit: row.unit, existing_id: row.id, is_active: row.is_active === false ? 'non' : 'oui' })),
    stock_categories: referenceRows.filter(row => row.list_key === 'stock_category' && ['semences','plants','engrais','phytosanitaires','emballages','consommables','pieces_rechange','autre'].includes(row.code)).map(row => ({ code: row.code, name: row.label })),
    units: referenceRows.filter(row => row.list_key === 'unit').map(row => ({ code: row.code, name: row.label })),
    farms: farms.map(row => ({ code: row.code, name: row.name, existing_id: row.id })),
    warehouses: warehouses.filter(row => farms.some(farm => farm.id === row.farm_id)).map(row => ({ code: row.code, name: row.name, farm: farms.find(farm => farm.id === row.farm_id)?.code || '', existing_id: row.id })),
  }
}
