'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { BordereauxSection } from '@/app/factures/BordereauxSection'
import { useReferenceList } from '@/lib/useReferenceList'
import { useAuth } from '@/lib/auth'

// ============================================================
// Page Récoltes — workflow unifié (CRUD + Cycle station)
// Onglets : Récoltes | À envoyer | À trier | À tarifer | Confirmés | Alertes
// ============================================================

type Tab = 'liste' | 'a_envoyer' | 'a_peser' | 'a_trier' | 'a_tarifer' | 'confirmes' | 'ca' | 'stock_retour' | 'bordereaux' | 'alertes'

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmt2 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Calcule la qty restante d'une récolte (non encore engagée dans des envois)
function computeUsed(harvestId: string, sources: any[], legacyDirect: any[]): number {
  const fromSources = sources.filter(s => s.harvest_id === harvestId).reduce((s, x) => s + Number(x.qty_contributed_kg || 0), 0)
  // Évite le double-comptage : si la dispatch est dans sources, on ne la compte pas via legacy
  const dispatchesWithSources = new Set(sources.map(s => s.harvest_lot_id))
  const fromLegacy = legacyDirect
    .filter(d => d.harvest_id === harvestId && !dispatchesWithSources.has(d.id))
    .reduce((s, x) => s + Number(x.quantity_kg || 0), 0)
  return fromSources + fromLegacy
}

