import { supabase } from './supabase'

/**
 * testCommerceGenerator — Génération de la chaîne commerciale (post-récoltes).
 *
 *   Récoltes (Cat 1+2) → Dispatches station → Tri → Prix → Factures
 *
 * Workflow :
 *   1. Regroupe les récoltes de la même variété par semaine
 *   2. Crée 1 dispatch (harvest_lots category='station_dispatch') par groupe
 *   3. Lie via harvest_lot_sources (N → 1)
 *   4. Applique tri : freinte 1-3%, écart 2-5%
 *   5. Calcule prix selon saison (haute/creuse/normale) × variété × marché
 *   6. Génère le CA et le tri_status='priced'
 *   7. (Optionnel) Crée des factures clients groupées par mois × client
 *      avec paiements partiels réalistes
 */

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════
export type CommerceGenOptions = {
  /** Cible : Cat 1 → export, Cat 2 → local, Cat 3 → local (déclassé). */
  exportMarketIds?: string[]    // IDs des marchés "export"
  localMarketIds?: string[]     // IDs des marchés "local"
  clientIds?: string[]          // IDs des clients (pour répartition des factures)
  /** Niveau de variance pour les prix (±%). */
  priceVariance?: number        // ex 0.1 = ±10%
  /** Doit-on générer aussi les factures clients ? */
  generateInvoices?: boolean
  /** Taux moyen de paiement (0-1). Ex 0.75 → 75% des montants encaissés. */
  paymentRate?: number
  /** Si true, ne traite que les récoltes passées (date <= aujourd'hui). */
  onlyPast?: boolean
}

