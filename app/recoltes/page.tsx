'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type TabType = 'liste' | 'sans_prix' | 'calendrier'

const STATUTS_JOURNEE = [
  { v:'avec_recolte',   l:'Avec récolte',     c:'#00e87a' },
  { v:'sans_recolte',   l:'Sans récolte',      c:'#ff4d6d' },
  { v:'maintenance',    l:'Maintenance serre', c:'#f5a623' },
  { v:'traitement',     l:'Traitement phyto',  c:'#9b5de5' },
  { v:'conge',          l:'Congé / Repos',     c:'#3d6b52' },
  { v:'intemperie',     l:'Intempérie',        c:'#00b4d8' },
]

export default function RecoltesPage() {
  const [tab, setTab] = useState<TabType>('liste')

  /* ── Données ── */
  const [harvests,    setHarvests]    = useState<any[]>([])
  const [plantings,   setPlantings]   = useState<any[]>([])
  const [markets,     setMarkets]     = useState<any[]>([])
  const [mktPrices,   setMktPrices]   = useState<Record<string,any[]>>({}) // harvest_id → []
  const [dailyStatus, setDailyStatus] = useState<Record<string, any>>({})  // date → row
  const [campagnes,   setCampagnes]   = useState<any[]>([])
  const [serres,      setSerres]      = useState<any[]>([])
  const [tablesOk,    setTablesOk]    = useState<{mkt:boolean,daily:boolean}>({mkt:false,daily:false})
  const [loading, setLoading] = useState(true)

  /* ── Modales ── */
  const [modalNew,    setModalNew]    = useState(false)
  const [modalMktAdd, setModalMktAdd] = useState(false)  // ajouter envoi marché
  const [modalPrix,   setModalPrix]   = useState(false)  // saisir prix unitaire
  const [modalMasse,  setModalMasse]  = useState(false)  // saisie masse
  const [modalJour,   setModalJour]   = useState(false)  // statut journée
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  /* ── Forms ── */
  const [formR, setFormR] = useState({
    campaign_planting_id:'', harvest_date:'',
    qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'', notes:''
  })
  const sr = (k:string) => (e:any) => setFormR(f=>({...f,[k]:e.target.value}))

  // Ajout marché à une récolte
  const [selHarvest, setSelHarvest] = useState<any>(null)
  const [formMkt, setFormMkt] = useState({ market_id:'', qty_sent_kg:'', currency:'MAD' })
  const sm = (k:string) => (e:any) => setFormMkt(f=>({...f,[k]:e.target.value}))

  // Prix unitaire
  const [selMktPrice, setSelMktPrice] = useState<any>(null)
  const [formP, setFormP] = useState({ price_per_kg:'', station_ref:'', receipt_date:'', notes:'' })
  const sp = (k:string) => (e:any) => setFormP(f=>({...f,[k]:e.target.value}))

  // Saisie masse
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massPrice,   setMassPrice]   = useState('')
  const [massRef,     setMassRef]     = useState('')
  const [massDate,    setMassDate]    = useState('')
  const [massMarket,  setMassMarket]  = useState('')

  // Statut journée
  const [formJour, setFormJour] = useState({ status_date:'', status:'sans_recolte', campaign_id:'', greenhouse_id:'', reason:'' })
  const sj = (k:string) => (e:any) => setFormJour(f=>({...f,[k]:e.target.value}))

  /* ─────────── CHARGEMENT ─────────── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Vérifier tables
      const [chkMkt, chkDaily] = await Promise.all([
        supabase.from('harvest_market_prices').select('id').limit(1),
        supabase.from('harvest_daily_status').select('id').limit(1),
      ])
      const mktOk   = !chkMkt.error
      const dailyOk = !chkDaily.error
      setTablesOk({ mkt: mktOk, daily: dailyOk })

      const [r, p, m, c, s] = await Promise.all([
        supabase.from('harvests')
          .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
          .order('harvest_date', { ascending: false }).limit(200),
        supabase.from('campaign_plantings')
          .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)'),
        supabase.from('markets').select('id,name,code,currency').eq('is_active',true).order('name'),
        supabase.from('campaigns').select('id,name').order('name'),
        supabase.from('greenhouses').select('id,code,name').order('code'),
      ])

      setHarvests(r.data || [])
      setPlantings(p.data || [])
      setMarkets(m.data || [])
      setCampagnes(c.data || [])
      setSerres(s.data || [])

      if (mktOk && r.data?.length) {
        const { data: prices } = await supabase
          .from('harvest_market_prices')
          .select('*, markets(name,currency)')
          .in('harvest_id', (r.data||[]).map((h:any) => h.id))
        const map: Record<string,any[]> = {}
        ;(prices||[]).forEach((p:any) => {
          if (!map[p.harvest_id]) map[p.harvest_id] = []
          map[p.harvest_id].push(p)
        })
        setMktPrices(map)
      }

      if (dailyOk) {
        const { data: ds } = await supabase
          .from('harvest_daily_status')
          .select('*')
          .order('status_date', { ascending: false })
          .limit(90)
        const dsMap: Record<string,any> = {}
        ;(ds||[]).forEach((d:any) => { dsMap[d.status_date] = d })
        setDailyStatus(dsMap)
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ─────────── SAUVEGARDER RÉCOLTE ─────────── */
  const saveRecolte = async () => {
    if (!formR.campaign_planting_id || !formR.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { error } = await supabase.from('harvests').insert({
        campaign_planting_id: formR.campaign_planting_id,
        harvest_date:    formR.harvest_date,
        qty_category_1:  Number(formR.qty_category_1)||0,
        qty_category_2:  Number(formR.qty_category_2)||0,
        qty_category_3:  Number(formR.qty_category_3)||0,
        qty_waste:       Number(formR.qty_waste)||0,
        lot_number: lot,
        notes: formR.notes||null,
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormR({campaign_planting_id:'',harvest_date:'',qty_category_1:'',qty_category_2:'',qty_category_3:'',qty_waste:'',notes:''})
        load()
      }, 1200)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────── AJOUTER ENVOI MARCHÉ ─────────── */
  const saveMktAdd = async () => {
    if (!selHarvest || !formMkt.market_id || !formMkt.qty_sent_kg) return
    setSaving(true)
    try {
      const mkt = markets.find(m=>m.id===formMkt.market_id)
      const { error } = await supabase.from('harvest_market_prices').upsert({
        harvest_id:  selHarvest.id,
        market_id:   formMkt.market_id,
        qty_sent_kg: Number(formMkt.qty_sent_kg),
        price_per_kg: null,
        currency:    mkt?.currency || formMkt.currency,
      }, { onConflict: 'harvest_id,market_id' })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalMktAdd(false); setDone(false); setSelHarvest(null); setFormMkt({market_id:'',qty_sent_kg:'',currency:'MAD'}); load() }, 1200)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────── SAISIR PRIX UNITAIRE ─────────── */
  const savePrix = async () => {
    if (!selMktPrice || !formP.price_per_kg) return
    setSaving(true)
    try {
      const { error } = await supabase.from('harvest_market_prices').update({
        price_per_kg: Number(formP.price_per_kg),
        station_ref:  formP.station_ref||null,
        receipt_date: formP.receipt_date||null,
        price_set_at: new Date().toISOString(),
        notes:        formP.notes||null,
      }).eq('id', selMktPrice.id)
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalPrix(false); setDone(false); setSelMktPrice(null); setFormP({price_per_kg:'',station_ref:'',receipt_date:'',notes:''}); load() }, 1200)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────── SAISIE EN MASSE (CORRIGÉE) ─────────── */
  const saveMasse = async () => {
    if (!massPrice || selectedIds.size === 0) return
    setSaving(true)
    try {
      const prix = Number(massPrice)
      let updated = 0

      for (const rowId of selectedIds) {
        // rowId = id de harvest_market_prices (pas harvest_id!)
        const { error } = await supabase
          .from('harvest_market_prices')
          .update({
            price_per_kg: prix,
            station_ref:  massRef || null,
            receipt_date: massDate || null,
            price_set_at: new Date().toISOString(),
          })
          .eq('id', rowId)
        if (!error) updated++
      }

      setDone(true)
      setTimeout(() => {
        setModalMasse(false); setDone(false)
        setSelectedIds(new Set()); setMassPrice(''); setMassRef(''); setMassDate(''); setMassMarket('')
        load()
      }, 1200)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────── STATUT JOURNÉE ─────────── */
  const saveJour = async () => {
    if (!formJour.status_date || !formJour.status) return
    setSaving(true)
    try {
      const { error } = await supabase.from('harvest_daily_status').upsert({
        status_date:  formJour.status_date,
        status:       formJour.status,
        campaign_id:  formJour.campaign_id||null,
        greenhouse_id:formJour.greenhouse_id||null,
        reason:       formJour.reason||null,
      }, { onConflict: 'status_date' })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalJour(false); setDone(false); setFormJour({status_date:'',status:'sans_recolte',campaign_id:'',greenhouse_id:'',reason:''}); load() }, 1200)
    } catch(e:any) { alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─────────── CALCULS ─────────── */
  const allMktRows = Object.values(mktPrices).flat()
  const sansPrix   = allMktRows.filter(r => !r.price_per_kg)
  const avecPrix   = allMktRows.filter(r => !!r.price_per_kg)
  const totalCA    = avecPrix.reduce((s,r) => s + (r.qty_sent_kg * r.price_per_kg), 0)
  const totalKg    = harvests.reduce((s,r) => s+(r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0), 0)

  // Jours sans récolte (30 derniers jours)
  const today = new Date()
  const alerteJours: string[] = []
  for (let i=1; i<=7; i++) {
    const d = new Date(today); d.setDate(d.getDate()-i)
    const ds = d.toISOString().slice(0,10)
    const hasRecolte = harvests.some(h=>h.harvest_date===ds)
    const hasStatus  = dailyStatus[ds]
    if (!hasRecolte && !hasStatus) alerteJours.push(ds)
  }

  // Pour saisie masse : tous les envois sans prix
  const filteredSansPrix = massMarket
    ? sansPrix.filter(r => r.market_id === massMarket)
    : sansPrix

  const toggleSelect = (id:string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const H_COLS = 'DM Mono,monospace'
  const H_DISP = 'Rajdhani,sans-serif'

  /* ─────────── RENDU ─────────── */
  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>

      {/* ══ Alerte tables manquantes ══ */}
      {(!tablesOk.mkt || !tablesOk.daily) && !loading && (
        <div style={{marginBottom:16,padding:'14px 18px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:8}}>
          <div style={{fontFamily:H_COLS,fontSize:11,color:'#ff4d6d',marginBottom:8,letterSpacing:.5}}>
            ⚠ TABLES MANQUANTES — Exécutez ce SQL dans Supabase → SQL Editor :
          </div>
          <pre style={{fontSize:9,color:'#ff9ab0',background:'#1a0a0d',padding:'10px',borderRadius:6,overflow:'auto',lineHeight:1.5}}>
{`CREATE TABLE IF NOT EXISTS harvest_market_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id),
  qty_sent_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg DECIMAL(8,4),
  currency VARCHAR(10) DEFAULT 'MAD',
  station_ref VARCHAR(100), receipt_date DATE,
  price_set_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(harvest_id, market_id)
);
ALTER TABLE harvest_market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_market_prices FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS harvest_daily_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_date DATE NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'sans_recolte',
  campaign_id UUID REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  reason TEXT, noted_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE harvest_daily_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON harvest_daily_status FOR ALL USING (true) WITH CHECK (true);`}
          </pre>
        </div>
      )}

      {/* ══ Alertes jours sans récolte ══ */}
      {tablesOk.daily && alerteJours.length > 0 && (
        <div style={{marginBottom:16,padding:'12px 16px',background:'#f5a62314',border:'1px solid #f5a62340',borderRadius:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <span style={{fontFamily:H_COLS,fontSize:10,color:'#f5a623',letterSpacing:1}}>
                ⚠ {alerteJours.length} JOUR(S) SANS RÉCOLTE NI STATUT (7 derniers jours)
              </span>
              <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                {alerteJours.map(d=>(
                  <span key={d} style={{padding:'2px 8px',background:'#f5a62320',border:'1px solid #f5a62340',borderRadius:4,fontFamily:H_COLS,fontSize:9,color:'#f5a623',cursor:'pointer'}}
                    onClick={()=>{ setFormJour(f=>({...f,status_date:d})); setModalJour(true) }}>
                    {d} ↗
                  </span>
                ))}
              </div>
            </div>
            <button onClick={()=>setModalJour(true)} className="btn-secondary" style={{fontSize:10,padding:'6px 12px',flexShrink:0}}>
              + STATUT JOURNÉE
            </button>
          </div>
        </div>
      )}

      {/* ══ Modale nouvelle récolte ══ */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation / Serre — Variété *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:H_COLS,fontSize:11}}>⚠ Aucune plantation disponible</div>
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
            <div className="section-label" style={{marginTop:12}}>QUANTITÉS RÉCOLTÉES</div>
            <FormRow>
              <FormGroup label="Cat. 1 — Export (kg)"><Input type="number" value={formR.qty_category_1} onChange={sr('qty_category_1')} placeholder="0" /></FormGroup>
              <FormGroup label="Cat. 2 — Local (kg)"><Input type="number" value={formR.qty_category_2} onChange={sr('qty_category_2')} placeholder="0" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cat. 3 — Déclassé (kg)"><Input type="number" value={formR.qty_category_3} onChange={sr('qty_category_3')} placeholder="0" /></FormGroup>
              <FormGroup label="Déchets (kg)"><Input type="number" value={formR.qty_waste} onChange={sr('qty_waste')} placeholder="0" /></FormGroup>
            </FormRow>
            <div style={{padding:'8px 12px',background:'#00b4d814',border:'1px solid #00b4d830',borderRadius:6,fontFamily:H_COLS,fontSize:10,color:'#00b4d8',marginBottom:12}}>
              ℹ Les envois par marché et les prix seront définis séparément après la saisie
            </div>
            <FormGroup label="Notes qualité"><Textarea rows={2} value={formR.notes} onChange={sr('notes')} placeholder="Observations..." /></FormGroup>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveRecolte} loading={saving}
              disabled={!formR.campaign_planting_id||!formR.harvest_date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ Modale ajout envoi marché ══ */}
      {modalMktAdd && selHarvest && (
        <Modal title="ENVOI VERS UN MARCHÉ" onClose={()=>{setModalMktAdd(false);setDone(false);setSelHarvest(null)}}>
          {done ? <SuccessMessage message="Envoi enregistré !" /> : (<>
            <div style={{padding:'10px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              <div style={{fontFamily:H_COLS,fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:4}}>RÉCOLTE</div>
              <div style={{fontFamily:H_DISP,fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{selHarvest.lot_number}</div>
              <div style={{fontFamily:H_COLS,fontSize:10,color:'#7aab90',marginTop:2}}>
                {selHarvest.campaign_plantings?.greenhouses?.name} · {selHarvest.harvest_date}
              </div>
              <div style={{fontFamily:H_COLS,fontSize:10,color:'#3d6b52',marginTop:2}}>
                Total récolté : {((selHarvest.qty_category_1||0)+(selHarvest.qty_category_2||0)+(selHarvest.qty_category_3||0)).toLocaleString('fr')} kg
              </div>
            </div>
            <FormGroup label="Marché *">
              {markets.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:H_COLS,fontSize:11}}>⚠ Aucun marché — créez d'abord un marché</div>
                : <Select value={formMkt.market_id} onChange={e=>{
                    const mkt = markets.find(m=>m.id===e.target.value)
                    setFormMkt(f=>({...f, market_id:e.target.value, currency:mkt?.currency||'MAD'}))
                  }}>
                    <option value="">-- Sélectionner --</option>
                    {markets.map(m=>(
                      <option key={m.id} value={m.id}>{m.name} ({m.currency})</option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Quantité envoyée (kg) *">
                <Input type="number" value={formMkt.qty_sent_kg} onChange={sm('qty_sent_kg')} placeholder="0" autoFocus />
              </FormGroup>
              <FormGroup label="Devise">
                <Input value={formMkt.currency} readOnly style={{opacity:.6}} />
              </FormGroup>
            </FormRow>
            <div style={{padding:'8px 12px',background:'#f5a62312',border:'1px solid #f5a62330',borderRadius:6,fontFamily:H_COLS,fontSize:10,color:'#f5a623',marginBottom:12}}>
              ⚠ Le prix /kg sera saisi ultérieurement — la ligne apparaîtra dans «&nbsp;Sans prix station&nbsp;»
            </div>
            <ModalFooter onCancel={()=>{setModalMktAdd(false);setSelHarvest(null)}} onSave={saveMktAdd} loading={saving}
              disabled={!formMkt.market_id||!formMkt.qty_sent_kg} saveLabel="ENREGISTRER L'ENVOI" />
          </>)}
        </Modal>
      )}

      {/* ══ Modale prix unitaire ══ */}
      {modalPrix && selMktPrice && (
        <Modal title="SAISIR LE PRIX" onClose={()=>{setModalPrix(false);setDone(false);setSelMktPrice(null)}}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            <div style={{padding:'10px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              <div style={{fontFamily:H_COLS,fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:4}}>ENVOI SÉLECTIONNÉ</div>
              <div style={{fontFamily:H_DISP,fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{selMktPrice.markets?.name}</div>
              <div style={{fontFamily:H_COLS,fontSize:10,color:'#7aab90',marginTop:2}}>
                Qté envoyée : <strong style={{color:'#f5a623'}}>{selMktPrice.qty_sent_kg} kg</strong>
                {formP.price_per_kg && <span style={{color:'#00e87a'}}> → CA : {(selMktPrice.qty_sent_kg * Number(formP.price_per_kg)).toFixed(2)} {selMktPrice.currency}</span>}
              </div>
            </div>
            <FormGroup label={`Prix / kg (${selMktPrice.currency}) *`}>
              <Input type="number" step="0.0001" value={formP.price_per_kg} onChange={sp('price_per_kg')} placeholder="ex: 1.8500" autoFocus />
            </FormGroup>
            {formP.price_per_kg && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:H_COLS,fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA station : {(selMktPrice.qty_sent_kg * Number(formP.price_per_kg)).toFixed(2)} {selMktPrice.currency}
              </div>
            )}
            <FormRow>
              <FormGroup label="Réf. station"><Input value={formP.station_ref} onChange={sp('station_ref')} placeholder="ex: STAT-2026-0325" /></FormGroup>
              <FormGroup label="Date de réception"><Input type="date" value={formP.receipt_date} onChange={sp('receipt_date')} /></FormGroup>
            </FormRow>
            <FormGroup label="Notes"><Textarea rows={2} value={formP.notes} onChange={sp('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>{setModalPrix(false);setSelMktPrice(null)}} onSave={savePrix} loading={saving}
              disabled={!formP.price_per_kg} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ══ Modale saisie en masse (CORRIGÉE) ══ */}
      {modalMasse && (
        <Modal title="SAISIE EN MASSE — PRIX STATION" onClose={()=>{setModalMasse(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message={`Prix appliqué à ${selectedIds.size} envoi(s) !`} /> : (<>
            {/* Filtre par marché */}
            <FormGroup label="Filtrer par marché (optionnel)">
              <Select value={massMarket} onChange={e=>{setMassMarket(e.target.value);setSelectedIds(new Set())}}>
                <option value="">Tous les marchés</option>
                {markets.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </FormGroup>

            {/* Liste des envois sans prix */}
            <div className="section-label" style={{marginBottom:10}}>
              ENVOIS SANS PRIX ({filteredSansPrix.length})
            </div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <button onClick={()=>setSelectedIds(new Set(filteredSansPrix.map(r=>r.id)))} className="btn-secondary" style={{fontSize:10,padding:'5px 10px'}}>TOUT</button>
              <button onClick={()=>setSelectedIds(new Set())} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>EFFACER</button>
              <span style={{fontFamily:H_COLS,fontSize:10,color:'#3d6b52',alignSelf:'center',marginLeft:'auto'}}>{selectedIds.size} sélectionné(s)</span>
            </div>

            <div style={{maxHeight:240,overflowY:'auto',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              {filteredSansPrix.length===0
                ? <div style={{padding:24,textAlign:'center',fontFamily:H_COLS,fontSize:10,color:'#3d6b52'}}>Aucun envoi sans prix{massMarket?' pour ce marché':''}</div>
                : filteredSansPrix.map(r => {
                    const h = harvests.find(x=>x.id===r.harvest_id)
                    const sel = selectedIds.has(r.id)
                    return (
                      <div key={r.id} onClick={()=>toggleSelect(r.id)}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'9px 14px',borderBottom:'1px solid #1a3526',cursor:'pointer',background:sel?'#00e87a0a':'transparent',transition:'background .1s'}}>
                        <div style={{width:15,height:15,borderRadius:3,flexShrink:0,border:'1px solid',borderColor:sel?'#00e87a':'#1f4030',background:sel?'#00e87a':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#030a07',fontWeight:900}}>
                          {sel?'✓':''}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontFamily:H_COLS,fontSize:10,color:'#00e87a'}}>{h?.lot_number}</span>
                            <span style={{fontFamily:H_COLS,fontSize:9,color:'#3d6b52'}}>{h?.harvest_date}</span>
                            <span style={{fontFamily:H_COLS,fontSize:9,color:'#7aab90'}}>{r.markets?.name}</span>
                          </div>
                          <div style={{fontFamily:H_DISP,fontSize:11,color:'#7aab90',marginTop:1}}>
                            {h?.campaign_plantings?.greenhouses?.name} · {h?.campaign_plantings?.varieties?.commercial_name}
                          </div>
                        </div>
                        <div style={{fontFamily:H_COLS,fontSize:10,color:'#f5a623',flexShrink:0,textAlign:'right'}}>
                          {r.qty_sent_kg} kg · {r.currency}
                        </div>
                      </div>
                    )
                  })
              }
            </div>

            {/* Prix à appliquer */}
            <div className="section-label">PRIX À APPLIQUER</div>
            <FormGroup label="Prix / kg *">
              <Input type="number" step="0.0001" value={massPrice} onChange={e=>setMassPrice(e.target.value)} placeholder="ex: 1.8500" autoFocus />
            </FormGroup>
            {massPrice && selectedIds.size>0 && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:H_COLS,fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA total : {filteredSansPrix.filter(r=>selectedIds.has(r.id)).reduce((s,r)=>s+r.qty_sent_kg*Number(massPrice),0).toFixed(2)} — sur {selectedIds.size} envoi(s)
              </div>
            )}
            <FormRow>
              <FormGroup label="Réf. station"><Input value={massRef} onChange={e=>setMassRef(e.target.value)} placeholder="ex: STAT-2026-0325" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={massDate} onChange={e=>setMassDate(e.target.value)} /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>{setModalMasse(false);setSelectedIds(new Set())}} onSave={saveMasse} loading={saving}
              disabled={!massPrice||selectedIds.size===0}
              saveLabel={`APPLIQUER À ${selectedIds.size} ENVOI(S)`} />
          </>)}
        </Modal>
      )}

      {/* ══ Modale statut journée ══ */}
      {modalJour && (
        <Modal title="STATUT JOURNÉE" onClose={()=>{setModalJour(false);setDone(false)}}>
          {done ? <SuccessMessage message="Statut enregistré !" /> : (<>
            <FormGroup label="Date *">
              <Input type="date" value={formJour.status_date} onChange={sj('status_date')} />
            </FormGroup>
            <FormGroup label="Statut *">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {STATUTS_JOURNEE.map(st=>(
                  <div key={st.v} onClick={()=>setFormJour(f=>({...f,status:st.v}))}
                    style={{padding:'10px 14px',borderRadius:8,border:'1px solid',cursor:'pointer',transition:'all .15s',
                      borderColor: formJour.status===st.v ? st.c : '#1a3526',
                      background:  formJour.status===st.v ? `${st.c}18` : '#0d1f14',
                    }}>
                    <div style={{fontFamily:H_COLS,fontSize:10,color:formJour.status===st.v?st.c:'#3d6b52',letterSpacing:.5}}>{st.l}</div>
                  </div>
                ))}
              </div>
            </FormGroup>
            <FormRow>
              <FormGroup label="Campagne">
                <Select value={formJour.campaign_id} onChange={sj('campaign_id')}>
                  <option value="">— Optionnel —</option>
                  {campagnes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Serre concernée">
                <Select value={formJour.greenhouse_id} onChange={sj('greenhouse_id')}>
                  <option value="">Toutes</option>
                  {serres.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormGroup label="Motif / Explication">
              <Textarea rows={2} value={formJour.reason} onChange={sj('reason')} placeholder="ex: Traitement préventif mildiou — attente 48h..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalJour(false)} onSave={saveJour} loading={saving}
              disabled={!formJour.status_date||!formJour.status} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ Header ══ */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">
            {harvests.length} lot(s) · {(totalKg/1000).toFixed(2)} t · CA : {(totalCA).toLocaleString('fr',{maximumFractionDigits:0})} MAD
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setModalJour(true)} className="btn-ghost" style={{fontSize:11}}>📅 STATUT JOURNÉE</button>
          <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Lots totaux',  v:String(harvests.length),           c:'#00e87a'},
          {l:'Production',   v:(totalKg/1000).toFixed(2)+' t',   c:'#00ffc8'},
          {l:'Envois marché',v:String(allMktRows.length),         c:'#00b4d8'},
          {l:'Sans prix',    v:String(sansPrix.length),            c:'#f5a623'},
          {l:'CA Total',     v:(totalCA/1000).toFixed(1)+' k',   c:'#9b5de5'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,textShadow:`0 0 16px ${k.c}60`,fontSize:22}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ══ Onglets ══ */}
      <div style={{display:'flex',gap:4,marginBottom:16,alignItems:'center'}}>
        {([
          ['liste','TOUTES LES RÉCOLTES',harvests.length],
          ['sans_prix','SANS PRIX STATION',sansPrix.length],
          ['calendrier','CALENDRIER JOURS',null],
        ] as [TabType,string,number|null][]).map(([t,label,badge])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'8px 16px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',fontSize:10,letterSpacing:.8,cursor:'pointer',transition:'all .15s',
              borderColor:tab===t?'#00e87a':'#1a3526',background:tab===t?'#00e87a18':'transparent',color:tab===t?'#00e87a':'#3d6b52'}}>
            {label}
            {badge !== null && badge > 0 && (
              <span style={{marginLeft:7,background:t==='sans_prix'?'#f5a623':'#00e87a',color:'#030a07',borderRadius:10,padding:'1px 6px',fontSize:8,fontWeight:900}}>
                {badge}
              </span>
            )}
          </button>
        ))}
        {tab==='sans_prix' && sansPrix.length>0 && (
          <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'7px 14px',letterSpacing:.5}}
            onClick={()=>{ setSelectedIds(new Set()); setMassMarket(''); setModalMasse(true) }}>
            ⚡ SAISIE EN MASSE ({sansPrix.length})
          </button>
        )}
      </div>

      {/* ══ Contenu ══ */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : tab==='liste' ? (
        harvests.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">Aucune récolte</div>
            <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {harvests.map((h:any)=>{
              const total  = (h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0)
              const envois = mktPrices[h.id] || []
              const caH    = envois.reduce((s:number,r:any)=>s+(r.qty_sent_kg*(r.price_per_kg||0)),0)
              return (
                <div key={h.id} className="card">
                  {/* En-tête lot */}
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12,paddingBottom:10,borderBottom:'1px solid #1a3526'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>{h.lot_number}</span>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h.harvest_date}</span>
                      </div>
                      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee',marginTop:2}}>
                        {h.campaign_plantings?.greenhouses?.name} · {h.campaign_plantings?.varieties?.commercial_name}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {caH>0 && <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#9b5de5'}}>{caH.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>}
                      <button onClick={()=>{ setSelHarvest(h); setFormMkt({market_id:'',qty_sent_kg:'',currency:'MAD'}); setModalMktAdd(true) }}
                        className="btn-secondary" style={{fontSize:10,padding:'5px 10px'}}>+ MARCHÉ</button>
                    </div>
                  </div>

                  {/* Quantités */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
                    {[['Cat.1 Export','#f5a623',h.qty_category_1],['Cat.2 Local','#00b4d8',h.qty_category_2],['Cat.3 Déclassé','#3d6b52',h.qty_category_3],['Total','#00e87a',total]].map(([l,c,v]:any)=>(
                      <div key={l} style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,padding:'6px 10px'}}>
                        <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#3d6b52',letterSpacing:.8,marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:c}}>{(v||0).toLocaleString('fr')} kg</div>
                      </div>
                    ))}
                  </div>

                  {/* Envois par marché */}
                  {envois.length>0 && (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {envois.map((r:any)=>(
                        <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'#0d1f14',border:'1px solid',borderColor:r.price_per_kg?'#1a3526':'#f5a62330',borderRadius:7}}>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',flex:1}}>{r.markets?.name}</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>{r.qty_sent_kg} kg</span>
                          {r.price_per_kg
                            ? <>
                                <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{Number(r.price_per_kg).toFixed(4)} {r.currency}/kg</span>
                                <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#9b5de5'}}>{(r.qty_sent_kg*r.price_per_kg).toFixed(2)} {r.currency}</span>
                                <button onClick={()=>{ setSelMktPrice(r); setFormP({price_per_kg:String(r.price_per_kg),station_ref:r.station_ref||'',receipt_date:r.receipt_date||'',notes:''}); setModalPrix(true) }}
                                  style={{padding:'3px 8px',borderRadius:5,border:'1px solid #1a3526',background:'transparent',color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:9,cursor:'pointer'}}>✏</button>
                              </>
                            : <>
                                <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623',padding:'2px 6px',background:'#f5a62318',borderRadius:4}}>EN ATTENTE PRIX</span>
                                <button onClick={()=>{ setSelMktPrice(r); setFormP({price_per_kg:'',station_ref:'',receipt_date:'',notes:''}); setModalPrix(true) }}
                                  className="btn-primary" style={{fontSize:9,padding:'4px 10px',letterSpacing:.5}}>⚡ PRIX</button>
                              </>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : tab==='sans_prix' ? (
        sansPrix.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Tous les prix sont renseignés !</div>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid #1a3526',display:'flex',alignItems:'center',gap:12,background:'#f5a62308'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',letterSpacing:.5}}>
                ⚠ {sansPrix.length} ENVOI(S) EN ATTENTE DE PRIX
              </span>
              <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'6px 12px'}}
                onClick={()=>{ setSelectedIds(new Set(sansPrix.map(r=>r.id))); setMassMarket(''); setModalMasse(true) }}>
                ⚡ SAISIE EN MASSE
              </button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>{['Lot','Date','Serre','Variété','Marché','Qté envoyée','Devise','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {sansPrix.map(r=>{
                    const h = harvests.find((x:any)=>x.id===r.harvest_id)
                    return (
                      <tr key={r.id}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{h?.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{h?.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{h?.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h?.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#7aab90'}}>{r.markets?.name}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{r.qty_sent_kg} kg</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{r.currency}</span></td>
                        <td>
                          <button onClick={()=>{ setSelMktPrice(r); setFormP({price_per_kg:'',station_ref:'',receipt_date:'',notes:''}); setModalPrix(true) }}
                            className="btn-primary" style={{fontSize:10,padding:'5px 12px',letterSpacing:.5}}>⚡ SAISIR PRIX</button>
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
        /* ── Onglet Calendrier ── */
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',letterSpacing:1}}>
              30 DERNIERS JOURS — STATUT DES JOURNÉES
            </div>
            <button onClick={()=>{ setFormJour({status_date:new Date().toISOString().slice(0,10),status:'sans_recolte',campaign_id:'',greenhouse_id:'',reason:''}); setModalJour(true) }}
              className="btn-primary" style={{fontSize:10,padding:'7px 14px'}}>+ STATUT AUJOURD'HUI</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
            {Array.from({length:30},(_,i)=>{
              const d = new Date(today); d.setDate(d.getDate()-i)
              const ds = d.toISOString().slice(0,10)
              const hasRecolte = harvests.some((h:any)=>h.harvest_date===ds)
              const status = dailyStatus[ds]
              const nbLots = harvests.filter((h:any)=>h.harvest_date===ds).length
              const kgJour = harvests.filter((h:any)=>h.harvest_date===ds).reduce((s:number,h:any)=>s+(h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0),0)

              let color = '#1a3526'; let bg = '#0a1810'; let label = 'VIDE'
              if (hasRecolte) { color='#00e87a'; bg='#00e87a0a'; label=`${nbLots} LOT${nbLots>1?'S':''}` }
              else if (status) {
                const st = STATUTS_JOURNEE.find(x=>x.v===status.status)
                color = st?.c||'#3d6b52'; bg=`${color}0a`; label = st?.l.toUpperCase()||status.status.toUpperCase()
              }

              return (
                <div key={ds}
                  onClick={()=>{ setFormJour({status_date:ds,status:status?.status||'sans_recolte',campaign_id:status?.campaign_id||'',greenhouse_id:status?.greenhouse_id||'',reason:status?.reason||''}); setModalJour(true) }}
                  style={{padding:'8px',background:bg,border:`1px solid ${color}30`,borderRadius:7,cursor:'pointer',transition:'all .15s',textAlign:'center'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=color}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=`${color}30`}>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#3d6b52',letterSpacing:.5,marginBottom:4}}>
                    {d.toLocaleDateString('fr',{weekday:'short'}).toUpperCase()}
                  </div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:15,fontWeight:700,color,lineHeight:1,marginBottom:3}}>
                    {d.getDate()}
                  </div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color,letterSpacing:.3,lineHeight:1.2}}>
                    {label}
                  </div>
                  {kgJour>0 && (
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#3d6b52',marginTop:2}}>
                      {(kgJour/1000).toFixed(1)}t
                    </div>
                  )}
                  {!hasRecolte && !status && (
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#f5a623',marginTop:2}}>?</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
