'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'liste' | 'sans_prix' | 'alertes'

/* ── Types ── */
type Dispatch = any
type Harvest  = any

/* ── Helpers ── */
const parseMeta = (notes: string | null) => {
  try { return JSON.parse(notes || '{}') } catch { return {} }
}

const dispatchStatut = (d: Dispatch) => {
  if (d.certificate_number && d.storage_temp !== null) return 'CONFIRMÉ'
  return 'EN ATTENTE'
}

const harvestStatut = (h: Harvest, disps: Dispatch[]) => {
  const hd = disps.filter(d => d.harvest_id === h.id)
  if (hd.length === 0) return 'RÉCOLTÉE'
  const confirmed = hd.filter(d => d.certificate_number)
  if (confirmed.length === 0) return 'DISPATCHÉE'
  if (confirmed.length < hd.length) return 'PARTIELLEMENT CONFIRMÉE'
  return 'CLÔTURÉE'
}

const statutStyle = (s: string) => {
  const map: Record<string, [string, string]> = {
    'RÉCOLTÉE':                ['#3d6b52', '#1a3526'],
    'DISPATCHÉE':              ['#00b4d8', '#00b4d818'],
    'PARTIELLEMENT CONFIRMÉE': ['#f5a623', '#f5a62318'],
    'CLÔTURÉE':                ['#00e87a', '#00e87a18'],
    'EN ATTENTE':              ['#f5a623', '#f5a62318'],
    'CONFIRMÉ':                ['#00e87a', '#00e87a18'],
  }
  const [color, bg] = map[s] || ['#3d6b52', '#1a3526']
  return { color, background: bg, border: `1px solid ${color}40` }
}

