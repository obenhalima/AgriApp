'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

const TYPES = ['traitement','irrigation','fertilisation','taille','effeuillage','palissage','desherbage','inspection','plantation','autre']
const TYPE_COLORS: Record<string,string> = {
  traitement:'#ff4d6d', irrigation:'#00b4d8', fertilisation:'#00e87a',
  taille:'#f5a623', effeuillage:'#9b5de5', inspection:'#00ffc8',
  plantation:'#f07050', autre:'#3d6b52'
}

export default function AgronomePage() {
  const [items, setItems]     = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [form, setForm] = useState({
    campaign_planting_id:'', operation_type:'traitement',
    operation_date:'', product_used:'', dose_per_m2:'',
    total_quantity:'', unit:'L', duration_hours:'',
    water_volume_liters:'', ec_ms_cm:'', ph_value:'',
    temperature:'', humidity_pct:'', worker_count:'',
    observations:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [ops, p] = await Promise.all([
      supabase.from('cultural_operations')
        .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))')
        .order('operation_date', {ascending:false}).limit(100),
      supabase.from('campaign_plantings')
        .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)')
    ])
    setItems(ops.data||[]); setPlantings(p.data||[]); setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const save = async () => {
    if (!form.campaign_planting_id||!form.operation_date) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('cultural_operations').insert({
        campaign_planting_id: form.campaign_planting_id,
        operation_type:  form.operation_type,
        operation_date:  form.operation_date,
        product_used:    form.product_used||null,
        dose_per_m2:     form.dose_per_m2 ? Number(form.dose_per_m2) : null,
        total_quantity:  form.total_quantity ? Number(form.total_quantity) : null,
        unit:            form.unit||null,
        duration_hours:  form.duration_hours ? Number(form.duration_hours) : null,
        water_volume_liters: form.water_volume_liters ? Number(form.water_volume_liters) : null,
        ec_ms_cm:        form.ec_ms_cm ? Number(form.ec_ms_cm) : null,
        ph_value:        form.ph_value ? Number(form.ph_value) : null,
        temperature:     form.temperature ? Number(form.temperature) : null,
        humidity_pct:    form.humidity_pct ? Number(form.humidity_pct) : null,
        worker_count:    form.worker_count ? Number(form.worker_count) : null,
        observations:    form.observations||null,
      }).select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))').single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false)
        setForm({campaign_planting_id:'',operation_type:'traitement',operation_date:'',product_used:'',dose_per_m2:'',total_quantity:'',unit:'L',duration_hours:'',water_volume_liters:'',ec_ms_cm:'',ph_value:'',temperature:'',humidity_pct:'',worker_count:'',observations:''})
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE INTERVENTION" onClose={()=>{setModal(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Intervention enregistrée !" /> : (<>
            <div className="section-label">IDENTIFICATION</div>
            <FormGroup label="Plantation / Serre *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation disponible</div>
                : <Select value={form.campaign_planting_id} onChange={s('campaign_planting_id')}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p:any)=>(
                      <option key={p.id} value={p.id}>{p.greenhouses?.name} · {p.varieties?.commercial_name}</option>
                    ))}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Type d'opération">
                <Select value={form.operation_type} onChange={s('operation_type')}>
                  {TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date *"><Input type="date" value={form.operation_date} onChange={s('operation_date')} /></FormGroup>
            </FormRow>
            <div className="section-label" style={{marginTop:16}}>PRODUIT & DOSAGE</div>
            <FormRow>
              <FormGroup label="Produit utilisé"><Input value={form.product_used} onChange={s('product_used')} placeholder="ex: Azoxystrobin 250SC" /></FormGroup>
              <FormGroup label="Dose / m²"><Input type="number" value={form.dose_per_m2} onChange={s('dose_per_m2')} placeholder="ex: 0.15" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Quantité totale"><Input type="number" value={form.total_quantity} onChange={s('total_quantity')} placeholder="0" /></FormGroup>
              <FormGroup label="Unité">
                <Select value={form.unit} onChange={s('unit')}>
                  {['L','kg','mL','g','unité'].map(u=><option key={u}>{u}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <div className="section-label" style={{marginTop:16}}>IRRIGATION / FERTIGATION</div>
            <FormRow>
              <FormGroup label="Volume eau (L)"><Input type="number" value={form.water_volume_liters} onChange={s('water_volume_liters')} placeholder="0" /></FormGroup>
              <FormGroup label="EC (mS/cm)"><Input type="number" value={form.ec_ms_cm} onChange={s('ec_ms_cm')} placeholder="ex: 3.5" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="pH"><Input type="number" value={form.ph_value} onChange={s('ph_value')} placeholder="ex: 6.2" /></FormGroup>
              <FormGroup label="Durée (heures)"><Input type="number" value={form.duration_hours} onChange={s('duration_hours')} placeholder="ex: 2.5" /></FormGroup>
            </FormRow>
            <div className="section-label" style={{marginTop:16}}>CONDITIONS</div>
            <FormRow>
              <FormGroup label="Température (°C)"><Input type="number" value={form.temperature} onChange={s('temperature')} placeholder="ex: 24" /></FormGroup>
              <FormGroup label="Humidité (%)"><Input type="number" value={form.humidity_pct} onChange={s('humidity_pct')} placeholder="ex: 75" /></FormGroup>
            </FormRow>
            <FormGroup label="Nombre d'ouvriers"><Input type="number" value={form.worker_count} onChange={s('worker_count')} placeholder="ex: 3" /></FormGroup>
            <FormGroup label="Observations"><Textarea rows={2} value={form.observations} onChange={s('observations')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.campaign_planting_id||!form.operation_date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><div className="page-title">JOURNAL AGRONOMIQUE</div><div className="page-sub">{items.length} intervention(s) enregistrée(s)</div></div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ INTERVENTION</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">⬨</div>
          <div className="empty-title">Aucune intervention</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ INTERVENTION</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['Date','Serre','Variété','Type','Produit','Dose/m²','Qté','EC','pH','Ouvriers','Notes'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((op:any)=>{
                  const cp = op.campaign_plantings
                  const c = TYPE_COLORS[op.operation_type]||'#3d6b52'
                  return (
                    <tr key={op.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{op.operation_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{cp?.greenhouses?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{cp?.varieties?.commercial_name||'—'}</span></td>
                      <td><span style={{background:`${c}18`,color:c,padding:'2px 7px',borderRadius:4,fontFamily:'DM Mono,monospace',fontSize:9,border:`1px solid ${c}40`}}>{op.operation_type?.toUpperCase()}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{op.product_used||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>{op.dose_per_m2||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{op.total_quantity ? op.total_quantity+' '+op.unit : '—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00b4d8'}}>{op.ec_ms_cm||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{op.ph_value||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{op.worker_count||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',maxWidth:120,display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{op.observations||'—'}</span></td>
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
