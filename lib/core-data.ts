import { createSupabaseServerClient } from '@/lib/supabase-server'

type DataSource = 'supabase' | 'empty'

type GreenhouseRow = {
  id: string
  code: string
  name: string
  type: string
  status: string
  total_area: number
  exploitable_area: number
}

type CampaignRow = {
  id: string
  name: string
  farm_id: string | null
  status: string | null
  planting_start: string | null
  harvest_start: string | null
  campaign_end: string | null
  budget_total: number | null
  production_target_kg: number | null
}

type FarmRow = {
  id: string
  name: string
}

type CampaignPlantingRow = {
  id: string
  campaign_id: string | null
  greenhouse_id: string | null
  variety_id: string | null
  target_yield_per_m2: number | null
}

type VarietyRow = {
  id: string
  commercial_name: string
}

type ProductionSummaryRow = {
  campaign_name: string
  greenhouse_code: string
  actual_production: number | null
  actual_yield_per_m2: number | null
  achievement_rate: number | null
}

type HarvestRow = {
  id: string
  campaign_planting_id: string
  harvest_date: string
  qty_category_1: number | null
  qty_category_2: number | null
  qty_category_3: number | null
  qty_waste: number | null
  total_qty: number | null
  lot_number: string | null
}

export type GreenhouseCardData = {
  code: string
  name: string
  type: string
  status: string
  totalArea: number
  exploitableArea: number
  varieties: string[]
  targetYield: number
  actualYield: number
  productionTons: number
  achievementRate: number
}

export type CampaignSummaryData = {
  id: string
  name: string
  farmName: string
  status: string
  plantingStart: string | null
  harvestStart: string | null
  campaignEnd: string | null
  budgetTotal: number
  productionTargetKg: number
  actualProductionKg: number
  greenhouseCount: number
}

export type HarvestTableRow = {
  id: string
  date: string
  greenhouseCode: string
  varietyName: string
  category1: number
  category2: number
  category3: number
  waste: number
  total: number
  lotNumber: string
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatStatus(status: string) {
  switch (status) {
    case 'en_cours':
      return 'En cours'
    case 'terminee':
      return 'Terminee'
    case 'annulee':
      return 'Annulee'
    case 'planification':
      return 'Planification'
    case 'en_preparation':
      return 'En preparation'
    case 'hors_service':
      return 'Hors service'
    case 'renovation':
      return 'Renovation'
    default:
      return status.replace(/_/g, ' ')
  }
}

function toNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value : 0
}

