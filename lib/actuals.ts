import { supabase } from './supabase'
import { pricedDispatch } from './pricedDispatches'

// ============================================================
// Agrégation du RÉEL + Budget pour le Compte d'exploitation.
//
// - Charges réelles : cost_entries is_planned=false, groupé par (catégorie, mois)
// - CA réel         : envois tarifés, avec bordereaux validés dédoublonnés,
//                     ventilés par campagne, ferme et serre, par mois d'envoi
// - Budget          : budget_lines, groupé par (catégorie, mois)
//
// La vue comparative peut ajouter une projection optionnelle des mois futurs.
// ============================================================

export type MonthKey = string // "YYYY-M"
export const monthKey = (year: number, month: number): MonthKey => `${year}-${month}`

export type ComparisonMonthly = {
  category_id: string
  category_code: string
  category_label: string
  category_type: 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'
  parent_id: string | null
  level: number
  display_order: number
  // Totaux enregistrés, avant projection optionnelle dans la vue comparative
  budget: number
  actual: number
  // Détail mensuel : uniquement valeurs directement associées à cette feuille
  // (l'agrégation des parents se fait côté UI)
  byMonth: Record<MonthKey, { budget: number; actual: number }>
}

// ────────────────────────────────────────────────────────────
// Lecture budget (monthly)
// ────────────────────────────────────────────────────────────
async function getBudgetMonthly(params: {
  versionId: string
  farmId?: string
  greenhouseId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  let q = supabase.from('budget_lines')
    .select('account_category_id, amount, period_year, period_month, farm_id, greenhouse_id')
    .eq('version_id', params.versionId)
  if (params.farmId) q = q.eq('farm_id', params.farmId)
  if (params.greenhouseId === null) q = q.is('greenhouse_id', null)
  else if (params.greenhouseId) q = q.eq('greenhouse_id', params.greenhouseId)

  const { data, error } = await q
  if (error) throw error

  const out: Record<string, Record<MonthKey, number>> = {}
  for (const r of (data ?? []) as any[]) {
    const catId = r.account_category_id
    if (!catId) continue
    const mk = monthKey(r.period_year, r.period_month)
    out[catId] ??= {}
    out[catId][mk] = (out[catId][mk] ?? 0) + Number(r.amount || 0)
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Lecture charges réelles (monthly)
// ────────────────────────────────────────────────────────────
export async function getActualChargeEntries(params: {
  campaignId: string
  farmId?: string
  greenhouseId?: string | null
}): Promise<any[]> {
  const {data:campaign,error}=await supabase.from('campaigns').select('domain_id,farm_id').eq('id',params.campaignId).single()
  if(error)throw error
  if(!campaign?.domain_id)throw new Error('Campagne inaccessible')
  const makeQuery=()=>{
  let q = supabase.from('cost_entries')
    .select('*,campaigns(name,farm_id),greenhouses(code,name,farm_id),account_categories(label,code,type)')
    .eq('domain_id',campaign.domain_id)
    .eq('campaign_id', params.campaignId)
    .eq('is_planned', false)
  if (params.greenhouseId === null) q = q.is('greenhouse_id', null)
  else if (params.greenhouseId) q = q.eq('greenhouse_id', params.greenhouseId)

  return q
  }
  const data=await readAllPages(makeQuery)
  return data.filter(r=>!params.farmId||!(r.greenhouses?.farm_id||campaign.farm_id)||(r.greenhouses?.farm_id||campaign.farm_id)===params.farmId)
}

async function getActualChargesMonthly(params: {campaignId:string;farmId?:string;greenhouseId?:string|null}):Promise<Record<string,Record<MonthKey,number>>>{
  const data=await getActualChargeEntries(params)

  const out: Record<string, Record<MonthKey, number>> = {}
  for (const r of (data ?? []) as any[]) {
    const catId = r.account_category_id
    if (!catId) continue
    // Filtre ferme (via serre ou via la campagne si pas de serre)
    if (params.farmId) {
      const ghFarm = r.greenhouses?.farm_id
      if (ghFarm && ghFarm !== params.farmId) continue
    }
    const date=/^(\d{4})-(\d{2})-\d{2}$/.exec(r.entry_date??'')
    if(!date)continue
    const mk = monthKey(Number(date[1]),Number(date[2]))
    out[catId] ??= {}
    out[catId][mk] = (out[catId][mk] ?? 0) + Number(r.amount || 0)
  }
  return out
}

// ────────────────────────────────────────────────────────────
// CA réalisé par mois d'envoi, depuis les tarifications enregistrées.
// Les lots multi-serres sont ventilés selon les quantités contribuées.
// Les allocations de bordereaux validés priment sur le CA miroir du lot.
// ───────────────────────────────────────────────────────────
async function readAllPages(make: () => any): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await make().order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}

async function getActualRevenuesMonthly(params: {
  campaignId: string
  farmId?: string
  greenhouseId?: string | null
  caExportCatId?: string | null
  caLocalCatId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  const { data: campaign, error } = await supabase.from('campaigns')
    .select('domain_id').eq('id', params.campaignId).single()
  if (error) throw error
  if (!campaign?.domain_id) throw new Error('Campagne inaccessible')
  const domain = campaign.domain_id
  const plantingSelect = 'campaign_id,greenhouse_id,greenhouses(farm_id)'
  const [lots, allocations, sources] = await Promise.all([
    readAllPages(() => supabase.from('harvest_lots')
      .select(`id,harvest_date,tri_status,qty_priced_kg,qty_acceptee_kg,ca_amount,markets!harvest_lots_market_id_fkey(type),campaign_plantings(${plantingSelect})`)
      .eq('domain_id', domain).eq('category', 'station_dispatch')),
    readAllPages(() => supabase.from('station_settlement_allocations')
      .select('id,harvest_lot_id,qty_allocated_kg,amount_allocated,harvest_lots!inner(domain_id),station_settlement_lines(station_settlements!station_settlement_lines_settlement_id_fkey(status))')
      .eq('harvest_lots.domain_id', domain)),
    readAllPages(() => supabase.from('harvest_lot_sources')
      .select(`id,harvest_lot_id,qty_contributed_kg,harvests!inner(domain_id,campaign_plantings(${plantingSelect}))`)
      .eq('harvests.domain_id', domain)),
  ])
  const sourcesByLot = new Map<string, any[]>()
  for (const source of sources) {
    const list = sourcesByLot.get(source.harvest_lot_id) ?? []
    list.push(source)
    sourcesByLot.set(source.harvest_lot_id, list)
  }
  const matchesScope = (planting: any) => planting?.campaign_id === params.campaignId
    && (!params.farmId || planting.greenhouses?.farm_id === params.farmId)
    && (!params.greenhouseId || planting.greenhouse_id === params.greenhouseId)
  const out: Record<string, Record<MonthKey, number>> = {}
  for (const lot of lots) {
    const pricing = pricedDispatch(lot, allocations)
    if (!pricing) continue
    const lotSources = sourcesByLot.get(lot.id) ?? []
    let share = matchesScope(lot.campaign_plantings) ? 1 : 0
    if (lotSources.length) {
      const total = lotSources.reduce((sum, source) => sum + Number(source.qty_contributed_kg || 0), 0)
      const selected = lotSources.filter(source => matchesScope(source.harvests?.campaign_plantings))
        .reduce((sum, source) => sum + Number(source.qty_contributed_kg || 0), 0)
      share = total > 0 ? selected / total : 0
    }
    if (!(share > 0)) continue
    const catId = lot.markets?.type === 'local' ? params.caLocalCatId : params.caExportCatId
    const date = /^(\d{4})-(\d{2})-\d{2}$/.exec(lot.harvest_date ?? '')
    if (!catId || !date) continue
    const key = monthKey(Number(date[1]), Number(date[2]))
    out[catId] ??= {}
    out[catId][key] = (out[catId][key] ?? 0) + pricing.amount * share
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Construction du rapport complet
// ────────────────────────────────────────────────────────────
export async function buildComparison(params: {
  campaignId: string
  versionId: string
  farmId?: string
  greenhouseId?: string | null
  months: { year: number; month: number }[]   // liste ordonnée des 12 mois à considérer
  cutoffDate?: Date                             // défaut : aujourd'hui
}): Promise<ComparisonMonthly[]> {

  // Charge les catégories pour identifier les codes CA
  const { data: allCats, error: categoriesError } = await supabase.from('account_categories').select('*').eq('is_active', true)
  if (categoriesError) throw categoriesError
  const categories = (allCats ?? []) as any[]
  const caExportCatId = categories.find(c => c.code === 'CA_EXPORT')?.id ?? null
  const caLocalCatId  = categories.find(c => c.code === 'CA_LOCAL')?.id  ?? null

  const [budgetMonthly, actualChargesMonthly, actualRevenuesMonthly] = await Promise.all([
    getBudgetMonthly({ versionId: params.versionId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualChargesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualRevenuesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId, caExportCatId, caLocalCatId }),
  ])

  // Fusion actuel = charges + revenues
  const actualMonthly: Record<string, Record<MonthKey, number>> = {}
  const addFromMap = (src: Record<string, Record<MonthKey, number>>) => {
    for (const [catId, monthsObj] of Object.entries(src)) {
      actualMonthly[catId] ??= {}
      for (const [mk, val] of Object.entries(monthsObj)) {
        actualMonthly[catId][mk] = (actualMonthly[catId][mk] ?? 0) + val
      }
    }
  }
  addFromMap(actualChargesMonthly)
  addFromMap(actualRevenuesMonthly)

  // Construit les lignes pour CHAQUE catégorie et CHAQUE mois de la fenêtre

  const result: ComparisonMonthly[] = categories.map(c => {
    const byMonth: Record<MonthKey, { budget: number; actual: number }> = {}
    let totalBudget = 0
    let totalActual = 0

    for (const m of params.months) {
      const mk = monthKey(m.year, m.month)
      const b = budgetMonthly[c.id]?.[mk] ?? 0
      const rawActual = actualMonthly[c.id]?.[mk] ?? 0
      // La projection budgétaire est appliquée explicitement par la vue comparative.
      const a = rawActual
      byMonth[mk] = { budget: b, actual: a }
      totalBudget += b
      totalActual += a
    }

    return {
      category_id: c.id,
      category_code: c.code,
      category_label: c.label,
      category_type: c.type,
      parent_id: c.parent_id,
      level: c.level,
      display_order: c.display_order,
      budget: totalBudget,
      actual: totalActual,
      byMonth,
    }
  })

  return result
}
