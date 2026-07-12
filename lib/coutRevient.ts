// ============================================================
// Moteur "Coût de revient" — marge par culture (variété) sur une campagne.
//
// Principes :
//  • Allocation des coûts en CASCADE (pas un prorata surface global) :
//      1. coût rattaché à (serre + variété) → imputé direct à la plantation
//      2. coût rattaché à une serre seule    → réparti sur les plantations de
//         cette serre au prorata de la surface plantée
//      3. coût niveau campagne (sans serre)  → réparti sur TOUTES les
//         plantations au prorata de la surface
//  • Deux CA :
//      - VALORISÉ  = récoltes × prix (qty_cat1×prix_export + (cat2+cat3)×prix_local),
//        exactement comme lib/actuals.ts / le dashboard (⚠️ pas de conversion de
//        devise : les prix export/local sont sommés tels quels, convention app).
//      - RÉEL      = Σ harvest_lots.ca_amount (lots station triés+tarifés), fiable
//        au niveau variété (variety_id NOT NULL).
//  • Coût/kg = coûts imputés ÷ production (total_qty récolté) ; Coût/m² = ÷ surface.
// ============================================================

export type PlantingInput = {
  id: string
  greenhouse_id: string
  variety_id: string
  planted_area: number
  price_per_kg_export: number | null
  price_per_kg_local: number | null
}
export type VarietyInput = {
  id: string
  commercial_name: string
  avg_price_export: number | null
  avg_price_local: number | null
}
/** Récoltes agrégées par plantation (campaign_planting_id). */
export type HarvestAgg = {
  qty_cat1: number
  qty_cat2: number
  qty_cat3: number
  total_qty: number
}
export type LotInput = {
  variety_id: string | null
  ca_amount: number | null
  qty_acceptee_kg: number | null
}
export type CostInput = {
  amount: number
  greenhouse_id: string | null
  variety_id: string | null
}

export type MargeVariete = {
  variety_id: string
  variety_name: string
  surface: number
  productionKg: number
  qtyAccepteeKg: number
  couts: number
  coutParKg: number | null
  coutParM2: number | null
  caValorise: number
  caReel: number
  margeValorisee: number
  margeReelle: number
  margePctValorisee: number | null
  margePctReelle: number | null
}

export type CoutRevientTotals = {
  surface: number
  productionKg: number
  couts: number
  caValorise: number
  caReel: number
  margeValorisee: number
  margeReelle: number
  margePctValorisee: number | null
  margePctReelle: number | null
  coutParKg: number | null
}

export type CoutRevientResult = {
  parVariete: MargeVariete[]
  totals: CoutRevientTotals
}