export async function getGreenhousesPageData(): Promise<{
  source: DataSource
  items: GreenhouseCardData[]
}> {
  const client = createSupabaseServerClient()
  if (!client) {
    return { source: 'empty', items: [] }
  }

  try {
    const [greenhousesRes, plantingsRes, varietiesRes, summaryRes] = await Promise.all([
      client
        .from('greenhouses')
        .select('id, code, name, type, status, total_area, exploitable_area')
        .order('code'),
      client
        .from('campaign_plantings')
        .select('id, campaign_id, greenhouse_id, variety_id, target_yield_per_m2'),
      client
        .from('varieties')
        .select('id, commercial_name'),
      client
        .from('v_production_summary')
        .select('campaign_name, greenhouse_code, actual_production, actual_yield_per_m2, achievement_rate'),
    ])

    if (greenhousesRes.error || plantingsRes.error || varietiesRes.error || summaryRes.error) {
      throw new Error('Failed to load greenhouse data from Supabase')
    }

    const greenhouses = (greenhousesRes.data ?? []) as GreenhouseRow[]
    const plantings = (plantingsRes.data ?? []) as CampaignPlantingRow[]
    const varieties = (varietiesRes.data ?? []) as VarietyRow[]
    const summaries = (summaryRes.data ?? []) as ProductionSummaryRow[]

    const varietyById = new Map(varieties.map((variety) => [variety.id, variety.commercial_name]))
    const plantingsByGreenhouse = new Map<string, CampaignPlantingRow[]>()
    const summariesByCode = new Map<string, ProductionSummaryRow[]>()

    for (const planting of plantings) {
      if (!planting.greenhouse_id) {
        continue
      }

      const existing = plantingsByGreenhouse.get(planting.greenhouse_id) ?? []
      existing.push(planting)
      plantingsByGreenhouse.set(planting.greenhouse_id, existing)
    }

    for (const summary of summaries) {
      const existing = summariesByCode.get(summary.greenhouse_code) ?? []
      existing.push(summary)
      summariesByCode.set(summary.greenhouse_code, existing)
    }

    const items = greenhouses.map((greenhouse) => {
      const greenhousePlantings = plantingsByGreenhouse.get(greenhouse.id) ?? []
      const greenhouseSummaries = summariesByCode.get(greenhouse.code) ?? []
      const varietiesForGreenhouse = greenhousePlantings
        .map((planting) => planting.variety_id ? varietyById.get(planting.variety_id) : null)
        .filter((value): value is string => Boolean(value))

      return {
        code: greenhouse.code,
        name: greenhouse.name,
        type: greenhouse.type,
        status: greenhouse.status,
        totalArea: toNumber(greenhouse.total_area),
        exploitableArea: toNumber(greenhouse.exploitable_area),
        varieties: Array.from(new Set(varietiesForGreenhouse)),
        targetYield: average(greenhousePlantings.map((planting) => toNumber(planting.target_yield_per_m2))),
        actualYield: average(greenhouseSummaries.map((summary) => toNumber(summary.actual_yield_per_m2))),
        productionTons: greenhouseSummaries.reduce((sum, summary) => sum + toNumber(summary.actual_production), 0) / 1000,
        achievementRate: average(greenhouseSummaries.map((summary) => toNumber(summary.achievement_rate))),
      }
    })

    return { source: 'supabase', items }
  } catch {
    return { source: 'supabase', items: [] }
  }
}

export async function getCampaignsPageData(): Promise<{
  source: DataSource
  items: CampaignSummaryData[]
}> {
  const client = createSupabaseServerClient()
  if (!client) {
    return { source: 'empty', items: [] }
  }

  try {
    const [campaignsRes, farmsRes, plantingsRes, harvestsRes] = await Promise.all([
      client
        .from('campaigns')
        .select('id, name, farm_id, status, planting_start, harvest_start, campaign_end, budget_total, production_target_kg')
        .order('planting_start', { ascending: false }),
      client
        .from('farms')
        .select('id, name'),
      client
        .from('campaign_plantings')
        .select('id, campaign_id, greenhouse_id, variety_id, target_yield_per_m2'),
      client
        .from('harvests')
        .select('campaign_planting_id, total_qty'),
    ])

    if (campaignsRes.error || farmsRes.error || plantingsRes.error || harvestsRes.error) {
      throw new Error('Failed to load campaign data from Supabase')
    }

    const campaigns = (campaignsRes.data ?? []) as CampaignRow[]
    const farms = (farmsRes.data ?? []) as FarmRow[]
    const plantings = (plantingsRes.data ?? []) as CampaignPlantingRow[]
    const harvests = (harvestsRes.data ?? []) as Array<Pick<HarvestRow, 'campaign_planting_id' | 'total_qty'>>

    const farmById = new Map(farms.map((farm) => [farm.id, farm.name]))
    const plantingIdsByCampaign = new Map<string, string[]>()
    const greenhouseIdsByCampaign = new Map<string, Set<string>>()
    const productionByPlanting = new Map<string, number>()

    for (const planting of plantings) {
      if (!planting.campaign_id) {
        continue
      }

      const campaignPlantings = plantingIdsByCampaign.get(planting.campaign_id) ?? []
      campaignPlantings.push(planting.id)
      plantingIdsByCampaign.set(planting.campaign_id, campaignPlantings)

      if (planting.greenhouse_id) {
        const greenhouseIds = greenhouseIdsByCampaign.get(planting.campaign_id) ?? new Set<string>()
        greenhouseIds.add(planting.greenhouse_id)
        greenhouseIdsByCampaign.set(planting.campaign_id, greenhouseIds)
      }
    }

    for (const harvest of harvests) {
      const current = productionByPlanting.get(harvest.campaign_planting_id) ?? 0
      productionByPlanting.set(harvest.campaign_planting_id, current + toNumber(harvest.total_qty))
    }

    const items = campaigns.map((campaign) => {
      const plantingIds = plantingIdsByCampaign.get(campaign.id) ?? []
      const actualProductionKg = plantingIds.reduce(
        (sum, plantingId) => sum + (productionByPlanting.get(plantingId) ?? 0),
        0,
      )

      return {
        id: campaign.id,
        name: campaign.name,
        farmName: campaign.farm_id ? (farmById.get(campaign.farm_id) ?? 'Ferme') : 'Ferme',
        status: campaign.status ?? 'planification',
        plantingStart: campaign.planting_start,
        harvestStart: campaign.harvest_start,
        campaignEnd: campaign.campaign_end,
        budgetTotal: toNumber(campaign.budget_total),
        productionTargetKg: toNumber(campaign.production_target_kg),
        actualProductionKg,
        greenhouseCount: (greenhouseIdsByCampaign.get(campaign.id) ?? new Set<string>()).size,
      }
    })

    return { source: 'supabase', items }
  } catch {
    return { source: 'supabase', items: [] }
  }
}

