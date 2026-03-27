'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'liste' | 'sans_prix' | 'alertes'

export default function RecoltesPage() {
  const [tab, setTab]         = useState<Tab>('liste')
  const [harvests, setHarvests] = useState<any[]>([])
  const [dispatches, setDispatches] = useState<any[]>([])  // harvest_lots par marché
  const [plantings, setPlantings]   = useState<any[]>([])
  const [markets, setMarkets]       = useState<any[]>([])
  const [alertes, setAlertes]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  // Modales
  const [modalNew,    setModalNew]    = useState(false)
  const [modalSansPrix, setModalSansPrix] = useState(false)  // liste sans prix → saisie individuelle
  const [modalMasse,  setModalMasse]  = useState(false)
  const [modalAlerte, setModalAlerte] = useState(false)
  const [modalDispatch, setModalDispatch] = useState<any>(null) // récolte sélectionnée pour dispatch

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  // Formulaire récolte
  const [formR, setFormR] = useState({
    campaign_planting_id:'', harvest_date:'',
    qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'',
    quality_notes:'', notes:''
  })
  const sr = (k:string) => (e:any) => setFormR(f=>({...f,[k]:e.target.value}))

  // Formulaire dispatch (envoi par marché)
  const [dispatching, setDispatching] = useState<{market_id:string; qty:string; category:string}[]>([
    {market_id:'', qty:'', category:'export'}
  ])

  // Formulaire prix (sur un dispatch)
  const [selDispatch, setSelDispatch] = useState<any>(null)
  const [formPrix, setFormPrix] = useState({ price_per_kg:'', station_ref:'', receipt_date:'' })

  // Saisie en masse
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massPrice,   setMassPrice]   = useState('')
  const [massRef,     setMassRef]     = useState('')
  const [massDate,    setMassDate]    = useState('')

  // Formulaire alerte journée sans récolte
  const [formAlerte, setFormAlerte] = useState({ date:'', reason:'panne', notes:'' })
  const sa = (k:string) => (e:any) => setFormAlerte(f=>({...f,[k]:e.target.value}))

  /* ─── CHARGEMENT ─── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, d, p, m, al] = await Promise.all([
        supabase.from('harvests')
          .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
          .order('harvest_date', { ascending: false }).limit(200),
        supabase.from('harvest_lots')
          .select('*, markets(name,currency)')
          .eq('category','station_dispatch')
          .order('created_at', { ascending: false }),
        supabase.from('campaign_plantings')
          .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)'),
        supabase.from('markets').select('id,name,currency,type').eq('is_active',true).order('name'),
        supabase.from('alerts').select('*').eq('type','no_harvest').order('created_at',{ascending:false}).limit(50),
      ])
      setHarvests(h.data||[])
      setDispatches(d.data||[])
      setPlantings(p.data||[])
      setMarkets(m.data||[])
      setAlertes(al.data||[])
    } catch(e){ console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ─── SAUVEGARDER RÉCOLTE ─── */
  const saveRecolte = async () => {
    if (!formR.campaign_planting_id || !formR.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${formR.harvest_date.replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formR.campaign_planting_id,
        harvest_date:         formR.harvest_date,
        qty_category_1:  Number(formR.qty_category_1)||0,
        qty_category_2:  Number(formR.qty_category_2)||0,
        qty_category_3:  Number(formR.qty_category_3)||0,
        qty_waste:       Number(formR.qty_waste)||0,
        lot_number: lot,
        quality_notes: formR.quality_notes||null,
        notes:         formR.notes||null,
      }).select('id, campaign_planting_id, harvest_date, qty_category_1, qty_category_2, qty_category_3, variety_id').single()
      if (error) throw error

      // Créer les dispatches par marché
      for (const d of dispatching) {
        if (!d.market_id || !d.qty) continue
        const cp = plantings.find(p=>p.id===formR.campaign_planting_id)
        await supabase.from('harvest_lots').insert({
          lot_number:           `DISP-${lot}-${d.market_id.slice(0,4)}`,
          harvest_id:           data.id,
          campaign_planting_id: formR.campaign_planting_id,
          harvest_date:         formR.harvest_date,
          quantity_kg:          Number(d.qty),
          category:             'station_dispatch',
          variety_id:           cp?.variety_id || null,
          greenhouse_id:        cp?.greenhouse_id || null,
          market_id:            d.market_id,
          // certificate_number = price_per_kg (null tant qu'on n'a pas le prix)
          certificate_number:   null,
          // storage_temp = amount_total
          storage_temp:         null,
          notes: null,
        })
      }

      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormR({campaign_planting_id:'',harvest_date:'',qty_category_1:'',qty_category_2:'',qty_category_3:'',qty_waste:'',quality_notes:'',notes:''})
        setDispatching([{market_id:'',qty:'',category:'export'}])
        load()
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── SAUVEGARDER PRIX UNITAIRE ─── */
  const savePrix = async () => {
    if (!selDispatch || !formPrix.price_per_kg) return
    setSaving(true)
    try {
      const prix = Number(formPrix.price_per_kg)
      const montant = selDispatch.quantity_kg * prix
      const meta = JSON.stringify({
        station_ref:  formPrix.station_ref||null,
        receipt_date: formPrix.receipt_date||null,
        price_set_at: new Date().toISOString(),
      })
      const { error } = await supabase.from('harvest_lots').update({
        certificate_number: String(prix),
        storage_temp:       montant,
        notes:              meta,
      }).eq('id', selDispatch.id)
      if (error) throw error
      setDone(true)
      setTimeout(() => {
        setModalSansPrix(false); setDone(false); setSelDispatch(null)
        setFormPrix({price_per_kg:'',station_ref:'',receipt_date:''})
        load()
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── SAISIE EN MASSE ─── */
  const saveMasse = async () => {
    if (!massPrice || selectedIds.size === 0) return
    setSaving(true)
    try {
      const prix = Number(massPrice)
      for (const dispId of selectedIds) {
        const d = sansPrix.find(x=>x.id===dispId)
        if (!d) continue
        const montant = d.quantity_kg * prix
        const meta = JSON.stringify({
          station_ref:  massRef||null,
          receipt_date: massDate||null,
          price_set_at: new Date().toISOString(),
        })
        await supabase.from('harvest_lots').update({
          certificate_number: String(prix),
          storage_temp:       montant,
          notes:              meta,
        }).eq('id', dispId)
      }
      setDone(true)
      setTimeout(() => {
        setModalMasse(false); setDone(false)
        setSelectedIds(new Set()); setMassPrice(''); setMassRef(''); setMassDate('')
        load()
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── ALERTE JOURNÉE SANS RÉCOLTE ─── */
  const saveAlerte = async () => {
    if (!formAlerte.date) return
    setSaving(true)
    try {
      const { error } = await supabase.from('alerts').insert({
        type:        'no_harvest',
        severity:    'warning',
        title:       `Journée sans récolte — ${formAlerte.date}`,
        message:     `Motif: ${formAlerte.reason}${formAlerte.notes ? ' — '+formAlerte.notes : ''}`,
        entity_type: 'harvest',
        is_read:     false,
        is_resolved: false,
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => {
        setModalAlerte(false); setDone(false)
        setFormAlerte({date:'', reason:'panne', notes:''})
        load()
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const resolveAlerte = async (id:string) => {
    await supabase.from('alerts').update({is_resolved:true, resolved_at: new Date().toISOString()}).eq('id',id)
    setAlertes(p=>p.map(a=>a.id===id ? {...a,is_resolved:true} : a))
  }

  /* ─── DONNÉES CALCULÉES ─── */
  // Dispatches sans prix = certificate_number IS NULL
  const sansPrix = dispatches.filter(d => !d.certificate_number)
  const avecPrix = dispatches.filter(d =>  d.certificate_number)

  // CA total station
  const totalCA = avecPrix.reduce((s,d) => s+(d.storage_temp||0), 0)

  // CA par marché
  const caParMarche: Record<string,{nom:string;qty:number;ca:number;currency:string}> = {}
  for (const d of dispatches) {
    const mid = d.market_id||'unknown'
    if (!caParMarche[mid]) caParMarche[mid] = {nom:d.markets?.name||'—',qty:0,ca:0,currency:d.markets?.currency||'MAD'}
    caParMarche[mid].qty += d.quantity_kg||0
    caParMarche[mid].ca  += d.storage_temp||0
  }

  const totalKg = harvests.filter(h=>!h.quality_notes?.startsWith('SANS_RECOLTE'))
    .reduce((s,h)=>(s+(h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0)),0)

  const joursSansRecolte = alertes.filter(a=>!a.is_resolved)
  const jrsTotal = harvests.filter(h=>h.quality_notes?.startsWith('SANS_RECOLTE')).length

  const toggleSel = (id:string) => setSelectedIds(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})

  /* ─── HELPERS DISPATCH ─── */
  const addDispatch = () => setDispatching(p=>[...p,{market_id:'',qty:'',category:'export'}])
  const rmDispatch  = (i:number) => setDispatching(p=>p.filter((_,j)=>j!==i))
  const upDispatch  = (i:number,k:string,v:string) => setDispatching(p=>p.map((d,j)=>j===i?{...d,[k]:v}:d))

  const totalDispatche = dispatching.reduce((s,d)=>s+Number(d.qty||0),0)

  /* ═══════════════════════════ RENDU ═══════════════════════════ */
  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>

      {/* ═══ MODALE NOUVELLE RÉCOLTE ═══ */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>

            <div className="section-label">IDENTIFICATION</div>
            <FormGroup label="Plantation / Serre — Variété *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation — créez d'abord une campagne avec des plantations</div>
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
              <FormGroup label="Cat.1 — Export (kg)">
                <Input type="number" value={formR.qty_category_1} onChange={sr('qty_category_1')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Cat.2 — Local (kg)">
                <Input type="number" value={formR.qty_category_2} onChange={sr('qty_category_2')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cat.3 — Déclassé (kg)">
                <Input type="number" value={formR.qty_category_3} onChange={sr('qty_category_3')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={formR.qty_waste} onChange={sr('qty_waste')} placeholder="0" />
              </FormGroup>
            </FormRow>

            {/* DISPATCH PAR MARCHÉ */}
            <div className="section-label" style={{marginTop:16}}>
              ENVOI PAR MARCHÉ
              <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginLeft:8,letterSpacing:0}}>
                (le prix sera saisi ultérieurement)
              </span>
            </div>
            {dispatching.map((d,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 120px 110px 32px',gap:8,marginBottom:8,alignItems:'end'}}>
                <FormGroup label={i===0 ? 'Marché' : ''}>
                  <Select value={d.market_id} onChange={e=>upDispatch(i,'market_id',e.target.value)}>
                    <option value="">-- Marché --</option>
                    {markets.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label={i===0 ? 'Qté (kg)' : ''}>
                  <Input type="number" value={d.qty} onChange={e=>upDispatch(i,'qty',e.target.value)} placeholder="kg" />
                </FormGroup>
                <FormGroup label={i===0 ? 'Catégorie' : ''}>
                  <Select value={d.category} onChange={e=>upDispatch(i,'category',e.target.value)}>
                    <option value="export">Export</option>
                    <option value="local">Local</option>
                    <option value="station">Station</option>
                  </Select>
                </FormGroup>
                <div style={{paddingBottom:2}}>
                  {dispatching.length>1
                    ? <button onClick={()=>rmDispatch(i)} className="btn-danger" style={{padding:'8px',fontSize:11,height:36}}>✕</button>
                    : <div style={{width:32}}/>
                  }
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:4}}>
              <button onClick={addDispatch} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>+ Ajouter un marché</button>
              {totalDispatche > 0 && (
                <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>
                  Total dispatché : {totalDispatche.toLocaleString('fr')} kg
                </span>
              )}
            </div>
            <div style={{padding:'8px 12px',background:'#f5a62312',border:'1px solid #f5a62330',borderRadius:6,fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',marginBottom:12}}>
              ⚠ Les prix /kg de la station seront définis ultérieurement
            </div>

            <FormGroup label="Notes qualité">
              <Textarea rows={2} value={formR.notes} onChange={sr('notes')} placeholder="Observations..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveRecolte} loading={saving}
              disabled={!formR.campaign_planting_id||!formR.harvest_date} saveLabel="ENREGISTRER LA RÉCOLTE" />
          </>)}
        </Modal>
      )}

      {/* ═══ MODALE PRIX UNITAIRE ═══ */}
      {modalSansPrix && selDispatch && (
        <Modal title="SAISIR LE PRIX STATION" onClose={()=>{setModalSansPrix(false);setDone(false);setSelDispatch(null)}}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            {/* Résumé */}
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:5}}>DISPATCH SÉLECTIONNÉ</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{selDispatch.lot_number}</div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:3}}>
                Marché : {selDispatch.markets?.name} · {selDispatch.quantity_kg} kg envoyés · {selDispatch.harvest_date}
              </div>
            </div>
            <FormGroup label="Prix / kg reçu de la station *">
              <Input type="number" step="0.001" value={formPrix.price_per_kg} autoFocus
                onChange={e=>setFormPrix(p=>({...p,price_per_kg:e.target.value}))} placeholder="ex: 1.850" />
            </FormGroup>
            {formPrix.price_per_kg && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA station : {(selDispatch.quantity_kg * Number(formPrix.price_per_kg)).toFixed(2)} {selDispatch.markets?.currency||'MAD'}
              </div>
            )}
            <FormRow>
              <FormGroup label="Référence station">
                <Input value={formPrix.station_ref} onChange={e=>setFormPrix(p=>({...p,station_ref:e.target.value}))} placeholder="ex: STAT-2026-0312" />
              </FormGroup>
              <FormGroup label="Date de réception">
                <Input type="date" value={formPrix.receipt_date} onChange={e=>setFormPrix(p=>({...p,receipt_date:e.target.value}))} />
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>{setModalSansPrix(false);setSelDispatch(null)}} onSave={savePrix}
              loading={saving} disabled={!formPrix.price_per_kg} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ═══ MODALE SAISIE EN MASSE ═══ */}
      {modalMasse && (
        <Modal title="SAISIE EN MASSE — PRIX STATION" onClose={()=>{setModalMasse(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message={`Prix appliqué à ${selectedIds.size} dispatch(s) !`} /> : (<>
            <div className="section-label">SÉLECTIONNER LES DISPATCHES</div>
            <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center'}}>
              <button onClick={()=>setSelectedIds(new Set(sansPrix.map(d=>d.id)))} className="btn-secondary" style={{fontSize:10,padding:'5px 10px'}}>TOUT SÉLECTIONNER</button>
              <button onClick={()=>setSelectedIds(new Set())} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>EFFACER</button>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',marginLeft:'auto'}}>{selectedIds.size}/{sansPrix.length}</span>
            </div>
            <div style={{maxHeight:260,overflowY:'auto',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              {sansPrix.length===0 ? (
                <div style={{padding:24,textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>Tous les dispatches ont un prix ✓</div>
              ) : sansPrix.map(d=>(
                <div key={d.id} onClick={()=>toggleSel(d.id)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderBottom:'1px solid #1a3526',cursor:'pointer',
                    background:selectedIds.has(d.id)?'#00e87a10':'transparent'}}>
                  <div style={{width:16,height:16,borderRadius:4,border:`1px solid ${selectedIds.has(d.id)?'#00e87a':'#1f4030'}`,
                    background:selectedIds.has(d.id)?'#00e87a':'transparent',display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:10,color:'#030a07',fontWeight:700,flexShrink:0}}>
                    {selectedIds.has(d.id)?'✓':''}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{d.lot_number}</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#7aab90',marginTop:1}}>
                      {d.markets?.name||'—'} · {d.harvest_date}
                    </div>
                  </div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623',flexShrink:0}}>
                    {d.quantity_kg} kg
                  </div>
                </div>
              ))}
            </div>
            <div className="section-label">PRIX À APPLIQUER</div>
            <FormGroup label="Prix / kg station *">
              <Input type="number" step="0.001" value={massPrice} onChange={e=>setMassPrice(e.target.value)} placeholder="ex: 1.850" autoFocus />
            </FormGroup>
            {massPrice && selectedIds.size > 0 && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',marginBottom:14}}>
                → CA total : {sansPrix.filter(d=>selectedIds.has(d.id)).reduce((s,d)=>s+d.quantity_kg*Number(massPrice),0).toFixed(2)} MAD sur {selectedIds.size} dispatch(s)
              </div>
            )}
            <FormRow>
              <FormGroup label="Référence station"><Input value={massRef} onChange={e=>setMassRef(e.target.value)} placeholder="ex: STAT-2026-0325" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={massDate} onChange={e=>setMassDate(e.target.value)} /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalMasse(false)} onSave={saveMasse} loading={saving}
              disabled={!massPrice||selectedIds.size===0}
              saveLabel={`APPLIQUER À ${selectedIds.size} DISPATCH(S)`} />
          </>)}
        </Modal>
      )}

      {/* ═══ MODALE ALERTE JOURNÉE ═══ */}
      {modalAlerte && (
        <Modal title="JOURNÉE SANS RÉCOLTE" onClose={()=>{setModalAlerte(false);setDone(false)}}>
          {done ? <SuccessMessage message="Journée enregistrée !" /> : (<>
            <div style={{padding:'10px 14px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d',marginBottom:16}}>
              ⚠ Cette journée sera marquée sans récolte et une alerte sera créée.
            </div>
            <FormGroup label="Date concernée *">
              <Input type="date" value={formAlerte.date} onChange={sa('date')} autoFocus />
            </FormGroup>
            <FormGroup label="Motif">
              <Select value={formAlerte.reason} onChange={sa('reason')}>
                <option value="panne">Panne équipement</option>
                <option value="meteo">Conditions météo</option>
                <option value="main_oeuvre">Manque main d'œuvre</option>
                <option value="stade_culture">Stade cultural (trop tôt/tard)</option>
                <option value="jour_repos">Jour de repos</option>
                <option value="autre">Autre</option>
              </Select>
            </FormGroup>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formAlerte.notes} onChange={sa('notes')} placeholder="Précisions..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalAlerte(false)} onSave={saveAlerte} loading={saving}
              disabled={!formAlerte.date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">
            {harvests.length} lot(s) · {(totalKg/1000).toFixed(2)} t · CA station : {totalCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{fontSize:11,color:'#ff4d6d',borderColor:'#ff4d6d40'}}>
            ⚠ SANS RÉCOLTE
          </button>
          <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ═══ KPIs ═══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:20}}>
        {[
          {l:'Lots',         v:String(harvests.length),                   c:'#00e87a'},
          {l:'Production',   v:(totalKg/1000).toFixed(1)+' t',            c:'#00ffc8'},
          {l:'Dispatches',   v:String(dispatches.length),                  c:'#00b4d8'},
          {l:'Sans prix',    v:String(sansPrix.length),                    c:'#f5a623'},
          {l:'CA Station',   v:(totalCA/1000).toFixed(1)+' k MAD',        c:'#9b5de5'},
          {l:'Jours ⚠',     v:String(joursSansRecolte.length),            c:'#ff4d6d'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,fontSize:20,textShadow:`0 0 12px ${k.c}50`}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* CA par marché */}
      {Object.keys(caParMarche).length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:20}}>
          {Object.values(caParMarche).map((m,i)=>(
            <div key={i} style={{background:'#0a1810',border:'1px solid #1a3526',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:6}}>MARCHÉ · {m.nom.toUpperCase()}</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:18,fontWeight:700,color:'#00e87a',marginBottom:2}}>{m.ca.toLocaleString('fr',{maximumFractionDigits:0})} {m.currency}</div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{m.qty.toLocaleString('fr')} kg envoyés</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div style={{display:'flex',gap:4,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        {([
          ['liste',     'TOUTES LES RÉCOLTES',  String(harvests.length)],
          ['sans_prix', 'SANS PRIX STATION',     String(sansPrix.length)],
          ['alertes',   'ALERTES JOURNÉE',       String(joursSansRecolte.length)],
        ] as [Tab,string,string][]).map(([t,label,count])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'8px 14px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',
              fontSize:10,letterSpacing:.8,cursor:'pointer',transition:'all .15s',
              borderColor: tab===t ? '#00e87a' : '#1a3526',
              background:  tab===t ? '#00e87a18' : 'transparent',
              color:       tab===t ? '#00e87a' : '#3d6b52'}}>
            {label}
            {Number(count)>0 && (
              <span style={{marginLeft:7,background:t==='alertes'?'#ff4d6d':t==='sans_prix'?'#f5a623':'#00e87a',
                color:'#030a07',borderRadius:10,padding:'1px 6px',fontSize:8,fontWeight:700}}>
                {count}
              </span>
            )}
          </button>
        ))}
        {tab==='sans_prix' && sansPrix.length>0 && (
          <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'7px 12px'}}
            onClick={()=>{ setSelectedIds(new Set()); setModalMasse(true) }}>
            ⚡ SAISIE EN MASSE
          </button>
        )}
      </div>

      {/* ═══ CONTENU TABS ═══ */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : tab==='liste' ? (
        /* ── Liste récoltes ── */
        harvests.length===0 ? (
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
                  {['N° Lot','Date','Serre','Variété','Cat.1','Cat.2','Cat.3','Total (kg)','Marchés','CA Station','Statut'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {harvests.map(h=>{
                    const total = (h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0)
                    const hDisps = dispatches.filter(d=>d.harvest_id===h.id)
                    const hCA = hDisps.reduce((s,d)=>s+(d.storage_temp||0),0)
                    const hMarchés = [...new Set(hDisps.map(d=>d.markets?.name).filter(Boolean))]
                    const sansPrixH = hDisps.filter(d=>!d.certificate_number).length
                    const isSansRecolte = h.quality_notes?.startsWith('SANS_RECOLTE')
                    return (
                      <tr key={h.id} style={{opacity:isSansRecolte?0.5:1}}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{h.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{h.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{h.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(h.qty_category_1||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(h.qty_category_2||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{(h.qty_category_3||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')}</span></td>
                        <td>
                          {hMarchés.length>0
                            ? <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                                {hMarchés.map(m=><span key={m} className="tag tag-blue" style={{fontSize:8}}>{m}</span>)}
                              </div>
                            : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>non dispatché</span>
                          }
                        </td>
                        <td>
                          {hCA>0
                            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#9b5de5'}}>{hCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
                            : sansPrixH>0
                              ? <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623'}}>⏳ {sansPrixH} en attente</span>
                              : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>
                          }
                        </td>
                        <td>
                          {isSansRecolte
                            ? <span className="tag tag-red">SANS RÉCOLTE</span>
                            : hDisps.length===0
                              ? <span className="tag" style={{background:'#1a3526',color:'#3d6b52',border:'1px solid #1a3526',fontSize:8}}>NON DISPATCHÉ</span>
                              : sansPrixH>0
                                ? <span className="tag tag-amber">PRIX MANQUANTS</span>
                                : <span className="tag tag-green">COMPLET</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : tab==='sans_prix' ? (
        /* ── Tab sans prix ── */
        sansPrix.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Tous les dispatches ont un prix !</div>
            <div className="empty-sub">Aucun lot en attente de prix station.</div>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid #1a3526',display:'flex',alignItems:'center',gap:12,background:'#f5a62308'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>⚠ {sansPrix.length} DISPATCH(S) EN ATTENTE DE PRIX</span>
              <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'6px 12px'}}
                onClick={()=>{ setSelectedIds(new Set(sansPrix.map(d=>d.id))); setModalMasse(true) }}>
                ⚡ SAISIE EN MASSE
              </button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['N° Dispatch','Marché','Date récolte','Quantité envoyée','Action'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sansPrix.map(d=>(
                    <tr key={d.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{d.lot_number}</span></td>
                      <td>
                        <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{d.markets?.name||'—'}</span>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginLeft:6}}>{d.markets?.currency}</span>
                      </td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{d.harvest_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#f5a623'}}>{d.quantity_kg?.toLocaleString('fr')} kg</span></td>
                      <td>
                        <button className="btn-primary" style={{fontSize:10,padding:'5px 12px',letterSpacing:.5}}
                          onClick={()=>{
                            setSelDispatch(d)
                            setFormPrix({price_per_kg:'',station_ref:'',receipt_date:''})
                            setModalSansPrix(true)
                          }}>
                          ⚡ SAISIR PRIX
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : (
        /* ── Tab alertes journée ── */
        <div>
          {joursSansRecolte.length>0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#ff4d6d',letterSpacing:1,marginBottom:8}}>
                {joursSansRecolte.length} ALERTE(S) ACTIVE(S)
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {joursSansRecolte.map(a=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#ff4d6d12',border:'1px solid #ff4d6d30',borderRadius:8}}>
                    <span style={{fontSize:18}}>⚠</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#ff4d6d'}}>{a.title}</div>
                      <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:2}}>{a.message}</div>
                    </div>
                    <button onClick={()=>resolveAlerte(a.id)} className="btn-ghost" style={{fontSize:10,padding:'5px 10px',color:'#00e87a',borderColor:'#00e87a40'}}>
                      ✓ RÉSOUDRE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alertes.filter(a=>a.is_resolved).length>0 && (
            <div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',letterSpacing:1,marginBottom:8}}>
                ALERTES RÉSOLUES ({alertes.filter(a=>a.is_resolved).length})
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {alertes.filter(a=>a.is_resolved).map(a=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'#0a1810',border:'1px solid #1a3526',borderRadius:8,opacity:.6}}>
                    <span style={{fontSize:14}}>✓</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:600,color:'#7aab90'}}>{a.title}</div>
                      <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginTop:1}}>{a.message}</div>
                    </div>
                    <span className="tag tag-green" style={{fontSize:8}}>RÉSOLU</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alertes.length===0 && (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <div className="empty-title">Aucune alerte journée</div>
              <div className="empty-sub">Aucune journée sans récolte enregistrée.</div>
              <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{color:'#ff4d6d',borderColor:'#ff4d6d40',fontSize:11}}>
                ⚠ SIGNALER UNE JOURNÉE SANS RÉCOLTE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