/* ══════════════════════════════════════════════════════════════ */
export default function RecoltesPage() {
  const [tab, setTab] = useState<Tab>('liste')
  const [harvests,   setHarvests]   = useState<Harvest[]>([])
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [plantings,  setPlantings]  = useState<any[]>([])
  const [markets,    setMarkets]    = useState<any[]>([])
  const [alertes,    setAlertes]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)

  /* Modales */
  const [modalNew,      setModalNew]      = useState(false)
  const [modalEdit,     setModalEdit]     = useState<Harvest | null>(null)
  const [modalDispatch, setModalDispatch] = useState<Harvest | null>(null) // étape 2
  const [modalConfirm,  setModalConfirm]  = useState<Dispatch | null>(null) // étape 3 individuel
  const [modalMasse,    setModalMasse]    = useState(false)
  const [modalAlerte,   setModalAlerte]   = useState(false)

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  /* Formulaires */
  const [formNew,  setFormNew]  = useState({ campaign_planting_id: '', harvest_date: '', total_qty: '', notes: '' })
  const [formEdit, setFormEdit] = useState<Record<string, any>>({})

  // Dispatch lines pour étape 2
  const [dispLines, setDispLines] = useState<{ market_id: string; qty: string }[]>([{ market_id: '', qty: '' }])

  // Confirmation prix individuelle (étape 3)
  const [formConfirm, setFormConfirm] = useState({ qty_acceptee: '', price_per_kg: '', station_ref: '', receipt_date: '' })

  // Masse
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massRows,    setMassRows]    = useState<Record<string, string>>({}) // dispatchId → qty_acceptee
  const [massPrice,   setMassPrice]   = useState('')
  const [massRef,     setMassRef]     = useState('')
  const [massDate,    setMassDate]    = useState('')

  // Alerte
  const [formAlerte, setFormAlerte] = useState({ date: '', reason: 'panne', notes: '' })

  /* ─── CHARGEMENT ─── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, d, p, m, al] = await Promise.all([
        supabase.from('harvests')
          .select('id, lot_number, harvest_date, total_qty, notes, campaign_planting_id, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
          .order('harvest_date', { ascending: false }).limit(300),
        supabase.from('harvest_lots')
          .select('id, lot_number, harvest_id, harvest_date, quantity_kg, certificate_number, storage_temp, notes, market_id, markets(name,currency)')
          .eq('category', 'station_dispatch')
          .order('created_at', { ascending: false }),
        supabase.from('campaign_plantings')
          .select('id, variety_id, greenhouse_id, greenhouses(code,name), varieties(commercial_name), campaigns(name)'),
        supabase.from('markets').select('id,name,currency,type').eq('is_active', true).order('name'),
        supabase.from('alerts').select('*').eq('type', 'no_harvest').order('created_at', { ascending: false }).limit(100),
      ])
      setHarvests((h.data || []) as any)
      setDispatches((d.data || []) as any)
      setPlantings(p.data || [])
      setMarkets(m.data || [])
      setAlertes(al.data || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ─── ÉTAPE 1 : CRÉER RÉCOLTE ─── */
  const saveNew = async () => {
    if (!formNew.campaign_planting_id || !formNew.harvest_date || !formNew.total_qty) return
    setSaving(true)
    try {
      const lot = `LOT-${formNew.harvest_date.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formNew.campaign_planting_id,
        harvest_date: formNew.harvest_date,
        total_qty: Number(formNew.total_qty),
        lot_number: lot,
        notes: formNew.notes || null,
        qty_category_1: 0, qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
      }).select('id, lot_number, harvest_date, total_qty, notes, campaign_planting_id, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))').single()
      if (error) throw error
      setHarvests(p => [data as any, ...p])
      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormNew({ campaign_planting_id: '', harvest_date: '', total_qty: '', notes: '' })
      }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  /* ─── ÉTAPE 1 : MODIFIER RÉCOLTE ─── */
  const openEdit = (h: Harvest) => {
    setFormEdit({
      campaign_planting_id: h.campaign_planting_id,
      harvest_date: h.harvest_date,
      total_qty: String(h.total_qty || ''),
      notes: h.notes || '',
    })
    setModalEdit(h)
  }

  const saveEdit = async () => {
    if (!modalEdit) return
    setSaving(true)
    try {
      const { error } = await supabase.from('harvests').update({
        campaign_planting_id: formEdit.campaign_planting_id,
        harvest_date: formEdit.harvest_date,
        total_qty: Number(formEdit.total_qty) || 0,
        notes: formEdit.notes || null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setHarvests(p => p.map(h => h.id === modalEdit.id
        ? { ...h, harvest_date: formEdit.harvest_date, total_qty: Number(formEdit.total_qty), notes: formEdit.notes || null }
        : h))
      setDone(true)
      setTimeout(() => { setModalEdit(null); setDone(false) }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const deleteRecolte = async (id: string, lot: string) => {
    if (!confirm(`Supprimer la récolte ${lot} ? Les dispatches associés seront aussi supprimés.`)) return
    await supabase.from('harvest_lots').delete().eq('harvest_id', id)
    await supabase.from('harvests').delete().eq('id', id)
    setHarvests(p => p.filter(h => h.id !== id))
    setDispatches(p => p.filter(d => d.harvest_id !== id))
  }

  /* ─── ÉTAPE 2 : DISPATCHER ─── */
  const openDispatch = (h: Harvest) => {
    setDispLines([{ market_id: '', qty: '' }])
    setModalDispatch(h)
    setDone(false)
  }

  const addDispLine = () => setDispLines(p => [...p, { market_id: '', qty: '' }])
  const rmDispLine  = (i: number) => setDispLines(p => p.filter((_, j) => j !== i))
  const upDispLine  = (i: number, k: string, v: string) => setDispLines(p => p.map((l, j) => j === i ? { ...l, [k]: v } : l))

  const saveDispatch = async () => {
    if (!modalDispatch) return
    const validLines = dispLines.filter(l => l.market_id && l.qty && Number(l.qty) > 0)
    if (validLines.length === 0) return
    setSaving(true)
    try {
      const cp = plantings.find(p => p.id === modalDispatch.campaign_planting_id)
      const newDisps: Dispatch[] = []
      for (const line of validLines) {
        const { data, error } = await supabase.from('harvest_lots').insert({
          lot_number:           `DISP-${modalDispatch.lot_number}-${line.market_id.slice(-4)}`,
          harvest_id:           modalDispatch.id,
          campaign_planting_id: modalDispatch.campaign_planting_id,
          harvest_date:         modalDispatch.harvest_date,
          quantity_kg:          Number(line.qty),
          category:             'station_dispatch',
          variety_id:           cp?.variety_id || null,
          greenhouse_id:        cp?.greenhouse_id || null,
          market_id:            line.market_id,
          certificate_number:   null,
          storage_temp:         null,
          notes:                null,
        }).select('id, lot_number, harvest_id, harvest_date, quantity_kg, certificate_number, storage_temp, notes, market_id, markets(name,currency)').single()
        if (error) throw error
        newDisps.push(data as any)
      }
      setDispatches((p:any) => [...newDisps, ...p])
      setDone(true)
      setTimeout(() => { setModalDispatch(null); setDone(false); setDispLines([{ market_id: '', qty: '' }]) }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  /* ─── ÉTAPE 3 : CONFIRMER PRIX (individuel) ─── */
  const openConfirm = (d: Dispatch) => {
    const meta = parseMeta(d.notes)
    setFormConfirm({
      qty_acceptee:  d.certificate_number ? String(d.certificate_number) : String(d.quantity_kg),
      price_per_kg:  meta.price_per_kg ? String(meta.price_per_kg) : '',
      station_ref:   meta.station_ref || '',
      receipt_date:  meta.receipt_date || '',
    })
    // storage_temp = ca local calculé pour affichage, pas en DB
    setModalConfirm(d)
    setDone(false)
  }

  const saveConfirm = async () => {
    if (!modalConfirm || !formConfirm.qty_acceptee || !formConfirm.price_per_kg) return
    setSaving(true)
    try {
      const qtyA  = Number(formConfirm.qty_acceptee)
      const prix  = Number(formConfirm.price_per_kg)
      const ca    = Math.round(qtyA * prix * 100) / 100
      const meta  = JSON.stringify({
        price_per_kg:  prix,
        ca_amount:     ca,
        station_ref:   formConfirm.station_ref || null,
        receipt_date:  formConfirm.receipt_date || null,
        price_set_at:  new Date().toISOString(),
      })
      const { error } = await supabase.from('harvest_lots').update({
        certificate_number: String(qtyA),
        notes:              meta,
      }).eq('id', modalConfirm.id)
      if (error) throw error
      // Mise à jour locale immédiate
      setDispatches(p => p.map(d => d.id === modalConfirm.id
        ? { ...d, certificate_number: String(qtyA), storage_temp: ca, notes: meta }
        : d))
      setDone(true)
      setTimeout(() => { setModalConfirm(null); setDone(false) }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  /* ─── ÉTAPE 3 : SAISIE EN MASSE ─── */
  const openMasse = () => {
    // Pré-remplir les quantités avec les qty envoyées
    const rows: Record<string, string> = {}
    sansPrix.forEach(d => { rows[d.id] = String(d.quantity_kg) })
    setMassRows(rows)
    setSelectedIds(new Set(sansPrix.map(d => d.id)))
    setMassPrice('')
    setMassRef('')
    setMassDate('')
    setModalMasse(true)
    setDone(false)
  }

  const saveMasse = async () => {
    if (!massPrice || selectedIds.size === 0) return
    setSaving(true)
    try {
      const prix = Number(massPrice)
      const updates: Dispatch[] = []
      for (const id of selectedIds) {
        const d = sansPrix.find(x => x.id === id)
        if (!d) continue
        const qtyA = Number(massRows[id] || d.quantity_kg)
        const ca   = Math.round(qtyA * prix * 100) / 100
        const meta = JSON.stringify({
          price_per_kg:  prix,
          ca_amount:     ca,
          station_ref:   massRef || null,
          receipt_date:  massDate || null,
          price_set_at:  new Date().toISOString(),
        })
        const { error } = await supabase.from('harvest_lots').update({
          certificate_number: String(qtyA),
          notes:              meta,
        }).eq('id', id)
        if (!error) updates.push({ ...d, certificate_number: String(qtyA), storage_temp: ca, notes: meta })
      }
      // Mise à jour locale immédiate
      setDispatches(p => p.map(d => {
        const u = updates.find(x => x.id === d.id)
        return u ? u : d
      }))
      setDone(true)
      setTimeout(() => {
        setModalMasse(false); setDone(false)
        setSelectedIds(new Set()); setMassRows({}); setMassPrice(''); setMassRef(''); setMassDate('')
      }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  /* ─── ALERTE JOURNÉE ─── */
  const saveAlerte = async () => {
    if (!formAlerte.date) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('alerts').insert({
        type: 'no_harvest', severity: 'warning',
        title:   `Journée sans récolte — ${formAlerte.date}`,
        message: `Motif: ${formAlerte.reason}${formAlerte.notes ? ' — ' + formAlerte.notes : ''}`,
        entity_type: 'harvest', is_read: false, is_resolved: false,
      }).select().single()
      if (error) throw error
      setAlertes(p => [data, ...p])
      setDone(true)
      setTimeout(() => { setModalAlerte(false); setDone(false); setFormAlerte({ date: '', reason: 'panne', notes: '' }) }, 1400)
    } catch (e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const resolveAlerte = async (id: string) => {
    await supabase.from('alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    setAlertes(p => p.map(a => a.id === id ? { ...a, is_resolved: true } : a))
  }

  /* ─── COMPUTED ─── */
  // Lire le CA depuis notes.ca_amount (storage_temp trop petit en DB)
  const getCA = (d: any) => d.storage_temp ?? parseMeta(d.notes).ca_amount ?? 0
  const sansPrix     = dispatches.filter(d => !d.certificate_number)
  const avecPrix     = dispatches.filter(d =>  d.certificate_number)
  const totalCA      = avecPrix.reduce((s, d) => s + getCA(d), 0)
  const totalKg      = harvests.reduce((s, h) => s + (h.total_qty || 0), 0)
  const activAlertes = alertes.filter(a => !a.is_resolved)

  // CA + invendus par marché
  const statParMarche: Record<string, { nom: string; qtyEnv: number; qtyAcc: number; ca: number; currency: string; sansPrix: number }> = {}
  for (const d of dispatches) {
    const mid = d.market_id || 'unknown'
    if (!statParMarche[mid]) statParMarche[mid] = { nom: d.markets?.name || '—', qtyEnv: 0, qtyAcc: 0, ca: 0, currency: d.markets?.currency || 'MAD', sansPrix: 0 }
    statParMarche[mid].qtyEnv += d.quantity_kg || 0
    statParMarche[mid].qtyAcc += d.certificate_number ? Number(d.certificate_number) : 0
    statParMarche[mid].ca     += getCA(d)
    if (!d.certificate_number) statParMarche[mid].sansPrix++
  }

  // Invendus par récolte
  const invendusParRecolte = (h: Harvest) => {
    const totalDisp = dispatches.filter(d => d.harvest_id === h.id).reduce((s, d) => s + (d.quantity_kg || 0), 0)
    return Math.max(0, (h.total_qty || 0) - totalDisp)
  }

  const toggleSel = (id: string) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const REASONS = [
    { value: 'panne',         label: 'Panne équipement' },
    { value: 'meteo',         label: 'Conditions météo' },
    { value: 'main_oeuvre',   label: 'Manque main d\'œuvre' },
    { value: 'stade_culture', label: 'Stade cultural' },
    { value: 'jour_repos',    label: 'Jour de repos' },
    { value: 'autre',         label: 'Autre' },
  ]

  /* ═══════════════════════════════ RENDU ═══════════════════════════════ */
  return (
    <div style={{ background: '#030a07', minHeight: '100vh' }}>

      {/* ══ MODALE NOUVELLE RÉCOLTE ══ */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation *">
              {plantings.length === 0
                ? <div style={{ padding: '10px', background: '#ff4d6d18', border: '1px solid #ff4d6d40', borderRadius: 7, color: '#ff4d6d', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>
                    ⚠ Aucune plantation — créez d'abord une campagne avec des plantations
                  </div>
                : <Select value={formNew.campaign_planting_id} onChange={e => setFormNew(f => ({ ...f, campaign_planting_id: e.target.value }))}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]
                      </option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Date de récolte *">
                <Input type="date" value={formNew.harvest_date} onChange={e => setFormNew(f => ({ ...f, harvest_date: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Quantité récoltée (kg) *">
                <Input type="number" value={formNew.total_qty} onChange={e => setFormNew(f => ({ ...f, total_qty: e.target.value }))} placeholder="ex: 500" autoFocus />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes qualité">
              <Textarea rows={2} value={formNew.notes} onChange={e => setFormNew(f => ({ ...f, notes: e.target.value }))} placeholder="Observations..." />
            </FormGroup>
            <div style={{ padding: '10px 14px', background: '#00b4d818', border: '1px solid #00b4d840', borderRadius: 7, fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#00b4d8', marginTop: 8 }}>
              ℹ Le dispatch par marché se fait à l'étape suivante
            </div>
            <ModalFooter onCancel={() => setModalNew(false)} onSave={saveNew} loading={saving}
              disabled={!formNew.campaign_planting_id || !formNew.harvest_date || !formNew.total_qty}
              saveLabel="ENREGISTRER LA RÉCOLTE" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE MODIFIER RÉCOLTE ══ */}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.lot_number}`} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message="Récolte modifiée !" /> : (<>
            <FormGroup label="Plantation">
              <Select value={formEdit.campaign_planting_id} onChange={e => setFormEdit(f => ({ ...f, campaign_planting_id: e.target.value }))}>
                {plantings.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormRow>
              <FormGroup label="Date de récolte">
                <Input type="date" value={formEdit.harvest_date} onChange={e => setFormEdit(f => ({ ...f, harvest_date: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Quantité récoltée (kg)">
                <Input type="number" value={formEdit.total_qty} onChange={e => setFormEdit(f => ({ ...f, total_qty: e.target.value }))} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formEdit.notes} onChange={e => setFormEdit(f => ({ ...f, notes: e.target.value }))} />
            </FormGroup>
            <ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE DISPATCH PAR MARCHÉ (ÉTAPE 2) ══ */}
      {modalDispatch && (
        <Modal title={`DISPATCHER — ${modalDispatch.lot_number}`} onClose={() => { setModalDispatch(null); setDone(false) }}>
          {done ? <SuccessMessage message="Dispatches créés !" /> : (<>
            {/* Résumé récolte */}
            <div style={{ padding: '12px 14px', background: '#0d1f14', border: '1px solid #1a3526', borderRadius: 8, marginBottom: 18 }}>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', letterSpacing: 1, marginBottom: 5 }}>RÉCOLTE</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: '#e8f5ee' }}>
                {modalDispatch.campaign_plantings?.greenhouses?.name} · {modalDispatch.campaign_plantings?.varieties?.commercial_name}
              </div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90', marginTop: 3 }}>
                {modalDispatch.harvest_date} · <strong style={{ color: '#00e87a' }}>{modalDispatch.total_qty} kg disponibles</strong>
              </div>
              {/* Dispatches déjà créés */}
              {dispatches.filter(d => d.harvest_id === modalDispatch.id).length > 0 && (
                <div style={{ marginTop: 8, fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#f5a623' }}>
                  Déjà dispatché : {dispatches.filter(d => d.harvest_id === modalDispatch.id).reduce((s, d) => s + d.quantity_kg, 0)} kg
                  · Invendus : {invendusParRecolte(modalDispatch)} kg
                </div>
              )}
            </div>

            <div className="section-label">ENVOI PAR MARCHÉ</div>
            {dispLines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div>
                  {i === 0 && <label className="form-label">Marché</label>}
                  <Select value={line.market_id} onChange={e => upDispLine(i, 'market_id', e.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {markets.map(m => <option key={m.id} value={m.id}>{m.name} ({m.currency})</option>)}
                  </Select>
                </div>
                <div>
                  {i === 0 && <label className="form-label">Qté (kg)</label>}
                  <Input type="number" value={line.qty} onChange={e => upDispLine(i, 'qty', e.target.value)} placeholder="0" />
                </div>
                <div style={{ paddingBottom: 1 }}>
                  {dispLines.length > 1
                    ? <button onClick={() => rmDispLine(i)} className="btn-danger" style={{ padding: '9px 8px', fontSize: 11 }}>✕</button>
                    : <div style={{ height: 36 }} />}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <button onClick={addDispLine} className="btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }}>+ Ajouter marché</button>
              {dispLines.reduce((s, l) => s + Number(l.qty || 0), 0) > 0 && (() => {
                const totalDisp  = dispLines.reduce((s, l) => s + Number(l.qty || 0), 0)
                const dejaDisp   = dispatches.filter(d => d.harvest_id === modalDispatch.id).reduce((s, d) => s + d.quantity_kg, 0)
                const totalFinal = totalDisp + dejaDisp
                const invendus   = Math.max(0, modalDispatch.total_qty - totalFinal)
                return (
                  <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90' }}>
                    Ce dispatch : <strong style={{ color: '#00e87a' }}>{totalDisp} kg</strong>
                    {invendus > 0 && <span style={{ color: '#f5a623' }}> · Invendus : {invendus} kg</span>}
                    {invendus === 0 && totalFinal > 0 && <span style={{ color: '#00e87a' }}> ✓ 100% dispatché</span>}
                  </div>
                )
              })()}
            </div>

            <ModalFooter onCancel={() => setModalDispatch(null)} onSave={saveDispatch} loading={saving}
              disabled={dispLines.every(l => !l.market_id || !l.qty)} saveLabel="CRÉER LES DISPATCHES" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE CONFIRMATION PRIX INDIVIDUELLE (ÉTAPE 3) ══ */}
      {modalConfirm && (
        <Modal title={modalConfirm.certificate_number ? "MODIFIER LA CONFIRMATION" : "CONFIRMER PRIX & QUANTITÉ"} onClose={() => { setModalConfirm(null); setDone(false) }}>
          {done ? <SuccessMessage message="Dispatch confirmé !" /> : (<>
            {/* Résumé */}
            <div style={{ padding: '12px 14px', background: '#0d1f14', border: '1px solid #1a3526', borderRadius: 8, marginBottom: 18 }}>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', letterSpacing: 1, marginBottom: 5 }}>DISPATCH</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: '#e8f5ee' }}>
                {modalConfirm.markets?.name} — {modalConfirm.harvest_date}
              </div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90', marginTop: 3 }}>
                Envoyé : <strong style={{ color: '#f5a623' }}>{modalConfirm.quantity_kg} kg</strong>
                {modalConfirm.certificate_number && (
                  <span style={{ marginLeft: 10, color: '#00e87a' }}>
                    · Confirmé précédemment : {modalConfirm.certificate_number} kg · CA : {Number(modalConfirm.storage_temp).toLocaleString('fr', { maximumFractionDigits: 2 })} {modalConfirm.markets?.currency}
                  </span>
                )}
              </div>
            </div>

            <FormRow>
              <FormGroup label="Quantité acceptée par l'acheteur (kg) *">
                <Input type="number" value={formConfirm.qty_acceptee}
                  onChange={e => setFormConfirm(f => ({ ...f, qty_acceptee: e.target.value }))}
                  placeholder={`max: ${modalConfirm.quantity_kg}`} autoFocus />
              </FormGroup>
              <FormGroup label="Prix / kg *">
                <Input type="number" step="0.001" value={formConfirm.price_per_kg}
                  onChange={e => setFormConfirm(f => ({ ...f, price_per_kg: e.target.value }))}
                  placeholder="ex: 1.850" />
              </FormGroup>
            </FormRow>

            {formConfirm.qty_acceptee && formConfirm.price_per_kg && Number(formConfirm.price_per_kg) > 0 && (
              <div style={{ padding: '10px 14px', background: '#00e87a18', border: '1px solid #00e87a40', borderRadius: 7, fontFamily: 'DM Mono,monospace', fontSize: 12, color: '#00e87a', marginBottom: 14 }}>
                → CA : <strong>{(Number(formConfirm.qty_acceptee) * Number(formConfirm.price_per_kg)).toLocaleString('fr', { maximumFractionDigits: 2 })} {modalConfirm.markets?.currency || 'MAD'}</strong>
                {Number(formConfirm.qty_acceptee) < modalConfirm.quantity_kg && (
                  <span style={{ color: '#f5a623', marginLeft: 12 }}>
                    ⚠ Rejet : {modalConfirm.quantity_kg - Number(formConfirm.qty_acceptee)} kg
                  </span>
                )}
              </div>
            )}

            <FormRow>
              <FormGroup label="Référence station">
                <Input value={formConfirm.station_ref} onChange={e => setFormConfirm(f => ({ ...f, station_ref: e.target.value }))} placeholder="ex: STAT-2026-0312" />
              </FormGroup>
              <FormGroup label="Date de réception">
                <Input type="date" value={formConfirm.receipt_date} onChange={e => setFormConfirm(f => ({ ...f, receipt_date: e.target.value }))} />
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={() => setModalConfirm(null)} onSave={saveConfirm} loading={saving}
              disabled={!formConfirm.qty_acceptee || !formConfirm.price_per_kg || Number(formConfirm.price_per_kg) <= 0}
              saveLabel="CONFIRMER LE DISPATCH" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE SAISIE EN MASSE (ÉTAPE 3) ══ */}
      {modalMasse && (
        <Modal title="CONFIRMATION EN MASSE — PRIX STATION" onClose={() => { setModalMasse(false); setDone(false) }} size="lg">
          {done ? <SuccessMessage message={`${selectedIds.size} dispatch(s) confirmés !`} /> : (<>

            <div className="section-label">PRIX COMMUN À TOUS LES DISPATCHES SÉLECTIONNÉS</div>
            <FormRow>
              <FormGroup label="Prix / kg *">
                <Input type="number" step="0.001" value={massPrice} onChange={e => setMassPrice(e.target.value)} placeholder="ex: 1.850" autoFocus />
              </FormGroup>
              <FormGroup label="Date de réception">
                <Input type="date" value={massDate} onChange={e => setMassDate(e.target.value)} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Référence station">
              <Input value={massRef} onChange={e => setMassRef(e.target.value)} placeholder="ex: STAT-2026-0325" />
            </FormGroup>

            <div className="section-label" style={{ marginTop: 16 }}>QUANTITÉS ACCEPTÉES PAR L'ACHETEUR (par dispatch)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <button onClick={() => setSelectedIds(new Set(sansPrix.map(d => d.id)))} className="btn-secondary" style={{ fontSize: 10, padding: '5px 10px' }}>TOUT SÉLECTIONNER</button>
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }}>EFFACER</button>
              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#3d6b52', marginLeft: 'auto' }}>
                {selectedIds.size}/{sansPrix.length} sélectionné(s)
              </span>
            </div>

            <div style={{ border: '1px solid #1a3526', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 120px', gap: 8, padding: '8px 14px', background: '#0a1810', borderBottom: '1px solid #1a3526' }}>
                {['', 'Dispatch / Marché', 'Envoyé (kg)', 'Accepté (kg)', 'CA estimé'].map((h, i) => (
                  <div key={i} style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', letterSpacing: 1 }}>{h}</div>
                ))}
              </div>
              {/* Lignes */}
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {sansPrix.length === 0
                  ? <div style={{ padding: 24, textAlign: 'center', fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#3d6b52' }}>Tous les dispatches ont un prix ✓</div>
                  : sansPrix.map(d => {
                    const sel = selectedIds.has(d.id)
                    const qtyA = Number(massRows[d.id] || d.quantity_kg)
                    const ca   = massPrice ? (qtyA * Number(massPrice)).toFixed(2) : '—'
                    return (
                      <div key={d.id}
                        style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 120px', gap: 8, padding: '10px 14px', borderBottom: '1px solid #1a3526', background: sel ? '#00e87a08' : 'transparent', alignItems: 'center' }}>
                        {/* Checkbox */}
                        <div onClick={() => toggleSel(d.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${sel ? '#00e87a' : '#1f4030'}`, background: sel ? '#00e87a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#030a07', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                          {sel ? '✓' : ''}
                        </div>
                        {/* Info */}
                        <div onClick={() => toggleSel(d.id)} style={{ cursor: 'pointer' }}>
                          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 12, fontWeight: 600, color: '#e8f5ee' }}>{d.markets?.name || '—'}</div>
                          <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', marginTop: 1 }}>{d.lot_number} · {d.harvest_date}</div>
                        </div>
                        {/* Envoyé */}
                        <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 600, color: '#f5a623' }}>{d.quantity_kg} kg</div>
                        {/* Accepté — saisie individuelle */}
                        <input
                          type="number"
                          className="form-input"
                          value={massRows[d.id] || String(d.quantity_kg)}
                          onChange={e => setMassRows(p => ({ ...p, [d.id]: e.target.value }))}
                          style={{ padding: '5px 8px', fontSize: 12 }}
                        />
                        {/* CA estimé */}
                        <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 12, fontWeight: 600, color: '#00e87a' }}>
                          {massPrice ? ca + ' ' + (d.markets?.currency || 'MAD') : '—'}
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </div>

            {/* Récap total */}
            {massPrice && selectedIds.size > 0 && (
              <div style={{ padding: '12px 14px', background: '#00e87a18', border: '1px solid #00e87a40', borderRadius: 7, fontFamily: 'DM Mono,monospace', fontSize: 12, color: '#00e87a', marginBottom: 14 }}>
                → CA total : <strong>
                  {sansPrix.filter(d => selectedIds.has(d.id))
                    .reduce((s, d) => s + Number(massRows[d.id] || d.quantity_kg) * Number(massPrice), 0)
                    .toLocaleString('fr', { maximumFractionDigits: 2 })} MAD
                </strong> sur {selectedIds.size} dispatch(s)
              </div>
            )}

            <ModalFooter onCancel={() => setModalMasse(false)} onSave={saveMasse} loading={saving}
              disabled={!massPrice || selectedIds.size === 0}
              saveLabel={`CONFIRMER ${selectedIds.size} DISPATCH(S)`} />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE ALERTE ══ */}
      {modalAlerte && (
        <Modal title="JOURNÉE SANS RÉCOLTE" onClose={() => { setModalAlerte(false); setDone(false) }}>
          {done ? <SuccessMessage message="Alerte enregistrée !" /> : (<>
            <div style={{ padding: '10px 14px', background: '#ff4d6d18', border: '1px solid #ff4d6d40', borderRadius: 7, fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#ff4d6d', marginBottom: 16 }}>
              ⚠ Cette journée sera marquée sans récolte dans les alertes.
            </div>
            <FormGroup label="Date *"><Input type="date" value={formAlerte.date} onChange={e => setFormAlerte(f => ({ ...f, date: e.target.value }))} autoFocus /></FormGroup>
            <FormGroup label="Motif">
              <Select value={formAlerte.reason} onChange={e => setFormAlerte(f => ({ ...f, reason: e.target.value }))}>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formAlerte.notes} onChange={e => setFormAlerte(f => ({ ...f, notes: e.target.value }))} placeholder="Précisions..." />
            </FormGroup>
            <ModalFooter onCancel={() => setModalAlerte(false)} onSave={saveAlerte} loading={saving} disabled={!formAlerte.date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ HEADER ══ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">
            {harvests.length} lot(s) · {(totalKg / 1000).toFixed(2)} t récoltées
            {totalCA > 0 && <> · CA confirmé : <strong style={{ color: '#00e87a' }}>{totalCA.toLocaleString('fr', { maximumFractionDigits: 0 })} MAD</strong></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModalAlerte(true)} style={{ fontSize: 11, color: '#ff4d6d', borderColor: '#ff4d6d40' }}>⚠ SANS RÉCOLTE</button>
          <button className="btn-primary" onClick={() => setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'Lots',        v: String(harvests.length),             c: '#00e87a' },
          { l: 'Récoltés',    v: (totalKg / 1000).toFixed(1) + ' t', c: '#00ffc8' },
          { l: 'Dispatches',  v: String(dispatches.length),           c: '#00b4d8' },
          { l: 'Sans prix',   v: String(sansPrix.length),             c: '#f5a623' },
          { l: 'CA confirmé', v: (totalCA / 1000).toFixed(1) + ' k MAD', c: '#9b5de5' },
          { l: 'Alertes',     v: String(activAlertes.length),         c: '#ff4d6d' },
        ].map((k, i) => (
          <div key={i} className="kpi" style={{ '--accent': k.c } as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{ color: k.c, fontSize: 20, textShadow: `0 0 12px ${k.c}50` }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* CA par marché */}
      {Object.keys(statParMarche).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, marginBottom: 16 }}>
          {Object.values(statParMarche).map((m, i) => (
            <div key={i} style={{ background: '#0a1810', border: `1px solid ${m.sansPrix > 0 ? '#f5a62340' : '#1a3526'}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 8.5, color: '#3d6b52', letterSpacing: 1, marginBottom: 5 }}>CA · {m.nom.toUpperCase()}</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: m.ca > 0 ? '#00e87a' : '#3d6b52', marginBottom: 2 }}>
                {m.ca > 0 ? m.ca.toLocaleString('fr', { maximumFractionDigits: 0 }) + ' ' + m.currency : '—'}
              </div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#7aab90' }}>
                {m.qtyEnv.toLocaleString('fr')} kg envoyés · {m.qtyAcc.toLocaleString('fr')} kg acceptés
              </div>
              {m.sansPrix > 0 && (
                <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#f5a623', marginTop: 3 }}>⚠ {m.sansPrix} sans prix</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ TABS ══ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {([['liste', 'RÉCOLTES', harvests.length], ['sans_prix', 'SANS PRIX', sansPrix.length], ['alertes', 'ALERTES', activAlertes.length]] as any[]).map(([t, l, c]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid', fontFamily: 'DM Mono,monospace', fontSize: 10, letterSpacing: .8, cursor: 'pointer', transition: 'all .15s', borderColor: tab === t ? '#00e87a' : '#1a3526', background: tab === t ? '#00e87a18' : 'transparent', color: tab === t ? '#00e87a' : '#3d6b52' }}>
            {l}
            {c > 0 && <span style={{ marginLeft: 6, background: t === 'alertes' ? '#ff4d6d' : t === 'sans_prix' ? '#f5a623' : '#00e87a', color: '#030a07', borderRadius: 10, padding: '1px 6px', fontSize: 8, fontWeight: 700 }}>{c}</span>}
          </button>
        ))}
        {tab === 'sans_prix' && sansPrix.length > 0 && (
          <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 10, padding: '7px 12px' }} onClick={openMasse}>⚡ CONFIRMATION EN MASSE</button>
        )}
      </div>

      {/* ══ CONTENU ══ */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#3d6b52', fontFamily: 'DM Mono,monospace', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT...</div>

      ) : tab === 'liste' ? (
        harvests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">Aucune récolte saisie</div>
            <button className="btn-primary" onClick={() => setModalNew(true)}>+ SAISIR RÉCOLTE</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  {['N° Lot', 'Date', 'Serre', 'Variété', 'Quantité', 'Invendus', 'Marchés', 'CA confirmé', 'Statut', 'Actions'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {harvests.map(h => {
                    const hDisps    = dispatches.filter(d => d.harvest_id === h.id)
                    const hCA       = hDisps.reduce((s, d) => s + getCA(d), 0)
                    const hMarchés  = [...new Set(hDisps.map(d => d.markets?.name).filter(Boolean))]
                    const hSansPrix = hDisps.filter(d => !d.certificate_number).length
                    const statut    = harvestStatut(h, dispatches)
                    const st        = statutStyle(statut)
                    const invendus  = invendusParRecolte(h)
                    return (
                      <tr key={h.id}>
                        <td><span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#00e87a' }}>{h.lot_number}</span></td>
                        <td><span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90' }}>{h.harvest_date}</span></td>
                        <td><span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 600, color: '#e8f5ee' }}>{h.campaign_plantings?.greenhouses?.name || '—'}</span></td>
                        <td><span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#3d6b52' }}>{h.campaign_plantings?.varieties?.commercial_name || '—'}</span></td>
                        <td><span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: '#00e87a' }}>{(h.total_qty || 0).toLocaleString('fr')} kg</span></td>
                        <td>
                          {invendus > 0
                            ? <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#f5a623' }}>{invendus.toLocaleString('fr')} kg</span>
                            : hDisps.length > 0 ? <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#00e87a' }}>✓ 0</span>
                            : <span style={{ color: '#1f4030', fontFamily: 'DM Mono,monospace', fontSize: 9 }}>—</span>
                          }
                        </td>
                        <td style={{ minWidth: 100 }}>
                          {hMarchés.length > 0
                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{hMarchés.map(m => <span key={m} className="tag tag-blue" style={{ fontSize: 8 }}>{m}</span>)}</div>
                            : <span style={{ color: '#1f4030', fontFamily: 'DM Mono,monospace', fontSize: 9 }}>non dispatché</span>
                          }
                        </td>
                        <td>
                          {hCA > 0
                            ? <span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 700, color: '#9b5de5' }}>{hCA.toLocaleString('fr', { maximumFractionDigits: 0 })} MAD</span>
                            : hSansPrix > 0
                              ? <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#f5a623' }}>⏳ {hSansPrix} en attente</span>
                              : <span style={{ color: '#1f4030', fontFamily: 'DM Mono,monospace', fontSize: 9 }}>—</span>
                          }
                        </td>
                        <td>
                          <span className="tag" style={{ ...st, fontSize: 8 }}>{statut}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => openDispatch(h)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 9, letterSpacing: 0 }} title="Dispatcher par marché">
                              📦 DISPATCH
                            </button>
                            <button onClick={() => openEdit(h)} className="btn-ghost" style={{ padding: '4px 7px', fontSize: 10 }} title="Modifier">✏️</button>
                            <button onClick={() => deleteRecolte(h.id, h.lot_number)} className="btn-danger" style={{ padding: '4px 7px', fontSize: 10 }} title="Supprimer">🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : tab === 'sans_prix' ? (
        sansPrix.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Tous les dispatches sont confirmés !</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #1a3526', display: 'flex', alignItems: 'center', gap: 12, background: '#f5a62308' }}>
              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#f5a623' }}>⚠ {sansPrix.length} DISPATCH(S) EN ATTENTE DE CONFIRMATION</span>
              <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 10, padding: '6px 12px' }} onClick={openMasse}>⚡ CONFIRMATION EN MASSE</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  {['Dispatch', 'Marché', 'Date récolte', 'Qté envoyée', 'Action'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sansPrix.map(d => (
                    <tr key={d.id}>
                      <td><span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#00e87a' }}>{d.lot_number}</span></td>
                      <td>
                        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 600, color: '#e8f5ee' }}>{d.markets?.name || '—'}</span>
                        <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', marginLeft: 5 }}>{d.markets?.currency}</span>
                      </td>
                      <td><span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90' }}>{d.harvest_date}</span></td>
                      <td><span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: '#f5a623' }}>{d.quantity_kg?.toLocaleString('fr')} kg</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openConfirm(d)} className="btn-primary" style={{ fontSize: 10, padding: '5px 10px' }}>⚡ CONFIRMER</button>
                          <button onClick={async () => { if (!confirm('Supprimer ce dispatch ?')) return; await supabase.from('harvest_lots').delete().eq('id', d.id); setDispatches(p => p.filter(x => x.id !== d.id)) }} className="btn-danger" style={{ padding: '5px 8px', fontSize: 10 }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : (
        /* ── ALERTES ── */
        <div>
          {activAlertes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {activAlertes.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#ff4d6d12', border: '1px solid #ff4d6d30', borderRadius: 8 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 700, color: '#ff4d6d' }}>{a.title}</div>
                    <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: '#7aab90', marginTop: 2 }}>{a.message}</div>
                  </div>
                  <button onClick={() => resolveAlerte(a.id)} className="btn-ghost" style={{ fontSize: 10, padding: '5px 10px', color: '#00e87a', borderColor: '#00e87a40', flexShrink: 0 }}>✓ RÉSOUDRE</button>
                </div>
              ))}
            </div>
          )}
          {alertes.filter(a => a.is_resolved).length > 0 && (
            <>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52', letterSpacing: 1, marginBottom: 8 }}>ALERTES RÉSOLUES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {alertes.filter(a => a.is_resolved).map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: '#0a1810', border: '1px solid #1a3526', borderRadius: 8, opacity: .6 }}>
                    <span style={{ fontSize: 12, color: '#00e87a' }}>✓</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 12, color: '#7aab90' }}>{a.title}</div>
                      <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: '#3d6b52' }}>{a.message}</div>
                    </div>
                    <span className="tag tag-green" style={{ fontSize: 8 }}>RÉSOLU</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {alertes.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <div className="empty-title">Aucune alerte</div>
              <button className="btn-ghost" onClick={() => setModalAlerte(true)} style={{ color: '#ff4d6d', borderColor: '#ff4d6d40', fontSize: 11 }}>⚠ SIGNALER UNE JOURNÉE SANS RÉCOLTE</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
