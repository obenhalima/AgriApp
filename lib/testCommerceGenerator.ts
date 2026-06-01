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

  // ─── 2. Récupérer les marchés / clients si pas fournis ─────────────────
  let exportMarketIds = options.exportMarketIds ?? []
  let localMarketIds = options.localMarketIds ?? []
  if (exportMarketIds.length === 0 && localMarketIds.length === 0) {
    const { data: markets } = await supabase.from('markets').select('id, code, name')
    const all = (markets ?? []) as any[]
    if (all.length > 0) {
      // Heuristique : code/name contient "export" → export, sinon local
      for (const m of all) {
        const label = `${m.code ?? ''} ${m.name ?? ''}`.toLowerCase()
        if (label.includes('export') || label.includes('eu') || label.includes('rungis')) {
          exportMarketIds.push(m.id)
        } else {
          localMarketIds.push(m.id)
        }
      }
      // Fallback : si rien classifié, prendre n'importe quel marché
      if (exportMarketIds.length === 0 && all.length > 0) exportMarketIds = [all[0].id]
      if (localMarketIds.length === 0 && all.length > 0) localMarketIds = [all[all.length - 1].id]
    }
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

  const groups = new Map<string, WeekGroup>()
  for (const h of harvests as any[]) {
    const cp = h.campaign_plantings
    if (!cp?.variety_id || !cp?.greenhouse_id) continue
    if (!h.harvest_date) continue
    if (!h.campaign_planting_id) {
      // Sans campaign_planting_id, impossible de creer un dispatch (FK NOT NULL)
      report.errors.push(`Recolte ${h.lot_number ?? h.id} sans campaign_planting_id — ignoree`)
      continue
    }
    const date = new Date(h.harvest_date + 'T00:00:00')
    if (onlyPast && date > new Date()) continue

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

  // ─── 4. Pour chaque groupe : créer dispatches Export + Local ────────────
  const dispatchesByMonthClient = new Map<string, {
    clientId: string; month: string; ca: number; varieties: string[]
  }>()

  for (const g of groups.values()) {
    // Dispatch EXPORT (depuis Cat 1)
    if (g.totalCat1 > 0 && g.priceExport > 0 && exportMarketIds.length > 0) {
      const lotNumber = `DISP-EXP-${g.weekKey}-${(g.variety?.code ?? 'V').slice(0, 4)}`
      const month = g.midDate.slice(0, 7)
      const monthNum = parseInt(month.split('-')[1])
      const coeff = seasonCoeff(monthNum)
      const variance = 1 + (Math.random() - 0.5) * 2 * priceVariance
      const priceEUR = g.priceExport * coeff * variance
      const priceMAD = priceEUR * 11.0  // taux moyen EUR/MAD ~11

      const freinte = gaussian(2.0, 0.6)
      const ecart = gaussian(3.5, 1.0)
      const fPct = Math.max(0.5, Math.min(5, freinte))
      const ePct = Math.max(1, Math.min(8, ecart))
      const qtyNette = g.totalCat1 * (1 - fPct / 100)
      const qtyAcceptee = qtyNette * (1 - ePct / 100)
      const ca = qtyAcceptee * priceMAD

      const marketId = pickRandom(exportMarketIds)
      const clientId = pickRandom(clientIds)

      try {
        const { data: lot, error } = await supabase.from('harvest_lots').insert({
          lot_number: lotNumber,
          // FK NOT NULL : on prend le campaign_planting_id du groupe (toutes les
          // recoltes du groupe ont le meme planting puisque grouped par variete x semaine)
          campaign_planting_id: g.campaignPlantingId,
          // harvest_id : pour les composites on prend la 1ere recolte du groupe
          // (post-migration 024, harvest_id peut etre NULL mais on prefere le remplir)
          harvest_id: g.harvests[0]?.id ?? null,
          harvest_date: g.midDate,
          receipt_date: g.midDate,
          quantity_kg: g.totalCat1,
          qty_nette_kg: qtyNette,
          qty_acceptee_kg: qtyAcceptee,
          category: 'station_dispatch',
          variety_id: g.varietyId,
          greenhouse_id: g.greenhouseId,
          market_id: marketId ?? null,
          client_id: clientId ?? null,
          freinte_pct: fPct,
          ecart_pct: ePct,
          price_per_kg: priceMAD,
          ca_amount: ca,
          station_ref: `STA-${g.weekKey}`,
          periode_debut: g.midDate,
          periode_fin: g.midDate,
          tri_status: 'priced',
          certificate_number: `CERT-EXP-${g.weekKey}`,
        }).select('id').single()
        if (error) throw error

        if (lot?.id) {
          // Liens sources (N harvests → 1 lot)
          const sources = g.harvests
            .filter(h => h.qty_cat1 > 0)
            .map(h => ({
              harvest_lot_id: lot.id,
              harvest_id: h.id,
              qty_contributed_kg: h.qty_cat1,
            }))
          if (sources.length > 0) {
            await supabase.from('harvest_lot_sources').insert(sources)
          }
        }

        report.dispatchesCreated++
        report.triApplied++
        report.pricedSet++
        report.totalCA += ca

        // Aggrège pour les factures
        if (clientId) {
          const k = `${clientId}|${month}`
          const cur = dispatchesByMonthClient.get(k) ?? { clientId, month, ca: 0, varieties: [] }
          cur.ca += ca
          if (g.variety?.commercial_name && !cur.varieties.includes(g.variety.commercial_name)) {
            cur.varieties.push(g.variety.commercial_name)
          }
          dispatchesByMonthClient.set(k, cur)
        }
      } catch (e: any) {
        report.errors.push(`Dispatch EXPORT ${lotNumber} : ${e.message}`)
      }
    }

    // Dispatch LOCAL (depuis Cat 2 + Cat 3)
    const totalLocal = g.totalCat2 + g.totalCat3
    if (totalLocal > 0 && g.priceLocal > 0 && localMarketIds.length > 0) {
      const lotNumber = `DISP-LOC-${g.weekKey}-${(g.variety?.code ?? 'V').slice(0, 4)}`
      const month = g.midDate.slice(0, 7)
      const monthNum = parseInt(month.split('-')[1])
      const coeff = seasonCoeff(monthNum)
      const variance = 1 + (Math.random() - 0.5) * 2 * priceVariance
      const priceMAD = g.priceLocal * coeff * variance

      const freinte = gaussian(1.5, 0.5)
      const ecart = gaussian(2.5, 0.8)
      const fPct = Math.max(0.5, Math.min(4, freinte))
      const ePct = Math.max(1, Math.min(6, ecart))
      const qtyNette = totalLocal * (1 - fPct / 100)
      const qtyAcceptee = qtyNette * (1 - ePct / 100)
      const ca = qtyAcceptee * priceMAD

      const marketId = pickRandom(localMarketIds)
      const clientId = pickRandom(clientIds)

      try {
        const { data: lot, error } = await supabase.from('harvest_lots').insert({
          lot_number: lotNumber,
          harvest_id: g.harvests[0]?.id ?? null,
          // FK NOT NULL : pris depuis le groupe (assigne lors du grouping)
          campaign_planting_id: g.campaignPlantingId,
          harvest_date: g.midDate,
          receipt_date: g.midDate,
          quantity_kg: totalLocal,
          qty_nette_kg: qtyNette,
          qty_acceptee_kg: qtyAcceptee,
          category: 'station_dispatch',
          variety_id: g.varietyId,
          greenhouse_id: g.greenhouseId,
          market_id: marketId ?? null,
          client_id: clientId ?? null,
          freinte_pct: fPct,
          ecart_pct: ePct,
          price_per_kg: priceMAD,
          ca_amount: ca,
          station_ref: `STA-${g.weekKey}-L`,
          periode_debut: g.midDate,
          periode_fin: g.midDate,
          tri_status: 'priced',
          certificate_number: `CERT-LOC-${g.weekKey}`,
        }).select('id').single()
        if (error) throw error

        if (lot?.id) {
          const sources = g.harvests
            .filter(h => h.qty_cat2 + h.qty_cat3 > 0)
            .map(h => ({
              harvest_lot_id: lot.id,
              harvest_id: h.id,
              qty_contributed_kg: h.qty_cat2 + h.qty_cat3,
            }))
          if (sources.length > 0) {
            await supabase.from('harvest_lot_sources').insert(sources)
          }
        }

        report.dispatchesCreated++
        report.triApplied++
        report.pricedSet++
        report.totalCA += ca

        if (clientId) {
          const k = `${clientId}|${month}`
          const cur = dispatchesByMonthClient.get(k) ?? { clientId, month, ca: 0, varieties: [] }
          cur.ca += ca
          if (g.variety?.commercial_name && !cur.varieties.includes(g.variety.commercial_name)) {
            cur.varieties.push(g.variety.commercial_name)
          }
          dispatchesByMonthClient.set(k, cur)
        }
      } catch (e: any) {
        report.errors.push(`Dispatch LOCAL ${lotNumber} : ${e.message}`)
      }
    }
  }

  // ─── 5. Factures clients (1 par client × mois) ────────────────────────
  if (options.generateInvoices !== false && dispatchesByMonthClient.size > 0) {
    let invIdx = 1
    for (const g of dispatchesByMonthClient.values()) {
      const subtotal = g.ca
      const taxRate = 0.20
      const taxAmount = subtotal * taxRate
      const total = subtotal + taxAmount
      const paid = total * (paymentRate + (Math.random() - 0.5) * 0.3)  // ±15% variance
      const invoiceDate = `${g.month}-15`
      const dueDate = new Date(invoiceDate + 'T00:00:00')
      dueDate.setDate(dueDate.getDate() + 30)
      const status = paid >= total - 1 ? 'paye'
                    : paid > 0 ? 'partiellement_paye'
                    : (new Date(fromDate(dueDate)) < new Date(today) ? 'en_retard' : 'en_attente')

      try {
        const { data: inv, error } = await supabase.from('invoices').insert({
          invoice_number: `F-${g.month.replace('-', '')}-${String(invIdx).padStart(4, '0')}`,
          invoice_type: 'vente',
          client_id: g.clientId,
          invoice_date: invoiceDate,
          due_date: fromDate(dueDate),
          currency: 'MAD',
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          paid_amount: Math.max(0, paid),
          status,
          notes: `Facture auto-générée (démo) — ${g.varieties.join(', ')}`,
        }).select('id').single()
        if (error) throw error
        report.invoicesCreated++
        invIdx++

        // Paiement reçu (si partiel ou complet)
        if (inv?.id && paid > 0) {
          const payDate = new Date(invoiceDate + 'T00:00:00')
          payDate.setDate(payDate.getDate() + Math.floor(15 + Math.random() * 30))
          await supabase.from('payments_received').insert({
            invoice_id: inv.id,
            payment_date: fromDate(payDate),
            amount: Math.max(0, paid),
            payment_method: Math.random() > 0.5 ? 'virement' : 'cheque',
            reference: `PAY-${invIdx}`,
          })
          report.paymentsRecorded++
        }
      } catch (e: any) {
        report.errors.push(`Facture ${g.clientId}/${g.month} : ${e.message}`)
      }
    }
  }

  return report
}
