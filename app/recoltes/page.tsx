'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'liste' | 'sans_prix' | 'alertes'

export default function RecoltesPage() {
  const [tab, setTab]       = useState<Tab>('liste')
  const [harvests, setHarvests]   = useState<any[]>([])
  const [dispatches, setDispatches] = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [markets, setMarkets]     = useState<any[]>([])
  const [alertes, setAlertes]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)

  // Modales
  const [modalNew,    setModalNew]    = useState(false)
  const [modalEdit,   setModalEdit]   = useState<any>(null)   // récolte à éditer
  const [modalPrix,   setModalPrix]   = useState<any>(null)   // dispatch pour prix
  const [modalMasse,  setModalMasse]  = useState(false)
  const [modalAlerte, setModalAlerte] = useState(false)

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  // Form nouvelle récolte
  const [formR, setFormR] = useState({
    campaign_planting_id:'', harvest_date:'',
    qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'', notes:''
  })
  const sr = (k:string) => (e:any) => setFormR(f=>({...f,[k]:e.target.value}))

  // Dispatch par marché (lors de la création)
  const [dispatching, setDispatching] = useState<{market_id:string;qty:string;category:string}[]>([
    {market_id:'',qty:'',category:'export'}
  ])

  // Form édition récolte
  const [formEdit, setFormEdit] = useState<Record<string,any>>({})

  // Form prix dispatch
  const [formPrix, setFormPrix] = useState({ price_per_kg:'', station_ref:'', receipt_date:'' })

  // Saisie en masse
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massPrice,   setMassPrice]   = useState('')
  const [massRef,     setMassRef]     = useState('')
  const [massDate,    setMassDate]    = useState('')

  // Form alerte
  const [formAlerte, setFormAlerte] = useState({ date:'', reason:'panne', notes:'' })
  const sa = (k:string) => (e:any) => setFormAlerte(f=>({...f,[k]:e.target.value}))

  /* ─── CHARGEMENT ─── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, d, p, m, al] = await Promise.all([
        supabase.from('harvests')
          .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
          .order('harvest_date', { ascending: false }).limit(300),
        supabase.from('harvest_lots')
          .select('*, markets(name,currency)')
          .eq('category','station_dispatch')
          .order('created_at', { ascending: false }),
        supabase.from('campaign_plantings')
          .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)'),
        supabase.from('markets').select('id,name,currency,type').eq('is_active',true).order('name'),
        supabase.from('alerts').select('*').eq('type','no_harvest').order('created_at',{ascending:false}).limit(100),
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

  /* ─── CRÉER RÉCOLTE ─── */
  const saveRecolte = async () => {
    if (!formR.campaign_planting_id || !formR.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${formR.harvest_date.replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const cp = plantings.find(p=>p.id===formR.campaign_planting_id)
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formR.campaign_planting_id,
        harvest_date:  formR.harvest_date,
        qty_category_1: Number(formR.qty_category_1)||0,
        qty_category_2: Number(formR.qty_category_2)||0,
        qty_category_3: Number(formR.qty_category_3)||0,
        qty_waste:      Number(formR.qty_waste)||0,
        lot_number: lot,
        notes: formR.notes||null,
      }).select('id, campaign_planting_id').single()
      if (error) throw error

      // Créer dispatches par marché
      for (const d of dispatching) {
        if (!d.market_id || !d.qty || Number(d.qty)<=0) continue
        await supabase.from('harvest_lots').insert({
          lot_number:           `DISP-${lot}-${d.market_id.slice(-4)}`,
          harvest_id:           data.id,
          campaign_planting_id: formR.campaign_planting_id,
          harvest_date:         formR.harvest_date,
          quantity_kg:          Number(d.qty),
          category:             'station_dispatch',
          variety_id:           cp?.variety_id||null,
          greenhouse_id:        cp?.greenhouse_id||null,
          market_id:            d.market_id,
          certificate_number:   null,
          storage_temp:         null,
          notes:                null,
        })
      }

      setDone(true)
      setTimeout(() => {
        setModalNew(false); setDone(false)
        setFormR({campaign_planting_id:'',harvest_date:'',qty_category_1:'',qty_category_2:'',qty_category_3:'',qty_waste:'',notes:''})
        setDispatching([{market_id:'',qty:'',category:'export'}])
        load()
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── ÉDITER RÉCOLTE ─── */
  const openEdit = (h: any) => {
    setFormEdit({
      harvest_date:    h.harvest_date,
      qty_category_1:  String(h.qty_category_1||0),
      qty_category_2:  String(h.qty_category_2||0),
      qty_category_3:  String(h.qty_category_3||0),
      qty_waste:       String(h.qty_waste||0),
      notes:           h.notes||'',
    })
    setModalEdit(h)
  }

  const saveEdit = async () => {
    if (!modalEdit) return
    setSaving(true)
    try {
      const { error } = await supabase.from('harvests').update({
        harvest_date:    formEdit.harvest_date,
        qty_category_1:  Number(formEdit.qty_category_1)||0,
        qty_category_2:  Number(formEdit.qty_category_2)||0,
        qty_category_3:  Number(formEdit.qty_category_3)||0,
        qty_waste:       Number(formEdit.qty_waste)||0,
        notes:           formEdit.notes||null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const deleteRecolte = async (id:string, lot:string) => {
    if (!confirm(`Supprimer la récolte ${lot} ? Tous les dispatches associés seront aussi supprimés.`)) return
    await supabase.from('harvest_lots').delete().eq('harvest_id', id)
    await supabase.from('harvests').delete().eq('id', id)
    setHarvests(p=>p.filter(h=>h.id!==id))
    setDispatches(p=>p.filter(d=>d.harvest_id!==id))
  }

  /* ─── SAISIR/MODIFIER PRIX DISPATCH ─── */
  const openPrix = (d: any) => {
    setFormPrix({
      price_per_kg: d.certificate_number ? String(d.certificate_number) : '',
      station_ref:  d.notes ? (() => { try { return JSON.parse(d.notes).station_ref||'' } catch{ return '' } })() : '',
      receipt_date: d.notes ? (() => { try { return JSON.parse(d.notes).receipt_date||'' } catch{ return '' } })() : '',
    })
    setModalPrix(d)
  }

  const savePrix = async () => {
    if (!modalPrix || !formPrix.price_per_kg) return
    setSaving(true)
    try {
      const prix   = Number(formPrix.price_per_kg)
      const montant = modalPrix.quantity_kg * prix
      const meta   = JSON.stringify({
        station_ref:  formPrix.station_ref||null,
        receipt_date: formPrix.receipt_date||null,
        price_set_at: new Date().toISOString(),
      })
      const { error } = await supabase.from('harvest_lots').update({
        certificate_number: String(prix),
        storage_temp:       montant,
        notes:              meta,
      }).eq('id', modalPrix.id)
      if (error) throw error

      // Mettre à jour localement pour affichage immédiat
      setDispatches(p => p.map(d =>
        d.id === modalPrix.id
          ? { ...d, certificate_number: String(prix), storage_temp: montant, notes: meta }
          : d
      ))
      setDone(true)
      setTimeout(() => { setModalPrix(null); setDone(false); setFormPrix({price_per_kg:'',station_ref:'',receipt_date:''}) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const deleteDispatch = async (id:string) => {
    if (!confirm('Supprimer ce dispatch ?')) return
    await supabase.from('harvest_lots').delete().eq('id',id)
    setDispatches(p=>p.filter(d=>d.id!==id))
  }

  /* ─── SAISIE EN MASSE ─── */
  const saveMasse = async () => {
    if (!massPrice || selectedIds.size===0) return
    setSaving(true)
    try {
      const prix = Number(massPrice)
      const updated: any[] = []
      for (const id of selectedIds) {
        const d = sansPrix.find(x=>x.id===id)
        if (!d) continue
        const montant = d.quantity_kg * prix
        const meta = JSON.stringify({ station_ref: massRef||null, receipt_date: massDate||null, price_set_at: new Date().toISOString() })
        const { error } = await supabase.from('harvest_lots').update({
          certificate_number: String(prix),
          storage_temp:       montant,
          notes:              meta,
        }).eq('id', id)
        if (!error) updated.push({ id, prix, montant, meta })
      }
      // Mise à jour locale immédiate
      setDispatches(p => p.map(d => {
        const u = updated.find(x=>x.id===d.id)
        return u ? { ...d, certificate_number: String(u.prix), storage_temp: u.montant, notes: u.meta } : d
      }))
      setDone(true)
      setTimeout(() => {
        setModalMasse(false); setDone(false)
        setSelectedIds(new Set()); setMassPrice(''); setMassRef(''); setMassDate('')
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── ALERTE SANS RÉCOLTE ─── */
  const saveAlerte = async () => {
    if (!formAlerte.date) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('alerts').insert({
        type: 'no_harvest', severity: 'warning',
        title:   `Journée sans récolte — ${formAlerte.date}`,
        message: `Motif: ${formAlerte.reason}${formAlerte.notes?' — '+formAlerte.notes:''}`,
        entity_type: 'harvest', is_read: false, is_resolved: false,
      }).select().single()
      if (error) throw error
      setAlertes(p=>[data,...p])
      setDone(true)
      setTimeout(() => { setModalAlerte(false); setDone(false); setFormAlerte({date:'',reason:'panne',notes:''}) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const resolveAlerte = async (id:string) => {
    await supabase.from('alerts').update({is_resolved:true,resolved_at:new Date().toISOString()}).eq('id',id)
    setAlertes(p=>p.map(a=>a.id===id?{...a,is_resolved:true}:a))
  }

  /* ─── COMPUTED ─── */
  const sansPrix   = dispatches.filter(d => !d.certificate_number)
  const avecPrix   = dispatches.filter(d =>  d.certificate_number)
  const totalCA    = avecPrix.reduce((s,d)=>s+(d.storage_temp||0), 0)
  const totalKg    = harvests.reduce((s,h)=>s+(h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0), 0)
  const activAlertes = alertes.filter(a=>!a.is_resolved)

  // CA par marché (recalculé depuis dispatches en état courant)
  const caParMarche: Record<string,{nom:string;qty:number;ca:number;currency:string;sansPrix:number}> = {}
  for (const d of dispatches) {
    const mid = d.market_id||'unknown'
    if (!caParMarche[mid]) caParMarche[mid] = {nom:d.markets?.name||'—',qty:0,ca:0,currency:d.markets?.currency||'MAD',sansPrix:0}
    caParMarche[mid].qty += d.quantity_kg||0
    caParMarche[mid].ca  += d.storage_temp||0
    if (!d.certificate_number) caParMarche[mid].sansPrix++
  }

  const toggleSel   = (id:string) => setSelectedIds(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})
  const addDispatch = () => setDispatching(p=>[...p,{market_id:'',qty:'',category:'export'}])
  const rmDispatch  = (i:number) => setDispatching(p=>p.filter((_,j)=>j!==i))
  const upD         = (i:number,k:string,v:string) => setDispatching(p=>p.map((d,j)=>j===i?{...d,[k]:v}:d))
  const totalDisp   = dispatching.reduce((s,d)=>s+Number(d.qty||0),0)

  const REASONS = [
    {value:'panne',label:'Panne équipement'},
    {value:'meteo',label:'Conditions météo'},
    {value:'main_oeuvre',label:'Manque main d\'œuvre'},
    {value:'stade_culture',label:'Stade cultural'},
    {value:'jour_repos',label:'Jour de repos'},
    {value:'autre',label:'Autre'},
  ]

  /* ═════════════════════════════════════ RENDU ══════════════════════════════════ */
  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>

      {/* ══ MODALE NOUVELLE RÉCOLTE ══ */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <div className="section-label">IDENTIFICATION</div>
            <FormGroup label="Plantation *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation disponible</div>
                : <Select value={formR.campaign_planting_id} onChange={sr('campaign_planting_id')}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p:any)=>(
                      <option key={p.id} value={p.id}>{p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]</option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormGroup label="Date *"><Input type="date" value={formR.harvest_date} onChange={sr('harvest_date')} /></FormGroup>

            <div className="section-label" style={{marginTop:16}}>QUANTITÉS</div>
            <FormRow>
              <FormGroup label="Cat.1 Export (kg)"><Input type="number" value={formR.qty_category_1} onChange={sr('qty_category_1')} placeholder="0" /></FormGroup>
              <FormGroup label="Cat.2 Local (kg)"><Input type="number" value={formR.qty_category_2} onChange={sr('qty_category_2')} placeholder="0" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cat.3 Déclassé (kg)"><Input type="number" value={formR.qty_category_3} onChange={sr('qty_category_3')} placeholder="0" /></FormGroup>
              <FormGroup label="Déchets (kg)"><Input type="number" value={formR.qty_waste} onChange={sr('qty_waste')} placeholder="0" /></FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:16}}>ENVOI PAR MARCHÉ <span style={{color:'#3d6b52',fontSize:9,letterSpacing:0}}>(prix défini ultérieurement)</span></div>
            {dispatching.map((d,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 110px 100px 32px',gap:8,marginBottom:8,alignItems:'end'}}>
                <div style={{marginBottom:0}}>
                  {i===0&&<label className="form-label">Marché</label>}
                  <Select value={d.market_id} onChange={e=>upD(i,'market_id',e.target.value)}>
                    <option value="">-- Marché --</option>
                    {markets.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </div>
                <div>
                  {i===0&&<label className="form-label">Qté (kg)</label>}
                  <Input type="number" value={d.qty} onChange={e=>upD(i,'qty',e.target.value)} placeholder="kg" />
                </div>
                <div>
                  {i===0&&<label className="form-label">Catégorie</label>}
                  <Select value={d.category} onChange={e=>upD(i,'category',e.target.value)}>
                    <option value="export">Export</option>
                    <option value="local">Local</option>
                    <option value="station">Station</option>
                  </Select>
                </div>
                <div style={{paddingBottom:1}}>
                  {dispatching.length>1
                    ? <button onClick={()=>rmDispatch(i)} className="btn-danger" style={{padding:'9px 8px',fontSize:11}}>✕</button>
                    : <div style={{height:36}}/>}
                </div>
              </div>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <button onClick={addDispatch} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>+ Ajouter marché</button>
              {totalDisp>0 && <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>Total : {totalDisp.toLocaleString('fr')} kg</span>}
            </div>
            <FormGroup label="Notes"><Textarea rows={2} value={formR.notes} onChange={sr('notes')} placeholder="Observations qualité..." /></FormGroup>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveRecolte} loading={saving}
              disabled={!formR.campaign_planting_id||!formR.harvest_date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE ÉDITION RÉCOLTE ══ */}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.lot_number}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte modifiée !" /> : (<>
            <FormGroup label="Date de récolte">
              <Input type="date" value={formEdit.harvest_date||''} onChange={e=>setFormEdit(f=>({...f,harvest_date:e.target.value}))} />
            </FormGroup>
            <div className="section-label" style={{marginTop:8}}>QUANTITÉS</div>
            <FormRow>
              <FormGroup label="Cat.1 Export (kg)">
                <Input type="number" value={formEdit.qty_category_1||''} onChange={e=>setFormEdit(f=>({...f,qty_category_1:e.target.value}))} />
              </FormGroup>
              <FormGroup label="Cat.2 Local (kg)">
                <Input type="number" value={formEdit.qty_category_2||''} onChange={e=>setFormEdit(f=>({...f,qty_category_2:e.target.value}))} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cat.3 Déclassé (kg)">
                <Input type="number" value={formEdit.qty_category_3||''} onChange={e=>setFormEdit(f=>({...f,qty_category_3:e.target.value}))} />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={formEdit.qty_waste||''} onChange={e=>setFormEdit(f=>({...f,qty_waste:e.target.value}))} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formEdit.notes||''} onChange={e=>setFormEdit(f=>({...f,notes:e.target.value}))} />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} saveLabel="ENREGISTRER LES MODIFICATIONS" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE PRIX DISPATCH ══ */}
      {modalPrix && (
        <Modal title={modalPrix.certificate_number ? "MODIFIER LE PRIX" : "SAISIR LE PRIX STATION"} onClose={()=>{setModalPrix(null);setDone(false)}}>
          {done ? <SuccessMessage message="Prix enregistré !" /> : (<>
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:5}}>DISPATCH</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{modalPrix.lot_number}</div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:3}}>
                Marché : <strong>{modalPrix.markets?.name}</strong> · {modalPrix.quantity_kg} kg · {modalPrix.harvest_date}
              </div>
              {modalPrix.certificate_number && (
                <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623',marginTop:3}}>
                  Prix actuel : {modalPrix.certificate_number} {modalPrix.markets?.currency} · CA : {modalPrix.storage_temp?.toLocaleString('fr')} {modalPrix.markets?.currency}
                </div>
              )}
            </div>
            <FormGroup label="Prix / kg *">
              <Input type="number" step="0.001" value={formPrix.price_per_kg} autoFocus
                onChange={e=>setFormPrix(p=>({...p,price_per_kg:e.target.value}))} placeholder="ex: 1.850" />
            </FormGroup>
            {formPrix.price_per_kg && Number(formPrix.price_per_kg)>0 && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:12,color:'#00e87a',marginBottom:14}}>
                → CA : <strong>{(modalPrix.quantity_kg * Number(formPrix.price_per_kg)).toFixed(2)} {modalPrix.markets?.currency||'MAD'}</strong>
              </div>
            )}
            <FormRow>
              <FormGroup label="Réf. station"><Input value={formPrix.station_ref} onChange={e=>setFormPrix(p=>({...p,station_ref:e.target.value}))} placeholder="ex: STAT-2026-0312" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={formPrix.receipt_date} onChange={e=>setFormPrix(p=>({...p,receipt_date:e.target.value}))} /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalPrix(null)} onSave={savePrix} loading={saving}
              disabled={!formPrix.price_per_kg||Number(formPrix.price_per_kg)<=0} saveLabel="ENREGISTRER LE PRIX" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE MASSE ══ */}
      {modalMasse && (
        <Modal title="SAISIE EN MASSE — PRIX STATION" onClose={()=>{setModalMasse(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message={`Prix appliqué à ${selectedIds.size} dispatch(s) !`} /> : (<>
            <div className="section-label">SÉLECTIONNER LES DISPATCHES</div>
            <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center'}}>
              <button onClick={()=>setSelectedIds(new Set(sansPrix.map(d=>d.id)))} className="btn-secondary" style={{fontSize:10,padding:'5px 10px'}}>TOUT</button>
              <button onClick={()=>setSelectedIds(new Set())} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>EFFACER</button>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',marginLeft:'auto'}}>{selectedIds.size}/{sansPrix.length} sélectionné(s)</span>
            </div>
            <div style={{maxHeight:240,overflowY:'auto',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              {sansPrix.length===0
                ? <div style={{padding:24,textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>Tous les dispatches ont un prix ✓</div>
                : sansPrix.map(d=>(
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
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623',flexShrink:0}}>{d.quantity_kg} kg</span>
                  </div>
                ))
              }
            </div>
            <div className="section-label">PRIX À APPLIQUER</div>
            <FormGroup label="Prix / kg *">
              <Input type="number" step="0.001" value={massPrice} onChange={e=>setMassPrice(e.target.value)} placeholder="ex: 1.850" autoFocus />
            </FormGroup>
            {massPrice && selectedIds.size>0 && (
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:12,color:'#00e87a',marginBottom:14}}>
                → CA total : <strong>{sansPrix.filter(d=>selectedIds.has(d.id)).reduce((s,d)=>s+d.quantity_kg*Number(massPrice),0).toFixed(2)} MAD</strong> sur {selectedIds.size} dispatch(s)
              </div>
            )}
            <FormRow>
              <FormGroup label="Réf. station"><Input value={massRef} onChange={e=>setMassRef(e.target.value)} placeholder="STAT-2026-XXXX" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={massDate} onChange={e=>setMassDate(e.target.value)} /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalMasse(false)} onSave={saveMasse} loading={saving}
              disabled={!massPrice||selectedIds.size===0}
              saveLabel={`APPLIQUER À ${selectedIds.size} DISPATCH(S)`} />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE ALERTE ══ */}
      {modalAlerte && (
        <Modal title="JOURNÉE SANS RÉCOLTE" onClose={()=>{setModalAlerte(false);setDone(false)}}>
          {done ? <SuccessMessage message="Alerte enregistrée !" /> : (<>
            <div style={{padding:'10px 14px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d',marginBottom:16}}>
              ⚠ Cette journée sera marquée sans récolte dans les alertes.
            </div>
            <FormGroup label="Date *"><Input type="date" value={formAlerte.date} onChange={sa('date')} autoFocus /></FormGroup>
            <FormGroup label="Motif">
              <Select value={formAlerte.reason} onChange={sa('reason')}>
                {REASONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={formAlerte.notes} onChange={sa('notes')} placeholder="Précisions..." /></FormGroup>
            <ModalFooter onCancel={()=>setModalAlerte(false)} onSave={saveAlerte} loading={saving} disabled={!formAlerte.date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ HEADER ══ */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">
            {harvests.length} lot(s) · {(totalKg/1000).toFixed(2)} t · CA station total : <strong style={{color:'#00e87a'}}>{totalCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</strong>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{fontSize:11,color:'#ff4d6d',borderColor:'#ff4d6d40'}}>⚠ SANS RÉCOLTE</button>
          <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:16}}>
        {[
          {l:'Lots',       v:String(harvests.length),            c:'#00e87a'},
          {l:'Production', v:(totalKg/1000).toFixed(1)+' t',    c:'#00ffc8'},
          {l:'Dispatches', v:String(dispatches.length),          c:'#00b4d8'},
          {l:'Sans prix',  v:String(sansPrix.length),            c:'#f5a623'},
          {l:'CA Station', v:(totalCA/1000).toFixed(1)+' k MAD',c:'#9b5de5'},
          {l:'Alertes',    v:String(activAlertes.length),        c:'#ff4d6d'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,fontSize:20,textShadow:`0 0 12px ${k.c}50`}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* CA par marché */}
      {Object.keys(caParMarche).length>0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:16}}>
          {Object.values(caParMarche).map((m,i)=>(
            <div key={i} style={{background:'#0a1810',border:`1px solid ${m.sansPrix>0?'#f5a62340':'#1a3526'}`,borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#3d6b52',letterSpacing:1,marginBottom:5}}>CA · {m.nom.toUpperCase()}</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:20,fontWeight:700,color: m.ca>0?'#00e87a':'#3d6b52',marginBottom:2}}>
                {m.ca>0 ? m.ca.toLocaleString('fr',{maximumFractionDigits:0})+' '+m.currency : '—'}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#7aab90'}}>{m.qty.toLocaleString('fr')} kg envoyés</div>
              {m.sansPrix>0 && <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623',marginTop:3}}>⚠ {m.sansPrix} sans prix</div>}
            </div>
          ))}
        </div>
      )}

      {/* ══ TABS ══ */}
      <div style={{display:'flex',gap:4,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        {([['liste','RÉCOLTES',harvests.length],['sans_prix','SANS PRIX',sansPrix.length],['alertes','ALERTES',activAlertes.length]] as any[]).map(([t,l,c])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'7px 14px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',fontSize:10,letterSpacing:.8,cursor:'pointer',transition:'all .15s',
              borderColor:tab===t?'#00e87a':'#1a3526',background:tab===t?'#00e87a18':'transparent',color:tab===t?'#00e87a':'#3d6b52'}}>
            {l}
            {c>0&&<span style={{marginLeft:6,background:t==='alertes'?'#ff4d6d':t==='sans_prix'?'#f5a623':'#00e87a',color:'#030a07',borderRadius:10,padding:'1px 6px',fontSize:8,fontWeight:700}}>{c}</span>}
          </button>
        ))}
        {tab==='sans_prix'&&sansPrix.length>0&&(
          <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'7px 12px'}}
            onClick={()=>{setSelectedIds(new Set());setModalMasse(true)}}>⚡ SAISIE EN MASSE</button>
        )}
      </div>

      {/* ══ CONTENU ══ */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : tab==='liste' ? (
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
                  {['N° Lot','Date','Serre','Variété','Cat.1','Cat.2','Cat.3','Total','Marchés','CA Station','Statut','Actions'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {harvests.map(h=>{
                    const total = (h.qty_category_1||0)+(h.qty_category_2||0)+(h.qty_category_3||0)
                    const hDisps = dispatches.filter(d=>d.harvest_id===h.id)
                    const hCA = hDisps.reduce((s,d)=>s+(d.storage_temp||0),0)
                    const hMarchés = [...new Set(hDisps.map(d=>d.markets?.name).filter(Boolean))]
                    const hSansPrix = hDisps.filter(d=>!d.certificate_number).length
                    const statut = hDisps.length===0 ? {l:'NON DISPATCHÉ',c:'tag'} :
                                   hSansPrix>0       ? {l:'PRIX MANQUANTS',c:'tag tag-amber'} :
                                                       {l:'COMPLET',c:'tag tag-green'}
                    return (
                      <tr key={h.id}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{h.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{h.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{h.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(h.qty_category_1||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(h.qty_category_2||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{(h.qty_category_3||0).toLocaleString('fr')}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')}</span></td>
                        <td style={{minWidth:100}}>
                          {hMarchés.length>0
                            ? <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hMarchés.map(m=><span key={m} className="tag tag-blue" style={{fontSize:8}}>{m}</span>)}</div>
                            : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>
                          }
                        </td>
                        <td>
                          {hCA>0
                            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#9b5de5'}}>{hCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
                            : hSansPrix>0
                              ? <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623'}}>⏳ {hSansPrix} en attente</span>
                              : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>
                          }
                        </td>
                        <td><span className={statut.c} style={{fontSize:8}}>{statut.l}</span></td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>openEdit(h)} className="btn-ghost" style={{padding:'4px 8px',fontSize:10}}>✏️</button>
                            <button onClick={()=>deleteRecolte(h.id,h.lot_number)} className="btn-danger" style={{padding:'4px 8px',fontSize:10}}>🗑</button>
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
      ) : tab==='sans_prix' ? (
        sansPrix.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Tous les dispatches ont un prix !</div>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid #1a3526',display:'flex',alignItems:'center',gap:12,background:'#f5a62308'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>⚠ {sansPrix.length} DISPATCH(S) EN ATTENTE</span>
              <button className="btn-secondary" style={{marginLeft:'auto',fontSize:10,padding:'6px 12px'}}
                onClick={()=>{setSelectedIds(new Set(sansPrix.map(d=>d.id)));setModalMasse(true)}}>⚡ SAISIE EN MASSE</button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['N° Dispatch','Marché','Date','Qté envoyée','Actions'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sansPrix.map(d=>(
                    <tr key={d.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{d.lot_number}</span></td>
                      <td>
                        <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{d.markets?.name||'—'}</span>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginLeft:5}}>{d.markets?.currency}</span>
                      </td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{d.harvest_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#f5a623'}}>{d.quantity_kg?.toLocaleString('fr')} kg</span></td>
                      <td>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>openPrix(d)} className="btn-primary" style={{fontSize:10,padding:'5px 10px'}}>⚡ SAISIR PRIX</button>
                          <button onClick={()=>deleteDispatch(d.id)} className="btn-danger" style={{padding:'5px 8px',fontSize:10}}>🗑</button>
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
          {activAlertes.length>0 && (
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {activAlertes.map(a=>(
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#ff4d6d12',border:'1px solid #ff4d6d30',borderRadius:8}}>
                  <span style={{fontSize:18,flexShrink:0}}>⚠</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#ff4d6d'}}>{a.title}</div>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:2}}>{a.message}</div>
                  </div>
                  <button onClick={()=>resolveAlerte(a.id)} className="btn-ghost" style={{fontSize:10,padding:'5px 10px',color:'#00e87a',borderColor:'#00e87a40',flexShrink:0}}>✓ RÉSOUDRE</button>
                </div>
              ))}
            </div>
          )}
          {alertes.filter(a=>a.is_resolved).length>0 && (
            <>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:8}}>ALERTES RÉSOLUES</div>
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {alertes.filter(a=>a.is_resolved).map(a=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 16px',background:'#0a1810',border:'1px solid #1a3526',borderRadius:8,opacity:.6}}>
                    <span style={{fontSize:12,color:'#00e87a'}}>✓</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#7aab90'}}>{a.title}</div>
                      <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>{a.message}</div>
                    </div>
                    <span className="tag tag-green" style={{fontSize:8}}>RÉSOLU</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {alertes.length===0 && (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <div className="empty-title">Aucune alerte</div>
              <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{color:'#ff4d6d',borderColor:'#ff4d6d40',fontSize:11}}>⚠ SIGNALER UNE JOURNÉE SANS RÉCOLTE</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
