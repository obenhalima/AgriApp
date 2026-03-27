'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

// ─── Types ───────────────────────────────────────────
interface Harvest {
  id: string
  lot_number: string
  harvest_date: string
  qty_category_1: number
  qty_category_2: number
  qty_category_3: number
  qty_waste: number
  notes: string | null
  campaign_plantings: {
    greenhouses: { code: string; name: string }
    varieties: { commercial_name: string }
    campaigns: { name: string }
  } | null
  // Prix station stocké dans harvest_lots
  station_lot?: {
    id: string
    quantity_kg: number
    notes: string | null  // JSON: {price_per_kg, station_ref, receipt_date, amount_total}
  } | null
}

// ─── Helpers ──────────────────────────────────────────
function parseStationNotes(notes: string | null): { price_per_kg?: number; station_ref?: string; receipt_date?: string; amount_total?: number } {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return {} }
}

function hasPrice(h: Harvest): boolean {
  if (!h.station_lot) return false
  const p = parseStationNotes(h.station_lot.notes)
  return !!p.price_per_kg
}

// ─── Page ─────────────────────────────────────────────
export default function RecoltesPage() {
  const [harvests, setHarvests]     = useState<Harvest[]>([])
  const [plantings, setPlantings]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'all' | 'sans_prix'>('all')

  // Modaux
  const [modalNew, setModalNew]     = useState(false)
  const [modalPrix, setModalPrix]   = useState<Harvest | null>(null)
  const [modalMasse, setModalMasse] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [done, setDone]             = useState(false)

  // Formulaire nouvelle récolte
  const [formNew, setFormNew] = useState({
    campaign_planting_id: '', harvest_date: '',
    qty_category_1: '', qty_category_2: '', qty_category_3: '', qty_waste: '',
    qty_sent_station: '',
    station_ref: '', notes: ''
  })
  const sN = (k: string) => (e: any) => setFormNew(f => ({ ...f, [k]: e.target.value }))

  // Formulaire prix unitaire
  const [formPrix, setFormPrix] = useState({ price_per_kg: '', station_ref: '', receipt_date: '' })
  const sP = (k: string) => (e: any) => setFormPrix(f => ({ ...f, [k]: e.target.value }))

  // Saisie en masse
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [massePrix, setMassePrix]   = useState('')
  const [masseRef, setMasseRef]     = useState('')
  const [masseDate, setMasseDate]   = useState('')
  const [masseSaving, setMasseSaving] = useState(false)

  // ── Chargement ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const [hr, pl] = await Promise.all([
      supabase.from('harvests')
        .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
        .order('harvest_date', { ascending: false }).limit(200),
      supabase.from('campaign_plantings')
        .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)')
    ])
    const rawHarvests: Harvest[] = (hr.data || []) as Harvest[]

    // Charger les harvest_lots (envois station) liés
    if (rawHarvests.length > 0) {
      const ids = rawHarvests.map(h => h.id)
      const { data: lots } = await supabase.from('harvest_lots')
        .select('id, harvest_id, quantity_kg, notes')
        .in('harvest_id', ids)
        .eq('category', 'station')

      const lotMap: Record<string, any> = {}
      for (const lot of (lots || [])) {
        lotMap[lot.harvest_id] = lot
      }
      rawHarvests.forEach(h => { h.station_lot = lotMap[h.id] || null })
    }

    setHarvests(rawHarvests)
    setPlantings(pl.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Créer récolte ────────────────────────────────────
  const saveNew = async () => {
    if (!formNew.campaign_planting_id || !formNew.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data: harvest, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formNew.campaign_planting_id,
        harvest_date:    formNew.harvest_date,
        qty_category_1:  Number(formNew.qty_category_1) || 0,
        qty_category_2:  Number(formNew.qty_category_2) || 0,
        qty_category_3:  Number(formNew.qty_category_3) || 0,
        qty_waste:       Number(formNew.qty_waste) || 0,
        lot_number:      lot,
        notes:           formNew.notes || null,
      }).select().single()
      if (error) throw error

      // Si quantité envoyée station, créer un harvest_lot
      if (formNew.qty_sent_station && Number(formNew.qty_sent_station) > 0) {
        await supabase.from('harvest_lots').insert({
          harvest_id:         harvest.id,
          lot_number:         `STATION-${lot}`,
          harvest_date:       formNew.harvest_date,
          quantity_kg:        Number(formNew.qty_sent_station),
          category:           'station',
          campaign_planting_id: formNew.campaign_planting_id,
          notes: JSON.stringify({
            station_ref: formNew.station_ref || null,
            price_per_kg: null,
            receipt_date: null,
            amount_total: null,
          }),
        })
      }

      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormNew({ campaign_planting_id:'', harvest_date:'', qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'', qty_sent_station:'', station_ref:'', notes:'' })
        load()
      }, 1400)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  // ── Saisir prix (unitaire) ───────────────────────────
  const savePrix = async () => {
    if (!modalPrix || !formPrix.price_per_kg) return
    setSaving(true)
    try {
      const h = modalPrix
      const qte = h.station_lot?.quantity_kg || 0
      const prix = Number(formPrix.price_per_kg)
      const total = qte * prix
      const newNotes = JSON.stringify({
        price_per_kg:  prix,
        station_ref:   formPrix.station_ref || parseStationNotes(h.station_lot?.notes || null).station_ref,
        receipt_date:  formPrix.receipt_date || null,
        amount_total:  total,
      })

      if (h.station_lot) {
        // Mettre à jour le lot existant
        const { error } = await supabase.from('harvest_lots')
          .update({ notes: newNotes })
          .eq('id', h.station_lot.id)
        if (error) throw error
      } else {
        // Créer un nouveau lot station
        const { error } = await supabase.from('harvest_lots').insert({
          harvest_id:   h.id,
          lot_number:   `STATION-${h.lot_number}`,
          harvest_date: h.harvest_date,
          quantity_kg:  0,
          category:     'station',
          campaign_planting_id: h.campaign_plantings ? undefined : undefined,
          notes: newNotes,
        })
        if (error) throw error
      }

      setDone(true)
      setTimeout(() => {
        setModalPrix(null); setDone(false)
        setFormPrix({ price_per_kg:'', station_ref:'', receipt_date:'' })
        load()
      }, 1400)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  // ── Saisie en masse ──────────────────────────────────
  const saveMasse = async () => {
    if (selected.size === 0 || !massePrix) return
    setMasseSaving(true)
    try {
      const prix = Number(massePrix)
      for (const harvestId of selected) {
        const h = harvests.find(x => x.id === harvestId)
        if (!h) continue
        const qte = h.station_lot?.quantity_kg || (h.qty_category_1 + h.qty_category_2)
        const newNotes = JSON.stringify({
          price_per_kg:  prix,
          station_ref:   masseRef || parseStationNotes(h.station_lot?.notes || null).station_ref,
          receipt_date:  masseDate || null,
          amount_total:  qte * prix,
        })

        if (h.station_lot) {
          await supabase.from('harvest_lots').update({ notes: newNotes }).eq('id', h.station_lot.id)
        } else {
          await supabase.from('harvest_lots').insert({
            harvest_id:   h.id,
            lot_number:   `STATION-${h.lot_number}`,
            harvest_date: h.harvest_date,
            quantity_kg:  qte,
            category:     'station',
            notes:        newNotes,
          })
        }
      }
      setSelected(new Set())
      setMassePrix(''); setMasseRef(''); setMasseDate('')
      setModalMasse(false)
      load()
    } catch(e: any) { alert('Erreur masse: ' + e.message) }
    setMasseSaving(false)
  }

  // ── Filtres ──────────────────────────────────────────
  const sansPrix  = harvests.filter(h => !hasPrice(h))
  const displayed = tab === 'sans_prix' ? sansPrix : harvests

  const totalKg    = harvests.reduce((s,h)=>s+(h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0),0)
  const totalSent  = harvests.reduce((s,h)=>s+(h.station_lot?.quantity_kg||0),0)
  const totalCA    = harvests.reduce((s,h)=>{
    const p=parseStationNotes(h.station_lot?.notes||null); return s+(p.amount_total||0)
  },0)

  // ─────────────────────────────────────────────────────
  return (
    <div style={{ background:'#030a07', minHeight:'100vh' }}>

      {/* ── Modal Nouvelle Récolte ── */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <div className="section-label">IDENTIFICATION</div>
            <FormGroup label="Plantation / Serre *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation — créez d'abord une plantation</div>
                : <Select value={formNew.campaign_planting_id} onChange={sN('campaign_planting_id')}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p:any)=>(
                      <option key={p.id} value={p.id}>
                        {p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]
                      </option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormGroup label="Date de récolte *">
              <Input type="date" value={formNew.harvest_date} onChange={sN('harvest_date')} />
            </FormGroup>

            <div className="section-label" style={{marginTop:16}}>QUANTITÉS RÉCOLTÉES</div>
            <FormRow>
              <FormGroup label="Catégorie 1 — Export (kg)">
                <Input type="number" value={formNew.qty_category_1} onChange={sN('qty_category_1')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Catégorie 2 — Local (kg)">
                <Input type="number" value={formNew.qty_category_2} onChange={sN('qty_category_2')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie 3 — Déclassé (kg)">
                <Input type="number" value={formNew.qty_category_3} onChange={sN('qty_category_3')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={formNew.qty_waste} onChange={sN('qty_waste')} placeholder="0" />
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:16}}>ENVOI STATION <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1}}>(prix inconnu — à saisir plus tard)</span></div>
            <div style={{padding:'10px 13px',background:'#00e87a08',border:'1px solid #00e87a20',borderRadius:7,marginBottom:12,fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',letterSpacing:.5}}>
              ℹ Le prix de la station sera défini ultérieurement dans l'onglet "Sans prix station"
            </div>
            <FormRow>
              <FormGroup label="Qté envoyée à la station (kg)">
                <Input type="number" value={formNew.qty_sent_station} onChange={sN('qty_sent_station')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Référence station">
                <Input value={formNew.station_ref} onChange={sN('station_ref')} placeholder="ex: REF-STA-001" />
              </FormGroup>
            </FormRow>

            <FormGroup label="Notes">
              <Textarea rows={2} value={formNew.notes} onChange={sN('notes')} placeholder="Observations, qualité, conditions météo..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveNew} loading={saving}
              disabled={!formNew.campaign_planting_id||!formNew.harvest_date} saveLabel="ENREGISTRER LA RÉCOLTE" />
          </>)}
        </Modal>
      )}

      {/* ── Modal Prix Unitaire ── */}
      {modalPrix && (
        <Modal title="SAISIR LE PRIX STATION" onClose={()=>{setModalPrix(null);setDone(false)}}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            {/* Info récolte */}
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:6}}>RÉCOLTE SÉLECTIONNÉE</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:15,fontWeight:700,color:'#e8f5ee',marginBottom:3}}>
                {modalPrix.lot_number}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:8}}>
                <div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>SERRE</div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#7aab90'}}>{modalPrix.campaign_plantings?.greenhouses?.name||'—'}</div>
                </div>
                <div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>DATE</div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#7aab90'}}>{modalPrix.harvest_date}</div>
                </div>
                <div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>QTÉ STATION</div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>
                    {(modalPrix.station_lot?.quantity_kg || (modalPrix.qty_category_1+modalPrix.qty_category_2)).toLocaleString('fr')} kg
                  </div>
                </div>
              </div>
            </div>

            <FormGroup label="Prix reçu de la station (MAD/kg) *">
              <Input type="number" value={formPrix.price_per_kg} onChange={sP('price_per_kg')}
                placeholder="ex: 1.85" autoFocus step="0.001" />
            </FormGroup>

            {formPrix.price_per_kg && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,marginBottom:14,fontFamily:'DM Mono,monospace',fontSize:12,color:'#00e87a'}}>
                → Montant calculé : <strong>
                  {((modalPrix.station_lot?.quantity_kg || (modalPrix.qty_category_1+modalPrix.qty_category_2)) * Number(formPrix.price_per_kg)).toLocaleString('fr', {maximumFractionDigits:2})} MAD
                </strong>
              </div>
            )}

            <FormRow>
              <FormGroup label="Référence bordereau station">
                <Input value={formPrix.station_ref} onChange={sP('station_ref')}
                  placeholder={parseStationNotes(modalPrix.station_lot?.notes||null).station_ref||'ex: BRD-2026-001'} />
              </FormGroup>
              <FormGroup label="Date réception prix">
                <Input type="date" value={formPrix.receipt_date} onChange={sP('receipt_date')} />
              </FormGroup>
            </FormRow>

            <ModalFooter onCancel={()=>setModalPrix(null)} onSave={savePrix} loading={saving}
              disabled={!formPrix.price_per_kg} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ── Modal Saisie en Masse ── */}
      {modalMasse && (
        <Modal title={`SAISIE EN MASSE — ${selected.size} récolte(s) sélectionnée(s)`}
          onClose={()=>setModalMasse(false)} size="sm">
          {selected.size === 0 ? (
            <div style={{textAlign:'center',padding:'24px 0',fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d'}}>
              ⚠ Aucune récolte sélectionnée
            </div>
          ) : (<>
            <div style={{padding:'10px 13px',background:'#00e87a08',border:'1px solid #00e87a20',borderRadius:7,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>
              Ce prix sera appliqué aux {selected.size} récolte(s) sélectionnée(s)
            </div>
            <FormGroup label="Prix station (MAD/kg) *">
              <Input type="number" value={massePrix} onChange={e=>setMassePrix(e.target.value)}
                placeholder="ex: 1.85" autoFocus step="0.001" />
            </FormGroup>
            <FormRow>
              <FormGroup label="Référence bordereau">
                <Input value={masseRef} onChange={e=>setMasseRef(e.target.value)} placeholder="ex: BRD-2026-010" />
              </FormGroup>
              <FormGroup label="Date réception">
                <Input type="date" value={masseDate} onChange={e=>setMasseDate(e.target.value)} />
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalMasse(false)} onSave={saveMasse}
              loading={masseSaving} disabled={!massePrix} saveLabel={`APPLIQUER AUX ${selected.size} RÉCOLTE(S)`} />
          </>)}
        </Modal>
      )}

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">{harvests.length} lot(s) · Total : {(totalKg/1000).toFixed(2)} t</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {tab==='sans_prix' && selected.size > 0 && (
            <button className="btn-secondary" onClick={()=>setModalMasse(true)}
              style={{fontSize:11}}>
              ✔ SAISIR PRIX EN MASSE ({selected.size})
            </button>
          )}
          <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Lots récoltés',    v:String(harvests.length),           c:'#00e87a'},
          {l:'Total récolté',    v:(totalKg/1000).toFixed(2)+' t',    c:'#00ffc8'},
          {l:'Envoyé station',   v:(totalSent/1000).toFixed(2)+' t',  c:'#f5a623'},
          {l:'CA station',       v:(totalCA/1000).toFixed(1)+' k MAD',c:'#00b4d8'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,textShadow:`0 0 16px ${k.c}60`,fontSize:24}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── Onglets ── */}
      <div style={{display:'flex',gap:2,marginBottom:16,background:'#0a1810',border:'1px solid #1a3526',borderRadius:8,padding:4,width:'fit-content'}}>
        {[
          {key:'all',     label:'TOUS LES LOTS',       count:harvests.length},
          {key:'sans_prix',label:'SANS PRIX STATION', count:sansPrix.length, alert:true},
        ].map(t=>(
          <button key={t.key}
            onClick={()=>{ setTab(t.key as any); setSelected(new Set()) }}
            style={{
              padding:'7px 16px', borderRadius:6, border:'none',
              background: tab===t.key ? '#1a3526' : 'transparent',
              color: tab===t.key ? '#00e87a' : '#3d6b52',
              fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:1, cursor:'pointer',
              display:'flex', alignItems:'center', gap:7, transition:'all .15s',
            }}>
            {t.label}
            <span style={{
              background: tab===t.key ? (t.alert&&t.count>0?'#ff4d6d':'#00e87a') : '#1a3526',
              color: tab===t.key ? '#030a07' : '#3d6b52',
              borderRadius:4, padding:'1px 6px',
              fontFamily:'DM Mono,monospace', fontSize:9, fontWeight:700,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Instructions onglet sans prix ── */}
      {tab==='sans_prix' && sansPrix.length > 0 && (
        <div style={{padding:'10px 14px',background:'#f5a62318',border:'1px solid #f5a62340',borderRadius:8,marginBottom:14,fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',letterSpacing:.5,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:14}}>⚡</span>
          Sélectionnez des récoltes avec la case à cocher, puis cliquez sur <strong>"SAISIR PRIX EN MASSE"</strong> — ou cliquez sur <strong>"PRIX"</strong> pour saisir récolte par récolte.
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : displayed.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">{tab==='sans_prix' ? '✅' : '◉'}</div>
          <div className="empty-title">{tab==='sans_prix' ? 'Tous les prix sont renseignés !' : 'Aucune récolte saisie'}</div>
          <div className="empty-sub">{tab==='sans_prix' ? 'Bravo — aucune récolte en attente de prix station.' : 'Enregistrez votre première récolte.'}</div>
          {tab==='all' && <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>}
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {tab==='sans_prix' && (
                  <th style={{width:40}}>
                    <input type="checkbox"
                      checked={selected.size===displayed.length && displayed.length>0}
                      onChange={e => setSelected(e.target.checked ? new Set(displayed.map(h=>h.id)) : new Set())}
                      style={{cursor:'pointer',accentColor:'#00e87a'}} />
                  </th>
                )}
                {['N° Lot','Date','Serre','Variété','Cat.1','Cat.2','Cat.3','Qté Station','Prix/kg','CA Station','Statut','Action'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {displayed.map((h) => {
                  const sp = parseStationNotes(h.station_lot?.notes || null)
                  const qteStation = h.station_lot?.quantity_kg || 0
                  const montant = sp.amount_total || (qteStation * (sp.price_per_kg||0))
                  const prixDef = !!sp.price_per_kg
                  return (
                    <tr key={h.id} style={selected.has(h.id)?{background:'#00e87a06'}:undefined}>
                      {tab==='sans_prix' && (
                        <td>
                          <input type="checkbox"
                            checked={selected.has(h.id)}
                            onChange={e => {
                              const ns = new Set(selected)
                              e.target.checked ? ns.add(h.id) : ns.delete(h.id)
                              setSelected(ns)
                            }}
                            style={{cursor:'pointer',accentColor:'#00e87a'}} />
                        </td>
                      )}
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#00e87a'}}>{h.lot_number}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{h.harvest_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{h.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(h.qty_category_1||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(h.qty_category_2||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{(h.qty_category_3||0).toLocaleString('fr')}</span></td>
                      <td>
                        {qteStation > 0
                          ? <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',fontWeight:700}}>{qteStation.toLocaleString('fr')} kg</span>
                          : <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#1f4030'}}>—</span>
                        }
                      </td>
                      <td>
                        {prixDef
                          ? <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00ffc8',fontWeight:700}}>{sp.price_per_kg!.toFixed(3)} MAD</span>
                          : <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#ff4d6d'}}>EN ATTENTE</span>
                        }
                      </td>
                      <td>
                        {montant > 0
                          ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{montant.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
                          : <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#1f4030'}}>—</span>
                        }
                      </td>
                      <td>
                        {prixDef
                          ? <span className="tag tag-green">✓ PRIX OK</span>
                          : qteStation > 0
                            ? <span className="tag tag-amber">⏳ ATTENTE PRIX</span>
                            : <span className="tag" style={{background:'#1a3526',color:'#3d6b52',border:'1px solid #1a3526'}}>NON ENVOYÉ</span>
                        }
                      </td>
                      <td>
                        <button
                          onClick={()=>{ setFormPrix({price_per_kg: sp.price_per_kg?.toString()||'', station_ref: sp.station_ref||'', receipt_date: sp.receipt_date||''}); setModalPrix(h) }}
                          style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${prixDef?'#00e87a40':'#f5a62340'}`,background:prixDef?'#00e87a18':'#f5a62318',color:prixDef?'#00e87a':'#f5a623',fontFamily:'DM Mono,monospace',fontSize:10,cursor:'pointer',letterSpacing:.5}}>
                          {prixDef ? '✏ MODIFIER' : '💰 PRIX'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