export type CommerceGenReport = {
  dispatchesCreated: number
  triApplied: number
  pricedSet: number
  invoicesCreated: number
  paymentsRecorded: number
  settlementsCreated: number   // bordereaux station crees et valides
  settlementsValidated: number
  totalCA: number
  errors: string[]
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
const toNum = (v: any) => (typeof v === 'number' && !isNaN(v) ? v : (Number(v) || 0))
const fromDate = (d: Date) => d.toISOString().slice(0, 10)

/** Coefficient saisonnier des prix (basé sur le mois). */
function seasonCoeff(month: number): number {
  // Saison haute : déc-fév (offre rare) → +20%
  // Saison creuse : mai-juin (offre abondante) → -15%
  // Normale : sinon
  if ([12, 1, 2].includes(month)) return 1.20
  if ([5, 6].includes(month)) return 0.85
  if ([3, 4, 11].includes(month)) return 1.05
  return 1.0
}

/** ISO week number "YYYY-Www" pour grouper les récoltes. */
function isoWeek(d: Date): string {
  const t = new Date(d.valueOf())
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const week1 = new Date(t.getFullYear(), 0, 4)
  const w = 1 + Math.round(((t.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${t.getFullYear()}-W${String(w).padStart(2, '0')}`
}

function gaussian(mean: number, sigma: number): number {
  const u1 = Math.max(1e-9, Math.random())
  const u2 = Math.random()
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

// ════════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export async function generateCommerceForCampaign(
  campaignId: string,
  options: CommerceGenOptions = {}
): Promise<CommerceGenReport> {
  const report: CommerceGenReport = {
    dispatchesCreated: 0,
    triApplied: 0,
    pricedSet: 0,
    invoicesCreated: 0,
    settlementsCreated: 0,
    settlementsValidated: 0,
    paymentsRecorded: 0,
    totalCA: 0,
    errors: [],
  }
  const today = fromDate(new Date())
  const onlyPast = options.onlyPast ?? true
  const priceVariance = options.priceVariance ?? 0.10
  const paymentRate = options.paymentRate ?? 0.78

  // ─── 1. Charger les récoltes + plantings + variétés de la campagne ─────
  const { data: harvests, error: hErr } = await supabase
    .from('harvests')
    .select(`
      id, harvest_date, qty_category_1, qty_category_2, qty_category_3, lot_number,
      campaign_planting_id,
      campaign_plantings!inner(
        id, campaign_id, greenhouse_id, variety_id,
        price_per_kg_export, price_per_kg_local,
        varieties(id, code, commercial_name, avg_price_export, avg_price_local),
        greenhouses(id, code, farm_id)
      )
    `)
    .eq('campaign_plantings.campaign_id', campaignId)

  if (hErr) {
    report.errors.push(`Lecture récoltes : ${hErr.message}`)
    return report
  }
  if (!harvests || harvests.length === 0) {
    report.errors.push('Aucune récolte pour cette campagne')
    return report
  }

  // ─── 2. Récupérer les marchés (avec type, prix, devise) ─────────────
  // Le prix utilise dans le simulateur vient en PRIORITE de markets.avg_price_per_kg
  // (le prix specifique negocie avec ce marche), puis fallback variete.
  let exportMarketIds = options.exportMarketIds ?? []
  let localMarketIds = options.localMarketIds ?? []
  const marketsWithoutClient = new Set<string>()
  const marketNamesById = new Map<string, string>()
  // Cache des infos par marche : avg_price_per_kg, currency
  const marketPriceById = new Map<string, { price: number; currency: string }>()

  // Map : marketId → bordereau_frequency ('weekly' | 'monthly' | 'none')
  const marketFrequencyById = new Map<string, 'weekly' | 'monthly' | 'none'>()

  if (exportMarketIds.length === 0 && localMarketIds.length === 0) {
    const { data: markets } = await supabase
      .from('markets')
      .select('id, code, name, type, currency, avg_price_per_kg, client_id, bordereau_frequency')
    const all = (markets ?? []) as any[]
    for (const m of all) {
      marketNamesById.set(m.id, m.name)
      marketPriceById.set(m.id, {
        price: toNum(m.avg_price_per_kg),
        currency: m.currency ?? 'MAD',
      })
      // Fréquence : valeur explicite OU défaut selon type (export=weekly, autre=monthly)
      const freq = m.bordereau_frequency ?? (m.type === 'export' ? 'weekly' : 'monthly')
      marketFrequencyById.set(m.id, freq as any)
      if (!m.client_id) marketsWithoutClient.add(m.id)
    }
    if (all.length > 0) {
      // Classification basee sur markets.type
      for (const m of all) {
        const type = (m.type ?? '').toLowerCase()
        if (type === 'export') {
          exportMarketIds.push(m.id)
        } else {
          localMarketIds.push(m.id)
        }
      }
      if (exportMarketIds.length === 0 && all.length > 0) exportMarketIds = [all[0].id]
      if (localMarketIds.length === 0 && all.length > 0) localMarketIds = [all[all.length - 1].id]
    }
  }

  // Helper : calcule le prix en MAD pour un marche donne.
  // Convention : MAD est la devise par defaut. Les prix sont toujours retournes en MAD.
  // - markets.avg_price_per_kg : prioritaire. Si markets.currency != MAD, conversion auto.
  // - varieties.avg_price_export / avg_price_local : fallback. Suppose MAD par defaut.
  function resolveMarketPrice(marketId: string, isExport: boolean, fallbackVarExport: number, fallbackVarLocal: number): number {
    const m = marketPriceById.get(marketId)
    if (m && m.price > 0) {
      // Conversion vers MAD selon devise du marche (taux fixes simplifies)
      const rate = m.currency === 'EUR' ? 11.0
                 : m.currency === 'USD' ? 10.0
                 : m.currency === 'GBP' ? 12.5
                 : 1.0  // MAD ou autre → pas de conversion
      return m.price * rate
    }
    // Fallback variete : on suppose MAD (par convention).
    // Si l'utilisateur a vraiment saisi des prix en EUR, ils doivent le mettre
    // dans markets.avg_price_per_kg + markets.currency='EUR' pour conversion auto.
    if (isExport && fallbackVarExport > 0) return fallbackVarExport
    if (!isExport && fallbackVarLocal > 0) return fallbackVarLocal
    return 0
  }

  let clientIds = options.clientIds ?? []
  if (clientIds.length === 0) {
    const { data: clients } = await supabase.from('clients').select('id').limit(20)
    clientIds = (clients ?? []).map((c: any) => c.id)
  }

  // ─── 3. Grouper les récoltes par (variété × semaine ISO) ────────────────
  type WeekGroup = {
    weekKey: string
    varietyId: string
    variety: any
    greenhouseId: string
    campaignPlantingId: string  // FK requise sur harvest_lots — DOIT etre present
    farmId: string | null
    harvests: Array<{ id: string; qty_cat1: number; qty_cat2: number; qty_cat3: number; date: string; lot: string; campaign_planting_id: string }>
    totalCat1: number
    totalCat2: number
    totalCat3: number
    priceExport: number  // EUR/kg
    priceLocal: number   // MAD/kg
    midDate: string      // milieu de semaine
  }

  // Compteurs de diagnostic pour comprendre pourquoi 0 groupes
  let skipNoPlanting = 0
  let skipNoDate = 0
  let skipNoCampaignPlantingId = 0
  let skipFuture = 0
  const groups = new Map<string, WeekGroup>()
  for (const h of harvests as any[]) {
    const cp = h.campaign_plantings
    if (!cp?.variety_id || !cp?.greenhouse_id) { skipNoPlanting++; continue }
    if (!h.harvest_date) { skipNoDate++; continue }
    if (!h.campaign_planting_id) {
      // Sans campaign_planting_id, impossible de creer un dispatch (FK NOT NULL)
      skipNoCampaignPlantingId++
      continue
    }
    const date = new Date(h.harvest_date + 'T00:00:00')
    if (onlyPast && date > new Date()) { skipFuture++; continue }

    const week = isoWeek(date)
    const key = `${cp.variety_id}|${week}`
    const v = cp.varieties
    if (!groups.has(key)) {
      groups.set(key, {
        weekKey: week,
        varietyId: cp.variety_id,
        variety: v,
        greenhouseId: cp.greenhouse_id,
        campaignPlantingId: h.campaign_planting_id,
        farmId: cp.greenhouses?.farm_id ?? null,
        harvests: [],
        totalCat1: 0, totalCat2: 0, totalCat3: 0,
        priceExport: toNum(cp.price_per_kg_export ?? v?.avg_price_export),
        priceLocal:  toNum(cp.price_per_kg_local  ?? v?.avg_price_local),
        midDate: h.harvest_date,
      })
    }
    const g = groups.get(key)!
    g.harvests.push({
      id: h.id,
      qty_cat1: toNum(h.qty_category_1),
      qty_cat2: toNum(h.qty_category_2),
      qty_cat3: toNum(h.qty_category_3),
      date: h.harvest_date,
      lot: h.lot_number,
      campaign_planting_id: h.campaign_planting_id,
    })
    g.totalCat1 += toNum(h.qty_category_1)
    g.totalCat2 += toNum(h.qty_category_2)
    g.totalCat3 += toNum(h.qty_category_3)
    // garde la date la plus récente du groupe (= date d'envoi station)
    if (h.harvest_date > g.midDate) g.midDate = h.harvest_date
  }

  // ─── 4. WORKFLOW REALISTE : envoi → tri → bordereau (Export) ou tarif direct (Local) ─
  // Au lieu de creer les dispatches directement en 'priced', on simule les 4 phases :
  //   A) Envoi : INSERT harvest_lots avec tri_status='pending'
  //   B) Triage : UPDATE avec freinte/ecart et tri_status='tried'
  //   C) Bordereaux station (export) : 1 bordereau par semaine + validation FIFO + factures
  //   D) Tarif direct (local) : update -> 'priced' + facture via admin_generate_dispatch_invoice

  type PendingDispatch = {
    lotId: string  // rempli apres phase A
    isExport: boolean
    qtyEnvoyee: number
    qtyAcceptee: number  // calcule en phase B
    priceMAD: number
    marketId: string
    farmId: string | null
    varietyId: string
    weekKey: string
    midDate: string
    lotNumber: string
  }
  const pendingDispatches: PendingDispatch[] = []

  // Diagnostic : skip count par raison
  let skippedNoQty = 0
  let skippedNoPriceExport = 0
  let skippedNoPriceLocal = 0
  let skippedNoMarket = 0

  for (const g of groups.values()) {
    // ─── Allocation intelligente Cat1 vs Cat2+3 → Export vs Local ───
    // Strategy :
    //   • Si Cat1>0 et prix Export et marché Export → Cat1 va en Export
    //   • Si Cat2+3>0 et prix Local et marché Local → Cat2+3 va en Local
    //   • Si Cat1 mais pas de prix Export, on bascule Cat1 en Local
    //   • Si Cat2+3 mais pas de prix Local, on bascule en Export
    //   • Si Cat2+3 = 0 mais Cat1 > 0 et 2 marchés/prix dispo, on split 70/30
    const totalAll = g.totalCat1 + g.totalCat2 + g.totalCat3
    let qtyForExport = 0
    let qtyForLocal = 0

    const canExport = g.priceExport > 0 && exportMarketIds.length > 0
    const canLocal = g.priceLocal > 0 && localMarketIds.length > 0

    if (totalAll <= 0) { skippedNoQty++; continue }
    if (!canExport && !canLocal) {
      if (!canExport) skippedNoPriceExport++
      if (!canLocal) skippedNoPriceLocal++
      continue
    }

    if (canExport && canLocal) {
      qtyForExport = g.totalCat1
      qtyForLocal = g.totalCat2 + g.totalCat3
      // Si tout est en Cat1 (cas saisie manuelle simple) → on garde 70% Export, 30% Local
      if (qtyForLocal === 0 && qtyForExport > 0) {
        qtyForLocal = qtyForExport * 0.30
        qtyForExport = qtyForExport * 0.70
      }
    } else if (canExport) {
      qtyForExport = totalAll
    } else if (canLocal) {
      qtyForLocal = totalAll
    }

    // Pre-check global : warning si des markets utilises n'ont pas de client_id
  // (la generation continue mais les factures concernees seront skip)
  if (options.generateInvoices !== false && marketsWithoutClient.size > 0) {
    const allUsedMarkets = new Set([...exportMarketIds, ...localMarketIds])
    const missingNames = Array.from(marketsWithoutClient)
      .filter(id => allUsedMarkets.has(id))
      .map(id => marketNamesById.get(id) ?? id.slice(0, 8))
    if (missingNames.length > 0) {
      report.errors.push(
        `⚠ ${missingNames.length} marche(s) sans client_id : ${missingNames.join(', ')}. ` +
        `Aucune facture ne sera generee pour ces marches. Configurez le 'Client par defaut' ` +
        `dans /marches pour activer la facturation auto.`
      )
    }
  }

  // ─── PHASE A : Envoi (insert harvest_lots tri_status='pending') ───
    if (qtyForExport > 0) {
      const monthNum = parseInt(g.midDate.slice(5, 7))
      const coeff = seasonCoeff(monthNum)
      const variance = 1 + (Math.random() - 0.5) * 2 * priceVariance
      const marketId = pickRandom(exportMarketIds)
      if (!marketId) { skippedNoMarket++; continue }
      // Prix : prioritise markets.avg_price_per_kg du marche choisi,
      // fallback varieties.avg_price_export (EUR converti × 11)
      const basePriceMAD = resolveMarketPrice(marketId, true, g.priceExport, g.priceLocal)
      const priceMAD = basePriceMAD * coeff * variance
      const lotNumber = `DISP-EXP-${g.weekKey}-${(g.variety?.code ?? 'V').slice(0, 4)}`

      try {
        const { data: lot, error } = await supabase.from('harvest_lots').insert({
          lot_number: lotNumber,
          campaign_planting_id: g.campaignPlantingId,
          harvest_id: g.harvests[0]?.id ?? null,
          harvest_date: g.midDate,
          receipt_date: g.midDate,
          quantity_kg: qtyForExport,
          category: 'station_dispatch',
          variety_id: g.varietyId,
          greenhouse_id: g.greenhouseId,
          market_id: marketId ?? null,
          tri_status: 'pending',  // ← PHASE A : envoye, pas encore trie
          station_ref: `STA-${g.weekKey}`,
          periode_debut: g.midDate,
          periode_fin: g.midDate,
        }).select('id').single()
        if (error) throw error
        if (lot?.id) {
          // Sources (N harvests → 1 lot)
          const sources = g.harvests.filter(h => h.qty_cat1 > 0).map(h => ({
            harvest_lot_id: lot.id, harvest_id: h.id, qty_contributed_kg: h.qty_cat1,
          }))
          if (sources.length > 0) await supabase.from('harvest_lot_sources').insert(sources)
          pendingDispatches.push({
            lotId: lot.id, isExport: true,
            qtyEnvoyee: qtyForExport, qtyAcceptee: 0,
            priceMAD, marketId, farmId: g.farmId, varietyId: g.varietyId,
            weekKey: g.weekKey, midDate: g.midDate, lotNumber,
          })
          report.dispatchesCreated++
        }
      } catch (e: any) {
        report.errors.push(`Envoi EXPORT ${lotNumber} : ${e.message}`)
      }
    }

    if (qtyForLocal > 0) {
      const monthNum = parseInt(g.midDate.slice(5, 7))
      const coeff = seasonCoeff(monthNum)
      const variance = 1 + (Math.random() - 0.5) * 2 * priceVariance
      const marketId = pickRandom(localMarketIds)
      if (!marketId) { skippedNoMarket++; continue }
      // Prix : prioritise markets.avg_price_per_kg, fallback varieties.avg_price_local
      const basePriceMAD = resolveMarketPrice(marketId, false, g.priceExport, g.priceLocal)
      const priceMAD = basePriceMAD * coeff * variance
      const lotNumber = `DISP-LOC-${g.weekKey}-${(g.variety?.code ?? 'V').slice(0, 4)}`

      try {
        const { data: lot, error } = await supabase.from('harvest_lots').insert({
          lot_number: lotNumber,
          campaign_planting_id: g.campaignPlantingId,
          harvest_id: g.harvests[0]?.id ?? null,
          harvest_date: g.midDate,
          receipt_date: g.midDate,
          quantity_kg: qtyForLocal,
          category: 'station_dispatch',
          variety_id: g.varietyId,
          greenhouse_id: g.greenhouseId,
          market_id: marketId ?? null,
          tri_status: 'pending',
          station_ref: `STA-${g.weekKey}-L`,
          periode_debut: g.midDate,
          periode_fin: g.midDate,
        }).select('id').single()
        if (error) throw error
        if (lot?.id) {
          const sources = g.harvests.filter(h => h.qty_cat2 + h.qty_cat3 > 0).map(h => ({
            harvest_lot_id: lot.id, harvest_id: h.id, qty_contributed_kg: h.qty_cat2 + h.qty_cat3,
          }))
          if (sources.length > 0) await supabase.from('harvest_lot_sources').insert(sources)
          pendingDispatches.push({
            lotId: lot.id, isExport: false,
            qtyEnvoyee: qtyForLocal, qtyAcceptee: 0,
            priceMAD, marketId, farmId: g.farmId, varietyId: g.varietyId,
            weekKey: g.weekKey, midDate: g.midDate, lotNumber,
          })
          report.dispatchesCreated++
        }
      } catch (e: any) {
        report.errors.push(`Envoi LOCAL ${lotNumber} : ${e.message}`)
      }
    }
  }

  // ─── PHASE B : Triage — applique freinte/ecart, tri_status='tried', qty_acceptee ───
  for (const d of pendingDispatches) {
    const freinteMean = d.isExport ? 2.0 : 1.5
    const ecartMean = d.isExport ? 3.5 : 2.5
    const fPct = Math.max(0.5, Math.min(d.isExport ? 5 : 4, gaussian(freinteMean, 0.6)))
    const ePct = Math.max(1, Math.min(d.isExport ? 8 : 6, gaussian(ecartMean, 0.9)))
    const qtyNette = d.qtyEnvoyee * (1 - fPct / 100)
    const qtyAcceptee = qtyNette * (1 - ePct / 100)
    d.qtyAcceptee = qtyAcceptee

    try {
      const { error } = await supabase.from('harvest_lots').update({
        tri_status: 'tried',
        freinte_pct: fPct,
        ecart_pct: ePct,
        qty_nette_kg: qtyNette,
        qty_acceptee_kg: qtyAcceptee,
        rejet_qty_kg: d.qtyEnvoyee - qtyAcceptee,
        destination_rejet: 'destruction',
      }).eq('id', d.lotId)
      if (error) throw error
      report.triApplied++
    } catch (e: any) {
      report.errors.push(`Tri ${d.lotNumber} : ${e.message}`)
    }
  }

  // ─── PHASE C : Bordereaux station selon la frequence par marche ───
  // Trois cas selon markets.bordereau_frequency :
  //   - 'weekly'  : 1 bordereau par semaine ISO (lundi → dimanche)
  //   - 'monthly' : 1 bordereau par mois calendaire (1er → fin du mois)
  //   - 'none'    : pas de bordereau, tarif direct (traite en PHASE D)

  type SettlementKey = { periodKey: string; periodType: 'weekly' | 'monthly'; periodStart: Date; periodEnd: Date }

  // Helper : crée/valide/facture un bordereau a partir d'un groupe de dispatches
  async function buildBordereauForGroup(key: SettlementKey, dispatches: PendingDispatch[]) {
    let settlementId: string | null = null
    let settlementIsValidated = false
    try {
      const { data: existing } = await supabase
        .from('station_settlements')
        .select('id, code, status, invoice_id, period_type')
        .eq('period_start', fromDate(key.periodStart))
        .eq('period_end', fromDate(key.periodEnd))
        .eq('period_type', key.periodType)
        .maybeSingle()

      if (existing) {
        settlementId = existing.id
        settlementIsValidated = existing.status === 'valide'
        if (settlementIsValidated && existing.invoice_id) return
      } else {
        const { data: s, error: sErr } = await supabase
          .from('station_settlements')
          .insert({
            period_start: fromDate(key.periodStart),
            period_end: fromDate(key.periodEnd),
            received_date: fromDate(key.periodEnd),
            status: 'brouillon',
            period_type: key.periodType,
            notes: `Bordereau auto-genere (demo) - ${key.periodType === 'weekly' ? 'semaine' : 'mois'} ${key.periodKey}`,
          })
          .select('id, code')
          .single()
        if (sErr) throw sErr
        settlementId = s.id
        report.settlementsCreated++
      }

      // Aggregate dispatches (market × variety × farm)
      const lineMap = new Map<string, { market_id: string; variety_id: string; farm_id: string | null; qty_kg: number; price_per_kg: number }>()
      for (const d of dispatches) {
        const k = `${d.marketId}|${d.varietyId}|${d.farmId ?? 'null'}`
        const cur = lineMap.get(k) ?? {
          market_id: d.marketId, variety_id: d.varietyId, farm_id: d.farmId,
          qty_kg: 0, price_per_kg: d.priceMAD,
        }
        cur.qty_kg += d.qtyAcceptee
        lineMap.set(k, cur)
      }

      if (!settlementIsValidated) {
        await supabase.from('station_settlement_lines').delete().eq('settlement_id', settlementId)
        const linesToInsert = Array.from(lineMap.values()).map(l => ({
          settlement_id: settlementId,
          market_id: l.market_id, variety_id: l.variety_id, farm_id: l.farm_id,
          qty_kg: l.qty_kg, price_per_kg: l.price_per_kg,
        }))
        if (linesToInsert.length > 0) {
          const { error: lErr } = await supabase.from('station_settlement_lines').insert(linesToInsert)
          if (lErr) throw lErr
        }
        const { error: vErr } = await supabase.rpc('admin_validate_station_settlement', { p_settlement_id: settlementId })
        if (vErr) throw vErr
        report.settlementsValidated++
      }

      // Facturation
      if (options.generateInvoices !== false) {
        const marketsInBordereau = new Set(dispatches.map(d => d.marketId))
        const missingClient = Array.from(marketsInBordereau).filter(mid => marketsWithoutClient.has(mid))
        if (missingClient.length > 0) {
          const names = missingClient.map(id => marketNamesById.get(id) ?? id.slice(0, 8)).join(', ')
          report.errors.push(`Facture ${key.periodKey} skip : marche(s) sans client_id : ${names}.`)
        } else {
          const { data: invRes, error: invErr } = await supabase.rpc('admin_generate_settlement_invoice', { p_settlement_id: settlementId })
          if (invErr) {
            report.errors.push(`Facture bordereau ${key.periodKey} : ${invErr.message}`)
          } else if (invRes) {
            report.invoicesCreated += (invRes as any).invoices_created ?? 0
            report.totalCA += (invRes as any).total_amount ?? 0
          }
        }
      }

      for (const d of dispatches) {
        if (!(options.generateInvoices !== false)) report.totalCA += d.qtyAcceptee * d.priceMAD
        report.pricedSet++
      }
    } catch (e: any) {
      report.errors.push(`Bordereau ${key.periodKey}${settlementId ? ` (${settlementId.slice(0,8)})` : ''} : ${e.message}`)
    }
  }

  // Helper : compute weekly/monthly period dates from a YYYY-Wnn or YYYY-MM key
  function isoWeekToDates(weekKey: string): { start: Date; end: Date } {
    const [yyyy, ww] = weekKey.split('-W')
    const year = parseInt(yyyy); const week = parseInt(ww)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const dayOfJan4 = jan4.getUTCDay() || 7
    const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (dayOfJan4 - 1))
    const monday = new Date(week1Mon); monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7)
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
    return { start: monday, end: sunday }
  }
  function monthlyToDates(yyyyMm: string): { start: Date; end: Date } {
    const [yyyy, mm] = yyyyMm.split('-')
    const year = parseInt(yyyy); const month = parseInt(mm)
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 0))  // dernier jour du mois
    return { start, end }
  }

  // Groupe les dispatches selon la frequence de LEUR marche
  const weeklyByKey = new Map<string, PendingDispatch[]>()    // key = weekKey
  const monthlyByKey = new Map<string, PendingDispatch[]>()   // key = YYYY-MM
  const noBordereauDispatches: PendingDispatch[] = []         // tarif direct

  for (const d of pendingDispatches.filter(x => x.qtyAcceptee > 0)) {
    const freq = marketFrequencyById.get(d.marketId) ?? (d.isExport ? 'weekly' : 'monthly')
    if (freq === 'weekly') {
      const arr = weeklyByKey.get(d.weekKey) ?? []
      arr.push(d); weeklyByKey.set(d.weekKey, arr)
    } else if (freq === 'monthly') {
      const monthKey = d.midDate.slice(0, 7)  // YYYY-MM
      const arr = monthlyByKey.get(monthKey) ?? []
      arr.push(d); monthlyByKey.set(monthKey, arr)
    } else {
      noBordereauDispatches.push(d)
    }
  }

  // C-1 : Bordereaux hebdo (typiquement Export)
  for (const [weekKey, dispatches] of weeklyByKey) {
    const { start, end } = isoWeekToDates(weekKey)
    await buildBordereauForGroup(
      { periodKey: weekKey, periodType: 'weekly', periodStart: start, periodEnd: end },
      dispatches,
    )
  }

  // C-2 : Bordereaux mensuels (typiquement Local)
  for (const [monthKey, dispatches] of monthlyByKey) {
    const { start, end } = monthlyToDates(monthKey)
    await buildBordereauForGroup(
      { periodKey: monthKey, periodType: 'monthly', periodStart: start, periodEnd: end },
      dispatches,
    )
  }

  // ─── PHASE D : Tarif direct pour markets frequency='none' (pas de bordereau) ───
  for (const d of noBordereauDispatches) {
    const ca = d.qtyAcceptee * d.priceMAD
    try {
      const { error } = await supabase.from('harvest_lots').update({
        tri_status: 'priced',
        price_per_kg: d.priceMAD,
        ca_amount: ca,
        certificate_number: `CERT-LOC-${d.weekKey}`,
      }).eq('id', d.lotId)
      if (error) throw error
      report.pricedSet++
      report.totalCA += ca

      // Facture pour ce dispatch (via RPC, utilise markets.client_id)
      // Pre-check : skip si le marche n'a pas de client_id
      if (options.generateInvoices !== false) {
        if (marketsWithoutClient.has(d.marketId)) {
          // Already logged at the global level — silent skip
        } else {
          const { data: invRes, error: invErr } = await supabase.rpc('admin_generate_dispatch_invoice', { p_lot_id: d.lotId })
          if (invErr) {
            if (!/PGRST202|does not exist/i.test(invErr.message ?? '')) {
              report.errors.push(`Facture LOCAL ${d.lotNumber} : ${invErr.message}`)
            }
          } else if (invRes && (invRes as any).created) {
            report.invoicesCreated++
          }
        }
      }
    } catch (e: any) {
      report.errors.push(`Tarif LOCAL ${d.lotNumber} : ${e.message}`)
    }
  }

  // Si 0 dispatches generes, on ajoute un diagnostic explicite
  if (report.dispatchesCreated === 0) {
    const diag: string[] = []
    diag.push(`Diagnostic : ${harvests.length} recoltes chargees, ${groups.size} groupes (variete x semaine) analyses`)

    // Diagnostic des skips au niveau du grouping
    if (skipNoPlanting > 0) {
      diag.push(`${skipNoPlanting} recoltes sans variety_id ou greenhouse_id (relation campaign_plantings cassee)`)
    }
    if (skipNoDate > 0) diag.push(`${skipNoDate} recoltes sans harvest_date`)
    if (skipNoCampaignPlantingId > 0) {
      diag.push(`${skipNoCampaignPlantingId} recoltes sans campaign_planting_id (NOT NULL requis)`)
    }
    if (skipFuture > 0) {
      diag.push(`${skipFuture} recoltes ignorees car dans le futur (option onlyPast=true). Astuce : decoche cette option pour les inclure.`)
    }

    // Diagnostic des skips au niveau des groupes
    if (skippedNoQty > 0) diag.push(`${skippedNoQty} groupes sans qty (qty_category_1/2/3 = 0)`)
    if (skippedNoPriceExport > 0 && skippedNoPriceLocal > 0) {
      diag.push(`Aucun prix configure : verifier varieties.avg_price_export et avg_price_local`)
    } else if (skippedNoPriceExport > 0) {
      diag.push(`Pas de prix Export : varieties.avg_price_export NULL ou 0`)
    } else if (skippedNoPriceLocal > 0) {
      diag.push(`Pas de prix Local : varieties.avg_price_local NULL ou 0`)
    }
    if (skippedNoMarket > 0) diag.push(`Aucun marche disponible (sans marketId attribue)`)
    if (exportMarketIds.length === 0 && localMarketIds.length === 0) {
      diag.push(`Aucun marche en DB. Cree au moins 1 marche dans /marches.`)
    }
    if (clientIds.length === 0) {
      diag.push(`Aucun client en DB. Cree au moins 1 client dans /clients.`)
    }

    for (const d of diag) report.errors.push(d)
  }

  return report
}
