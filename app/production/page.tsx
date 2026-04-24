'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function ProductionPage() {
  const [items,     setItems]     = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [fermes,    setFermes]    = useState<any[]>([])
  const [serres,    setSerres]    = useState<any[]>([])
  const [varietes,  setVarietes]  = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)
  const [areaError, setAreaError] = useState('')
  const [editingId, setEditingId] = useState<string|null>(null)

  const emptyForm = {
    campaign_id:'', farm_id:'', greenhouse_id:'', variety_id:'',
    planted_area:'', plant_count:'', planting_date:'',
    target_yield_per_m2:'', estimated_cost:'',
    harvest_start_date:'', harvest_end_date:'',
    export_share_pct:'100',
    price_per_kg_export:'', price_per_kg_local:'',
  }
  const loadExisting = (p:any) => {
    setEditingId(p.id)
    const greenhouse = serres.find(g => g.id === p.greenhouse_id)
    const campaign   = campagnes.find(c => c.id === p.campaign_id)
    const farm_id = greenhouse?.farm_id || campaign?.farm_id || ''
    setForm({
      campaign_id:         p.campaign_id||'',
      farm_id,
      greenhouse_id:       p.greenhouse_id||'',
      variety_id:          p.variety_id||'',
      planted_area:        p.planted_area?String(p.planted_area):'',
      plant_count:         p.plant_count?String(p.plant_count):'',
      planting_date:       p.planting_date||'',
      target_yield_per_m2: p.target_yield_per_m2?String(p.target_yield_per_m2):'',
      estimated_cost:      p.estimated_cost?String(p.estimated_cost):'',
      harvest_start_date:  p.harvest_start_date||'',
      harvest_end_date:    p.harvest_end_date||'',
      export_share_pct:    p.export_share_pct != null ? String(p.export_share_pct) : '100',
      price_per_kg_export: p.price_per_kg_export != null ? String(p.price_per_kg_export) : '',
      price_per_kg_local:  p.price_per_kg_local  != null ? String(p.price_per_kg_local)  : '',
    })
    setAreaError('')
  }
  const closeModal = () => { setModal(false); setDone(false); setAreaError(''); setEditingId(null); setForm(emptyForm) }

  const [form, setForm] = useState({
    campaign_id:'', farm_id:'', greenhouse_id:'', variety_id:'',
    planted_area:'', plant_count:'', planting_date:'',
    target_yield_per_m2:'', estimated_cost:'',
    harvest_start_date:'', harvest_end_date:'',
    export_share_pct:'100',
    price_per_kg_export:'', price_per_kg_local:'',
  })
  const s = (k:string) => (e:any) => {
    setForm(f=>({...f,[k]:e.target.value}))
    if (k === 'planted_area') setAreaError('')
  }

  const load = async () => {
    const [p, c, f, sr, v] = await Promise.all([
      supabase.from('campaign_plantings')
        .select('*, campaigns(name), greenhouses(code,name,exploitable_area), varieties(commercial_name,type)')
        .order('created_at', { ascending: false }),
      supabase.from('campaigns').select('id,name,code,farm_id').order('name'),
      supabase.from('farms').select('id,code,name').eq('is_active', true).order('name'),
      supabase.from('greenhouses').select('id,code,name,farm_id,total_area,exploitable_area').order('code'),
      supabase.from('varieties').select('id,commercial_name,type,theoretical_yield_per_m2,theoretical_cost_per_m2,avg_price_export,avg_price_local').eq('is_active',true).order('commercial_name'),
    ])
    setItems(p.data||[])
    setCampagnes(c.data||[])
    setFermes(f.data||[])
    setSerres(sr.data||[])
    setVarietes(v.data||[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Auto-remplit la ferme quand la campagne change (si la ferme n'est pas déjà cohérente)
  const onChangeCampaign = (campaignId: string) => {
    const camp = campagnes.find(c => c.id === campaignId)
    const farm_id = camp?.farm_id || form.farm_id
    // Si la serre actuelle n'appartient pas à la nouvelle ferme, on la réinitialise
    const currentGh = serres.find(g => g.id === form.greenhouse_id)
    const keepGh = currentGh && currentGh.farm_id === farm_id ? form.greenhouse_id : ''
    setForm(f => ({ ...f, campaign_id: campaignId, farm_id, greenhouse_id: keepGh }))
  }

  const onChangeFarm = (farmId: string) => {
    // Si la serre actuelle n'appartient pas à la nouvelle ferme, on la réinitialise
    const currentGh = serres.find(g => g.id === form.greenhouse_id)
    const keepGh = currentGh && currentGh.farm_id === farmId ? form.greenhouse_id : ''
    setForm(f => ({ ...f, farm_id: farmId, greenhouse_id: keepGh }))
    setAreaError('')
  }

  const filteredSerres = useMemo(() =>
    form.farm_id ? serres.filter(s => s.farm_id === form.farm_id) : serres,
    [serres, form.farm_id]
  )

  const selectVariete = (varId: string) => {
    const v = varietes.find(x=>x.id===varId)
    setForm(f=>({
      ...f,
      variety_id: varId,
      target_yield_per_m2: v ? String(v.theoretical_yield_per_m2 || '') : f.target_yield_per_m2,
      // Pré-remplit les prix si vides
      price_per_kg_export: f.price_per_kg_export || (v?.avg_price_export ? String(v.avg_price_export) : ''),
      price_per_kg_local:  f.price_per_kg_local  || (v?.avg_price_local  ? String(v.avg_price_local)  : ''),
    }))
  }

  /* ── Validation surface ── */
  const selectedSerre = useMemo(() => serres.find(s=>s.id===form.greenhouse_id), [form.greenhouse_id, serres])

  const surfaceDejaPlantee = useMemo(() => {
    if (!form.greenhouse_id) return 0
    return items
      .filter(p => p.greenhouse_id === form.greenhouse_id && p.id !== editingId)
      .reduce((s, p) => s + (p.planted_area || 0), 0)
  }, [form.greenhouse_id, items, editingId])

  const surfaceDisponible = selectedSerre
    ? (selectedSerre.exploitable_area || selectedSerre.total_area || 0) - surfaceDejaPlantee
    : 0

  const surfaceProposee = Number(form.planted_area) || 0
  const surfaceOk = !form.planted_area || !form.greenhouse_id || surfaceProposee <= surfaceDisponible

  const save = async () => {
    if (!form.campaign_id||!form.farm_id||!form.greenhouse_id||!form.variety_id||!form.planted_area) return

    // Validation surface
    if (!surfaceOk) {
      setAreaError(`Surface trop grande — disponible : ${surfaceDisponible.toLocaleString('fr')} m²`)
      return
    }

    setSaving(true)
    try {
      const area = Number(form.planted_area)
      const yld  = Number(form.target_yield_per_m2)||0
      const payload = {
        campaign_id:          form.campaign_id,
        greenhouse_id:        form.greenhouse_id,
        variety_id:           form.variety_id,
        planted_area:         area,
        plant_count:          form.plant_count ? Number(form.plant_count) : null,
        planting_date:        form.planting_date||null,
        harvest_start_date:   form.harvest_start_date || null,
        harvest_end_date:     form.harvest_end_date || null,
        export_share_pct:     form.export_share_pct ? Number(form.export_share_pct) : 100,
        price_per_kg_export:  form.price_per_kg_export ? Number(form.price_per_kg_export) : null,
        price_per_kg_local:   form.price_per_kg_local ? Number(form.price_per_kg_local) : null,
        target_yield_per_m2:  yld,
        target_total_production: area * yld,
        estimated_cost:       form.estimated_cost ? Number(form.estimated_cost) : null,
      }
      const selectCols = '*, campaigns(name), greenhouses(code,name,exploitable_area), varieties(commercial_name,type)'

      if (editingId) {
        const { data, error } = await supabase.from('campaign_plantings')
          .update(payload).eq('id', editingId).select(selectCols).single()
        if (error) throw error
        setItems(prev => prev.map(x => x.id === editingId ? data : x))
      } else {
        const { data, error } = await supabase.from('campaign_plantings')
          .insert({ ...payload, status: 'planifie' }).select(selectCols).single()
        if (error) throw error
        setItems(p=>[data,...p])
      }
      setDone(true)
      setTimeout(closeModal, 1400)
    } catch(e:any){
      const isDuplicate = e?.code === '23505'
        || (typeof e?.message === 'string' && e.message.includes('campaign_plantings_campaign_id_greenhouse_id_variety_id_key'))
      if (isDuplicate) {
        const existing = items.find(p =>
          p.campaign_id === form.campaign_id &&
          p.greenhouse_id === form.greenhouse_id &&
          p.variety_id === form.variety_id)
        const varNom = varietes.find(v=>v.id===form.variety_id)?.commercial_name || 'cette variété'
        const serreNom = serres.find(x=>x.id===form.greenhouse_id)?.code || 'cette serre'
        if (existing && confirm(`Une plantation de ${varNom} existe déjà dans ${serreNom} pour cette campagne.\n\nVoulez-vous la modifier ?`)) {
          loadExisting(existing)
        } else {
          alert(`Plantation déjà existante. Aucune modification effectuée.`)
        }
      } else {
        alert('Erreur: '+e.message)
      }
    }
    setSaving(false)
  }

  const totalArea = items.reduce((s,p)=>s+(p.planted_area||0), 0)
  const totalProd = items.reduce((s,p)=>s+(p.target_total_production||0), 0)

  return (
    <div style={{background:'var(--bg-base)',minHeight:'100vh'}}>
      {modal && (
        <Modal title={editingId ? 'MODIFIER PLANTATION' : 'NOUVELLE PLANTATION'} onClose={closeModal} size="lg">
          {done ? <SuccessMessage message={editingId ? 'Plantation modifiée !' : 'Plantation enregistrée !'} /> : (<>
            <div className="section-label">AFFECTATION</div>
            <FormRow>
              <FormGroup label="Campagne *">
                {campagnes.length===0
                  ? <div style={{padding:'10px',background:'var(--red-dim)',border:'1px solid color-mix(in srgb,var(--red) 30%,transparent)',borderRadius:8,color:'var(--red)',fontFamily:'var(--font-mono)',fontSize:11}}>⚠ Aucune campagne</div>
                  : <Select value={form.campaign_id} onChange={e=>onChangeCampaign(e.target.value)}>
                      <option value="">-- Sélectionner une campagne --</option>
                      {campagnes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </Select>
                }
              </FormGroup>
              <FormGroup label="Ferme *">
                {fermes.length===0
                  ? <div style={{padding:'10px',background:'var(--red-dim)',border:'1px solid color-mix(in srgb,var(--red) 30%,transparent)',borderRadius:8,color:'var(--red)',fontFamily:'var(--font-mono)',fontSize:11}}>⚠ Aucune ferme</div>
                  : <Select value={form.farm_id} onChange={e=>onChangeFarm(e.target.value)}>
                      <option value="">-- Sélectionner --</option>
                      {fermes.map(f=><option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                    </Select>
                }
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Serre *">
                <Select value={form.greenhouse_id} onChange={e=>{s('greenhouse_id')(e);setAreaError('')}}>
                  <option value="">
                    {form.farm_id ? '-- Sélectionner --' : '-- Choisissez une ferme d\'abord --'}
                  </option>
                  {filteredSerres.map(sr=><option key={sr.id} value={sr.id}>{sr.code} — {sr.name} ({sr.exploitable_area?.toLocaleString('fr')} m² dispo)</option>)}
                </Select>
                {/* Afficher la surface disponible */}
                {selectedSerre && (
                  <div style={{marginTop:5,fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>
                    Surface exploitable : <strong style={{color:surfaceDisponible>0?'var(--neon)':'var(--red)'}}>
                      {surfaceDisponible.toLocaleString('fr')} m² disponibles
                    </strong>
                    {surfaceDejaPlantee > 0 && (
                      <span style={{color:'var(--amber)',marginLeft:8}}>
                        ({surfaceDejaPlantee.toLocaleString('fr')} m² déjà plantés)
                      </span>
                    )}
                  </div>
                )}
              </FormGroup>
              <FormGroup label="Variété *">
                <Select value={form.variety_id} onChange={e=>selectVariete(e.target.value)}>
                  <option value="">-- Sélectionner --</option>
                  {varietes.map(v=><option key={v.id} value={v.id}>{v.commercial_name} ({v.type})</option>)}
                </Select>
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:16}}>SURFACES & DENSITÉ</div>
            <FormRow>
              <FormGroup label="Surface plantée (m²) *">
                <Input type="number" value={form.planted_area} onChange={s('planted_area')} placeholder={selectedSerre ? `max ${surfaceDisponible.toLocaleString('fr')} m²` : 'ex: 2500'} />
                {/* Erreur surface */}
                {areaError && (
                  <div style={{marginTop:5,padding:'6px 10px',background:'var(--red-dim)',border:'1px solid color-mix(in srgb,var(--red) 30%,transparent)',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:10,color:'var(--red)'}}>
                    ⚠ {areaError}
                  </div>
                )}
                {/* Warning préventif */}
                {!areaError && form.planted_area && !surfaceOk && (
                  <div style={{marginTop:5,padding:'6px 10px',background:'var(--red-dim)',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:10,color:'var(--red)'}}>
                    ⚠ Dépasse la surface disponible ({surfaceDisponible.toLocaleString('fr')} m²)
                  </div>
                )}
                {/* Confirmation OK */}
                {form.planted_area && form.greenhouse_id && surfaceOk && surfaceProposee > 0 && (
                  <div style={{marginTop:5,fontFamily:'var(--font-mono)',fontSize:10,color:'var(--neon)'}}>
                    ✓ Surface valide · reste {(surfaceDisponible - surfaceProposee).toLocaleString('fr')} m²
                  </div>
                )}
              </FormGroup>
              <FormGroup label="Nombre de plants">
                <Input type="number" value={form.plant_count} onChange={s('plant_count')} placeholder="ex: 6250" />
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:16}}>OBJECTIFS</div>
            <FormRow>
              <FormGroup label="Rendement cible (kg/m²)">
                <Input type="number" value={form.target_yield_per_m2} onChange={s('target_yield_per_m2')} placeholder="auto depuis variété" />
              </FormGroup>
              <FormGroup label="Date de plantation">
                <Input type="date" value={form.planting_date} onChange={s('planting_date')} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Coût estimé (MAD)">
              <Input type="number" value={form.estimated_cost} onChange={s('estimated_cost')} placeholder="Optionnel" />
            </FormGroup>
            {form.planted_area && form.target_yield_per_m2 && (
              <div style={{padding:'10px 14px',background:'var(--neon-dim)',border:'1px solid color-mix(in srgb,var(--neon) 30%,transparent)',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--neon)',marginTop:4}}>
                → Production théorique : <strong>{(Number(form.planted_area)*Number(form.target_yield_per_m2)/1000).toFixed(2)} tonnes</strong>
              </div>
            )}

            <div className="section-label" style={{marginTop:16}}>RÉCOLTE & VENTES</div>
            <FormRow>
              <FormGroup label="Début récolte">
                <Input type="date" value={form.harvest_start_date} onChange={s('harvest_start_date')} />
              </FormGroup>
              <FormGroup label="Fin récolte">
                <Input type="date" value={form.harvest_end_date} onChange={s('harvest_end_date')} />
              </FormGroup>
              <FormGroup label="% Export">
                <Input type="number" value={form.export_share_pct} onChange={s('export_share_pct')} placeholder="100" min={0} max={100} step={1} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Prix kg Export (MAD)">
                <Input type="number" value={form.price_per_kg_export} onChange={s('price_per_kg_export')} placeholder="auto depuis variété" step={0.01} />
              </FormGroup>
              <FormGroup label="Prix kg Local (MAD)">
                <Input type="number" value={form.price_per_kg_local} onChange={s('price_per_kg_local')} placeholder="auto depuis variété" step={0.01} />
              </FormGroup>
            </FormRow>
            {form.planted_area && form.target_yield_per_m2 && (form.price_per_kg_export || form.price_per_kg_local) && (() => {
              const vol = Number(form.planted_area) * Number(form.target_yield_per_m2)
              const exportPct = Math.max(0, Math.min(100, Number(form.export_share_pct) || 0))
              const volExport = vol * exportPct / 100
              const volLocal  = vol - volExport
              const caExport = volExport * (Number(form.price_per_kg_export) || 0)
              const caLocal  = volLocal  * (Number(form.price_per_kg_local)  || 0)
              const caTotal = caExport + caLocal
              return (
                <div style={{padding:'10px 14px',background:'color-mix(in srgb, var(--amber) 15%, transparent)',border:'1px solid color-mix(in srgb,var(--amber) 30%,transparent)',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--amber)',marginTop:4,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <div>→ CA Export : <strong>{caExport.toLocaleString('fr', {maximumFractionDigits:0})} MAD</strong></div>
                  <div>→ CA Local : <strong>{caLocal.toLocaleString('fr', {maximumFractionDigits:0})} MAD</strong></div>
                  <div>→ CA Total : <strong>{caTotal.toLocaleString('fr', {maximumFractionDigits:0})} MAD</strong></div>
                </div>
              )
            })()}
            <ModalFooter onCancel={closeModal} onSave={save} loading={saving}
              disabled={!form.campaign_id||!form.farm_id||!form.greenhouse_id||!form.variety_id||!form.planted_area||!surfaceOk}
              saveLabel={editingId ? 'ENREGISTRER' : 'CRÉER LA PLANTATION'} />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">SUIVI PRODUCTION</div>
          <div className="page-sub">{items.length} plantation(s) · {(totalArea/10000).toFixed(2)} ha · Objectif : {(totalProd/1000).toFixed(1)} t</div>
        </div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ PLANTATION</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Plantations', v:String(items.length),              c:'var(--neon)'},
          {l:'Surface',     v:(totalArea/10000).toFixed(2)+' ha',c:'var(--blue)'},
          {l:'Prod. théo.', v:(totalProd/1000).toFixed(1)+' t',  c:'var(--amber)'},
          {l:'Serres',      v:String(new Set(items.map(i=>i.greenhouse_id)).size),c:'var(--purple)'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚙️</div>
          <div className="empty-title">Aucune plantation</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ PLANTATION</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['Campagne','Serre','Variété','Surface','Nb Plants','Rend.','Prod. Théo.','Date Plant.','Surf. Dispo','Statut',''].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((p:any)=>{
                  const gh = serres.find(s=>s.id===p.greenhouse_id)
                  const exploitable = gh?.exploitable_area || gh?.total_area || 0
                  const autresPlantings = items.filter(x=>x.greenhouse_id===p.greenhouse_id&&x.id!==p.id)
                  const autresSurface = autresPlantings.reduce((s,x)=>s+(x.planted_area||0),0)
                  const dispoPourCeRecord = exploitable - autresSurface - (p.planted_area||0)
                  return (
                    <tr key={p.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{p.campaigns?.name||'—'}</span></td>
                      <td><span style={{fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{p.greenhouses?.name||'—'}</span></td>
                      <td><span style={{fontSize:13,color:'var(--tx-2)'}}>{p.varieties?.commercial_name||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--neon)'}}>{(p.planted_area||0).toLocaleString('fr')} m²</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{p.plant_count?.toLocaleString('fr')||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--amber)'}}>{p.target_yield_per_m2||'—'} kg/m²</span></td>
                      <td><span style={{fontSize:13,fontWeight:700,color:'var(--neon)'}}>{p.target_total_production ? (p.target_total_production/1000).toFixed(2)+' t' : '—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{p.planting_date||'—'}</span></td>
                      <td>
                        {exploitable > 0 && (
                          <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:dispoPourCeRecord>=0?'var(--neon)':'var(--red)'}}>
                            {dispoPourCeRecord.toLocaleString('fr')} m²
                          </span>
                        )}
                      </td>
                      <td><span className="tag tag-green">{p.status||'planifie'}</span></td>
                      <td>
                        <button
                          onClick={()=>{ loadExisting(p); setModal(true) }}
                          title="Modifier la plantation"
                          style={{background:'transparent',border:'1px solid var(--bd-1)',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:12,color:'var(--tx-2)'}}>
                          ✏️
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