export default function RecoltesPage() {
  const { values: trayTypes } = useReferenceList('tray_type')
  const { profile } = useAuth()
  const myId = profile?.id ?? null
  const myName = profile?.full_name || profile?.email || 'Moi'
  const [tab, setTab] = useState<Tab>('liste')
  const [harvests, setHarvests] = useState<any[]>([])
  const [stockRetour, setStockRetour] = useState<any[]>([])
  const [dispatches, setDispatches] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [markets, setMarkets] = useState<any[]>([])
  const [alertes, setAlertes] = useState<any[]>([])
  const [settlementCount, setSettlementCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Modals ───
  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [modalCompose, setModalCompose] = useState(false)
  const [modalPesee, setModalPesee] = useState<any>(null)
  const [modalTri, setModalTri] = useState<any>(null)
  const [modalPrice, setModalPrice] = useState<any>(null)
  const [modalPeriodPrice, setModalPeriodPrice] = useState(false)
  const [modalAlerte, setModalAlerte] = useState(false)

  // ─── Form: nouvelle récolte (saisie en plateaux) ───
  const emptyTrayLine = () => ({ tray_type_code: '', nb: '' })
  const [formNew, setFormNew] = useState<{ campaign_planting_id: string; harvest_date: string; notes: string; trayLines: { tray_type_code: string; nb: string }[] }>(
    { campaign_planting_id: '', harvest_date: '', notes: '', trayLines: [emptyTrayLine()] }
  )

  // Poids théorique par code de plateau (depuis le référentiel tray_type)
  const trayWeightByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of trayTypes) m.set(t.code, Number(t.metadata?.poids_kg ?? 0))
    return m
  }, [trayTypes])

  // Estimation = Σ (nb plateaux × poids théorique)
  const estimateLines = (lines: { tray_type_code: string; nb: string }[]) =>
    lines.reduce((s, l) => s + (Number(l.nb) || 0) * (trayWeightByCode.get(l.tray_type_code) ?? 0), 0)
  const [formEdit, setFormEdit] = useState<Record<string, any>>({})
  const [formAlerte, setFormAlerte] = useState({ date: '', reason: 'panne_irrigation', notes: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // ─── Filtres globaux (s'appliquent à tous les onglets sauf bordereaux) ───
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterFarmId, setFilterFarmId] = useState('')
  const [filterGreenhouseId, setFilterGreenhouseId] = useState('')
  const [filterVarietyId, setFilterVarietyId] = useState('')

  // ─── Tri par colonne (utilisé par ListeTab) ───
  type SortKey = 'lot_number' | 'harvest_date' | 'greenhouse' | 'variety' | 'total_qty' | 'used_kg' | 'remaining_kg'
  const [sortKey, setSortKey] = useState<SortKey>('harvest_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ─── Chargement ───
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const [hRes, dRes, sRes, pRes, mRes, alRes, srRes, stRes] = await Promise.all([
        supabase.from('harvests')
          .select('id, lot_number, harvest_date, total_qty, estimated_kg, actual_kg, recorded_by, recorded_by_name, notes, campaign_planting_id, campaign_plantings(*, greenhouses(code, name, farm_id, farms(name)), varieties(commercial_name, code), campaigns(name))')
          .order('harvest_date', { ascending: false })
          .limit(300),
        supabase.from('harvest_lots')
          .select('id, lot_number, harvest_id, harvest_date, quantity_kg, estimated_kg, weighed_kg, weighed_at, market_id, markets(name, currency), variety_id, varieties(code, commercial_name), tri_status, freinte_pct, ecart_pct, qty_nette_kg, qty_acceptee_kg, qty_priced_kg, price_per_kg, ca_amount, station_ref, certificate_number, notes, destination_rejet, rejet_qty_kg, parent_dispatch_id, campaign_planting_id, greenhouse_id, greenhouses(farm_id, farms(name)), category')
          .eq('category', 'station_dispatch')
          .gte('harvest_date', since30)
          .order('harvest_date', { ascending: false }),
        supabase.from('harvest_lot_sources')
          .select('harvest_lot_id, harvest_id, qty_contributed_kg, harvests(lot_number, harvest_date, recorded_by, recorded_by_name)'),
        supabase.from('campaign_plantings').select('id, variety_id, greenhouse_id, first_harvest_date, last_harvest_date, greenhouses(code, name, farm_id, farms(name)), varieties(commercial_name, code), campaigns(name, harvest_start, harvest_end)'),
        supabase.from('markets').select('id, code, name, currency, type').eq('is_active', true).order('name'),
        supabase.from('alerts').select('*').eq('type', 'no_harvest').order('created_at', { ascending: false }).limit(100),
        // Stock de retour : lots créés via tri (destination = retour_stock) pas encore consommés
        supabase.from('harvest_lots')
          .select('id, lot_number, harvest_date, quantity_kg, variety_id, varieties(code, commercial_name), greenhouse_id, parent_dispatch_id, tri_status, notes')
          .eq('category', 'stock_retour')
          .eq('tri_status', 'pending')
          .order('harvest_date', { ascending: false }),
        // Compteur de bordereaux station (pour le badge d'onglet)
        supabase.from('station_settlements').select('id', { count: 'exact', head: true }),
      ])
      if (hRes.error) throw hRes.error
      setHarvests(hRes.data ?? [])
      setDispatches(dRes.data ?? [])
      setSources(sRes.data ?? [])
      setPlantings(pRes.data ?? [])
      setMarkets(mRes.data ?? [])
      setAlertes(alRes.data ?? [])
      setStockRetour(srRes.data ?? [])
      setSettlementCount(stRes.count ?? 0)
    } catch (e: any) { setError(e.message || String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Realtime : abonnement aux changements harvests / harvest_lots / sources / alerts ───
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [realtimeNudge, setRealtimeNudge] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  useEffect(() => {
    let reloadTimer: any = null
    const triggerReload = (table: string, payload: any) => {
      console.log(`[realtime] ✓ ${table} ${payload.eventType} (${payload.new?.id ?? payload.old?.id ?? '?'}) → reload`)
      setRealtimeNudge(x => x + 1)
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => { load(); setLastRefresh(new Date()) }, 800)
    }
    console.log('[realtime] subscribing to recoltes-changes…')
    const channel = supabase.channel('recoltes-changes')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'harvests' }, (p: any) => triggerReload('harvests', p))
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'harvest_lots' }, (p: any) => triggerReload('harvest_lots', p))
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'harvest_lot_sources' }, (p: any) => triggerReload('harvest_lot_sources', p))
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'alerts' }, (p: any) => triggerReload('alerts', p))
      .subscribe((status, err) => {
        console.log('[realtime] status:', status, err ? `error: ${JSON.stringify(err)}` : '')
        setRealtimeOk(status === 'SUBSCRIBED')
      })
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      supabase.removeChannel(channel)
    }
  }, [load])

  const manualRefresh = async () => {
    console.log('[recoltes] manual refresh')
    await load()
    setLastRefresh(new Date())
  }

  // ─── Données dérivées ───
  const harvestsEnriched = useMemo(() => harvests.map(h => {
    const used = computeUsed(h.id, sources, dispatches)
    return { ...h, used_kg: used, remaining_kg: Math.max(0, Number(h.total_qty || 0) - used) }
  }), [harvests, sources, dispatches])

  const dispatchesEnriched = useMemo(() => {
    const sourcesByLot = new Map<string, any[]>()
    sources.forEach((s: any) => {
      const arr = sourcesByLot.get(s.harvest_lot_id) ?? []
      arr.push(s); sourcesByLot.set(s.harvest_lot_id, arr)
    })
    return dispatches.map((d: any) => ({ ...d, sources: sourcesByLot.get(d.id) ?? [] }))
  }, [dispatches, sources])

  // ─── Application des filtres globaux ───
  // Filtres : date_from, date_to, farm, greenhouse, variety
  const matchesFilters = useCallback((row: any, opts: { dateField?: string } = {}) => {
    const dateField = opts.dateField ?? 'harvest_date'
    const dateValue = row[dateField]
    if (filterDateFrom && dateValue && dateValue < filterDateFrom) return false
    if (filterDateTo && dateValue && dateValue > filterDateTo) return false

    // Variety : direct sur row ou via campaign_plantings
    const varietyId = row.variety_id ?? row.campaign_plantings?.variety_id ?? null
    if (filterVarietyId && varietyId !== filterVarietyId) return false

    // Greenhouse : direct ou via campaign_plantings
    const ghId = row.greenhouse_id ?? row.campaign_plantings?.greenhouse_id ?? null
    if (filterGreenhouseId && ghId !== filterGreenhouseId) return false

    // Farm : via greenhouses → farm_id (peut être direct sur dispatches.greenhouses ou via plantings.greenhouses)
    const farmId = row.greenhouses?.farm_id
      ?? row.campaign_plantings?.greenhouses?.farm_id
      ?? null
    if (filterFarmId && farmId !== filterFarmId) return false

    return true
  }, [filterDateFrom, filterDateTo, filterFarmId, filterGreenhouseId, filterVarietyId])

  // Versions filtrees
  const harvestsFiltered = useMemo(() => harvestsEnriched.filter(h => matchesFilters(h)), [harvestsEnriched, matchesFilters])
  const dispatchesFiltered = useMemo(() => dispatchesEnriched.filter(d => matchesFilters(d)), [dispatchesEnriched, matchesFilters])

  // Tri (applique uniquement a la liste principale)
  const harvestsSorted = useMemo(() => {
    const arr = [...harvestsFiltered]
    arr.sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'lot_number':  va = a.lot_number ?? ''; vb = b.lot_number ?? ''; break
        case 'harvest_date': va = a.harvest_date ?? ''; vb = b.harvest_date ?? ''; break
        case 'greenhouse':  va = a.campaign_plantings?.greenhouses?.code ?? ''; vb = b.campaign_plantings?.greenhouses?.code ?? ''; break
        case 'variety':     va = a.campaign_plantings?.varieties?.code ?? ''; vb = b.campaign_plantings?.varieties?.code ?? ''; break
        case 'total_qty':   va = Number(a.total_qty || 0); vb = Number(b.total_qty || 0); break
        case 'used_kg':     va = Number(a.used_kg || 0); vb = Number(b.used_kg || 0); break
        case 'remaining_kg': va = Number(a.remaining_kg || 0); vb = Number(b.remaining_kg || 0); break
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const cmp = String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [harvestsFiltered, sortKey, sortDir])

  // Filtres par tab (utilisent les versions filtrees)
  const aEnvoyer = useMemo(() => harvestsFiltered.filter(h => h.remaining_kg > 0.01), [harvestsFiltered])
  // À peser : envoi avec estimation (tray-based), pas encore pesé par la station
  const aPeser = useMemo(() => dispatchesFiltered.filter(d =>
    (d.tri_status ?? 'pending') === 'pending' && d.estimated_kg != null && d.weighed_kg == null
  ), [dispatchesFiltered])
  // À trier : envoi pesé OU envoi legacy sans estimation (pesée non requise)
  const aTrier = useMemo(() => dispatchesFiltered.filter(d =>
    (d.tri_status ?? 'pending') === 'pending' && (d.weighed_kg != null || d.estimated_kg == null)
  ), [dispatchesFiltered])
  const aTarifer = useMemo(() => dispatchesFiltered.filter(d => d.tri_status === 'tried'), [dispatchesFiltered])
  const confirmes = useMemo(() => dispatchesFiltered.filter(d => d.tri_status === 'priced'), [dispatchesFiltered])
  const alertesActives = useMemo(() => alertes.filter(a => !a.is_resolved), [alertes])

  // ─── CA réalisé : attribution par lot + par récolteur (prorata des contributions) ───
  const caData = useMemo(() => {
    const harvestById = new Map(harvests.map((h: any) => [h.id, h]))
    let totalCA = 0, myCA = 0
    const rows = confirmes.map((d: any) => {
      const ca = Number(d.ca_amount || 0)
      totalCA += ca
      const shares = new Map<string, { name: string; amount: number }>()
      const srcs = d.sources ?? []
      if (srcs.length > 0) {
        const tot = srcs.reduce((s: number, x: any) => s + Number(x.qty_contributed_kg || 0), 0) || 1
        for (const s of srcs) {
          const rid = s.harvests?.recorded_by ?? 'unknown'
          const name = s.harvests?.recorded_by_name ?? '— non attribué'
          const amt = ca * (Number(s.qty_contributed_kg || 0) / tot)
          const cur = shares.get(rid) ?? { name, amount: 0 }
          cur.amount += amt; shares.set(rid, cur)
        }
      } else if (d.harvest_id) {
        const h = harvestById.get(d.harvest_id)
        shares.set(h?.recorded_by ?? 'unknown', { name: h?.recorded_by_name ?? '— non attribué', amount: ca })
      } else {
        shares.set('unknown', { name: '— non attribué', amount: ca })
      }
      const mine = myId ? (shares.get(myId)?.amount ?? 0) : 0
      myCA += mine
      return {
        id: d.id, lot: d.lot_number, date: d.harvest_date,
        variety: d.varieties?.code ?? d.varieties?.commercial_name ?? '—',
        market: d.markets?.name ?? '—',
        qty: Number(d.qty_acceptee_kg || 0),
        price: Number(d.price_per_kg || 0),
        ca,
        contributors: Array.from(shares.values()).map(s => s.name).filter((v, i, a) => a.indexOf(v) === i),
        mine,
      }
    })
    return { rows, totalCA, myCA }
  }, [confirmes, harvests, myId])

  // Liste de fermes / greenhouses / varietes pour les dropdowns
  const farmsForFilter = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of plantings) {
      const fid = p.greenhouses?.farm_id
      const fname = p.greenhouses?.farms?.name
      if (fid && fname) set.set(fid, fname)
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [plantings])

  const greenhousesForFilter = useMemo(() => {
    const set = new Map<string, { name: string; farm_id?: string }>()
    for (const p of plantings) {
      if (p.greenhouse_id && p.greenhouses?.code) {
        if (filterFarmId && p.greenhouses?.farm_id !== filterFarmId) continue
        set.set(p.greenhouse_id, { name: `${p.greenhouses.code} — ${p.greenhouses.name ?? ''}`, farm_id: p.greenhouses.farm_id })
      }
    }
    return Array.from(set.entries()).map(([id, v]) => ({ id, name: v.name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [plantings, filterFarmId])

  const varietiesForFilter = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of plantings) {
      if (p.variety_id && p.varieties?.code) {
        set.set(p.variety_id, `${p.varieties.code} — ${p.varieties.commercial_name ?? ''}`)
      }
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [plantings])

  const hasActiveFilter = !!(filterDateFrom || filterDateTo || filterFarmId || filterGreenhouseId || filterVarietyId)
  const resetFilters = () => {
    setFilterDateFrom(''); setFilterDateTo(''); setFilterFarmId(''); setFilterGreenhouseId(''); setFilterVarietyId('')
  }

  // ─── Dispo à tarifer par Marché × Variété × Ferme ───
  // Pour chaque dispatch trié non encore tarifé OU partiellement tarifé :
  //   remaining = qty_acceptee_kg - qty_priced_kg
  // Affiché regroupé sous l'onglet "À tarifer" pour visualiser ce qu'il reste
  // à mettre dans un bordereau station.
  type UnpricedRow = {
    key: string
    market_id: string
    market_name: string
    variety_id: string
    variety_code: string
    variety_name: string
    farm_id: string | null
    farm_name: string | null
    remaining_kg: number
    partial_kg: number     // qty deja partiellement tarifee (qty_priced_kg > 0)
    accepted_kg: number    // qty_acceptee_kg total
    lots_count: number
    partial_lots: number   // lots avec qty_priced_kg > 0 et < qty_acceptee_kg
  }
  const unpricedByMarketVariety: UnpricedRow[] = useMemo(() => {
    const buckets = new Map<string, UnpricedRow>()
    for (const d of dispatchesEnriched) {
      // Seuls les dispatches 'tried' (triés, sans prix final) sont eligibles pour un bordereau station.
      // Les dispatches 'priced' sont deja tarifés (legacy ou fully bordereau-priced) → exclus.
      // Les dispatches 'pending' (pas encore triés) ne peuvent pas être tarifés.
      if (d.tri_status !== 'tried') continue

      const accepted = Number(d.qty_acceptee_kg ?? 0)
      const priced = Number(d.qty_priced_kg ?? 0)
      const remaining = accepted - priced
      if (remaining <= 0.01) continue

      const farmId: string | null = d.greenhouses?.farm_id ?? null
      const farmName: string | null = d.greenhouses?.farms?.name ?? null
      const key = `${d.market_id ?? 'null'}::${d.variety_id ?? 'null'}::${farmId ?? 'null'}`

      const existing = buckets.get(key)
      if (existing) {
        existing.remaining_kg += remaining
        existing.accepted_kg += accepted
        existing.partial_kg += priced
        existing.lots_count += 1
        if (priced > 0) existing.partial_lots += 1
      } else {
        buckets.set(key, {
          key,
          market_id: d.market_id ?? '',
          market_name: d.markets?.name ?? '(marché ?)',
          variety_id: d.variety_id ?? '',
          variety_code: d.varieties?.code ?? '',
          variety_name: d.varieties?.commercial_name ?? '(variété ?)',
          farm_id: farmId,
          farm_name: farmName,
          remaining_kg: remaining,
          partial_kg: priced,
          accepted_kg: accepted,
          lots_count: 1,
          partial_lots: priced > 0 ? 1 : 0,
        })
      }
    }
    return Array.from(buckets.values()).sort((a, b) => {
      const c1 = a.market_name.localeCompare(b.market_name)
      if (c1 !== 0) return c1
      const c2 = a.variety_name.localeCompare(b.variety_name)
      if (c2 !== 0) return c2
      return (a.farm_name ?? '').localeCompare(b.farm_name ?? '')
    })
  }, [dispatchesEnriched])

  // KPIs globaux
  const kpis = useMemo(() => {
    const totalKg = harvests.reduce((s, h) => s + Number(h.total_qty || 0), 0)
    const ca = confirmes.reduce((s, d) => s + Number(d.ca_amount || 0), 0)
    return {
      lots: harvests.length,
      kg: totalKg,
      a_envoyer_kg: aEnvoyer.reduce((s, h) => s + h.remaining_kg, 0),
      a_trier_n: aTrier.length,
      a_tarifer_n: aTarifer.length,
      confirmes_n: confirmes.length,
      ca,
    }
  }, [harvests, confirmes, aEnvoyer, aTrier, aTarifer])

  // Fenêtre de récolte d'une plantation : bornes plantation sinon campagne
  const harvestWindowOf = useCallback((plantingId: string): { start: string | null; end: string | null } => {
    const p = plantings.find((x: any) => x.id === plantingId)
    if (!p) return { start: null, end: null }
    return {
      start: p.first_harvest_date ?? p.campaigns?.harvest_start ?? null,
      end: p.last_harvest_date ?? p.campaigns?.harvest_end ?? null,
    }
  }, [plantings])

  // ─── CRUD récolte (saisie en plateaux → poids estimé) ───
  const saveNew = async () => {
    // Lignes de plateaux valides — OBLIGATOIRE (la récolte se saisit en plateaux)
    const validLines = formNew.trayLines.filter(l => l.tray_type_code && Number(l.nb) > 0)
    if (!formNew.campaign_planting_id || !formNew.harvest_date) return
    if (validLines.length === 0) { setError('Ajoute au moins un plateau (type + nombre) — la récolte se saisit obligatoirement en plateaux.'); return }
    // Garde-fou plage de récolte (miroir du trigger DB, pour un message immédiat)
    const win = harvestWindowOf(formNew.campaign_planting_id)
    if (win.start && formNew.harvest_date < win.start) {
      setError(`Date hors plage : la récolte commence le ${win.start}.`); return
    }
    if (win.end && formNew.harvest_date > win.end) {
      setError(`Date hors plage : la récolte se termine le ${win.end}.`); return
    }
    setSaving(true); setError('')
    try {
      const estimated = estimateLines(validLines)
      const lot = `LOT-${formNew.harvest_date.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
      // 1. Récolte — estimated_kg est la source de vérité ; on miroir dans
      //    qty_category_1 (bridge) pour que total_qty/dashboards restent cohérents
      //    tant que la pesée station (Lot 2) ne prend pas le relais.
      const { data: created, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formNew.campaign_planting_id,
        harvest_date: formNew.harvest_date,
        estimated_kg: estimated,
        qty_category_1: estimated,
        qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
        lot_number: lot,
        notes: formNew.notes || null,
        recorded_by: myId,
        recorded_by_name: myName,
      }).select('id').single()
      if (error) throw error
      // 2. Lignes de plateaux (snapshot du libellé + poids théorique)
      const lineRows = validLines.map(l => {
        const t = trayTypes.find(x => x.code === l.tray_type_code)
        return {
          harvest_id: created!.id,
          tray_type_code: l.tray_type_code,
          tray_type_label: t?.label ?? l.tray_type_code,
          nb_trays: Number(l.nb),
          poids_unitaire_kg: trayWeightByCode.get(l.tray_type_code) ?? 0,
        }
      })
      const { error: linesErr } = await supabase.from('harvest_tray_lines').insert(lineRows)
      if (linesErr) throw linesErr
      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormNew({ campaign_planting_id: '', harvest_date: '', notes: '', trayLines: [emptyTrayLine()] })
        load()
      }, 1000)
    } catch (e: any) { setError(e.message || String(e)) }
    setSaving(false)
  }

  const openEdit = (h: any) => {
    setFormEdit({ campaign_planting_id: h.campaign_planting_id, harvest_date: h.harvest_date, total_qty: String(h.total_qty || ''), notes: h.notes || '' })
    setModalEdit(h); setDone(false); setError('')
  }
  const saveEdit = async () => {
    if (!modalEdit) return
    setSaving(true); setError('')
    try {
      // Correction directe du poids estimé (sans repasser par les plateaux).
      // On synchronise estimated_kg et le miroir qty_category_1.
      const qty = Number(formEdit.total_qty) || 0
      const { error } = await supabase.from('harvests').update({
        campaign_planting_id: formEdit.campaign_planting_id,
        harvest_date: formEdit.harvest_date,
        estimated_kg: qty,
        qty_category_1: qty,
        qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
        notes: formEdit.notes || null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1000)
    } catch (e: any) { setError(e.message || String(e)) }
    setSaving(false)
  }

  const deleteRecolte = async (h: any) => {
    if (!confirm(`Supprimer la récolte ${h.lot_number} ? Tous les envois associés seront aussi supprimés.`)) return
    try {
      await supabase.from('harvest_lot_sources').delete().eq('harvest_id', h.id)
      await supabase.from('harvest_lots').delete().eq('harvest_id', h.id)
      await supabase.from('harvests').delete().eq('id', h.id)
      load()
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  // ─── Suppression en masse (via RPC pour bypasser RLS) ───
  const bulkDeleteRecoltes = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`Supprimer ${ids.length} récolte(s) ? Les envois associés (si applicable) seront aussi supprimés. Cette action est irréversible.`)) return
    try {
      const { data, error } = await supabase.rpc('admin_bulk_delete_harvests', { p_harvest_ids: ids })
      if (error) {
        const msg = (error.message ?? '').toLowerCase()
        if (msg.includes('could not find the function') || msg.includes('does not exist') || error.code === 'PGRST202') {
          alert('⚠️ La RPC admin_bulk_delete_harvests n\'existe pas en DB.\n\nApplique la migration 039_admin_bulk_delete_harvests.sql via le SQL Editor de Supabase.')
        } else {
          alert('Erreur : ' + error.message)
        }
        console.error('[bulkDelete] RPC error:', error)
        return
      }
      const result = data as any
      console.log('[bulkDelete] result:', result)
      alert(`✅ ${result?.message ?? `${ids.length} récolte(s) supprimée(s)`}`)
      load()
    } catch (e: any) {
      console.error('[bulkDelete] catch:', e)
      alert('Erreur : ' + (e?.message ?? 'inconnue'))
    }
  }

  // ─── Alerte journée sans récolte ───
  const saveAlerte = async () => {
    if (!formAlerte.date) return
    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('alerts').insert({
        type: 'no_harvest', severity: 'warning',
        title: `Journée sans récolte — ${formAlerte.date}`,
        message: `Motif: ${formAlerte.reason}${formAlerte.notes ? ' — ' + formAlerte.notes : ''}`,
        entity_type: 'harvest', is_read: false, is_resolved: false,
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalAlerte(false); setDone(false); setFormAlerte({ date: '', reason: 'panne_irrigation', notes: '' }); load() }, 1000)
    } catch (e: any) { setError(e.message || String(e)) }
    setSaving(false)
  }
  const resolveAlerte = async (id: string) => {
    await supabase.from('alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  // ─── Render ───
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500 }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>🌿 Récoltes</h1>
            {realtimeOk && (
              <span title="Mises à jour temps réel actives" key={realtimeNudge}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px', borderRadius: 12,
                  background: 'var(--neon-dim)', color: 'var(--neon)',
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  letterSpacing: 1, animation: realtimeNudge ? 'pulse 0.6s ease-out' : undefined,
                }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                LIVE
              </span>
            )}
          </div>
          <style>{`@keyframes pulse{0%{opacity:.4;transform:scale(.95)}50%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}`}</style>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
            <strong>{kpis.lots}</strong> lot(s) · <strong>{(kpis.kg / 1000).toFixed(1)} t</strong> récoltées
            {kpis.ca > 0 && <> · CA confirmé <strong style={{ color: 'var(--neon)' }}>{fmt(kpis.ca)} MAD</strong></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={manualRefresh} title={`Dernier refresh : ${lastRefresh.toLocaleTimeString('fr-FR')}`} className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }}>
            ↻ Rafraîchir
          </button>
          <Link
            href="#" onClick={(e) => { e.preventDefault(); setTab('bordereaux') }}
            className="btn-ghost"
            style={{
              fontSize: 11, padding: '6px 10px',
              color: '#8b5cf6',
              borderColor: 'color-mix(in srgb,#8b5cf6 30%,transparent)',
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="Saisir le bordereau hebdomadaire de la station"
          >
            🚚 BORDEREAUX STATION
          </Link>
          <button onClick={() => setModalAlerte(true)} className="btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'color-mix(in srgb,var(--red) 25%,transparent)' }}>
            ⚠ SANS RÉCOLTE
          </button>
          {tab === 'a_envoyer' ? (
            <button onClick={() => setModalCompose(true)} disabled={aEnvoyer.length === 0} className="btn-primary" style={{ fontSize: 11.5 }}>
              📦 COMPOSER UN ENVOI
            </button>
          ) : (
            <button onClick={() => setModalNew(true)} className="btn-primary" style={{ fontSize: 11.5 }}>
              + SAISIR RÉCOLTE
            </button>
          )}
        </div>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 14 }}>
        <KPI icon="🌿" label="Récoltes" value={kpis.lots} sub={`${(kpis.kg / 1000).toFixed(1)} t total`} color="#10b981" />
        <KPI icon="🚚" label="À envoyer" value={fmt(kpis.a_envoyer_kg) + ' kg'} sub={`${aEnvoyer.length} récolte(s)`} color="#22c55e" />
        <KPI icon="📦" label="À trier" value={kpis.a_trier_n} sub="envois pending" color="#f59e0b" />
        <KPI icon="🔬" label="À tarifer" value={kpis.a_tarifer_n} sub="envois triés" color="#3b82f6" />
        <KPI icon="✓" label="Confirmés" value={kpis.confirmes_n} sub="prix saisi" color="#0ea5e9" />
        <KPI icon="💰" label="CA" value={fmt(kpis.ca) + ' MAD'} sub="encaissé" color="#a855f7" />
      </div>

      {/* Barre de filtres globaux (hors bordereaux) */}
      {tab !== 'bordereaux' && (
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: hasActiveFilter ? 'color-mix(in srgb, #3b82f6 6%, transparent)' : 'var(--bg-2)',
          border: '1px solid ' + (hasActiveFilter ? 'color-mix(in srgb, #3b82f6 40%, transparent)' : 'var(--bd-1)'),
          borderRadius: 8,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: 1 }}>
            🔍 Filtres
          </span>

          {/* Date du */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-sub)' }}>Du</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--bd-1)', borderRadius: 4, background: 'var(--bg-1)', color: 'var(--text-main)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-sub)' }}>Au</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--bd-1)', borderRadius: 4, background: 'var(--bg-1)', color: 'var(--text-main)' }} />
          </div>

          {/* Ferme */}
          <select value={filterFarmId} onChange={e => { setFilterFarmId(e.target.value); setFilterGreenhouseId('') }}
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--bd-1)', borderRadius: 4, background: 'var(--bg-1)', color: 'var(--text-main)', minWidth: 140 }}>
            <option value="">Toutes fermes</option>
            {farmsForFilter.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {/* Serre */}
          <select value={filterGreenhouseId} onChange={e => setFilterGreenhouseId(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--bd-1)', borderRadius: 4, background: 'var(--bg-1)', color: 'var(--text-main)', minWidth: 180 }}>
            <option value="">Toutes serres</option>
            {greenhousesForFilter.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {/* Variété */}
          <select value={filterVarietyId} onChange={e => setFilterVarietyId(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--bd-1)', borderRadius: 4, background: 'var(--bg-1)', color: 'var(--text-main)', minWidth: 180 }}>
            <option value="">Toutes variétés</option>
            {varietiesForFilter.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>

          {/* Reset */}
          {hasActiveFilter && (
            <button onClick={resetFilters} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#3b82f6', marginLeft: 'auto' }}>
              ✕ Réinitialiser
            </button>
          )}

          {/* Compteur */}
          {hasActiveFilter && (
            <span style={{ fontSize: 11, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>
              {harvestsFiltered.length} récolte(s) · {dispatchesFiltered.length} dispatch(es)
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--bd-1)', marginBottom: 14, overflowX: 'auto' }}>
        {([
          ['liste', '📋 Récoltes', kpis.lots],
          ['a_envoyer', '🚚 À envoyer', aEnvoyer.length],
          ['a_peser', '⚖️ À peser', aPeser.length],
          ['a_trier', '📦 À trier', aTrier.length],
          ['a_tarifer', '🔬 À tarifer', aTarifer.length],
          ['confirmes', '✅ Confirmés', confirmes.length],
          ['ca', '💰 CA réalisé', caData.rows.length],
          ['bordereaux', '📑 Bordereaux station', settlementCount],
          ['stock_retour', '🔄 Stock retour', stockRetour.length],
          ['alertes', '⚠ Alertes', alertesActives.length],
        ] as [Tab, string, number][]).map(([k, l, c]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: '8px 14px', border: 'none',
              background: tab === k ? 'var(--bg-2)' : 'transparent',
              color: tab === k ? 'var(--text-main)' : 'var(--text-sub)',
              borderBottom: tab === k ? '2px solid var(--neon)' : '2px solid transparent',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap',
            }}>
            {l} <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 9, background: 'var(--bg-2)', color: 'var(--text-sub)', fontSize: 10.5 }}>{c}</span>
          </button>
        ))}
      </div>

      {/* Tab contents */}
      {tab === 'liste' && <ListeTab
        harvests={harvestsSorted}
        sortKey={sortKey} sortDir={sortDir}
        onSort={(k) => {
          if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
          else { setSortKey(k); setSortDir('asc') }
        }}
        onEdit={openEdit} onDelete={deleteRecolte} onBulkDelete={bulkDeleteRecoltes} loading={loading} />}
      {tab === 'a_envoyer' && <AEnvoyerTab harvests={aEnvoyer} onBulkDelete={bulkDeleteRecoltes} loading={loading} />}
      {tab === 'a_peser' && <APeserTab dispatches={aPeser} onPick={d => setModalPesee(d)} loading={loading} />}
      {tab === 'a_trier' && <ATrierTab dispatches={aTrier} onPick={d => setModalTri(d)} loading={loading} />}
      {tab === 'a_tarifer' && <ATariferTab dispatches={aTarifer} summary={unpricedByMarketVariety} onPick={d => setModalPrice(d)} onOpenPeriod={() => setModalPeriodPrice(true)} onGotoBordereaux={() => setTab('bordereaux')} loading={loading} />}
      {tab === 'confirmes' && <ConfirmesTab dispatches={confirmes} loading={loading} />}
      {tab === 'ca' && <CaTab data={caData} myName={myName} myId={myId} loading={loading} />}
      {tab === 'bordereaux' && <BordereauxSection />}
      {tab === 'stock_retour' && <StockRetourTab lots={stockRetour} onReload={load} loading={loading} />}
      {tab === 'alertes' && <AlertesTab alertes={alertesActives} onResolve={resolveAlerte} loading={loading} />}

      {/* Modals */}
      {modalNew && (
        <NewHarvestModal
          form={formNew} setForm={setFormNew} plantings={plantings} trayTypes={trayTypes}
          estimate={estimateLines(formNew.trayLines)} emptyTrayLine={emptyTrayLine}
          window={harvestWindowOf(formNew.campaign_planting_id)}
          saving={saving} done={done} error={error}
          onClose={() => { setModalNew(false); setDone(false); setError('') }} onSave={saveNew}
        />
      )}
      {modalEdit && (
        <EditHarvestModal
          harvest={modalEdit} form={formEdit} setForm={setFormEdit} plantings={plantings}
          saving={saving} done={done} error={error}
          onClose={() => { setModalEdit(null); setDone(false); setError('') }} onSave={saveEdit}
        />
      )}
      {modalCompose && (
        <ComposeModal
          harvests={aEnvoyer} markets={markets}
          onClose={() => setModalCompose(false)}
          onDone={() => { setModalCompose(false); load() }}
        />
      )}
      {modalPesee && (
        <PeseeModal dispatch={modalPesee} sources={sources} onClose={() => setModalPesee(null)} onDone={() => { setModalPesee(null); load() }} />
      )}
      {modalTri && (
        <TriModal dispatch={modalTri} onClose={() => setModalTri(null)} onDone={() => { setModalTri(null); load() }} />
      )}
      {modalPrice && (
        <PriceModal dispatch={modalPrice} onClose={() => setModalPrice(null)} onDone={() => { setModalPrice(null); load() }} />
      )}
      {modalPeriodPrice && (
        <PeriodPriceModal
          dispatches={aTarifer}
          onClose={() => setModalPeriodPrice(false)}
          onDone={() => { setModalPeriodPrice(false); load() }}
        />
      )}
      {modalAlerte && (
        <AlerteModal
          form={formAlerte} setForm={setFormAlerte} saving={saving} done={done} error={error}
          onClose={() => { setModalAlerte(false); setDone(false); setError('') }} onSave={saveAlerte}
        />
      )}
    </div>
  )
}

// ============================================================
// TABS
// ============================================================

type SortKey = 'lot_number' | 'harvest_date' | 'greenhouse' | 'variety' | 'total_qty' | 'used_kg' | 'remaining_kg'

function ListeTab({ harvests, sortKey, sortDir, onSort, onEdit, onDelete, onBulkDelete, loading }: {
  harvests: any[]; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
  onEdit: (h: any) => void; onDelete: (h: any) => void; onBulkDelete: (ids: string[]) => void; loading: boolean
}) {
  // Helper : cellule header cliquable avec indicateur de tri
  const sortHeader = (label: string, key: SortKey) => {
    const isActive = sortKey === key
    return (
      <span
        onClick={() => onSort(key)}
        style={{ cursor: 'pointer', userSelect: 'none', color: isActive ? 'var(--neon)' : undefined, fontWeight: isActive ? 700 : undefined }}
        title="Cliquer pour trier"
      >
        {label} {isActive ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
      </span>
    )
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allSelected = harvests.length > 0 && harvests.every(h => selected.has(h.id))
  const someSelected = selected.size > 0

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(harvests.map(h => h.id)))
  }

  return (
    <div>
      {/* Barre d'action sticky */}
      {someSelected && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          marginBottom: 10, padding: '10px 14px',
          background: 'color-mix(in srgb, var(--red) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 40%, transparent)',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-main)', fontWeight: 600 }}>
            ☑️ {selected.size} récolte(s) sélectionnée(s)
          </span>
          <button
            onClick={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()) }}
            style={{
              padding: '6px 14px', borderRadius: 6,
              background: 'var(--red)', color: 'white', border: 'none',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            🗑️ Supprimer la sélection
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '6px 14px', borderRadius: 6,
              background: 'transparent', color: 'var(--text-sub)',
              border: '1px solid var(--bd-1)', fontSize: 12, cursor: 'pointer',
            }}>
            Désélectionner
          </button>
        </div>
      )}

      <Table
        headers={[
          <input key="sa" type="checkbox" checked={allSelected} onChange={toggleAll}
            style={{ cursor: 'pointer', width: 16, height: 16 }} title="Tout sélectionner" />,
          sortHeader('Lot', 'lot_number'),
          sortHeader('Date', 'harvest_date'),
          <span key="gv">{sortHeader('Serre', 'greenhouse')} / {sortHeader('Variété', 'variety')}</span>,
          sortHeader('Total', 'total_qty'),
          sortHeader('Engagé', 'used_kg'),
          sortHeader('Restant', 'remaining_kg'),
          'Actions',
        ]}
        loading={loading}
        empty="Aucune récolte. Cliquer + Saisir récolte."
        rows={harvests}>
        {(h: any) => (
          <tr key={h.id} style={{
            borderBottom: '1px solid var(--bd-1)',
            background: selected.has(h.id) ? 'color-mix(in srgb, var(--red) 5%, transparent)' : undefined,
          }}>
            <td style={{ ...td, width: 36, textAlign: 'center' }}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}
                style={{ cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--red)' }} />
            </td>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{h.lot_number}</td>
            <td style={td}>{h.harvest_date}</td>
            <td style={td}>{h.campaign_plantings?.greenhouses?.code} / {h.campaign_plantings?.varieties?.code}</td>
            <td style={tdNum}>{fmt(h.total_qty)}</td>
            <td style={{ ...tdNum, color: 'var(--text-sub)' }}>{fmt(h.used_kg)}</td>
            <td style={{ ...tdNum, color: h.remaining_kg > 0 ? 'var(--neon)' : 'var(--text-muted)', fontWeight: h.remaining_kg > 0 ? 700 : 400 }}>
              {fmt(h.remaining_kg)}
            </td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>
              <button onClick={() => onEdit(h)} className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 8px', marginRight: 4 }}>Éditer</button>
              <button onClick={() => onDelete(h)} className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 8px', color: 'var(--red)' }}>Supprimer</button>
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function AEnvoyerTab({ harvests, onBulkDelete, loading }: { harvests: any[]; onBulkDelete: (ids: string[]) => void; loading: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allSelected = harvests.length > 0 && harvests.every(h => selected.has(h.id))
  const someSelected = selected.size > 0

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(harvests.map(h => h.id)))
  }

  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Récoltes ayant encore une quantité <strong>disponible</strong> à inclure dans un envoi station.
        Cliquer sur <strong>📦 COMPOSER UN ENVOI</strong> en haut pour créer un envoi multi-récoltes.
      </div>

      {/* Barre d'action sticky quand des lignes sont sélectionnées */}
      {someSelected && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          marginBottom: 10, padding: '10px 14px',
          background: 'color-mix(in srgb, var(--red) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 40%, transparent)',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-main)', fontWeight: 600 }}>
            ☑️ {selected.size} récolte(s) sélectionnée(s)
          </span>
          <button
            onClick={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()) }}
            style={{
              padding: '6px 14px', borderRadius: 6,
              background: 'var(--red)', color: 'white', border: 'none',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            🗑️ Supprimer la sélection
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '6px 14px', borderRadius: 6,
              background: 'transparent', color: 'var(--text-sub)',
              border: '1px solid var(--bd-1)', fontSize: 12, cursor: 'pointer',
            }}>
            Désélectionner
          </button>
        </div>
      )}

      <Table
        headers={[
          <input key="sa" type="checkbox" checked={allSelected} onChange={toggleAll}
            style={{ cursor: 'pointer', width: 18, height: 18 }} title="Tout sélectionner" />,
          'Lot récolte', 'Date', 'Serre / Variété', 'Total', 'Engagé', 'Disponible',
        ]}
        loading={loading}
        empty="Toutes les récoltes sont engagées dans un envoi ✓"
        rows={harvests}>
        {(h: any) => (
          <tr key={h.id} style={{
            borderBottom: '1px solid var(--bd-1)',
            background: selected.has(h.id) ? 'color-mix(in srgb, var(--red) 5%, transparent)' : undefined,
          }}>
            <td style={{ ...td, width: 36, textAlign: 'center' }}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}
                style={{ cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--red)' }} />
            </td>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{h.lot_number}</td>
            <td style={td}>{h.harvest_date}</td>
            <td style={td}>{h.campaign_plantings?.greenhouses?.code} / {h.campaign_plantings?.varieties?.code}</td>
            <td style={tdNum}>{fmt(h.total_qty)}</td>
            <td style={{ ...tdNum, color: 'var(--text-sub)' }}>{fmt(h.used_kg)}</td>
            <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{fmt(h.remaining_kg)}</td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function APeserTab({ dispatches, onPick, loading }: { dispatches: any[]; onPick: (d: any) => void; loading: boolean }) {
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Envois partis à la station avec un poids <strong>estimé</strong> (plateaux). Saisis le <strong>tonnage réel</strong> pesé par la station — il sera réparti au prorata sur les récoltes.
      </div>
      <Table headers={['Lot dispatch', 'Date', 'Marché', 'Variété', 'Récoltes incluses', 'Estimé (kg)', 'Action']} loading={loading} empty="Aucun envoi en attente de pesée ✓" rows={dispatches}>
        {(d: any) => (
          <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.lot_number}</td>
            <td style={td}>{d.harvest_date}</td>
            <td style={td}>{d.markets?.name ?? '—'}</td>
            <td style={{ ...td, fontSize: 11.5 }}>
              {d.varieties?.code
                ? <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600 }}>{d.varieties.code}</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={{ ...td, fontSize: 11, color: 'var(--text-sub)' }}>
              {(d.sources?.length ?? 0) > 0
                ? d.sources.map((s: any) => `${s.harvests?.lot_number ?? '?'} (${fmt(s.qty_contributed_kg)})`).join(', ')
                : <em>simple</em>}
            </td>
            <td style={tdNum}>{fmt(d.estimated_kg ?? d.quantity_kg)}</td>
            <td style={td}>
              <button onClick={() => onPick(d)} className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>⚖️ Saisir tonnage</button>
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function PeseeModal({ dispatch, sources, onClose, onDone }: { dispatch: any; sources: any[]; onClose: () => void; onDone: () => void }) {
  const lines = useMemo(() => sources.filter((s: any) => s.harvest_lot_id === dispatch.id), [sources, dispatch.id])
  const totalEst = useMemo(() => lines.reduce((s: number, l: any) => s + Number(l.qty_contributed_kg || 0), 0)
    || Number(dispatch.estimated_kg ?? dispatch.quantity_kg ?? 0), [lines, dispatch])
  const [realKg, setRealKg] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const real = Number(realKg.replace(',', '.')) || 0
  const ecart = real > 0 ? real - totalEst : 0
  const ecartPct = totalEst > 0 && real > 0 ? (ecart / totalEst) * 100 : 0

  const save = async () => {
    if (real <= 0) { setErr('Saisis le tonnage réel (> 0).'); return }
    setSaving(true); setErr('')
    try {
      const { error } = await supabase.rpc('admin_weigh_station_dispatch', { p_dispatch_id: dispatch.id, p_real_kg: real })
      if (error) throw error
      onDone()
    } catch (e: any) { setErr(e.message || String(e)); setSaving(false) }
  }

  return (
    <Modal title={`⚖️ Pesée station — ${dispatch.lot_number}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--text-sub)', marginBottom: 10 }}>
        Le tonnage réel sera réparti au <strong>prorata de l'estimation</strong> sur chaque récolte de l'envoi.
      </div>

      {/* Estimation + saisie */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#b45309' }}>Poids estimé (plateaux)</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: '#b45309' }}>{fmt(totalEst)} kg</span>
      </div>

      <FormGroup label="Tonnage réel pesé par la station (kg) *">
        <Input type="number" value={realKg} onChange={(e: any) => setRealKg(e.target.value)} placeholder={String(Math.round(totalEst))} autoFocus />
      </FormGroup>

      {real > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: ecart < 0 ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)', border: `1px solid ${ecart < 0 ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.3)'}`, borderRadius: 6, padding: '6px 12px', marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-sub)' }}>Écart estimation → réel</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: ecart < 0 ? '#dc2626' : '#16a34a' }}>
            {ecart >= 0 ? '+' : ''}{fmt2(ecart)} kg ({ecartPct >= 0 ? '+' : ''}{ecartPct.toFixed(1)}%)
          </span>
        </div>
      )}

      {/* Aperçu répartition */}
      {lines.length > 0 && real > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .4 }}>Répartition prorata</div>
          <div style={{ border: '1px solid var(--bd-1)', borderRadius: 6, overflow: 'hidden' }}>
            {lines.map((l: any, i: number) => {
              const part = totalEst > 0 ? real * (Number(l.qty_contributed_kg) / totalEst) : 0
              return (
                <div key={l.harvest_id ?? i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', fontSize: 12, borderTop: i ? '1px solid var(--bd-1)' : 'none' }}>
                  <span style={{ color: 'var(--text-sub)' }}>{l.harvests?.lot_number ?? l.harvest_id?.slice(0, 8)} <span style={{ color: 'var(--text-muted)' }}>(est. {fmt(l.qty_contributed_kg)})</span></span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt2(part)} kg</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {err && <ErrorBox msg={err} />}
      <ModalFooter onCancel={onClose} onSave={save} loading={saving} saveLabel="VALIDER LA PESÉE" disabled={real <= 0} />
    </Modal>
  )
}

function ATrierTab({ dispatches, onPick, loading }: { dispatches: any[]; onPick: (d: any) => void; loading: boolean }) {
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Envois envoyés à la station, en attente de saisie du <strong>tri (freinte + écart)</strong>.
      </div>
      <Table headers={['Lot dispatch', 'Date', 'Marché', 'Variété', 'Récoltes incluses', 'Brute (kg)', 'Action']} loading={loading} empty="Aucun envoi en attente de tri ✓" rows={dispatches}>
        {(d: any) => (
          <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.lot_number}</td>
            <td style={td}>{d.harvest_date}</td>
            <td style={td}>{d.markets?.name ?? '—'}</td>
            <td style={{ ...td, fontSize: 11.5 }}>
              {d.varieties?.code
                ? <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600 }}>{d.varieties.code}</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={{ ...td, fontSize: 11, color: 'var(--text-sub)' }}>
              {(d.sources?.length ?? 0) > 0
                ? d.sources.map((s: any) => `${s.harvests?.lot_number ?? '?'} (${fmt(s.qty_contributed_kg)})`).join(', ')
                : <em>simple</em>}
            </td>
            <td style={tdNum}>{fmt(d.quantity_kg)}</td>
            <td style={td}>
              <button onClick={() => onPick(d)} className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>🔬 Saisir tri</button>
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function ATariferTab({ dispatches, summary, onPick, onOpenPeriod, onGotoBordereaux, loading }: { dispatches: any[]; summary: any[]; onPick: (d: any) => void; onOpenPeriod: () => void; onGotoBordereaux: () => void; loading: boolean }) {
  const summaryTotals = useMemo(() => ({
    remaining: summary.reduce((s, r) => s + r.remaining_kg, 0),
    accepted: summary.reduce((s, r) => s + r.accepted_kg, 0),
    partial: summary.reduce((s, r) => s + r.partial_kg, 0),
    lots: summary.reduce((s, r) => s + r.lots_count, 0),
    partialLots: summary.reduce((s, r) => s + r.partial_lots, 0),
  }), [summary])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-sub)' }}>
          Envois <strong>triés</strong>, en attente du <strong>prix /kg</strong> pour confirmer le CA.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onGotoBordereaux}
            className="btn-primary"
            style={{
              fontSize: 11.5, padding: '6px 12px',
              background: '#8b5cf6', borderColor: '#8b5cf6',
              textDecoration: 'none',
              border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="Saisir le bordereau hebdomadaire envoyé par la station (méthode recommandée)"
          >
            🚚 BORDEREAU STATION
          </button>
          <button onClick={onOpenPeriod} disabled={dispatches.length === 0} className="btn-ghost" style={{ fontSize: 11.5, padding: '6px 12px', color: '#a855f7', borderColor: 'color-mix(in srgb,#a855f7 30%,transparent)' }}>
            📅 TARIF PAR PÉRIODE
          </button>
        </div>
      </div>

      {dispatches.length > 0 && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 10,
          background: 'color-mix(in srgb, #8b5cf6 8%, transparent)',
          border: '1px solid color-mix(in srgb, #8b5cf6 25%, transparent)',
          borderRadius: 6,
          fontSize: 11.5,
          color: 'var(--text-sub)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>💡</span>
          <span>
            <strong>Tip :</strong> au lieu de tarifer dispatch par dispatch, utilisez
            {' '}<a href="#" onClick={(e) => { e.preventDefault(); onGotoBordereaux() }} style={{ color: '#8b5cf6', fontWeight: 600 }}>les bordereaux station</a>{' '}
            pour saisir le prix de la semaine entière (allocation FIFO automatique).
          </span>
        </div>
      )}

      {/* ─── Synthèse Dispo à tarifer par Marché × Variété × Ferme ─── */}
      {summary.length > 0 && (
        <div style={{
          marginBottom: 14,
          border: '1px solid var(--bd-1)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg-2)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'color-mix(in srgb, #3b82f6 10%, transparent)',
            borderBottom: '1px solid var(--bd-1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>📊</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-main)' }}>
                Dispo à tarifer · par marché × variété × ferme
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', gap: 16 }}>
              <span><strong style={{ color: '#3b82f6', fontSize: 13 }}>{fmt(summaryTotals.remaining)} kg</strong> à tarifer</span>
              <span><strong>{summaryTotals.lots}</strong> lot(s) · dont <strong>{summaryTotals.partialLots}</strong> partiel(s)</span>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd-1)', background: 'var(--bg-1)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Marché</th>
                <th style={{ ...th, textAlign: 'left' }}>Variété</th>
                <th style={{ ...th, textAlign: 'left' }}>Ferme</th>
                <th style={{ ...th, textAlign: 'right' }}>Acceptée</th>
                <th style={{ ...th, textAlign: 'right' }}>Déjà tarifée</th>
                <th style={{ ...th, textAlign: 'right' }}>Restant à tarifer</th>
                <th style={{ ...th, textAlign: 'right' }}>Lots</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r: any) => {
                const isPartial = r.partial_kg > 0
                return (
                  <tr key={r.key} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                    <td style={td}>{r.market_name}</td>
                    <td style={td}>
                      {r.variety_code && (
                        <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600, marginRight: 6 }}>
                          {r.variety_code}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-sub)' }}>{r.variety_name}</span>
                    </td>
                    <td style={{ ...td, color: r.farm_name ? 'var(--text-main)' : 'var(--text-muted)' }}>
                      {r.farm_name ?? '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(r.accepted_kg)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: isPartial ? '#f59e0b' : 'var(--text-muted)' }}>
                      {isPartial ? fmt(r.partial_kg) : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#3b82f6', fontWeight: 700 }}>
                      {fmt(r.remaining_kg)}
                      {isPartial && (
                        <span title="Cette ligne est partiellement tarifée (un bordereau l'a déjà payée en partie)" style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>
                          PARTIEL
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-sub)' }}>
                      {r.lots_count}
                      {r.partial_lots > 0 && <span style={{ color: '#f59e0b' }}> ({r.partial_lots}p)</span>}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--bg-1)', fontWeight: 700 }}>
                <td style={td} colSpan={3}>TOTAL</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(summaryTotals.accepted)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{fmt(summaryTotals.partial)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>{fmt(summaryTotals.remaining)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{summaryTotals.lots}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <Table headers={['Lot', 'Date', 'Marché', 'Variété', 'Brute', 'Freinte', 'Écart', 'Acceptée', 'Action']} loading={loading} empty="Aucun envoi en attente de prix." rows={dispatches}>
        {(d: any) => (
          <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.lot_number}</td>
            <td style={td}>{d.harvest_date}</td>
            <td style={td}>{d.markets?.name ?? '—'}</td>
            <td style={td}>
              {d.varieties?.code
                ? <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600, fontSize: 11.5 }}>{d.varieties.code}</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={tdNum}>{fmt(d.quantity_kg)}</td>
            <td style={tdNum}>{(d.freinte_pct ?? 0).toFixed(1)}%</td>
            <td style={tdNum}>{(d.ecart_pct ?? 0).toFixed(1)}%</td>
            <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{fmt(d.qty_acceptee_kg ?? 0)}</td>
            <td style={td}>
              <button onClick={() => onPick(d)} className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>💰 Tarifer</button>
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function ConfirmesTab({ dispatches, loading }: { dispatches: any[]; loading: boolean }) {
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Envois avec prix confirmé et CA calculé.
      </div>
      <Table headers={['Lot', 'Date', 'Marché', 'Variété', 'Acceptée', 'Prix /kg', 'CA', 'Réf station']} loading={loading} empty="Aucun envoi confirmé." rows={dispatches}>
        {(d: any) => (
          <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.lot_number}</td>
            <td style={td}>{d.harvest_date}</td>
            <td style={td}>{d.markets?.name ?? '—'}</td>
            <td style={td}>
              {d.varieties?.code
                ? <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600, fontSize: 11.5 }}>{d.varieties.code}</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={tdNum}>{fmt(d.qty_acceptee_kg ?? 0)}</td>
            <td style={tdNum}>{(d.price_per_kg ?? 0).toFixed(2)}</td>
            <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{fmt(d.ca_amount ?? 0)} MAD</td>
            <td style={{ ...td, fontSize: 11, color: 'var(--text-sub)' }}>{d.station_ref ?? '—'}</td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function CaTab({ data, myName, myId, loading }: { data: { rows: any[]; totalCA: number; myCA: number }; myName: string; myId: string | null; loading: boolean }) {
  const [mineOnly, setMineOnly] = useState(false)
  // Tri du plus gros CA au plus petit
  const rows = useMemo(() => {
    const r = mineOnly ? data.rows.filter(x => x.mine > 0) : data.rows
    return [...r].sort((a, b) => (mineOnly ? b.mine - a.mine : b.ca - a.ca))
  }, [data.rows, mineOnly])

  return (
    <div>
      {/* KPIs CA */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180, border: '1px solid var(--bd-1)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .4 }}>CA total réalisé</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--neon)', fontFamily: 'var(--font-mono)' }}>{fmt(data.totalCA)} MAD</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{data.rows.length} lot(s) confirmé(s)</div>
        </div>
        <div style={{ flex: 1, minWidth: 180, border: '1px solid rgba(34,197,94,.4)', borderRadius: 8, padding: '10px 14px', background: 'rgba(34,197,94,.05)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .4 }}>Mon CA ({myName})</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', fontFamily: 'var(--font-mono)' }}>{fmt(data.myCA)} MAD</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
            {data.totalCA > 0 ? ((data.myCA / data.totalCA) * 100).toFixed(1) : '0'}% du total
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-sub)' }}>
          CA par lot. Attribution au récolteur au <strong>prorata</strong> des quantités contribuées.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} disabled={!myId} />
          Mon CA seulement
        </label>
      </div>

      <Table headers={['Lot', 'Date', 'Marché', 'Variété', 'Acceptée', 'Prix /kg', 'CA lot', 'Ma part', 'Récolteur(s)']} loading={loading} empty="Aucun CA réalisé pour l'instant." rows={rows}>
        {(r: any) => (
          <tr key={r.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.lot}</td>
            <td style={td}>{r.date}</td>
            <td style={td}>{r.market}</td>
            <td style={td}>
              <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600, fontSize: 11.5 }}>{r.variety}</span>
            </td>
            <td style={tdNum}>{fmt(r.qty)}</td>
            <td style={tdNum}>{r.price.toFixed(2)}</td>
            <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{fmt(r.ca)}</td>
            <td style={{ ...tdNum, color: r.mine > 0 ? '#16a34a' : 'var(--text-muted)', fontWeight: r.mine > 0 ? 700 : 400 }}>{r.mine > 0 ? fmt(r.mine) : '—'}</td>
            <td style={{ ...td, fontSize: 11, color: 'var(--text-sub)' }}>{r.contributors.join(', ')}</td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function StockRetourTab({ lots, onReload, loading }: { lots: any[]; onReload: () => void; loading: boolean }) {
  const [acting, setActing] = useState<string>('')

  const markConsumed = async (lotId: string, lotNumber: string) => {
    if (!confirm(`Marquer le lot ${lotNumber} comme consommé (envoyé vers un autre marché) ?`)) return
    setActing(lotId)
    try {
      const { error } = await supabase.from('harvest_lots').update({
        tri_status: 'priced',  // marqué consommé
        notes: `Stock retour consommé manuellement le ${new Date().toISOString().slice(0, 10)}`,
      }).eq('id', lotId)
      if (error) throw error
      onReload()
    } catch (e: any) {
      alert('Erreur : ' + e.message)
    }
    setActing('')
  }

  const markDestroyed = async (lotId: string, lotNumber: string) => {
    if (!confirm(`Marquer le lot ${lotNumber} comme finalement détruit (perte) ?`)) return
    setActing(lotId)
    try {
      const { error } = await supabase.from('harvest_lots').update({
        tri_status: 'priced',
        notes: `Stock retour finalement détruit le ${new Date().toISOString().slice(0, 10)}`,
      }).eq('id', lotId)
      if (error) throw error
      onReload()
    } catch (e: any) {
      alert('Erreur : ' + e.message)
    }
    setActing('')
  }

  const total = lots.reduce((s, l) => s + Number(l.quantity_kg ?? 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 10, padding: 12, background: 'color-mix(in srgb, var(--neon) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)', borderRadius: 7, fontSize: 12.5, color: 'var(--text-main)' }}>
        🔄 <strong>Stock de retour</strong> — lots créés à partir des rejets de tri (destination = "retour stock"),
        disponibles pour <strong>ré-envoi vers un autre marché</strong> (souk local, industrie, etc.).
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-sub)' }}>
          💡 V1 : marque les lots comme consommés (envoyés vers un autre canal) ou détruits si finalement perdus.
          V2 (à venir) : composition directe d'un nouvel envoi station depuis ces lots.
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--neon)', fontWeight: 600 }}>
          Total disponible : {fmt(total)} kg sur {lots.length} lot(s)
        </div>
      </div>

      <Table headers={['Lot retour', 'Date', 'Variété', 'Qté (kg)', 'Origine', 'Actions']} loading={loading} empty="Aucun stock de retour en attente ✨" rows={lots}>
        {(l: any) => (
          <tr key={l.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
            <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{l.lot_number}</td>
            <td style={td}>{l.harvest_date}</td>
            <td style={{ ...td, fontSize: 11 }}>
              <span style={{ color: '#a855f7' }}>{l.varieties?.code ?? '—'}</span> {l.varieties?.commercial_name ? `· ${l.varieties.commercial_name}` : ''}
            </td>
            <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 600 }}>{fmt(l.quantity_kg)}</td>
            <td style={{ ...td, fontSize: 10.5, color: 'var(--text-sub)' }}>
              {l.parent_dispatch_id ? <span style={{ fontFamily: 'var(--font-mono)' }}>{String(l.parent_dispatch_id).slice(0, 8)}…</span> : '—'}
            </td>
            <td style={td}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => markConsumed(l.id, l.lot_number)}
                  disabled={acting === l.id}
                  style={{
                    padding: '4px 10px', fontSize: 11,
                    background: 'var(--neon-dim)', color: 'var(--neon)',
                    border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)',
                    borderRadius: 5, cursor: acting === l.id ? 'wait' : 'pointer',
                  }}>
                  ✅ Renvoyé
                </button>
                <button
                  onClick={() => markDestroyed(l.id, l.lot_number)}
                  disabled={acting === l.id}
                  style={{
                    padding: '4px 10px', fontSize: 11,
                    background: 'var(--red-dim)', color: 'var(--red)',
                    border: '1px solid color-mix(in srgb, var(--red) 40%, transparent)',
                    borderRadius: 5, cursor: acting === l.id ? 'wait' : 'pointer',
                  }}>
                  🗑️ Détruit
                </button>
              </div>
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function AlertesTab({ alertes, onResolve, loading }: { alertes: any[]; onResolve: (id: string) => void; loading: boolean }) {
  return (
    <Table headers={['Date', 'Titre', 'Message', 'Actions']} loading={loading} empty="Aucune alerte active ✓" rows={alertes}>
      {(a: any) => (
        <tr key={a.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
          <td style={{ ...td, fontSize: 11 }}>{a.created_at?.slice(0, 10)}</td>
          <td style={{ ...td, fontWeight: 600 }}>{a.title}</td>
          <td style={{ ...td, fontSize: 11, color: 'var(--text-sub)' }}>{a.message}</td>
          <td style={td}>
            <button onClick={() => onResolve(a.id)} className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 8px' }}>✓ Résoudre</button>
          </td>
        </tr>
      )}
    </Table>
  )
}

// ============================================================
// MODALS
// ============================================================

function NewHarvestModal({ form, setForm, plantings, trayTypes, estimate, emptyTrayLine, window: win, saving, done, error, onClose, onSave }: any) {
  const f = (k: string) => (e: any) => setForm((s: any) => ({ ...s, [k]: e.target.value }))

  const setLine = (i: number, key: string, val: string) =>
    setForm((s: any) => ({ ...s, trayLines: s.trayLines.map((l: any, idx: number) => idx === i ? { ...l, [key]: val } : l) }))
  const addLine = () => setForm((s: any) => ({ ...s, trayLines: [...s.trayLines, emptyTrayLine()] }))
  const removeLine = (i: number) => setForm((s: any) => ({ ...s, trayLines: s.trayLines.length > 1 ? s.trayLines.filter((_: any, idx: number) => idx !== i) : s.trayLines }))

  const poidsOf = (code: string) => Number(trayTypes.find((t: any) => t.code === code)?.metadata?.poids_kg ?? 0)
  const hasValidLine = form.trayLines.some((l: any) => l.tray_type_code && Number(l.nb) > 0)
  const noTrayTypes = trayTypes.length === 0

  return (
    <Modal title="🌿 Saisir une récolte" onClose={onClose}>
      {done ? <SuccessMessage message="Récolte créée" /> : (
        <>
          <FormGroup label="Plantation (serre · variété) *">
            <Select value={form.campaign_planting_id} onChange={f('campaign_planting_id')}>
              <option value="">— sélectionner —</option>
              {plantings.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.greenhouses?.code} · {p.varieties?.commercial_name} ({p.campaigns?.name ?? '?'})
                </option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Date récolte *">
            <Input type="date" value={form.harvest_date} onChange={f('harvest_date')} min={win?.start ?? undefined} max={win?.end ?? undefined} />
            {form.campaign_planting_id && (win?.start || win?.end) && (
              <div className="text-[11px] text-gray-500 mt-1">
                Plage de récolte : {win?.start ?? '—'} → {win?.end ?? '—'}
              </div>
            )}
          </FormGroup>

          {/* Saisie en plateaux */}
          <FormGroup label="Plateaux récoltés *">
            {noTrayTypes ? (
              <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Aucun type de plateau défini. Ajoute-les dans <strong>Admin → Référentiels → Types de plateaux</strong>.
              </div>
            ) : (
              <div className="space-y-2">
                {form.trayLines.map((l: any, i: number) => {
                  const lineKg = (Number(l.nb) || 0) * poidsOf(l.tray_type_code)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={l.tray_type_code} onChange={(e: any) => setLine(i, 'tray_type_code', e.target.value)}>
                        <option value="">— type de plateau —</option>
                        {trayTypes.map((t: any) => (
                          <option key={t.code} value={t.code}>{t.label} ({poidsOf(t.code)} kg)</option>
                        ))}
                      </Select>
                      <div style={{ width: 90, flexShrink: 0 }}>
                        <Input type="number" value={l.nb} onChange={(e: any) => setLine(i, 'nb', e.target.value)} placeholder="Nb" />
                      </div>
                      <span className="text-[12px] text-gray-500 font-mono whitespace-nowrap" style={{ minWidth: 70, textAlign: 'right' }}>
                        {lineKg > 0 ? `${fmt(lineKg)} kg` : '—'}
                      </span>
                      <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500 px-1" title="Retirer">✕</button>
                    </div>
                  )
                })}
                <button type="button" onClick={addLine} className="text-[13px] text-emerald-600 hover:text-emerald-700 font-medium">
                  + Ajouter un type de plateau
                </button>
              </div>
            )}
          </FormGroup>

          {/* Estimation */}
          <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 my-1">
            <span className="text-[13px] text-emerald-800 font-medium">Poids estimé</span>
            <span className="text-[15px] font-bold text-emerald-700 font-mono">{fmt(estimate)} kg</span>
          </div>
          <div className="text-[11px] text-gray-500 -mt-1 mb-1">Estimation au champ. Le poids réel sera confirmé à la pesée station.</div>

          <FormGroup label="Notes"><Textarea value={form.notes} onChange={f('notes')} placeholder="Optionnel" /></FormGroup>
          {error && <ErrorBox msg={error} />}
          <ModalFooter onCancel={onClose} onSave={onSave} loading={saving} saveLabel="CRÉER" disabled={!form.campaign_planting_id || !form.harvest_date || !hasValidLine} />
        </>
      )}
    </Modal>
  )
}

function EditHarvestModal({ harvest, form, setForm, plantings, saving, done, error, onClose, onSave }: any) {
  const f = (k: string) => (e: any) => setForm((s: any) => ({ ...s, [k]: e.target.value }))
  return (
    <Modal title={`Éditer — ${harvest.lot_number}`} onClose={onClose}>
      {done ? <SuccessMessage message="Récolte modifiée" /> : (
        <>
          <FormGroup label="Plantation">
            <Select value={form.campaign_planting_id} onChange={f('campaign_planting_id')}>
              {plantings.map((p: any) => (
                <option key={p.id} value={p.id}>{p.greenhouses?.code} · {p.varieties?.commercial_name}</option>
              ))}
            </Select>
          </FormGroup>
          <FormRow>
            <FormGroup label="Date récolte"><Input type="date" value={form.harvest_date} onChange={f('harvest_date')} /></FormGroup>
            <FormGroup label="Quantité (kg)"><Input type="number" value={form.total_qty} onChange={f('total_qty')} /></FormGroup>
          </FormRow>
          <FormGroup label="Notes"><Textarea value={form.notes} onChange={f('notes')} /></FormGroup>
          {error && <ErrorBox msg={error} />}
          <ModalFooter onCancel={onClose} onSave={onSave} loading={saving} saveLabel="ENREGISTRER" />
        </>
      )}
    </Modal>
  )
}

function ComposeModal({ harvests, markets, onClose, onDone }: { harvests: any[]; markets: any[]; onClose: () => void; onDone: () => void }) {
  // La collecte a été saisie en PLATEAUX → on réutilise le métrage plateaux
  // de CHAQUE récolte (harvest_tray_lines). Poids moyen/plateau = kg total ÷
  // nb plateaux enregistrés. Repli sur le type par défaut si une récolte n'a
  // pas de lignes de plateaux (saisie en kg).
  const { values: trayTypes } = useReferenceList('tray_type')
  const defaultTray = (trayTypes.find(t => (t as any).is_default) ?? trayTypes[0]) as any
  const defaultWeight = Number(defaultTray?.metadata?.poids_kg) || 0
  const defaultLabel = defaultTray?.label ?? 'plateaux'

  const [trayByHarvest, setTrayByHarvest] = useState<Record<string, { trays: number; label: string }>>({})
  useEffect(() => {
    const ids = harvests.map((h: any) => h.id)
    if (ids.length === 0) return
    supabase.from('harvest_tray_lines').select('harvest_id, nb_trays, tray_type_label').in('harvest_id', ids)
      .then(({ data }) => {
        const m: Record<string, { trays: number; label: string }> = {}
        for (const r of (data ?? []) as any[]) {
          const cur = m[r.harvest_id] ?? { trays: 0, label: r.tray_type_label ?? 'plateaux' }
          cur.trays += Number(r.nb_trays) || 0
          m[r.harvest_id] = cur
        }
        setTrayByHarvest(m)
      })
  }, [harvests])

  // Poids moyen d'un plateau + nb collecté + max plateaux envoyables pour une récolte
  const trayOf = (h: any) => {
    const info = trayByHarvest[h.id]
    const totalKg = Number(h.total_qty) || Number(h.estimated_kg) || 0
    const collected = info?.trays ?? 0
    if (info && info.trays > 0 && totalKg > 0) {
      const w = totalKg / info.trays
      return { w, label: info.label, collected, max: w > 0 ? Math.floor(h.remaining_kg / w) : 0 }
    }
    return { w: defaultWeight, label: defaultLabel, collected, max: defaultWeight > 0 ? Math.floor(h.remaining_kg / defaultWeight) : 0 }
  }
  const kgOf = (h: any, nb: number) => nb * trayOf(h).w

  const [picks, setPicks] = useState<Record<string, number>>({})  // nb de plateaux par récolte
  const [marketId, setMarketId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const totalTrays = Object.values(picks).reduce((s, v) => s + v, 0)
  const total = Object.entries(picks).reduce((s, [id, nb]) => {
    const h = harvests.find((x: any) => x.id === id)
    return s + (h ? kgOf(h, nb) : 0)
  }, 0)  // kg estimé

  const updateQty = (h: any, nbStr: string) => {
    setErr('')
    const nb = Math.floor(Number(nbStr.replace(',', '.')))
    if (!Number.isFinite(nb) || nb <= 0) {
      setPicks(s => { const n = { ...s }; delete n[h.id]; return n })
      return
    }
    const info = trayOf(h)
    if (nb * info.w > h.remaining_kg + 0.01) { setErr(`${h.lot_number} : max ${info.max} plateaux (${fmt(h.remaining_kg)} kg dispo)`); return }
    setPicks(s => ({ ...s, [h.id]: nb }))
  }
  const fillAll = (h: any) => updateQty(h, String(trayOf(h).max))

  const save = async () => {
    setErr('')
    // Convertit les plateaux en kg estimé, par récolte (poids propre à chacune)
    const entries = Object.entries(picks).filter(([, nb]) => nb > 0).map(([id, nb]) => {
      const h = harvests.find((x: any) => x.id === id)
      return [id, h ? kgOf(h, nb) : 0] as [string, number]
    }).filter(([, kg]) => kg > 0)
    if (entries.length === 0) { setErr('Sélectionne au moins une récolte.'); return }
    if (!marketId) { setErr('Choisis un marché.'); return }
    setSaving(true)
    try {
      // Groupe les récoltes sélectionnées PAR VARIÉTÉ
      // (harvest_lots.variety_id est NOT NULL donc 1 lot = 1 variété)
      type Entry = { harvest_id: string; qty: number; harvest: any; variety_id: string | null }
      const enriched: Entry[] = entries.map(([hId, qty]) => {
        const h = harvests.find(x => x.id === hId)
        return {
          harvest_id: hId, qty,
          harvest: h,
          variety_id: h?.campaign_plantings?.variety_id ?? null,
        }
      })
      const groups = new Map<string, Entry[]>()
      for (const e of enriched) {
        if (!e.variety_id) { setErr(`Récolte ${e.harvest?.lot_number} sans variété — impossible de l'inclure.`); setSaving(false); return }
        const g = groups.get(e.variety_id) ?? []
        g.push(e); groups.set(e.variety_id, g)
      }

      const ts = String(Date.now())
      const today = new Date().toISOString().slice(0, 10)
      const totalQty = entries.reduce((s, [, q]) => s + q, 0)
      const createdLots: { lot_number: string; variety_code?: string; total: number }[] = []

      let groupIdx = 0
      for (const [varietyId, groupEntries] of groups.entries()) {
        groupIdx++
        const sub = groupEntries[0].harvest
        const subTotal = groupEntries.reduce((s, e) => s + e.qty, 0)
        const dispLot = `D${ts.slice(-8)}-${String(groupIdx).padStart(2, '0')}`.slice(0, 50)

        const { data: lot, error } = await supabase.from('harvest_lots').insert({
          lot_number: dispLot,
          harvest_id: groupEntries.length === 1 ? groupEntries[0].harvest_id : null,
          campaign_planting_id: sub?.campaign_planting_id ?? null,
          harvest_date: today,
          quantity_kg: subTotal,
          estimated_kg: subTotal,
          category: 'station_dispatch',
          variety_id: varietyId,
          greenhouse_id: sub?.campaign_plantings?.greenhouse_id ?? null,
          market_id: marketId,
          tri_status: 'pending',
          notes: `Envoi composite — ${groupEntries.length} récolte(s) variété ${sub?.campaign_plantings?.varieties?.code ?? '?'}`,
        }).select('id, lot_number').single()
        if (error) throw error

        const sourceRows = groupEntries.map(e => ({
          harvest_lot_id: lot!.id, harvest_id: e.harvest_id, qty_contributed_kg: e.qty,
        }))
        const { error: srcErr } = await supabase.from('harvest_lot_sources').insert(sourceRows)
        if (srcErr) throw srcErr

        createdLots.push({
          lot_number: lot!.lot_number,
          variety_code: sub?.campaign_plantings?.varieties?.code,
          total: subTotal,
        })
      }

      if (createdLots.length > 1) {
        // Affichage informatif (non bloquant) : on a splitté en N lots
        console.info('[compose] split into', createdLots)
      }
      onDone()
    } catch (e: any) { setErr(e.message || String(e)) }
    setSaving(false)
  }

  return (
    <Modal title="📦 Composer un envoi station" onClose={onClose} size="lg">
      <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Choisis le marché, puis saisis le nombre de plateaux à envoyer par récolte (le poids kg est estimé d'après les plateaux enregistrés à la collecte).
      </div>
      <FormGroup label="Marché *">
        <Select value={marketId} onChange={e => setMarketId(e.target.value)}>
          <option value="">— sélectionner —</option>
          {markets.map((m: any) => <option key={m.id} value={m.id}>🌍 {m.name}{m.code ? ` (${m.code})` : ''}</option>)}
        </Select>
      </FormGroup>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 12, marginBottom: 4 }}>
        Récoltes disponibles
      </div>
      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 6, maxHeight: 360, overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead style={{ background: 'var(--bg-2)', position: 'sticky', top: 0 }}>
            <tr>{['Lot', 'Date', 'Serre/Var', 'Dispo', 'Plateaux à envoyer', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {harvests.map(h => (
              <tr key={h.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{h.lot_number}</td>
                <td style={td}>{h.harvest_date}</td>
                <td style={{ ...td, fontSize: 11 }}>{h.campaign_plantings?.greenhouses?.code} / {h.campaign_plantings?.varieties?.code}</td>
                <td style={tdNum}>
                  {fmt(h.remaining_kg)} kg
                  <div style={{ fontSize: 10, color: 'var(--text-sub)', fontWeight: 400 }}>
                    {trayOf(h).collected} plateaux collectés · <b style={{ color: 'var(--neon)' }}>{trayOf(h).max}</b> dispo
                  </div>
                </td>
                <td style={td}>
                  <input type="number" placeholder="0" min={0} max={trayOf(h).max}
                    value={picks[h.id] ?? ''}
                    onChange={e => updateQty(h, e.target.value)}
                    style={{ width: 70, padding: '4px 6px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 4, fontSize: 12 }} />
                  {Number(picks[h.id]) > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--neon)' }}>≈ {fmt(kgOf(h, Number(picks[h.id])))} kg</span>
                  )}
                </td>
                <td style={td}>
                  <button onClick={() => fillAll(h)} className="btn-ghost" style={{ fontSize: 10.5, padding: '2px 6px' }}>↪ Tout</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(() => {
        const selectedHarvests = Object.keys(picks).filter(id => Number(picks[id]) > 0).map(id => harvests.find(h => h.id === id)).filter(Boolean)
        const varieties = new Set(selectedHarvests.map((h: any) => h?.campaign_plantings?.variety_id).filter(Boolean))
        const varietyCodes = Array.from(new Set(selectedHarvests.map((h: any) => h?.campaign_plantings?.varieties?.code).filter(Boolean)))
        const multiVar = varieties.size > 1
        return (
          <>
            <div style={{ marginTop: 10, padding: 10, background: 'var(--neon-dim)', borderRadius: 6, fontSize: 12, color: 'var(--text-main)' }}>
              Total envoi : <strong style={{ color: 'var(--neon)', fontSize: 14 }}>{totalTrays} plateaux ≈ {fmt(total)} kg</strong> sur {Object.keys(picks).length} récolte(s)
            </div>
            {multiVar && (
              <div style={{ marginTop: 8, padding: 8, background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-main)' }}>
                ℹ {varieties.size} variétés sélectionnées ({varietyCodes.join(', ')}) → <strong>{varieties.size} envois distincts</strong> seront créés (1 par variété), tous dirigés vers le même marché.
              </div>
            )}
          </>
        )
      })()}
      {err && <ErrorBox msg={err} />}
      <ModalFooter onCancel={onClose} onSave={save} loading={saving} saveLabel="CRÉER L'ENVOI" disabled={total <= 0 || !marketId} />
    </Modal>
  )
}

function TriModal({ dispatch, onClose, onDone }: { dispatch: any; onClose: () => void; onDone: () => void }) {
  const [freinte, setFreinte] = useState(String(dispatch.freinte_pct ?? '0'))
  const [ecart, setEcart] = useState(String(dispatch.ecart_pct ?? '0'))
  const [destination, setDestination] = useState<'destruction' | 'retour_stock' | 'vente_industrie' | 'dons' | 'vente_ecart'>(
    (dispatch.destination_rejet ?? 'vente_ecart') as any
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Pré-remplit freinte/écart avec les valeurs par défaut paramétrables
  // (business_params) au premier tri seulement (si pas déjà saisis).
  useEffect(() => {
    const alreadyTried = Number(dispatch.freinte_pct ?? 0) > 0 || Number(dispatch.ecart_pct ?? 0) > 0
    if (alreadyTried) return
    import('@/lib/businessParams').then(({ getBusinessParams }) => {
      getBusinessParams().then(p => {
        const isExport = (dispatch.markets?.type ?? '') === 'export'
        setFreinte(String(isExport ? p.default_freinte_export : p.default_freinte_local))
        setEcart(String(isExport ? p.default_ecart_export : p.default_ecart_local))
      }).catch(() => { /* garde 0 */ })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const fr = Number(freinte) || 0
  const ec = Number(ecart) || 0
  const qtyB = Number(dispatch.quantity_kg)
  const qtyN = Math.round(qtyB * (1 - fr / 100) * 100) / 100
  // FREINTE = pertes physiques détruites (à ignorer dans la qty restante)
  // ÉCART = pieces hors-cat1 → vendables au client écart
  const qtyAfterFreinte = qtyN  // après destruction des pertes physiques
  const qtyA = Math.round(qtyN * (1 - ec / 100) * 100) / 100  // qté de 1ère cat
  const qtyEcart = Math.round((qtyN - qtyA) * 100) / 100  // écart en kg (vendable)
  const qtyFreinte = Math.round((qtyB - qtyN) * 100) / 100  // freinte en kg (détruite)
  const qtyRejet = qtyEcart  // pour compat avec le code existant : rejet = écart

  const destinationLabel: Record<string, { label: string; desc: string; color: string; icon: string }> = {
    vente_ecart:     { label: 'Vente client écart', desc: 'Le client écart configuré passe récupérer (recommandé)', color: '#3b82f6',  icon: '🤝' },
    destruction:     { label: 'Destruction',      desc: 'Perte sèche — produit non récupérable', color: 'var(--red)',    icon: '🗑️' },
    retour_stock:    { label: 'Retour au stock',  desc: 'Ré-envoi possible vers un autre marché', color: 'var(--neon)',  icon: '🔄' },
    vente_industrie: { label: 'Vente industrie',  desc: 'Vendu direct prix réduit (transformation, jus)', color: 'var(--amber)', icon: '🏭' },
    dons:            { label: 'Dons',             desc: 'Banque alimentaire, associations', color: '#a855f7',  icon: '🎁' },
  }

  const save = async () => {
    setErr('')
    if (fr < 0 || fr > 100 || ec < 0 || ec > 100) { setErr('Freinte et écart entre 0 et 100.'); return }
    if (fr + ec >= 100) { setErr('Freinte + écart ≥ 100% (rien d\'accepté).'); return }
    setSaving(true)
    try {
      // 1. Update le dispatch original
      // Note : rejet_qty_kg = ecart seulement (la freinte est detruite physiquement,
      // elle n'apparait pas comme "rejet recuperable")
      const { error } = await supabase.from('harvest_lots').update({
        freinte_pct: fr, ecart_pct: ec, qty_nette_kg: qtyN, qty_acceptee_kg: qtyA,
        rejet_qty_kg: qtyEcart, destination_rejet: destination,
        tri_status: 'tried',
      }).eq('id', dispatch.id)
      if (error) throw error

      // 2a. Si vente_ecart : appeler la RPC pour creer le dispatch enfant vers le marche ecart
      if (destination === 'vente_ecart' && qtyEcart > 0) {
        const { error: ecartErr } = await supabase.rpc('create_ecart_dispatch', {
          p_parent_lot_id: dispatch.id,
          p_ecart_qty_kg: qtyEcart,
        })
        if (ecartErr) {
          // Si la RPC n'est pas deployee ou config manque -> on log mais on continue
          if (/PGRST202|does not exist/i.test(ecartErr.message ?? '')) {
            const { toast } = await import('sonner')
            toast.warning('RPC create_ecart_dispatch non deployee (migration 048 a appliquer). Tri sauve sans creation dispatch ecart.', { duration: 8000 })
          } else {
            const { toast } = await import('sonner')
            toast.error('Dispatch ecart non cree : ' + ecartErr.message, { duration: 8000 })
          }
        } else {
          const { toast } = await import('sonner')
          toast.success(`Dispatch ecart cree (${fmt(qtyEcart)} kg) vers le marche ecart`, { duration: 5000 })
        }
      }

      // 2b. Si retour_stock : créer le harvest_lot enfant disponible pour ré-envoi
      if (destination === 'retour_stock' && qtyEcart > 0) {
        const childLotNumber = `${dispatch.lot_number}-RETOUR`
        const { error: childErr } = await supabase.from('harvest_lots').insert({
          lot_number: childLotNumber,
          harvest_id: dispatch.harvest_id ?? null,
          campaign_planting_id: dispatch.campaign_planting_id ?? null,
          harvest_date: dispatch.harvest_date ?? new Date().toISOString().slice(0, 10),
          quantity_kg: qtyEcart,
          variety_id: dispatch.variety_id ?? null,
          greenhouse_id: dispatch.greenhouse_id ?? null,
          category: 'stock_retour',
          parent_dispatch_id: dispatch.id,
          tri_status: 'pending',
          destination_rejet: null,
          notes: `Retour stock issu du dispatch ${dispatch.lot_number} (${qtyEcart} kg rejetés au tri)`,
        })
        if (childErr) {
          console.warn('[tri] Création lot stock_retour échouée :', childErr)
        }
      }

      onDone()
    } catch (e: any) { setErr(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`🔬 Tri — ${dispatch.lot_number}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12 }}>
        Marché : <strong>{dispatch.markets?.name ?? '—'}</strong> · Variété : <strong style={{ color: '#a855f7' }}>{dispatch.varieties?.code ?? '—'}</strong> · Brute : <strong>{fmt(qtyB)} kg</strong>
      </div>
      <FormRow>
        <FormGroup label="Freinte (%) *"><Input type="number" value={freinte} onChange={e => setFreinte((e.target as any).value)} /></FormGroup>
        <FormGroup label="Écart (%) *"><Input type="number" value={ecart} onChange={e => setEcart((e.target as any).value)} /></FormGroup>
      </FormRow>
      <div style={{ marginTop: 10, padding: 12, background: 'var(--neon-dim)', border: '1px solid var(--neon)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Calcul automatique</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-main)', lineHeight: 1.7 }}>
          Brute = <strong>{fmt(qtyB)} kg</strong><br/>
          ↓ Freinte {fr}% = <strong style={{ color: 'var(--red)' }}>{fmt(qtyFreinte)} kg DÉTRUITS (pertes physiques)</strong><br/>
          Nette = <strong>{fmt(qtyN)} kg</strong><br/>
          ↓ Écart {ec}% = <strong style={{ color: '#3b82f6' }}>{fmt(qtyEcart)} kg VENDABLES (écart commercial)</strong><br/>
          Acceptée = <strong style={{ color: 'var(--neon)' }}>{fmt(qtyA)} kg (1ère cat → vente normale)</strong>
        </div>
      </div>

      {/* Sélecteur destination du rejet (uniquement pour l'écart, pas la freinte) */}
      {qtyEcart > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, fontWeight: 700 }}>
            🎯 Destination de l'écart ({fmt(qtyEcart)} kg)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {(Object.keys(destinationLabel) as Array<keyof typeof destinationLabel>).map(k => {
              const opt = destinationLabel[k]
              const selected = destination === k
              return (
                <button key={k} type="button" onClick={() => setDestination(k as any)}
                  style={{
                    textAlign: 'left', padding: 10, borderRadius: 7,
                    background: selected ? `color-mix(in srgb, ${opt.color} 12%, transparent)` : 'transparent',
                    border: `1.5px solid ${selected ? opt.color : 'var(--bd-1)'}`,
                    color: 'var(--text-main)', cursor: 'pointer',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                    {opt.icon} {opt.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-sub)', lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </button>
              )
            })}
          </div>
          {destination === 'retour_stock' && (
            <div style={{ marginTop: 8, padding: 8, background: 'color-mix(in srgb, var(--neon) 8%, transparent)', borderRadius: 6, fontSize: 11, color: 'var(--text-sub)' }}>
              💡 Un nouveau lot <code>{dispatch.lot_number}-RETOUR</code> sera créé avec <strong>{fmt(qtyRejet)} kg</strong>, disponible pour un nouvel envoi vers un autre marché.
            </div>
          )}
        </div>
      )}

      {err && <ErrorBox msg={err} />}
      <ModalFooter onCancel={onClose} onSave={save} loading={saving} saveLabel="ENREGISTRER LE TRI" />
    </Modal>
  )
}

function PriceModal({ dispatch, onClose, onDone }: { dispatch: any; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState(String(dispatch.price_per_kg ?? ''))
  const [stationRef, setStationRef] = useState(dispatch.station_ref ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const p = Number(price) || 0
  const qtyA = Number(dispatch.qty_acceptee_kg) || 0
  const ca = Math.round(qtyA * p * 100) / 100

  const save = async () => {
    setErr('')
    if (p <= 0) { setErr('Prix doit être > 0.'); return }
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { error } = await supabase.from('harvest_lots').update({
        price_per_kg: p, ca_amount: ca, station_ref: stationRef.trim() || null,
        receipt_date: today, periode_debut: today, periode_fin: today,
        certificate_number: String(qtyA), tri_status: 'priced',
      }).eq('id', dispatch.id)
      if (error) throw error

      // Auto-facturation : génère une facture avec le client du marché
      // Idempotent (la RPC retourne l'existante si déjà créée)
      try {
        const { data: invRes, error: invErr } = await supabase.rpc('admin_generate_dispatch_invoice', {
          p_lot_id: dispatch.id,
        })
        if (invErr) {
          // Erreurs non bloquantes : on log mais on continue
          if (/PGRST202|does not exist/i.test(invErr.message ?? '')) {
            console.warn('[recoltes] RPC admin_generate_dispatch_invoice non déployée — applique migration 047')
          } else if (/client par défaut/i.test(invErr.message ?? '')) {
            const { toast } = await import('sonner')
            toast.warning(`Tarification OK mais facture impossible : ${invErr.message}`, { duration: 8000 })
          } else {
            console.error('[recoltes] auto-facturation:', invErr)
          }
        } else if (invRes && (invRes as any).created) {
          const { toast } = await import('sonner')
          toast.success(`Facture ${(invRes as any).invoice_number} créée — échéance ${(invRes as any).due_date}`, { duration: 6000 })
        }
      } catch (e) { /* silent */ }

      onDone()
    } catch (e: any) { setErr(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`💰 Tarifer — ${dispatch.lot_number}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-main)' }}>
        Marché : <strong>{dispatch.markets?.name ?? '—'}</strong> · Variété : <strong style={{ color: '#a855f7' }}>{dispatch.varieties?.code ?? '—'}</strong><br/>
        Brute {fmt(dispatch.quantity_kg)} kg → Nette {fmt(dispatch.qty_nette_kg ?? 0)} kg → <strong style={{ color: 'var(--neon)' }}>Acceptée {fmt(qtyA)} kg</strong><br/>
        <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>(freinte {dispatch.freinte_pct}% · écart {dispatch.ecart_pct}%)</span>
      </div>
      <FormGroup label={`Prix /kg (${dispatch.markets?.currency ?? 'MAD'}) *`}>
        <Input type="number" value={price} onChange={e => setPrice((e.target as any).value)} placeholder="8.50" autoFocus />
      </FormGroup>
      <FormGroup label="Référence station / bordereau"><Input value={stationRef} onChange={e => setStationRef((e.target as any).value)} placeholder="STN-…" /></FormGroup>
      {p > 0 && (
        <div style={{ marginTop: 10, padding: 12, background: 'var(--neon-dim)', border: '1px solid var(--neon)', borderRadius: 8, fontSize: 13 }}>
          CA = {fmt(qtyA)} kg × {p.toFixed(2)} = <strong style={{ color: 'var(--neon)', fontSize: 16 }}>{fmt(ca)} MAD</strong>
        </div>
      )}
      {err && <ErrorBox msg={err} />}
      <ModalFooter onCancel={onClose} onSave={save} loading={saving} saveLabel="CONFIRMER LE PRIX" />
    </Modal>
  )
}

function PeriodPriceModal({ dispatches, onClose, onDone }: { dispatches: any[]; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [debut, setDebut] = useState(sevenAgo)
  const [fin, setFin] = useState(today)
  const [stationRef, setStationRef] = useState('')
  // Map marché_id → prix /kg
  const [pricesByMarket, setPricesByMarket] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Filtre les dispatches sur la période
  const filtered = useMemo(() => dispatches.filter(d => {
    const dt = d.harvest_date
    return dt && dt >= debut && dt <= fin
  }), [dispatches, debut, fin])

  // Regroupement par (marché × variété) : le prix dépend des deux
  type MarketVarietyGroup = {
    key: string
    market_id: string; market_name: string; currency: string
    variety_id: string; variety_code: string; variety_name: string
    rows: any[]; total_acceptee: number
  }
  const byKey = useMemo(() => {
    const map = new Map<string, MarketVarietyGroup>()
    filtered.forEach(d => {
      const mid = d.market_id ?? '__none'
      const vid = d.variety_id ?? '__none'
      const key = `${mid}|${vid}`
      const cur: MarketVarietyGroup = map.get(key) ?? {
        key,
        market_id: mid,
        market_name: d.markets?.name ?? '— sans marché —',
        currency: d.markets?.currency ?? 'MAD',
        variety_id: vid,
        variety_code: d.varieties?.code ?? '—',
        variety_name: d.varieties?.commercial_name ?? '',
        rows: [],
        total_acceptee: 0,
      }
      cur.rows.push(d)
      cur.total_acceptee += Number(d.qty_acceptee_kg ?? 0)
      map.set(key, cur)
    })
    return Array.from(map.values()).sort((a, b) =>
      a.market_name.localeCompare(b.market_name) || a.variety_code.localeCompare(b.variety_code)
    )
  }, [filtered])

  const toggleExcluded = (id: string) => {
    setExcluded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const selectedDispatches = useMemo(() => filtered.filter(d => !excluded.has(d.id)), [filtered, excluded])

  // Helper : clé combinée market×variety pour un dispatch
  const keyOf = (d: any) => `${d.market_id ?? '__none'}|${d.variety_id ?? '__none'}`

  // CA simulé
  const simulation = useMemo(() => {
    let totalCA = 0
    let totalKg = 0
    let count = 0
    selectedDispatches.forEach(d => {
      const prix = Number(pricesByMarket[keyOf(d)]) || 0
      if (prix <= 0) return
      const qtyA = Number(d.qty_acceptee_kg ?? 0)
      totalCA += Math.round(qtyA * prix * 100) / 100
      totalKg += qtyA
      count++
    })
    return { totalCA, totalKg, count }
  }, [selectedDispatches, pricesByMarket])

  const save = async () => {
    setErr('')
    const toUpdate = selectedDispatches.filter(d => Number(pricesByMarket[keyOf(d)]) > 0)
    if (toUpdate.length === 0) { setErr('Aucun envoi sélectionné avec un prix > 0.'); return }
    setSaving(true)
    try {
      let ok = 0
      for (const d of toUpdate) {
        const prix = Number(pricesByMarket[keyOf(d)])
        const qtyA = Number(d.qty_acceptee_kg ?? 0)
        const ca = Math.round(qtyA * prix * 100) / 100
        const { error } = await supabase.from('harvest_lots').update({
          price_per_kg: prix,
          ca_amount: ca,
          station_ref: stationRef.trim() || null,
          receipt_date: fin,
          periode_debut: debut,
          periode_fin: fin,
          certificate_number: String(qtyA),
          tri_status: 'priced',
        }).eq('id', d.id)
        if (!error) ok++
      }
      if (ok < toUpdate.length) setErr(`${ok}/${toUpdate.length} confirmés (autres en erreur).`)
      onDone()
    } catch (e: any) { setErr(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="📅 Tarifer par période" onClose={onClose} size="lg">
      <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--text-sub)' }}>
        Saisis un prix par marché pour appliquer en masse à tous les envois <strong>triés</strong> sur la période choisie.
      </div>

      <FormRow>
        <FormGroup label="Période début *"><Input type="date" value={debut} onChange={e => setDebut((e.target as any).value)} /></FormGroup>
        <FormGroup label="Période fin *"><Input type="date" value={fin} onChange={e => setFin((e.target as any).value)} /></FormGroup>
        <FormGroup label="Référence station / bordereau (optionnel)"><Input value={stationRef} onChange={e => setStationRef((e.target as any).value)} placeholder="STN-…" /></FormGroup>
      </FormRow>

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-2)', borderRadius: 8 }}>
          Aucun envoi trié sur cette période.
        </div>
      ) : (
        <>
          {/* Tableau prix par (marché × variété) */}
          <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 8, marginBottom: 4 }}>
            Prix par marché × variété — {filtered.length} envoi(s) sur {byKey.length} combinaison(s)
          </div>
          <div style={{ border: '1px solid var(--bd-1)', borderRadius: 6, overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead style={{ background: 'var(--bg-2)' }}>
                <tr>{['Marché', 'Variété', 'Envois', 'Total acceptée', 'Prix /kg', 'CA simulé'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {byKey.map(g => {
                  const prix = Number(pricesByMarket[g.key]) || 0
                  const ca = g.total_acceptee * prix
                  return (
                    <tr key={g.key} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>🌍 {g.market_name}</td>
                      <td style={td}>
                        <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600 }}>
                          {g.variety_code}
                        </span>
                        {g.variety_name && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-sub)' }}>{g.variety_name}</span>}
                      </td>
                      <td style={tdNum}>{g.rows.length}</td>
                      <td style={tdNum}>{fmt(g.total_acceptee)} kg</td>
                      <td style={td}>
                        <input type="number" step="0.01" placeholder="0.00"
                          value={pricesByMarket[g.key] ?? ''}
                          onChange={e => setPricesByMarket(s => ({ ...s, [g.key]: e.target.value }))}
                          style={{ width: 100, padding: '4px 6px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 4, fontSize: 12 }} />
                        <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--text-muted)' }}>{g.currency}</span>
                      </td>
                      <td style={{ ...tdNum, color: prix > 0 ? 'var(--neon)' : 'var(--text-muted)', fontWeight: prix > 0 ? 700 : 400 }}>
                        {prix > 0 ? fmt(ca) + ' MAD' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Détail dispatches (excludable) */}
          <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 14, marginBottom: 4 }}>
            Détail des envois (décoche pour exclure)
          </div>
          <div style={{ border: '1px solid var(--bd-1)', borderRadius: 6, overflow: 'auto', maxHeight: 240 }}>
            <table style={{ width: '100%', fontSize: 11.5 }}>
              <thead style={{ background: 'var(--bg-2)', position: 'sticky', top: 0 }}>
                <tr>{['', 'Lot', 'Date', 'Marché', 'Variété', 'Brute', 'Acceptée', 'CA'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const sel = !excluded.has(d.id)
                  const prix = Number(pricesByMarket[keyOf(d)]) || 0
                  const qtyA = Number(d.qty_acceptee_kg ?? 0)
                  const ca = qtyA * prix
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)', opacity: sel ? 1 : 0.4 }}>
                      <td style={td}>
                        <input type="checkbox" checked={sel} onChange={() => toggleExcluded(d.id)} />
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{d.lot_number}</td>
                      <td style={td}>{d.harvest_date}</td>
                      <td style={td}>{d.markets?.name ?? '—'}</td>
                      <td style={td}>
                        {d.varieties?.code
                          ? <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(168,85,247,.15)', color: '#a855f7', fontWeight: 600, fontSize: 10.5 }}>{d.varieties.code}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={tdNum}>{fmt(d.quantity_kg)}</td>
                      <td style={tdNum}>{fmt(qtyA)}</td>
                      <td style={{ ...tdNum, color: prix > 0 && sel ? 'var(--neon)' : 'var(--text-muted)' }}>
                        {prix > 0 && sel ? fmt(ca) + ' MAD' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Récap */}
          <div style={{ marginTop: 12, padding: 12, background: 'var(--neon-dim)', border: '1px solid var(--neon)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-main)' }}>
              <strong>{simulation.count}</strong> envoi(s) seront tarifés · <strong>{fmt(simulation.totalKg)} kg</strong> au total
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--neon)' }}>
              CA simulé : {fmt(simulation.totalCA)} MAD
            </div>
          </div>
        </>
      )}

      {err && <ErrorBox msg={err} />}
      <ModalFooter onCancel={onClose} onSave={save} loading={saving} saveLabel="APPLIQUER LES PRIX" disabled={simulation.count === 0} />
    </Modal>
  )
}

function AlerteModal({ form, setForm, saving, done, error, onClose, onSave }: any) {
  const f = (k: string) => (e: any) => setForm((s: any) => ({ ...s, [k]: e.target.value }))
  const { values: REASONS } = useReferenceList('no_harvest_reason')
  return (
    <Modal title="⚠ Journée sans récolte" onClose={onClose}>
      {done ? <SuccessMessage message="Alerte créée" /> : (
        <>
          <FormGroup label="Date *"><Input type="date" value={form.date} onChange={f('date')} /></FormGroup>
          <FormGroup label="Motif">
            <Select value={form.reason} onChange={f('reason')}>
              {REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Notes"><Textarea value={form.notes} onChange={f('notes')} /></FormGroup>
          {error && <ErrorBox msg={error} />}
          <ModalFooter onCancel={onClose} onSave={onSave} loading={saving} saveLabel="SIGNALER" disabled={!form.date} />
        </>
      )}
    </Modal>
  )
}

// ============================================================
// HELPERS UI
// ============================================================

function Table({ headers, rows, children, loading, empty }: { headers: React.ReactNode[]; rows: any[]; children: (r: any) => any; loading: boolean; empty: string }) {
  return (
    <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--bg-2)' }}>
          <tr>{headers.map((h, idx) => <th key={idx} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={headers.length} style={{ padding: 14, textAlign: 'center', color: 'var(--text-sub)' }}>Chargement…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={headers.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>{empty}</td></tr>}
          {!loading && rows.map(children)}
        </tbody>
      </table>
    </div>
  )
}

function KPI({ icon, label, value, sub, color }: { icon: string; label: string; value: any; sub: string; color: string }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10, borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-display)', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-sub)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ marginTop: 8, padding: 8, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12 }}>⚠ {msg}</div>
}

const th: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid var(--bd-1)' }
const td: React.CSSProperties = { padding: '7px 10px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '7px 10px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
