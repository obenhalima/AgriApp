'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'toutes' | 'sans_prix'
type Harvest = {
  id: string
  lot_number: string
  harvest_date: string
  qty_category_1: number
  qty_category_2: number
  qty_category_3: number
  qty_waste: number
  notes?: string
  campaign_plantings?: {
    greenhouses?: { code: string; name: string }
    varieties?:   { commercial_name: string }
    campaigns?:   { name: string }
  }
  harvest_station_prices?: {
    id: string
    qty_sent_kg: number
    price_per_kg?: number
    amount_total?: number
    station_ref?: string
    receipt_date?: string
  }[]
}

export default function RecoltesPage() {
  const [tab, setTab]             = useState<Tab>('toutes')
  const [items, setItems]         = useState<Harvest[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [tableOk, setTableOk]     = useState(true)

  /* ── modales ── */
  const [modalRecolte, setModalRecolte] = useState(false)
  const [modalPrix, setModalPrix]       = useState(false)   // prix unitaire
  const [modalMasse, setModalMasse]     = useState(false)   // saisie en masse

  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  /* ── formulaire récolte ── */
  const [formR, setFormR] = useState({
    campaign_planting_id: '', harvest_date: '',
    qty_category_1: '', qty_category_2: '', qty_category_3: '', qty_waste: '',
    qty_sent_to_station: '', notes: ''
  })
  const sr = (k: string) => (e: any) => setFormR(f => ({ ...f, [k]: e.target.value }))

  /* ── formulaire prix unique ── */
  const [selHarvest, setSelHarvest]   = useState<Harvest | null>(null)
  const [formP, setFormP] = useState({ qty_sent_kg: '', price_per_kg: '', station_ref: '', receipt_date: '' })
  const sp = (k: string) => (e: any) => setFormP(f => ({ ...f, [k]: e.target.value }))

  /* ── formulaire saisie en masse ── */
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [massPrice, setMassPrice]     = useState('')
  const [massRef, setMassRef]         = useState('')
  const [massDate, setMassDate]       = useState('')

  /* ────────────── CHARGEMENT ────────────── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Vérifier que la table harvest_station_prices existe
      const test = await supabase.from('harvest_station_prices').select('id').limit(1)
      setTableOk(!test.error)

      const [h, p] = await Promise.all([
        supabase.from('harvests')
          .select(`*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name)),
                   harvest_station_prices(id, qty_sent_kg, price_per_kg, amount_total, station_ref, receipt_date)`)
          .order('harvest_date', { ascending: false })
          .limit(200),
        supabase.from('campaign_plantings')
          .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)')
      ])
      setItems((h.data || []) as Harvest[])
      setPlantings(p.data || [])
    } catch { setTableOk(false) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ── listes filtrées ── */
  const itemsSansPrix = items.filter(r => {
    const sp = r.harvest_station_prices || []
    return sp.length === 0 || sp.some(x => !x.price_per_kg)
  })
  const displayed = tab === 'sans_prix' ? itemsSansPrix : items

  /* ────────────── SAUVEGARDES ────────────── */
  const saveRecolte = async () => {
    if (!formR.campaign_planting_id || !formR.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data: harvest, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formR.campaign_planting_id,
        harvest_date:  formR.harvest_date,
        qty_category_1: Number(formR.qty_category_1) || 0,
        qty_category_2: Number(formR.qty_category_2) || 0,
        qty_category_3: Number(formR.qty_category_3) || 0,
        qty_waste:      Number(formR.qty_waste) || 0,
        lot_number: lot,
        notes: formR.notes || null,
      }).select().single()
      if (error) throw error

      // Si quantité station renseignée, créer une entrée sans prix
      if (tableOk && formR.qty_sent_to_station && Number(formR.qty_sent_to_station) > 0) {
        await supabase.from('harvest_station_prices').insert({
          harvest_id:  harvest.id,
          qty_sent_kg: Number(formR.qty_sent_to_station),
        })
      }
      setDone(true)
      setTimeout(() => {
        setModalRecolte(false); setDone(false)
        setFormR({ campaign_planting_id:'', harvest_date:'', qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'', qty_sent_to_station:'', notes:'' })
        load()
      }, 1400)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const savePrix = async () => {
    if (!selHarvest || !formP.price_per_kg) return
    setSaving(true)
    try {
      const qty   = Number(formP.qty_sent_kg) || 0
      const price = Number(formP.price_per_kg)
      const total = qty * price

      const existing = selHarvest.harvest_station_prices?.[0]
      if (existing) {
        const { error } = await supabase.from('harvest_station_prices').update({
          qty_sent_kg:   qty || existing.qty_sent_kg,
          price_per_kg:  price,
          amount_total:  (qty || existing.qty_sent_kg) * price,
          station_ref:   formP.station_ref || null,
          receipt_date:  formP.receipt_date || null,
          price_set_at:  new Date().toISOString(),
        }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('harvest_station_prices').insert({
          harvest_id:   selHarvest.id,
          qty_sent_kg:  qty,
          price_per_kg: price,
          amount_total: total,
          station_ref:  formP.station_ref || null,
          receipt_date: formP.receipt_date || null,
          price_set_at: new Date().toISOString(),
        })
        if (error) throw error
      }
      setDone(true)
      setTimeout(() => { setModalPrix(false); setDone(false); setSelHarvest(null); setFormP({qty_sent_kg:'',price_per_kg:'',station_ref:'',receipt_date:''}); load() }, 1400)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const saveMasse = async () => {
    if (!massPrice || selected.size === 0) return
    setSaving(true)
    try {
      const price = Number(massPrice)
      // Pour chaque récolte sélectionnée
      for (const hid of Array.from(selected)) {
        const harvest = items.find(i => i.id === hid)
        if (!harvest) continue
        const existing = harvest.harvest_station_prices?.[0]
        const qty = existing?.qty_sent_kg ||
          (harvest.qty_category_1 || 0) + (harvest.qty_category_2 || 0) + (harvest.qty_category_3 || 0)

        if (existing) {
          await supabase.from('harvest_station_prices').update({
            price_per_kg: price,
            amount_total: qty * price,
            station_ref:  massRef || null,
            receipt_date: massDate || null,
            price_set_at: new Date().toISOString(),
          }).eq('id', existing.id)
        } else {
          await supabase.from('harvest_station_prices').insert({
            harvest_id:   hid,
            qty_sent_kg:  qty,
            price_per_kg: price,
            amount_total: qty * price,
            station_ref:  massRef || null,
            receipt_date: massDate || null,
            price_set_at: new Date().toISOString(),
          })
        }
      }
      setDone(true)
      setTimeout(() => { setModalMasse(false); setDone(false); setSelected(new Set()); setMassPrice(''); setMassRef(''); setMassDate(''); load() }, 1400)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleAll = () => {
    if (selected.size === itemsSansPrix.length) setSelected(new Set())
    else setSelected(new Set(itemsSansPrix.map(i => i.id)))
  }

  /* ── totaux ── */
  const totalKg    = items.reduce((s,r) => s + (r.qty_category_1||0) + (r.qty_category_2||0) + (r.qty_category_3||0), 0)
  const totalCA    = items.reduce((s,r) => { const sp = r.harvest_station_prices?.[0]; return s + (sp?.amount_total || 0) }, 0)
  const sansPrixCount = itemsSansPrix.length

  /* ── row de récolte ── */
  const HarvestRow = ({ r }: { r: Harvest }) => {
    const cp    = r.campaign_plantings
    const spRow = r.harvest_station_prices?.[0]
    const total = (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0)
    const hasPrix = !!spRow?.price_per_kg
    const inSelect = tab === 'sans_prix'

    return (
      <tr style={{ borderBottom:'1px solid #1a3526' }}>
        {inSelect && (
          <td style={{padding:'10px 14px'}}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
              style={{ width:14, height:14, accentColor:'#00e87a', cursor:'pointer' }} />
          </td>
        )}
        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{r.lot_number}</span></td>
        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{r.harvest_date}</span></td>
        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{cp?.greenhouses?.name||'—'}</span></td>
        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{cp?.varieties?.commercial_name||'—'}</span></td>
        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(r.qty_category_1||0).toLocaleString('fr')}</span></td>
        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(r.qty_category_2||0).toLocaleString('fr')}</span></td>
        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')}</span></td>
        {/* Colonne station */}
        <td>
          {spRow
            ? <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{spRow.qty_sent_kg?.toLocaleString('fr')} kg</span>
            : <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>—</span>
          }
        </td>
        <td>
          {hasPrix
            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#00e87a'}}>{spRow!.price_per_kg} MAD/kg</span>
            : <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:4,background:'#f5a62318',border:'1px solid #f5a62340',fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623'}}>
                ● EN ATTENTE
              </span>
          }
        </td>
        <td>
          {hasPrix
            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#00ffc8'}}>{spRow!.amount_total?.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
            : <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>—</span>
          }
        </td>
        <td>
          <button
            onClick={() => {
              setSelHarvest(r)
              setFormP({
                qty_sent_kg:  String(spRow?.qty_sent_kg || total || ''),
                price_per_kg: String(spRow?.price_per_kg || ''),
                station_ref:  spRow?.station_ref || '',
                receipt_date: spRow?.receipt_date || '',
              })
              setModalPrix(true)
            }}
            style={{ padding:'4px 10px', borderRadius:5, border:'1px solid #00e87a40', background:'#00e87a18', color:'#00e87a', fontFamily:'DM Mono,monospace', fontSize:9, cursor:'pointer', letterSpacing:.5 }}>
            {hasPrix ? '✏ MODIFIER' : '+ PRIX'}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ background:'#030a07', minHeight:'100vh' }}>

      {/* ── MODAL RÉCOLTE ── */}
      {modalRecolte && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={() => { setModalRecolte(false); setDone(false) }}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation / Serre-Variété *">
              {plantings.length === 0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation — créez d'abord une plantation dans Suivi Production</div>
                : <Select value={formR.campaign_planting_id} onChange={sr('campaign_planting_id')}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]
                      </option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormGroup label="Date de récolte *">
              <Input type="date" value={formR.harvest_date} onChange={sr('harvest_date')} />
            </FormGroup>

            <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:10,marginTop:4,display:'flex',alignItems:'center',gap:8}}>
              QUANTITÉS RÉCOLTÉES <span style={{flex:1,height:1,background:'#1a3526',display:'block'}}/>
            </div>
            <FormRow>
              <FormGroup label="Cat. 1 — Export (kg)">
                <Input type="number" value={formR.qty_category_1} onChange={sr('qty_category_1')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Cat. 2 — Local (kg)">
                <Input type="number" value={formR.qty_category_2} onChange={sr('qty_category_2')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cat. 3 — Déclassé (kg)">
                <Input type="number" value={formR.qty_category_3} onChange={sr('qty_category_3')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={formR.qty_waste} onChange={sr('qty_waste')} placeholder="0" />
              </FormGroup>
            </FormRow>

            <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:10,marginTop:16,display:'flex',alignItems:'center',gap:8}}>
              ENVOI STATION <span style={{flex:1,height:1,background:'#1a3526',display:'block'}}/>
            </div>
            <div style={{padding:'10px 13px',background:'#00b4d818',border:'1px solid #00b4d840',borderRadius:7,marginBottom:12,fontFamily:'DM Mono,monospace',fontSize:10,color:'#00b4d8',letterSpacing:.5}}>
              ℹ Le prix de la station n'est pas connu à l'avance. Saisissez la quantité envoyée maintenant — le prix pourra être défini ultérieurement.
            </div>
            <FormGroup label="Quantité envoyée à la station (kg)">
              <Input type="number" value={formR.qty_sent_to_station} onChange={sr('qty_sent_to_station')}
                placeholder="Laissez vide si pas encore envoyé" />
            </FormGroup>
            <FormGroup label="Notes qualité">
              <Textarea rows={2} value={formR.notes} onChange={sr('notes')} placeholder="Observations, conditions..." />
            </FormGroup>
            <ModalFooter onCancel={() => setModalRecolte(false)} onSave={saveRecolte} loading={saving}
              disabled={!formR.campaign_planting_id || !formR.harvest_date} saveLabel="ENREGISTRER LA RÉCOLTE" />
          </>)}
        </Modal>
      )}

      {/* ── MODAL PRIX UNITAIRE ── */}
      {modalPrix && selHarvest && (
        <Modal title="SAISIR LE PRIX STATION" onClose={() => { setModalPrix(false); setDone(false); setSelHarvest(null) }}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:4}}>RÉCOLTE SÉLECTIONNÉE</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>
                {selHarvest.lot_number}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:2}}>
                {selHarvest.campaign_plantings?.greenhouses?.name} · {selHarvest.campaign_plantings?.varieties?.commercial_name} · {selHarvest.harvest_date}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',marginTop:2}}>
                Total récolté : {((selHarvest.qty_category_1||0)+(selHarvest.qty_category_2||0)+(selHarvest.qty_category_3||0)).toLocaleString('fr')} kg
              </div>
            </div>
            <FormRow>
              <FormGroup label="Quantité envoyée station (kg)">
                <Input type="number" value={formP.qty_sent_kg} onChange={sp('qty_sent_kg')} placeholder="kg" />
              </FormGroup>
              <FormGroup label="Prix reçu station (MAD/kg) *">
                <Input type="number" value={formP.price_per_kg} onChange={sp('price_per_kg')} placeholder="ex: 2.85" autoFocus />
              </FormGroup>
            </FormRow>
            {formP.qty_sent_kg && formP.price_per_kg && (
              <div style={{padding:'8px 12px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,marginBottom:14,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>
                → Montant total : {(Number(formP.qty_sent_kg) * Number(formP.price_per_kg)).toLocaleString('fr', {maximumFractionDigits:2})} MAD
              </div>
            )}
            <FormRow>
              <FormGroup label="Réf. bordereau station">
                <Input value={formP.station_ref} onChange={sp('station_ref')} placeholder="ex: BL-STAT-2026-042" />
              </FormGroup>
              <FormGroup label="Date de réception prix">
                <Input type="date" value={formP.receipt_date} onChange={sp('receipt_date')} />
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={() => { setModalPrix(false); setSelHarvest(null) }} onSave={savePrix}
              loading={saving} disabled={!formP.price_per_kg} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ── MODAL SAISIE EN MASSE ── */}
      {modalMasse && (
        <Modal title="SAISIE EN MASSE — PRIX STATION" onClose={() => { setModalMasse(false); setDone(false); setSelected(new Set()) }} size="lg">
          {done ? <SuccessMessage message={`Prix appliqué à ${selected.size} récolte(s) !`} /> : (<>
            <div style={{padding:'10px 13px',background:'#00b4d818',border:'1px solid #00b4d840',borderRadius:7,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:10,color:'#00b4d8',letterSpacing:.5}}>
              Sélectionnez les récoltes ayant reçu le même prix de la station, puis appliquez-le en une seule fois.
            </div>

            {/* Sélection des récoltes */}
            <div style={{maxHeight:280,overflowY:'auto',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#0d1f14',position:'sticky',top:0}}>
                    <th style={{padding:'8px 12px',textAlign:'left'}}>
                      <input type="checkbox"
                        checked={selected.size === itemsSansPrix.length && itemsSansPrix.length > 0}
                        onChange={toggleAll}
                        style={{width:14,height:14,accentColor:'#00e87a',cursor:'pointer'}} />
                    </th>
                    {['Lot','Date','Serre','Variété','Total (kg)','Qté station','Statut'].map(h=>(
                      <th key={h} style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',textTransform:'uppercase',letterSpacing:1,textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemsSansPrix.map(r => {
                    const cp  = r.campaign_plantings
                    const sp2 = r.harvest_station_prices?.[0]
                    const total2 = (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0)
                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid #1a3526',cursor:'pointer',background:selected.has(r.id)?'#00e87a0a':'transparent'}}
                        onClick={() => toggleSelect(r.id)}>
                        <td style={{padding:'8px 12px'}}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                            style={{width:14,height:14,accentColor:'#00e87a',cursor:'pointer'}} />
                        </td>
                        <td style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{r.lot_number}</td>
                        <td style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{r.harvest_date}</td>
                        <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:600,color:'#e8f5ee'}}>{cp?.greenhouses?.name||'—'}</td>
                        <td style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{cp?.varieties?.commercial_name||'—'}</td>
                        <td style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{total2.toLocaleString('fr')}</td>
                        <td style={{padding:'8px 12px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{sp2?.qty_sent_kg?.toLocaleString('fr') || total2.toLocaleString('fr')}</td>
                        <td style={{padding:'8px 12px'}}>
                          {sp2?.price_per_kg
                            ? <span style={{color:'#00e87a',fontSize:9,fontFamily:'DM Mono,monospace'}}>● PRIX DÉFINI</span>
                            : <span style={{color:'#f5a623',fontSize:9,fontFamily:'DM Mono,monospace'}}>● EN ATTENTE</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{padding:'8px 12px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>
              {selected.size} récolte(s) sélectionnée(s)
              {selected.size > 0 && ` · Total : ${
                Array.from(selected).reduce((s,id) => {
                  const r = items.find(x=>x.id===id)
                  if (!r) return s
                  const sp2 = r.harvest_station_prices?.[0]
                  return s + (sp2?.qty_sent_kg || (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0))
                }, 0).toLocaleString('fr')
              } kg`}
            </div>

            <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
              PRIX À APPLIQUER <span style={{flex:1,height:1,background:'#1a3526',display:'block'}}/>
            </div>
            <FormRow>
              <FormGroup label="Prix station (MAD/kg) *">
                <Input type="number" value={massPrice} onChange={e=>setMassPrice(e.target.value)} placeholder="ex: 2.85" autoFocus />
              </FormGroup>
              <FormGroup label="Date réception prix">
                <Input type="date" value={massDate} onChange={e=>setMassDate(e.target.value)} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Réf. bordereau / lot station">
              <Input value={massRef} onChange={e=>setMassRef(e.target.value)} placeholder="ex: BL-STAT-2026-042" />
            </FormGroup>

            {massPrice && selected.size > 0 && (
              <div style={{padding:'10px 13px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,marginBottom:4,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>
                → Montant total estimé : {
                  (Number(massPrice) * Array.from(selected).reduce((s,id) => {
                    const r = items.find(x=>x.id===id)
                    if (!r) return s
                    const sp2 = r.harvest_station_prices?.[0]
                    return s + (sp2?.qty_sent_kg || (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0))
                  }, 0)).toLocaleString('fr', {maximumFractionDigits:2})
                } MAD
              </div>
            )}
            <ModalFooter onCancel={() => { setModalMasse(false); setSelected(new Set()) }} onSave={saveMasse}
              loading={saving} disabled={selected.size === 0 || !massPrice} saveLabel={`APPLIQUER À ${selected.size} RÉCOLTE(S)`} />
          </>)}
        </Modal>
      )}

      {/* ── HEADER ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">{items.length} lot(s) · Total : {(totalKg/1000).toFixed(2)} t · CA Station : {totalCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          {sansPrixCount > 0 && (
            <button onClick={() => setModalMasse(true)}
              style={{padding:'8px 14px',borderRadius:8,border:'1px solid #f5a62340',background:'#f5a62318',color:'#f5a623',fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',letterSpacing:.5}}>
              ⚡ PRIX EN MASSE ({sansPrixCount})
            </button>
          )}
          <button className="btn-primary" onClick={() => setModalRecolte(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ── Alerte table manquante ── */}
      {!tableOk && (
        <div style={{padding:'12px 16px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:8,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d'}}>
          ⚠ La table <strong>harvest_station_prices</strong> n'existe pas encore dans votre base.
          Exécutez le SQL ci-dessous dans <strong>Supabase → SQL Editor</strong> pour activer la gestion des prix station :
          <pre style={{marginTop:8,padding:'8px',background:'#0d1f14',borderRadius:6,fontSize:10,color:'#7aab90',overflow:'auto'}}>
{`CREATE TABLE IF NOT EXISTS harvest_station_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  qty_sent_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg DECIMAL(8,3),
  amount_total DECIMAL(12,2),
  station_ref VARCHAR(100),
  receipt_date DATE,
  price_set_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE harvest_station_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_station_prices FOR ALL USING (true) WITH CHECK (true);`}
          </pre>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Lots récoltés',     v:String(items.length),                      c:'#00e87a'},
          {l:'Total récolté',     v:(totalKg/1000).toFixed(2)+' t',             c:'#00ffc8'},
          {l:'Sans prix station', v:String(sansPrixCount),                      c: sansPrixCount>0 ? '#f5a623' : '#3d6b52'},
          {l:'CA station',        v:totalCA.toLocaleString('fr',{maximumFractionDigits:0})+' MAD', c:'#00e87a'},
          {l:'Prix moy. station', v: items.filter(r=>r.harvest_station_prices?.[0]?.price_per_kg).length > 0
            ? (items.reduce((s,r)=>s+(r.harvest_station_prices?.[0]?.price_per_kg||0),0) /
               items.filter(r=>r.harvest_station_prices?.[0]?.price_per_kg).length).toFixed(2)+' MAD/kg'
            : '—', c:'#00ffc8'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,textShadow:`0 0 16px ${k.c}60`,fontSize:20}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{display:'flex',gap:2,marginBottom:16,borderBottom:'1px solid #1a3526'}}>
        {([['toutes','Toutes les récoltes',items.length],['sans_prix','Sans prix station',sansPrixCount]] as [Tab,string,number][]).map(([t,label,count])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{
              padding:'8px 16px', background:'transparent', border:'none',
              borderBottom: tab===t ? '2px solid #00e87a' : '2px solid transparent',
              color: tab===t ? '#00e87a' : '#3d6b52',
              fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:1,
              textTransform:'uppercase', cursor:'pointer', marginBottom:-1,
              transition:'color .15s',
            }}>
            {label} <span style={{padding:'1px 6px',borderRadius:3,background:tab===t?'#00e87a18':'#1a3526',marginLeft:5}}>{count}</span>
          </button>
        ))}
        {tab === 'sans_prix' && selected.size > 0 && (
          <button onClick={() => setModalMasse(true)}
            style={{marginLeft:'auto',marginBottom:4,padding:'6px 12px',borderRadius:6,border:'1px solid #f5a62340',background:'#f5a62318',color:'#f5a623',fontFamily:'DM Mono,monospace',fontSize:9,cursor:'pointer',letterSpacing:1}}>
            ⚡ APPLIQUER PRIX ({selected.size})
          </button>
        )}
      </div>

      {/* ── TABLE ── */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : displayed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <div className="empty-title">{tab==='sans_prix' ? 'Toutes les récoltes ont un prix !' : 'Aucune récolte'}</div>
          {tab==='toutes' && <button className="btn-primary" onClick={()=>setModalRecolte(true)}>+ SAISIR RÉCOLTE</button>}
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead>
                <tr>
                  {tab === 'sans_prix' && (
                    <th style={{width:40}}>
                      <input type="checkbox"
                        checked={selected.size === itemsSansPrix.length && itemsSansPrix.length > 0}
                        onChange={toggleAll}
                        style={{width:14,height:14,accentColor:'#00e87a',cursor:'pointer'}} />
                    </th>
                  )}
                  {['Lot','Date','Serre','Variété','Cat.1','Cat.2','Total récolté','Qté station','Prix station','Montant','Action'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(r => <HarvestRow key={r.id} r={r} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
