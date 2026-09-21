import { supabase } from './supabase'
import { INIT_SECTIONS, type InitCatalog, type InitRow } from './initialization'

/** Explicit tenant predicates for domain-owned tables. Shared catalogs follow their existing modules. No writes. */
export async function loadInitializationCatalog(domain: string): Promise<InitCatalog> {
  async function all(table: string, scope?: string, select = '*') {
    const rows: any[] = []
    for (let start = 0; ; start += 500) {
      let query = supabase.from(table).select(select).order(table === 'domain_memberships' ? 'user_id' : 'id').range(start, start + 499)
      if (scope) query = query.eq(scope, domain)
      const { data, error } = await query
      if (error) throw new Error(`${table} : ${error.message}`)
      rows.push(...(data || []).filter((r: any) => r.is_active !== false))
      if (!data || data.length < 500) return rows
    }
  }
  const [crops, varieties, farms, houses, warehouses, campaigns, products, suppliers, clients, workers, plantings, categories, referenceValues, phyto, roles, teams, members, markets] = await Promise.all([
    all('crops'), all('varieties'), all('farms', 'domain_id'), all('greenhouses', 'farms.domain_id', '*,farms!inner(domain_id)'),
    all('warehouses', 'domain_id'), all('campaigns', 'domain_id'), all('stock_items', 'domain_id'), all('suppliers', 'domain_id'),
    all('clients'), all('workers', 'farms.domain_id', '*,farms!inner(domain_id)'), all('campaign_plantings', 'domain_id'), all('account_categories'),
    all('reference_values'), all('plant_protection_products', 'domain_id'),
    all('roles'), all('teams', 'farms.domain_id', '*,farms!inner(domain_id)'), all('domain_memberships', 'domain_id', 'user_id,is_active,profiles:user_id(full_name,email)'), all('markets'),
  ])
  const s = (v: unknown) => v == null ? '' : String(v)
  const keys = new Set(INIT_SECTIONS.flatMap(section => section.fields.map(f => f.key)))
  const base = (r: any, extra: Record<string, unknown>): InitRow => Object.fromEntries(Object.entries({ ...Object.fromEntries(Object.entries(r).filter(([key]) => keys.has(key))), existing_id: r.id, code: r.code, ...extra }).map(([k, v]) => [k, typeof v === 'boolean' ? v ? 'oui' : 'non' : s(v)]))
  const farmCode = (id: string) => farms.find(r => r.id === id)?.code || ''
  const referenceKeys = new Set(INIT_SECTIONS.flatMap(section => section.fields.flatMap(f => f.ref ? [f.ref] : [])))
  return {
    ...Object.fromEntries(Array.from(new Set(referenceValues.map(r => r.list_key))).filter(key => referenceKeys.has(key)).map(key => [key, referenceValues.filter(r => r.list_key === key).map(r => base(r, { name: r.label }))])),
    roles: roles.map(r => base(r, { name: r.name })),
    teams: teams.map(r => base(r, { code: r.id, name: r.name, farm: farmCode(r.farm_id) })),
    members: members.map(r => ({ code: r.user_id, existing_id: r.user_id, name: r.profiles?.full_name?.trim() || r.profiles?.email || 'Utilisateur' })),
    markets: markets.map(r => base(r, { code: r.code || r.id, name: r.name })),
    commercial_customers: clients.map(r => base(r, { name: r.name })),
    crops: crops.map(r => base(r, { name: r.name, id: r.id })),
    varieties: varieties.map(r => base(r, { name: r.commercial_name, crop: crops.find(c => c.id === r.crop_id)?.code || '' })),
    farms: farms.map(r => base(r, { name: r.name, address: r.address || r.city })),
    greenhouses: houses.map(r => base(r, { code: `${farmCode(r.farm_id)}/${r.code}`, name: `${r.name || r.code} — ${farms.find(f => f.id === r.farm_id)?.name || ''}`, farm: farmCode(r.farm_id), type: r.type, area: r.total_area, usable_area: r.exploitable_area })),
    warehouses: warehouses.map(r => base(r, { name: r.name, farm: farmCode(r.farm_id), manager: r.manager_id })),
    campaigns: campaigns.map(r => base(r, { name: r.name, farm: farmCode(r.farm_id), start: r.preparation_start || r.planting_start, end: r.campaign_end })),
    products: products.map(r => base(r, { name: r.name, category: r.category, unit: r.unit, min_qty: r.min_qty, unit_cost: r.unit_cost, location: r.location, phyto_product: r.plant_protection_product_id })),
    units: referenceValues.filter(r => r.list_key === 'unit').map(r => base(r, { name: r.label })),
    stock_categories: referenceValues.filter(r => r.list_key === 'stock_category').map(r => base(r, { name: r.label })),
    phyto_products: phyto.filter(r => r.authorization_status === 'autorise').map(r => base(r, { code: r.id, name: `${r.commercial_name} · AMM ${r.authorization_number || 'non renseignée'}` })),
    partners: [...suppliers.map(r => base(r, { code: `FOU:${r.code}`, name: r.name, type: 'fournisseur', supplier_category: r.category, email: r.email, phone: r.phone })), ...clients.map(r => base(r, { code: `CLI:${r.code}`, name: r.name, type: 'client', client_type: r.type, email: r.email, phone: r.phone }))],
    people: workers.map(r => base(r, { code: r.matricule || `EMP:${r.id}`, name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), farm: farmCode(r.farm_id), email: r.email, daily_rate: r.daily_rate, role: '', team: r.team_id })),
    plantings: plantings.map(r => {
      const h = houses.find(h => h.id === r.greenhouse_id)
      return base(r, { code: `PLA:${r.id}`, name: `${h?.name || h?.code || ''} — ${varieties.find(v => v.id === r.variety_id)?.commercial_name || ''} — ${r.planting_date || ''}`, farm: farmCode(h?.farm_id), greenhouse: h ? `${farmCode(h.farm_id)}/${h.code}` : '', campaign: campaigns.find(c => c.id === r.campaign_id)?.code, variety: varieties.find(v => v.id === r.variety_id)?.code, date: r.planting_date, harvest_start: r.harvest_start_date || r.first_harvest_date, harvest_end: r.harvest_end_date || r.last_harvest_date, area: r.planted_area, target_kg: r.target_total_production })
    }),
    categories: categories.filter(c => c.type !== 'produit' && !categories.some(child => child.parent_id === c.id)).map(c => base(c, { name: c.label })),
  }
}
