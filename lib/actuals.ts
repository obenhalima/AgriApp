import { supabase } from './supabase'
import { readHarvestRevenue } from './harvestRevenueApi'
import {buildHarvestForecast,type HarvestForecastLine} from './harvestForecast'

// ============================================================
// Agrégation du RÉEL + Budget pour le Compte d'exploitation.
//
// - Charges réelles : cost_entries is_planned=false, groupé par (catégorie, mois)
// - CA réel         : envois tarifés, avec bordereaux validés dédoublonnés,
//                     ventilés par campagne, ferme et serre, par mois de récolte
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
  undated_actual?: number
  unassigned_revenue_count?: number
  revenue_details?: HarvestForecastLine[]
  estimate_issues?: number
  estimated_amount?: number
  undated_count?: number
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
// CA réalisé par mois de récolte, depuis les tarifications enregistrées.
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
  revenueBasis?: 'actual' | 'provisional'
  details?: Record<string,HarvestForecastLine[]>
  caExportCatId?: string | null
  caLocalCatId?: string | null
}): Promise<Record<string, Record<MonthKey, number>>> {
  const { data: campaign, error } = await supabase.from('campaigns')
    .select('domain_id').eq('id', params.campaignId).single()
  if (error) throw error
  if (!campaign?.domain_id) throw new Error('Campagne inaccessible')
  const forecast=params.revenueBasis==='provisional'
  const plantingSelect='id,campaign_id,greenhouse_id,variety_id,greenhouses(farm_id),varieties!campaign_plantings_variety_id_fkey(commercial_name,avg_price_export,avg_price_local)'
  const revenue = await readHarvestRevenue(campaign.domain_id,forecast?{plantingSelect,includeTrays:true,lotExtras:'weighed_kg,estimated_kg,quantity_kg'}:{})
  const harvests=forecast?await readAllPages(()=>supabase.from('harvests')
    .select(`id,lot_number,harvest_date,total_qty,estimated_kg,qty_category_1,qty_category_2,qty_category_3,campaign_plantings!inner(${plantingSelect})`)
    .eq('domain_id',campaign.domain_id).eq('campaign_plantings.campaign_id',params.campaignId)):[]
  const lines=buildHarvestForecast(forecast?revenue.lots:[],revenue.sources,revenue.entries,harvests,forecast?revenue.trayLines:[])
  const matchesScope = (planting: any) => planting?.campaign_id === params.campaignId
    && (!params.farmId || planting.greenhouses?.farm_id === params.farmId)
    && (!params.greenhouseId || planting.greenhouse_id === params.greenhouseId)
  const out: Record<string, Record<MonthKey, number>> = {}
  for (const entry of lines) {
    const catId = entry.destination === 'local' ? params.caLocalCatId : params.caExportCatId
    if (!catId) continue
    if (!entry.planting?.campaign_id){
      out[catId]??={};out[catId].unassigned_count=(out[catId].unassigned_count||0)+1;continue
    }
    if (!matchesScope(entry.planting)) continue
    out[catId] ??= {}
    if(params.details)(params.details[catId]??=[]).push(entry)
    if(entry.amount==null){out[catId].estimate_issues=(out[catId].estimate_issues||0)+1;continue}
    if(entry.kind==='estimate')out[catId].estimated_amount=(out[catId].estimated_amount||0)+entry.amount
    if (!entry.date) {
      out[catId].undated = (out[catId].undated || 0) + entry.amount
      out[catId].undated_count = (out[catId].undated_count || 0) + 1
      continue
    }
    const [year, month] = entry.date.split('-').map(Number)
    const key = monthKey(year, month)
    out[catId][key] = Math.round(((out[catId][key] || 0) + entry.amount) * 100) / 100
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
  revenueBasis?: 'actual' | 'provisional'
  cutoffDate?: Date                             // défaut : aujourd'hui
}): Promise<ComparisonMonthly[]> {

  // Charge les catégories pour identifier les codes CA
  const { data: allCats, error: categoriesError } = await supabase.from('account_categories').select('*').eq('is_active', true)
  if (categoriesError) throw categoriesError
  const categories = (allCats ?? []) as any[]
  const caExportCatId = categories.find(c => c.code === 'CA_EXPORT')?.id ?? null
  const caLocalCatId  = categories.find(c => c.code === 'CA_LOCAL')?.id  ?? null

  const details:Record<string,HarvestForecastLine[]>={}
  const [budgetMonthly, actualChargesMonthly, actualRevenuesMonthly] = await Promise.all([
    getBudgetMonthly({ versionId: params.versionId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualChargesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId }),
    getActualRevenuesMonthly({ campaignId: params.campaignId, farmId: params.farmId, greenhouseId: params.greenhouseId, revenueBasis:params.revenueBasis, details, caExportCatId, caLocalCatId }),
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
      unassigned_revenue_count: actualRevenuesMonthly[c.id]?.unassigned_count || 0,
      revenue_details: details[c.id] || [],
      estimate_issues: actualRevenuesMonthly[c.id]?.estimate_issues || 0,
      estimated_amount: actualRevenuesMonthly[c.id]?.estimated_amount || 0,
      undated_actual: actualRevenuesMonthly[c.id]?.undated || 0,
      undated_count: actualRevenuesMonthly[c.id]?.undated_count || 0,
      byMonth,
    }
  })

  return result
}
