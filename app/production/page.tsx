'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function ProductionPage() {
  const [items, setItems]     = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres]   = useState<any[]>([])
  const [varietes, setVarietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [form, setForm] = useState({
    campaign_id:'', greenhouse_id:'', variety_id:'',
    planted_area:'', plant_count:'', planting_date:'',
    target_yield_per_m2:'', estimated_cost:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [p, c, s, v] = await Promise.all([
      supabase.from('campaign_plantings')
        .select('*, campaigns(name), greenhouses(code,name), varieties(commercial_name,type)')
        .order('created_at', { ascending: false }),
      supabase.from('campaigns').select('id,name,code').order('name'),
      supabase.from('greenhouses').select('id,code,name').order('code'),
      supabase.from('varieties').select('id,commercial_name,type,theoretical_yield_per_m2,theoretical_cost_per_m2').eq('is_active',true).order('commercial_name'),
    ])
    setItems(p.data||[])
    setCampagnes(c.data||[])
    setSerres(s.data||[])
    setVarietes(v.data||[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Auto-remplir rendement/coût depuis variété
  const selectVariete = (varId: string) => {
    const v = varietes.find(x=>x.id===varId)
    setForm(f=>({
      ...f, variety_id: varId,
      target_yield_per_m2: v ? String(v.theoretical_yield_per_m2||'') : f.target_yield_per_m2,
    }))
  }

  const save = async () => {
    if (!form.campaign_id||!form.greenhouse_id||!form.variety_id||!form.planted_area) return
    setSaving(true)
    try {
      const area = Number(form.planted_area)
      const yld  = Number(form.target_yield_per_m2)||0
      const { data, error } = await supabase.from('campaign_plantings').insert({
        campaign_id:          form.campaign_id,
        greenhouse_id:        form.greenhouse_id,
        variety_id:           form.variety_id,
        planted_area:         area,
        plant_count:          form.plant_count ? Number(form.plant_count) : null,
        planting_date:        form.planting_date||null,
        target_yield_per_m2:  yld,
        target_total_production: area * yld,
        estimated_cost:       form.estimated_cost ? Number(form.estimated_cost) : null,
        status: 'planifie',
      }).select('*, campaigns(name), greenhouses(code,name), varieties(commercial_name,type)').single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false)
        setForm({campaign_id:'',greenhouse_id:'',variety_id:'',planted_area:'',plant_count:'',planting_date:'',target_yield_per_m2:'',estimated_cost:''})
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const totalArea = items.reduce((s,p)=>s+(p.planted_area||0), 0)
  const totalProd = items.reduce((s,p)=>s+(p.target_total_production||0), 0)

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE PLANTATION" onClose={()=>{setModal(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Plantation enregistrée !" /> : (<>
            <div className="section-label">AFFECTATION</div>
            <FormGroup label="Campagne *">
              {campagnes.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune campagne — créez d'abord une campagne</div>
                : <Select value={form.campaign_id} onChange={s('campaign_id')}>
                    <option value="">-- Sélectionner une campagne --</option>
                    {campagnes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Serre *">
                <Select value={form.greenhouse_id} onChange={s('greenhouse_id')}>
                  <option value="">-- Sélectionner --</option>
                  {serres.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
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
                <Input type="number" value={form.planted_area} onChange={s('planted_area')} placeholder="ex: 2500" />
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
              <div style={{padding:'10px 14px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a',marginTop:4}}>
                → Production théorique : {(Number(form.planted_area)*Number(form.target_yield_per_m2)/1000).toFixed(2)} tonnes
              </div>
            )}
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving}
              disabled={!form.campaign_id||!form.greenhouse_id||!form.variety_id||!form.planted_area}
              saveLabel="CRÉER LA PLANTATION" />
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
          {l:'Plantations actives', v:String(items.length),              c:'#00e87a'},
          {l:'Surface totale',      v:(totalArea/10000).toFixed(2)+' ha', c:'#00ffc8'},
          {l:'Prod. théorique',     v:(totalProd/1000).toFixed(1)+' t',   c:'#f5a623'},
          {l:'Serres actives',      v:String(new Set(items.map(i=>i.greenhouse_id)).size), c:'#00b4d8'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,textShadow:`0 0 16px ${k.c}60`}}>{k.v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">▲</div>
          <div className="empty-title">Aucune plantation</div>
          <div className="empty-sub">Créez votre première plantation.</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ PLANTATION</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['Campagne','Serre','Variété','Surface','Nb Plants','Rend. Cible','Prod. Théo.','Date Plant.','Statut'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((p:any)=>(
                  <tr key={p.id}>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{p.campaigns?.name||'—'}</span></td>
                    <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{p.greenhouses?.name||'—'}</span></td>
                    <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#7aab90'}}>{p.varieties?.commercial_name||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>{(p.planted_area||0).toLocaleString('fr')} m²</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{p.plant_count?.toLocaleString('fr')||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{p.target_yield_per_m2||'—'} kg/m²</span></td>
                    <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#00e87a'}}>{p.target_total_production ? (p.target_total_production/1000).toFixed(2)+' t' : '—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{p.planting_date||'—'}</span></td>
                    <td><span className="tag tag-green">{p.status||'planifie'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