export function computeCoutRevient(input: {
  plantings: PlantingInput[]
  varieties: VarietyInput[]
  harvestsByPlanting: Map<string, HarvestAgg>   // clé = campaign_planting_id
  lots: LotInput[]
  costs: CostInput[]
}): CoutRevientResult {
  const { plantings, varieties, harvestsByPlanting, lots, costs } = input
  const varMap = new Map(varieties.map(v => [v.id, v]))

  // ── 1. Allocation des coûts en cascade → coût par plantation ──
  const costByPlanting = new Map<string, number>()
  const addCost = (pid: string, amt: number) =>
    costByPlanting.set(pid, (costByPlanting.get(pid) ?? 0) + amt)

  const plantingsByGh = new Map<string, PlantingInput[]>()
  for (const p of plantings) {
    const arr = plantingsByGh.get(p.greenhouse_id)
    if (arr) arr.push(p)
    else plantingsByGh.set(p.greenhouse_id, [p])
  }
  const areaOf = (ps: PlantingInput[]) => ps.reduce((s, p) => s + (Number(p.planted_area) || 0), 0)
  const splitByArea = (ps: PlantingInput[], amt: number) => {
    const tot = areaOf(ps)
    if (tot > 0) for (const p of ps) addCost(p.id, amt * (Number(p.planted_area) || 0) / tot)
    else if (ps.length > 0) { const per = amt / ps.length; for (const p of ps) addCost(p.id, per) }
  }

  for (const c of costs) {
    const amt = Number(c.amount) || 0
    if (amt === 0) continue
    if (c.greenhouse_id && c.variety_id) {
      const direct = plantings.find(p => p.greenhouse_id === c.greenhouse_id && p.variety_id === c.variety_id)
      if (direct) { addCost(direct.id, amt); continue }
      // pas de plantation correspondante → on retombe au niveau serre
    }
    if (c.greenhouse_id) {
      const ps = plantingsByGh.get(c.greenhouse_id)
      if (ps && ps.length > 0) { splitByArea(ps, amt); continue }
      // serre hors périmètre → niveau campagne
    }
    splitByArea(plantings, amt)   // niveau campagne : toutes les plantations
  }

  // ── 2. Production + CA valorisé par plantation ──
  const prodByPlanting = new Map<string, number>()
  const caValoByPlanting = new Map<string, number>()
  for (const p of plantings) {
    const h = harvestsByPlanting.get(p.id)
    prodByPlanting.set(p.id, h ? Number(h.total_qty) || 0 : 0)
    const v = varMap.get(p.variety_id)
    const priceExport = Number(p.price_per_kg_export ?? v?.avg_price_export ?? 0)
    const priceLocal = Number(p.price_per_kg_local ?? v?.avg_price_local ?? 0)
    const qExp = h ? Number(h.qty_cat1) || 0 : 0
    const qLoc = h ? (Number(h.qty_cat2) || 0) + (Number(h.qty_cat3) || 0) : 0
    caValoByPlanting.set(p.id, qExp * priceExport + qLoc * priceLocal)
  }

  // ── 3. CA réel + qté acceptée par variété (fiable via harvest_lots.variety_id) ──
  const caReelByVariety = new Map<string, number>()
  const qtyAccByVariety = new Map<string, number>()
  for (const l of lots) {
    if (!l.variety_id) continue
    caReelByVariety.set(l.variety_id, (caReelByVariety.get(l.variety_id) ?? 0) + (Number(l.ca_amount) || 0))
    qtyAccByVariety.set(l.variety_id, (qtyAccByVariety.get(l.variety_id) ?? 0) + (Number(l.qty_acceptee_kg) || 0))
  }

  // ── 4. Agrégation par variété ──
  const byVar = new Map<string, MargeVariete>()
  for (const p of plantings) {
    let row = byVar.get(p.variety_id)
    if (!row) {
      row = {
        variety_id: p.variety_id, variety_name: varMap.get(p.variety_id)?.commercial_name ?? '—',
        surface: 0, productionKg: 0, qtyAccepteeKg: 0, couts: 0, coutParKg: null, coutParM2: null,
        caValorise: 0, caReel: 0, margeValorisee: 0, margeReelle: 0, margePctValorisee: null, margePctReelle: null,
      }
      byVar.set(p.variety_id, row)
    }
    row.surface += Number(p.planted_area) || 0
    row.productionKg += prodByPlanting.get(p.id) ?? 0
    row.couts += costByPlanting.get(p.id) ?? 0
    row.caValorise += caValoByPlanting.get(p.id) ?? 0
  }
  for (const row of byVar.values()) {
    row.caReel = caReelByVariety.get(row.variety_id) ?? 0
    row.qtyAccepteeKg = qtyAccByVariety.get(row.variety_id) ?? 0
    row.coutParKg = row.productionKg > 0 ? row.couts / row.productionKg : null
    row.coutParM2 = row.surface > 0 ? row.couts / row.surface : null
    row.margeValorisee = row.caValorise - row.couts
    row.margeReelle = row.caReel - row.couts
    row.margePctValorisee = row.caValorise > 0 ? (row.margeValorisee / row.caValorise) * 100 : null
    row.margePctReelle = row.caReel > 0 ? (row.margeReelle / row.caReel) * 100 : null
  }

  const parVariete = Array.from(byVar.values()).sort((a, b) => b.caValorise - a.caValorise)

  const totals: CoutRevientTotals = {
    surface: 0, productionKg: 0, couts: 0, caValorise: 0, caReel: 0,
    margeValorisee: 0, margeReelle: 0, margePctValorisee: null, margePctReelle: null, coutParKg: null,
  }
  for (const r of parVariete) {
    totals.surface += r.surface; totals.productionKg += r.productionKg; totals.couts += r.couts
    totals.caValorise += r.caValorise; totals.caReel += r.caReel
  }
  totals.margeValorisee = totals.caValorise - totals.couts
  totals.margeReelle = totals.caReel - totals.couts
  totals.margePctValorisee = totals.caValorise > 0 ? (totals.margeValorisee / totals.caValorise) * 100 : null
  totals.margePctReelle = totals.caReel > 0 ? (totals.margeReelle / totals.caReel) * 100 : null
  totals.coutParKg = totals.productionKg > 0 ? totals.couts / totals.productionKg : null

  return { parVariete, totals }
}
