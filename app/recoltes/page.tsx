'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

// ============================================================
// Page Récoltes — workflow unifié (CRUD + Cycle station)
// Onglets : Récoltes | À envoyer | À trier | À tarifer | Confirmés | Alertes
// ============================================================

type Tab = 'liste' | 'a_envoyer' | 'a_trier' | 'a_tarifer' | 'confirmes' | 'stock_retour' | 'alertes'

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
  const [tab, setTab] = useState<Tab>('liste')
  const [harvests, setHarvests] = useState<any[]>([])
  const [stockRetour, setStockRetour] = useState<any[]>([])
  const [dispatches, setDispatches] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [markets, setMarkets] = useState<any[]>([])
  const [alertes, setAlertes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Modals ───
  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [modalCompose, setModalCompose] = useState(false)
  const [modalTri, setModalTri] = useState<any>(null)
  const [modalPrice, setModalPrice] = useState<any>(null)
  const [modalPeriodPrice, setModalPeriodPrice] = useState(false)
  const [modalAlerte, setModalAlerte] = useState(false)

  // ─── Form: nouvelle récolte ───
  const [formNew, setFormNew] = useState({ campaign_planting_id: '', harvest_date: '', total_qty: '', notes: '' })
  const [formEdit, setFormEdit] = useState<Record<string, any>>({})
  const [formAlerte, setFormAlerte] = useState({ date: '', reason: 'panne_irrigation', notes: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // ─── Chargement ───
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const [hRes, dRes, sRes, pRes, mRes, alRes, srRes] = await Promise.all([
        supabase.from('harvests')
          .select('id, lot_number, harvest_date, total_qty, notes, campaign_planting_id, campaign_plantings(*, greenhouses(code, name), varieties(commercial_name, code), campaigns(name))')
          .order('harvest_date', { ascending: false })
          .limit(300),
        supabase.from('harvest_lots')
          .select('id, lot_number, harvest_id, harvest_date, quantity_kg, market_id, markets(name, currency), variety_id, varieties(code, commercial_name), tri_status, freinte_pct, ecart_pct, qty_nette_kg, qty_acceptee_kg, price_per_kg, ca_amount, station_ref, certificate_number, notes, destination_rejet, rejet_qty_kg, parent_dispatch_id, campaign_planting_id, greenhouse_id, category')
          .eq('category', 'station_dispatch')
          .gte('harvest_date', since30)
          .order('harvest_date', { ascending: false }),
        supabase.from('harvest_lot_sources')
          .select('harvest_lot_id, harvest_id, qty_contributed_kg, harvests(lot_number, harvest_date)'),
        supabase.from('campaign_plantings').select('id, variety_id, greenhouse_id, greenhouses(code, name), varieties(commercial_name, code), campaigns(name)'),
        supabase.from('markets').select('id, code, name, currency, type').eq('is_active', true).order('name'),
        supabase.from('alerts').select('*').eq('type', 'no_harvest').order('created_at', { ascending: false }).limit(100),
        // Stock de retour : lots créés via tri (destination = retour_stock) pas encore consommés
        supabase.from('harvest_lots')
          .select('id, lot_number, harvest_date, quantity_kg, variety_id, varieties(code, commercial_name), greenhouse_id, parent_dispatch_id, tri_status, notes')
          .eq('category', 'stock_retour')
          .eq('tri_status', 'pending')
          .order('harvest_date', { ascending: false }),
      ])
      if (hRes.error) throw hRes.error
      setHarvests(hRes.data ?? [])
      setDispatches(dRes.data ?? [])
      setSources(sRes.data ?? [])
      setPlantings(pRes.data ?? [])
      setMarkets(mRes.data ?? [])
      setAlertes(alRes.data ?? [])
      setStockRetour(srRes.data ?? [])
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

  // Filtres par tab
  const aEnvoyer = useMemo(() => harvestsEnriched.filter(h => h.remaining_kg > 0.01), [harvestsEnriched])
  const aTrier = useMemo(() => dispatchesEnriched.filter(d => (d.tri_status ?? 'pending') === 'pending'), [dispatchesEnriched])
  const aTarifer = useMemo(() => dispatchesEnriched.filter(d => d.tri_status === 'tried'), [dispatchesEnriched])
  const confirmes = useMemo(() => dispatchesEnriched.filter(d => d.tri_status === 'priced'), [dispatchesEnriched])
  const alertesActives = useMemo(() => alertes.filter(a => !a.is_resolved), [alertes])

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

  // ─── CRUD récolte ───
  const saveNew = async () => {
    if (!formNew.campaign_planting_id || !formNew.harvest_date || !formNew.total_qty) return
    setSaving(true); setError('')
    try {
      const lot = `LOT-${formNew.harvest_date.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
      const { error } = await supabase.from('harvests').insert({
        campaign_planting_id: formNew.campaign_planting_id,
        harvest_date: formNew.harvest_date,
        qty_category_1: Number(formNew.total_qty) || 0,
        qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
        lot_number: lot,
        notes: formNew.notes || null,
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalNew(false); setDone(false); setFormNew({ campaign_planting_id: '', harvest_date: '', total_qty: '', notes: '' }); load() }, 1000)
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
      const { error } = await supabase.from('harvests').update({
        campaign_planting_id: formEdit.campaign_planting_id,
        harvest_date: formEdit.harvest_date,
        qty_category_1: Number(formEdit.total_qty) || 0,
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

  // ─── Suppression en masse ───
  const bulkDeleteRecoltes = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`Supprimer ${ids.length} récolte(s) ? Les envois associés (si applicable) seront aussi supprimés. Cette action est irréversible.`)) return
    let okCount = 0
    let errCount = 0
    for (const id of ids) {
      try {
        await supabase.from('harvest_lot_sources').delete().eq('harvest_id', id)
        await supabase.from('harvest_lots').delete().eq('harvest_id', id)
        const { error } = await supabase.from('harvests').delete().eq('id', id)
        if (error) errCount++
        else okCount++
      } catch (e) {
        console.error('[bulkDelete] harvest', id, e)
        errCount++
      }
    }
    if (errCount === 0) {
      alert(`✅ ${okCount} récolte(s) supprimée(s)`)
    } else {
      alert(`${okCount} supprimée(s), ${errCount} erreur(s) — voir console`)
    }
    load()
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--bd-1)', marginBottom: 14, overflowX: 'auto' }}>
        {([
          ['liste', '📋 Récoltes', kpis.lots],
          ['a_envoyer', '🚚 À envoyer', aEnvoyer.length],
          ['a_trier', '📦 À trier', aTrier.length],
          ['a_tarifer', '🔬 À tarifer', aTarifer.length],
          ['confirmes', '✅ Confirmés', confirmes.length],
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
      {tab === 'liste' && <ListeTab harvests={harvestsEnriched} onEdit={openEdit} onDelete={deleteRecolte} onBulkDelete={bulkDeleteRecoltes} loading={loading} />}
      {tab === 'a_envoyer' && <AEnvoyerTab harvests={aEnvoyer} onBulkDelete={bulkDeleteRecoltes} loading={loading} />}
      {tab === 'a_trier' && <ATrierTab dispatches={aTrier} onPick={d => setModalTri(d)} loading={loading} />}
      {tab === 'a_tarifer' && <ATariferTab dispatches={aTarifer} onPick={d => setModalPrice(d)} onOpenPeriod={() => setModalPeriodPrice(true)} loading={loading} />}
      {tab === 'confirmes' && <ConfirmesTab dispatches={confirmes} loading={loading} />}
      {tab === 'stock_retour' && <StockRetourTab lots={stockRetour} onReload={load} loading={loading} />}
      {tab === 'alertes' && <AlertesTab alertes={alertesActives} onResolve={resolveAlerte} loading={loading} />}

      {/* Modals */}
      {modalNew && (
        <NewHarvestModal
          form={formNew} setForm={setFormNew} plantings={plantings} saving={saving} done={done} error={error}
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

function ListeTab({ harvests, onEdit, onDelete, onBulkDelete, loading }: { harvests: any[]; onEdit: (h: any) => void; onDelete: (h: any) => void; onBulkDelete: (ids: string[]) => void; loading: boolean }) {
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
          'Lot', 'Date', 'Serre / Variété', 'Total', 'Engagé', 'Restant', 'Actions',
        ] as any}
        loading={loading}
        empty="Aucune récolte. Cliquer + Saisir récolte."
        rows={harvests}>
        {(h: any) => (
          <tr key={h.id} style={{
            borderBottom: '1px solid var(--bd-1)',
            background: selected.has(h.id) ? 'color-mix(in srgb, var(--red) 5%, transparent)' : undefined,
          }}>
            <td style={{ ...td, width: 32 }}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}
                style={{ cursor: 'pointer', width: 16, height: 16 }} />
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
            style={{ cursor: 'pointer', width: 16, height: 16 }} title="Tout sélectionner" />,
          'Lot récolte', 'Date', 'Serre / Variété', 'Total', 'Engagé', 'Disponible',
        ] as any}
        loading={loading}
        empty="Toutes les récoltes sont engagées dans un envoi ✓"
        rows={harvests}>
        {(h: any) => (
          <tr key={h.id} style={{
            borderBottom: '1px solid var(--bd-1)',
            background: selected.has(h.id) ? 'color-mix(in srgb, var(--red) 5%, transparent)' : undefined,
          }}>
            <td style={{ ...td, width: 32 }}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}
                style={{ cursor: 'pointer', width: 16, height: 16 }} />
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

function ATariferTab({ dispatches, onPick, onOpenPeriod, loading }: { dispatches: any[]; onPick: (d: any) => void; onOpenPeriod: () => void; loading: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-sub)' }}>
          Envois <strong>triés</strong>, en attente du <strong>prix /kg</strong> pour confirmer le CA.
        </div>
        <button onClick={onOpenPeriod} disabled={dispatches.length === 0} className="btn-ghost" style={{ fontSize: 11.5, padding: '6px 12px', color: '#a855f7', borderColor: 'color-mix(in srgb,#a855f7 30%,transparent)' }}>
          📅 TARIF PAR PÉRIODE
        </button>
      </div>
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

function NewHarvestModal({ form, setForm, plantings, saving, done, error, onClose, onSave }: any) {
  const f = (k: string) => (e: any) => setForm((s: any) => ({ ...s, [k]: e.target.value }))
  return (
    <Modal title="🌿 Saisir une récolte" onClose={onClose}>
      {done ? <SuccessMessage message="Récolte créée" /> : (
        <>
          <FormGroup label="Plantation *">
            <Select value={form.campaign_planting_id} onChange={f('campaign_planting_id')}>
              <option value="">— sélectionner —</option>
              {plantings.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.greenhouses?.code} · {p.varieties?.commercial_name} ({p.campaigns?.name ?? '?'})
                </option>
              ))}
            </Select>
          </FormGroup>
          <FormRow>
            <FormGroup label="Date récolte *"><Input type="date" value={form.harvest_date} onChange={f('harvest_date')} /></FormGroup>
            <FormGroup label="Quantité (kg) *"><Input type="number" value={form.total_qty} onChange={f('total_qty')} placeholder="150" /></FormGroup>
          </FormRow>
          <FormGroup label="Notes"><Textarea value={form.notes} onChange={f('notes')} placeholder="Optionnel" /></FormGroup>
          {error && <ErrorBox msg={error} />}
          <ModalFooter onCancel={onClose} onSave={onSave} loading={saving} saveLabel="CRÉER" disabled={!form.campaign_planting_id || !form.harvest_date || !form.total_qty} />
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
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [marketId, setMarketId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const total = Object.values(picks).reduce((s, v) => s + v, 0)

  const updateQty = (h: any, qtyStr: string) => {
    setErr('')
    const q = Number(qtyStr.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) {
      setPicks(s => { const n = { ...s }; delete n[h.id]; return n })
      return
    }
    if (q > h.remaining_kg + 0.01) { setErr(`${h.lot_number} : max ${fmt(h.remaining_kg)} kg`); return }
    setPicks(s => ({ ...s, [h.id]: q }))
  }
  const fillAll = (h: any) => updateQty(h, String(h.remaining_kg))

  const save = async () => {
    setErr('')
    const entries = Object.entries(picks).filter(([, q]) => q > 0)
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
        Sélectionne 1 ou plusieurs récoltes et la quantité contribuée par chacune. Choisis le marché de destination.
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
            <tr>{['Lot', 'Date', 'Serre/Var', 'Dispo', 'Qté à inclure', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {harvests.map(h => (
              <tr key={h.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{h.lot_number}</td>
                <td style={td}>{h.harvest_date}</td>
                <td style={{ ...td, fontSize: 11 }}>{h.campaign_plantings?.greenhouses?.code} / {h.campaign_plantings?.varieties?.code}</td>
                <td style={tdNum}>{fmt(h.remaining_kg)}</td>
                <td style={td}>
                  <input type="number" placeholder="0" min={0} max={h.remaining_kg}
                    value={picks[h.id] ?? ''}
                    onChange={e => updateQty(h, e.target.value)}
                    style={{ width: 90, padding: '4px 6px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 4, fontSize: 12 }} />
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
              Total envoi : <strong style={{ color: 'var(--neon)', fontSize: 14 }}>{fmt(total)} kg</strong> sur {Object.keys(picks).length} récolte(s)
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
  const [destination, setDestination] = useState<'destruction' | 'retour_stock' | 'vente_industrie' | 'dons'>(
    (dispatch.destination_rejet ?? 'destruction') as any
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fr = Number(freinte) || 0
  const ec = Number(ecart) || 0
  const qtyB = Number(dispatch.quantity_kg)
  const qtyN = Math.round(qtyB * (1 - fr / 100) * 100) / 100
  const qtyA = Math.round(qtyN * (1 - ec / 100) * 100) / 100
  const qtyRejet = Math.round((qtyB - qtyA) * 100) / 100  // freinte + écart en kg

  const destinationLabel: Record<string, { label: string; desc: string; color: string; icon: string }> = {
    destruction:     { label: 'Destruction',      desc: 'Perte sèche — produit non récupérable', color: 'var(--red)',    icon: '🗑️' },
    retour_stock:    { label: 'Retour au stock',  desc: 'Ré-envoi possible vers un autre marché (souk local, etc.)', color: 'var(--neon)',  icon: '🔄' },
    vente_industrie: { label: 'Vente industrie',  desc: 'Vendu direct prix réduit (transformation, jus, conserve)', color: 'var(--amber)', icon: '🏭' },
    dons:            { label: 'Dons',             desc: 'Banque alimentaire, associations', color: '#a855f7',  icon: '🤝' },
  }

  const save = async () => {
    setErr('')
    if (fr < 0 || fr > 100 || ec < 0 || ec > 100) { setErr('Freinte et écart entre 0 et 100.'); return }
    if (fr + ec >= 100) { setErr('Freinte + écart ≥ 100% (rien d\'accepté).'); return }
    setSaving(true)
    try {
      // 1. Update le dispatch original
      const { error } = await supabase.from('harvest_lots').update({
        freinte_pct: fr, ecart_pct: ec, qty_nette_kg: qtyN, qty_acceptee_kg: qtyA,
        rejet_qty_kg: qtyRejet, destination_rejet: destination,
        tri_status: 'tried',
      }).eq('id', dispatch.id)
      if (error) throw error

      // 2. Si retour_stock : créer le harvest_lot enfant disponible pour ré-envoi
      if (destination === 'retour_stock' && qtyRejet > 0) {
        const childLotNumber = `${dispatch.lot_number}-RETOUR`
        const { error: childErr } = await supabase.from('harvest_lots').insert({
          lot_number: childLotNumber,
          harvest_id: dispatch.harvest_id ?? null,
          campaign_planting_id: dispatch.campaign_planting_id ?? null,
          harvest_date: dispatch.harvest_date ?? new Date().toISOString().slice(0, 10),
          quantity_kg: qtyRejet,
          variety_id: dispatch.variety_id ?? null,
          greenhouse_id: dispatch.greenhouse_id ?? null,
          category: 'stock_retour',
          parent_dispatch_id: dispatch.id,
          tri_status: 'pending',
          destination_rejet: null,  // pas applicable pour stock_retour lui-même
          notes: `Retour stock issu du dispatch ${dispatch.lot_number} (${qtyRejet} kg rejetés au tri)`,
        })
        if (childErr) {
          console.warn('[tri] Création lot stock_retour échouée :', childErr)
          // On continue : l'erreur ne doit pas bloquer la sauvegarde du tri principal
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
          Brute × (1 − {fr}%) = <strong>Nette {fmt(qtyN)} kg</strong><br/>
          Nette × (1 − {ec}%) = <strong style={{ color: 'var(--neon)' }}>Acceptée {fmt(qtyA)} kg</strong><br/>
          Brute − Acceptée = <strong style={{ color: 'var(--amber)' }}>Rejet {fmt(qtyRejet)} kg</strong>
        </div>
      </div>

      {/* Sélecteur destination du rejet */}
      {qtyRejet > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, fontWeight: 700 }}>
            🎯 Destination du rejet ({fmt(qtyRejet)} kg)
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
  return (
    <Modal title="⚠ Journée sans récolte" onClose={onClose}>
      {done ? <SuccessMessage message="Alerte créée" /> : (
        <>
          <FormGroup label="Date *"><Input type="date" value={form.date} onChange={f('date')} /></FormGroup>
          <FormGroup label="Motif">
            <Select value={form.reason} onChange={f('reason')}>
              <option value="panne_irrigation">Panne d'irrigation</option>
              <option value="meteo">Météo défavorable</option>
              <option value="main_oeuvre">Manque de main d'œuvre</option>
              <option value="maladie">Maladie / phytopathologie</option>
              <option value="maintenance">Maintenance</option>
              <option value="autre">Autre</option>
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

function Table({ headers, rows, children, loading, empty }: { headers: string[]; rows: any[]; children: (r: any) => any; loading: boolean; empty: string }) {
  return (
    <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--bg-2)' }}>
          <tr>{headers.map(h => <th key={h} style={th}>{h}</th>)}</tr>
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
