'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'liste' | 'sans_prix'

interface HarvestRow {
  id: string
  lot_number: string
  harvest_date: string
  qty_category_1: number
  qty_category_2: number
  qty_category_3: number
  qty_waste: number
  qty_sent_station?: number
  notes?: string
  campaign_plantings?: {
    greenhouses?: { name: string; code: string }
    varieties?:   { commercial_name: string }
    campaigns?:   { name: string }
  }
  station_price?: {
    id: string
    qty_sent_kg: number
    price_per_kg: number | null
    amount_total: number | null
    station_ref?: string
    receipt_date?: string
  } | null
}

export default function RecoltesPage() {
  const [tab, setTab]       = useState<Tab>('liste')
  const [items, setItems]   = useState<HarvestRow[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)

  /* ── Modales ── */
  const [modalNew,  setModalNew]  = useState(false)
  const [modalPrix, setModalPrix] = useState(false)  // saisie prix unitaire
  const [modalMasse,setModalMasse]= useState(false)  // saisie en masse

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  /* ── Formulaire nouvelle récolte ── */
  const [formR, setFormR] = useState({
    campaign_planting_id:'', harvest_date:'',
    qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'',
    qty_sent_station:'', notes:''
  })
  const sr = (k:string) => (e:any) => setFormR(f=>({...f,[k]:e.target.value}))

  /* ── Formulaire prix unitaire ── */
  const [selHarvest, setSelHarvest] = useState<HarvestRow|null>(null)
  const [formP, setFormP] = useState({ price_per_kg:'', station_ref:'', receipt_date:'', notes:'' })
  const sp = (k:string) => (e:any) => setFormP(f=>({...f,[k]:e.target.value}))

  /* ── Formulaire masse ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massPrice, setMassPrice]     = useState('')
  const [massRef,   setMassRef]       = useState('')
  const [massDate,  setMassDate]      = useState('')

  /* ─────────────── Chargement ─────────────── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Check si harvest_station_prices existe
      const chk = await supabase.from('harvest_station_prices').select('id').limit(1)
      if (chk.error?.code === '42P01') { setTableExists(false); setLoading(false); return }
      setTableExists(true)

      const [r, p] = await Promise.all([
        supabase.from('harvests')
          .select(`*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))`)
          .order('harvest_date', { ascending: false }).limit(200),
        supabase.from('campaign_plantings')
          .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)')
      ])

      const harvests: HarvestRow[] = r.data || []

      // Charger les prix station
      const { data: prices } = await supabase
        .from('harvest_station_prices')
        .select('*')
        .in('harvest_id', harvests.map(h => h.id))

      const priceMap: Record<string, any> = {}
      ;(prices||[]).forEach(p => { priceMap[p.harvest_id] = p })

      const enriched = harvests.map(h => ({ ...h, station_price: priceMap[h.id] || null }))
      setItems(enriched)
      setPlantings(p.data || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ─────────────── Sauvegarder récolte ─────────────── */
  const saveRecolte = async () => {
    if (!formR.campaign_planting_id || !formR.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formR.campaign_planting_id,
        harvest_date: formR.harvest_date,
        qty_category_1: Number(formR.qty_category_1)||0,
        qty_category_2: Number(formR.qty_category_2)||0,
        qty_category_3: Number(formR.qty_category_3)||0,
        qty_waste:      Number(formR.qty_waste)||0,
        lot_number: lot,
        notes: formR.notes||null,
      }).select('id').single()
      if (error) throw error

      // Si quantité envoyée à la station saisie, créer l'entrée sans prix
      if (formR.qty_sent_station && Number(formR.qty_sent_station) > 0) {
        await supabase.from('harvest_station_prices').insert({
          harvest_id:  data.id,
          qty_sent_kg: Number(formR.qty_sent_station),
          price_per_kg: null,
          amount_total: null,
        })
      }

      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormR({campaign_planting_id:'',harvest_date:'',qty_category_1:'',qty_category_2:'',qty_category_3:'',qty_waste:'',qty_sent_station:'',notes:''})
        load()
      }, 1400)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────────── Sauvegarder prix unitaire ─────────────── */
  const savePrix = async () => {
    if (!selHarvest || !formP.price_per_kg) return
    setSaving(true)
    try {
      const prix = Number(formP.price_per_kg)
      const sp = selHarvest.station_price

      if (sp) {
        // Mettre à jour
        const montant = sp.qty_sent_kg * prix
        const { error } = await supabase.from('harvest_station_prices').update({
          price_per_kg: prix,
          amount_total: montant,
          station_ref:  formP.station_ref||null,
          receipt_date: formP.receipt_date||null,
          price_set_at: new Date().toISOString(),
          notes:        formP.notes||null,
        }).eq('id', sp.id)
        if (error) throw error
      } else {
        // Créer
        const { error } = await supabase.from('harvest_station_prices').insert({
          harvest_id:   selHarvest.id,
          qty_sent_kg:  0,
          price_per_kg: prix,
          amount_total: 0,
          station_ref:  formP.station_ref||null,
          receipt_date: formP.receipt_date||null,
          price_set_at: new Date().toISOString(),
          notes:        formP.notes||null,
        })
        if (error) throw error
      }

      setDone(true)
      setTimeout(() => {
        setModalPrix(false); setDone(false); setSelHarvest(null)
        setFormP({price_per_kg:'',station_ref:'',receipt_date:'',notes:''})
        load()
      }, 1400)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────────── Saisie masse ─────────────── */
  const saveMasse = async () => {
    if (!massPrice || selectedIds.size === 0) return
    setSaving(true)
    try {
      const prix = Number(massPrice)

      for (const harvestId of selectedIds) {
        const h = itemsSansPrix.find(x => x.id === harvestId)
        if (!h) continue
        const qty = h.station_price?.qty_sent_kg || 0
        const montant = qty * prix

        if (h.station_price) {
          await supabase.from('harvest_station_prices').update({
            price_per_kg: prix,
            amount_total: montant,
            station_ref:  massRef||null,
            receipt_date: massDate||null,
            price_set_at: new Date().toISOString(),
          }).eq('id', h.station_price.id)
        } else {
          await supabase.from('harvest_station_prices').insert({
            harvest_id: harvestId, qty_sent_kg: 0,
            price_per_kg: prix, amount_total: 0,
            station_ref: massRef||null,
            receipt_date: massDate||null,
            price_set_at: new Date().toISOString(),
          })
        }
      }

      setDone(true)
      setTimeout(() => {
        setModalMasse(false); setDone(false)
        setSelectedIds(new Set()); setMassPrice(''); setMassRef(''); setMassDate('')
        load()
      }, 1400)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────────── Données filtrées ─────────────── */
  const itemsSansPrix = items.filter(h => !h.station_price?.price_per_kg)
  const itemsAvecPrix = items.filter(h =>  h.station_price?.price_per_kg)
  const totalKg   = items.reduce((s,r) => s+(r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0), 0)
  const totalCA   = itemsAvecPrix.reduce((s,r) => s+(r.station_price?.amount_total||0), 0)

  const toggleSelect = (id:string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const selectAll = () => setSelectedIds(new Set(itemsSansPrix.map(h=>h.id)))
  const clearAll  = () => setSelectedIds(new Set())

  /* ─────────────── Rendu ─────────────── */
  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>

      {/* ── Modale nouvelle récolte ── */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation / Serre — Variété *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation disponible</div>
                : <Select value={formR.campaign_planting_id} onChange={sr('campaign_planting_id')}>
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
              <Input type="date" value={formR.harvest_date} onChange={sr('harvest_date')} />
            </FormGroup>

            <div className="section-label" style={{marginTop:16}}>QUANTITÉS RÉCOLTÉES</div>
            <FormRow>
              <FormGroup label="Catégorie 1 — Export (kg)">
                <Input type="number" value={formR.qty_category_1} onChange={sr('qty_category_1')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Catégorie 2 — Local (kg)">
                <Input type="number" value={formR.qty_category_2} onChange={sr('qty_category_2')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie 3 — Déclassé (kg)">
                <Input type="number" value={formR.qty_category_3} onChange={sr('qty_category_3')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={formR.qty_waste} onChange={sr('qty_waste')} placeholder="0" />
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:16}}>ENVOI À LA STATION</div>
            <FormGroup label="Quantité envoyée à la station (kg)">
              <Input type="number" value={formR.qty_sent_station} onChange={sr('qty_sent_station')} placeholder="Le prix sera saisi plus tard" />
            </FormGroup>
            <div style={{padding:'8px 12px',background:'#f5a62312',border:'1px solid #f5a62330',borderRadius:6,fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',marginBottom:12}}>
              ⚠ Le prix /kg de la station sera défini ultérieurement — la récolte apparaîtra dans «&nbsp;Sans prix station&nbsp;»
            </div>

            <FormGroup label="Notes">
              <Textarea rows={2} value={formR.notes} onChange={sr('notes')} placeholder="Observations qualité..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveRecolte} loading={saving}
              disabled={!formR.campaign_planting_id||!formR.harvest_date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ── Modale prix unitaire ── */}
      {modalPrix && selHarvest && (
        <Modal title="SAISIR LE PRIX STATION" onClose={()=>{setModalPrix(false);setDone(false);setSelHarvest(null)}}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            {/* Résumé récolte */}
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:6}}>RÉCOLTE SÉLECTIONNÉE</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{selHarvest.lot_number}</div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:3}}>
                {selHarvest.campaign_plantings?.greenhouses?.name} · {selHarvest.campaign_plantings?.varieties?.commercial_name}
                {' · '}{selHarvest.harvest_date}
              </div>
              {selHarvest.station_price && (
                <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a',marginTop:4}}>
                  Qté envoyée : <strong>{selHarvest.station_price.qty_sent_kg} kg</strong>
                  {' · '}Montant calculé : <strong>{selHarvest.station_price.qty_sent_kg * Number(formP.price_per_kg||0)} MAD</strong>
                </div>
              )}
            </div>

            <FormGroup label="Prix / kg reçu de la station *">
              <Input type="number" step="0.001" value={formP.price_per_kg} onChange={sp('price_per_kg')} placeholder="ex: 1.850" autoFocus />
            </FormGroup>

            {formP.price_per_kg && selHarvest.station_price && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA station : {(selHarvest.station_price.qty_sent_kg * Number(formP.price_per_kg)).toFixed(2)} MAD
              </div>
            )}

            <FormRow>
              <FormGroup label="Référence station">
                <Input value={formP.station_ref} onChange={sp('station_ref')} placeholder="ex: STAT-2026-0312" />
              </FormGroup>
              <FormGroup label="Date de réception">
                <Input type="date" value={formP.receipt_date} onChange={sp('receipt_date')} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formP.notes} onChange={sp('notes')} placeholder="Remarques sur le prix reçu..." />
            </FormGroup>
            <ModalFooter onCancel={()=>{setModalPrix(false);setSelHarvest(null)}} onSave={savePrix} loading={saving}
              disabled={!formP.price_per_kg} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ── Modale saisie en masse ── */}
      {modalMasse && (
        <Modal title="SAISIE EN MASSE — PRIX STATION" onClose={()=>{setModalMasse(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message={`Prix appliqué à ${selectedIds.size} récolte(s) !`} /> : (<>
            {/* Sélection récoltes */}
            <div className="section-label">SÉLECTIONNER LES RÉCOLTES</div>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <button onClick={selectAll} className="btn-secondary" style={{fontSize:10,padding:'5px 10px'}}>TOUT SÉLECTIONNER</button>
              <button onClick={clearAll}  className="btn-ghost"    style={{fontSize:10,padding:'5px 10px'}}>EFFACER</button>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',alignSelf:'center',marginLeft:'auto'}}>
                {selectedIds.size} / {itemsSansPrix.length} sélectionnée(s)
              </span>
            </div>

            <div style={{maxHeight:260,overflowY:'auto',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              {itemsSansPrix.length===0 ? (
                <div style={{padding:24,textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>
                  Toutes les récoltes ont un prix station
                </div>
              ) : itemsSansPrix.map(h=>(
                <div key={h.id}
                  onClick={()=>toggleSelect(h.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderBottom:'1px solid #1a3526', cursor:'pointer', transition:'background .1s',
                    background: selectedIds.has(h.id) ? '#00e87a10' : 'transparent',
                  }}>
                  {/* Checkbox custom */}
                  <div style={{
                    width:16, height:16, borderRadius:4, flexShrink:0, border:'1px solid',
                    borderColor: selectedIds.has(h.id) ? '#00e87a' : '#1f4030',
                    background: selectedIds.has(h.id) ? '#00e87a' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, color:'#030a07', fontWeight:700,
                  }}>
                    {selectedIds.has(h.id) ? '✓' : ''}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{h.lot_number}</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#7aab90',marginTop:1}}>
                      {h.campaign_plantings?.greenhouses?.name} · {h.campaign_plantings?.varieties?.commercial_name} · {h.harvest_date}
                    </div>
                  </div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',textAlign:'right',flexShrink:0}}>
                    {h.station_price?.qty_sent_kg ? h.station_price.qty_sent_kg+' kg' : '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Prix à appliquer */}
            <div className="section-label">PRIX À APPLIQUER</div>
            <FormGroup label="Prix / kg station (appliqué à toutes les sélections) *">
              <Input type="number" step="0.001" value={massPrice} onChange={e=>setMassPrice(e.target.value)} placeholder="ex: 1.850" autoFocus />
            </FormGroup>
            {massPrice && selectedIds.size > 0 && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA total estimé : {itemsSansPrix
                  .filter(h=>selectedIds.has(h.id))
                  .reduce((s,h)=>s+(h.station_price?.qty_sent_kg||0)*Number(massPrice),0)
                  .toFixed(2)} MAD sur {selectedIds.size} lot(s)
              </div>
            )}
            <FormRow>
              <FormGroup label="Référence station">
                <Input value={massRef} onChange={e=>setMassRef(e.target.value)} placeholder="ex: STAT-2026-0325" />
              </FormGroup>
              <FormGroup label="Date de réception">
                <Input type="date" value={massDate} onChange={e=>setMassDate(e.target.value)} />
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalMasse(false)} onSave={saveMasse} loading={saving}
              disabled={!massPrice||selectedIds.size===0}
              saveLabel={`APPLIQUER À ${selectedIds.size} RÉCOLTE(S)`} />
          </>)}
        </Modal>
      )}

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">{items.length} lot(s) · {(totalKg/1000).toFixed(2)} t · CA station : {(totalCA).toLocaleString('fr',{maximumFractionDigits:0})} MAD</div>
        </div>
        <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
      </div>

      {/* ── Alerte table manquante ── */}
      {!tableExists && (
        <div style={{padding:'14px 18px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:8,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d'}}>
          ⚠ TABLE MANQUANTE — Exécutez ce SQL dans Supabase Dashboard → SQL Editor :
          <pre style={{marginTop:8,fontSize:9,color:'#ff9ab0',background:'#1a0a0d',padding:'10px',borderRadius:6,overflow:'auto'}}>
{`CREATE TABLE IF NOT EXISTS harvest_station_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  qty_sent_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg DECIMAL(8,4), amount_total DECIMAL(12,2),
  station_ref VARCHAR(100), receipt_date DATE,
  price_set_at TIMESTAMPTZ, notes TEXT,
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
          {l:'Lots totaux',      v:String(items.length),               c:'#00e87a'},
          {l:'Production',       v:(totalKg/1000).toFixed(2)+' t',     c:'#00ffc8'},
          {l:'Sans prix',        v:String(itemsSansPrix.length),        c:'#f5a623'},
          {l:'Avec prix',        v:String(itemsAvecPrix.length),        c:'#00b4d8'},
          {l:'CA Station',       v:(totalCA/1000).toFixed(1)+' k MAD', c:'#9b5de5'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,textShadow:`0 0 16px ${k.c}60`,fontSize:22}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:4,marginBottom:16,alignItems:'center'}}>
        {([['liste','TOUTES LES RÉCOLTES'],['sans_prix','SANS PRIX STATION']] as [Tab,string][]).map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'8px 16px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',fontSize:10,letterSpacing:1,cursor:'pointer',transition:'all .15s',
              borderColor: tab===t ? '#00e87a' : '#1a3526',
              background:  tab===t ? '#00e87a18' : 'transparent',
              color:       tab===t ? '#00e87a' : '#3d6b52',
            }}>
            {label}
            {t==='sans_prix' && itemsSansPrix.length>0 && (
              <span style={{marginLeft:8,background:'#f5a623',color:'#030a07',borderRadius:10,padding:'1px 6px',fontSize:9,fontWeight:700}}>
                {itemsSansPrix.length}
              </span>
            )}
          </button>
        ))}

        {/* Bouton saisie en masse — visible uniquement sur tab sans_prix */}
        {tab==='sans_prix' && itemsSansPrix.length>0 && (
          <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'7px 14px'}}
            onClick={()=>{ setSelectedIds(new Set()); setModalMasse(true) }}>
            ⚡ SAISIE EN MASSE
          </button>
        )}
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : tab === 'liste' ? (
        /* ── Liste complète ── */
        items.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">Aucune récolte saisie</div>
            <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['N° Lot','Date','Serre','Variété','Cat.1','Cat.2','Cat.3','Total','Envoyé station','Prix/kg','CA Station','Actions'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {items.map((r)=>{
                    const total = (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0)
                    const sp    = r.station_price
                    const hasPrix = !!(sp?.price_per_kg)
                    return (
                      <tr key={r.id}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{r.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{r.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{r.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{r.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(r.qty_category_1||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(r.qty_category_2||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{(r.qty_category_3||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{sp?.qty_sent_kg ? sp.qty_sent_kg+' kg' : '—'}</span></td>
                        <td>
                          {hasPrix
                            ? <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>{Number(sp!.price_per_kg).toFixed(3)} MAD</span>
                            : <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>EN ATTENTE</span>
                          }
                        </td>
                        <td>
                          {hasPrix
                            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#9b5de5'}}>{Number(sp!.amount_total).toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
                            : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:10}}>—</span>
                          }
                        </td>
                        <td>
                          <button
                            onClick={()=>{
                              setSelHarvest(r)
                              setFormP({price_per_kg:sp?.price_per_kg?String(sp.price_per_kg):'',station_ref:sp?.station_ref||'',receipt_date:sp?.receipt_date||'',notes:''})
                              setModalPrix(true)
                            }}
                            style={{padding:'4px 10px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',fontSize:9,cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap',
                              borderColor: hasPrix ? '#1a3526' : '#f5a623',
                              background:  hasPrix ? 'transparent' : '#f5a62318',
                              color:       hasPrix ? '#3d6b52' : '#f5a623',
                            }}>
                            {hasPrix ? '✏ MODIFIER PRIX' : '⚡ SAISIR PRIX'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ── Tab Sans Prix ── */
        itemsSansPrix.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Toutes les récoltes ont un prix !</div>
            <div className="empty-sub">Aucune récolte en attente de prix station.</div>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid #1a3526',display:'flex',alignItems:'center',gap:12,background:'#f5a62308'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>⚠ {itemsSansPrix.length} RÉCOLTE(S) EN ATTENTE DE PRIX</span>
              <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'6px 12px'}}
                onClick={()=>{ setSelectedIds(new Set(itemsSansPrix.map(h=>h.id))); setModalMasse(true) }}>
                ⚡ SAISIE EN MASSE
              </button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['N° Lot','Date','Serre','Variété','Total récolté','Envoyé station','Action'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {itemsSansPrix.map((r)=>{
                    const total = (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0)
                    return (
                      <tr key={r.id}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{r.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{r.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{r.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{r.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')} kg</span></td>
                        <td>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>
                            {r.station_price?.qty_sent_kg ? r.station_price.qty_sent_kg+' kg' : '—'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={()=>{ setSelHarvest(r); setFormP({price_per_kg:'',station_ref:'',receipt_date:'',notes:''}); setModalPrix(true) }}
                            className="btn-primary" style={{fontSize:10,padding:'5px 12px',letterSpacing:.5}}>
                            ⚡ SAISIR PRIX
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