export async function getHarvestsPageData(): Promise<{
  source: DataSource
  items: HarvestTableRow[]
}> {
  const client = createSupabaseServerClient()
  if (!client) {
    return { source: 'empty', items: [] }
  }

  try {
    const [harvestsRes, plantingsRes, greenhousesRes, varietiesRes] = await Promise.all([
      client
        .from('harvests')
        .select('id, campaign_planting_id, harvest_date, qty_category_1, qty_category_2, qty_category_3, qty_waste, total_qty, lot_number')
        .order('harvest_date', { ascending: false })
        .limit(50),
      client
        .from('campaign_plantings')
        .select('id, campaign_id, greenhouse_id, variety_id, target_yield_per_m2'),
      client
        .from('greenhouses')
        .select('id, code, name, type, status, total_area, exploitable_area'),
      client
        .from('varieties')
        .select('id, commercial_name'),
    ])

    if (harvestsRes.error || plantingsRes.error || greenhousesRes.error || varietiesRes.error) {
      throw new Error('Failed to load harvest data from Supabase')
    }

    const harvests = (harvestsRes.data ?? []) as HarvestRow[]
    const plantings = (plantingsRes.data ?? []) as CampaignPlantingRow[]
    const greenhouses = (greenhousesRes.data ?? []) as GreenhouseRow[]
    const varieties = (varietiesRes.data ?? []) as VarietyRow[]

    const plantingById = new Map(plantings.map((planting) => [planting.id, planting]))
    const greenhouseById = new Map(greenhouses.map((greenhouse) => [greenhouse.id, greenhouse]))
    const varietyById = new Map(varieties.map((variety) => [variety.id, variety]))

    const items = harvests.map((harvest) => {
      const planting = plantingById.get(harvest.campaign_planting_id)
      const greenhouse = planting?.greenhouse_id ? greenhouseById.get(planting.greenhouse_id) : null
      const variety = planting?.variety_id ? varietyById.get(planting.variety_id) : null

      return {
        id: harvest.id,
        date: harvest.harvest_date,
        greenhouseCode: greenhouse?.code ?? '-',
        varietyName: variety?.commercial_name ?? '-',
        category1: toNumber(harvest.qty_category_1),
        category2: toNumber(harvest.qty_category_2),
        category3: toNumber(harvest.qty_category_3),
        waste: toNumber(harvest.qty_waste),
        total: toNumber(harvest.total_qty),
        lotNumber: harvest.lot_number ?? '-',
      }
    })

    return { source: 'supabase', items }
  } catch {
    return { source: 'supabase', items: [] }
  }
}

export function getSourceLabel(source: DataSource) {
  return source === 'supabase' ? 'Supabase' : 'Configuration locale'
}

export function getSourceTone(source: DataSource) {
  return source === 'supabase' ? 'tag-green' : 'tag-amber'
}

export function getDisplayStatus(status: string) {
  return formatStatus(status)
}
