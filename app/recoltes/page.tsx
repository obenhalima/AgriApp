'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function RecoltesPage() {
  const [items, setItems]   = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [form, setForm] = useState({
    campaign_planting_id:'', harvest_date:'',
    qty_category_1:'', qty_category_2:'', qty_category_3:'', qty_waste:'',
    notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [r, p] = await Promise.all([
      supabase.from('harvests')
        .select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))')
        .order('harvest_date', { ascending: false }).limit(100),
      supabase.from('campaign_plantings')
        .select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)')
    ])
    setItems(r.data||[])
    setPlantings(p.data||[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.campaign_planting_id || !form.harvest_date) return
    setSaving(true)
    try {
      const lot = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: form.campaign_planting_id,
        harvest_date: form.harvest_date,
        qty_category_1: Number(form.qty_category_1)||0,
        qty_category_2: Number(form.qty_category_2)||0,
        qty_category_3: Number(form.qty_category_3)||0,
        qty_waste:      Number(form.qty_waste)||0,
        lot_number: lot,
        notes: form.notes||null,
      }).select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))').single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false)
        setForm({campaign_planting_id:'',harvest_date:'',qty_category_1:'',qty_category_2:'',qty_category_3:'',qty_waste:'',notes:''})
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const totalKg = items.reduce((s,r)=>{
    const cp = r.campaign_plantings
    return s + (cp ? (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0) : 0)
  }, 0)

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation / Serre-Variété *">
              {plantings.length===0
                ? <div style={{padding:'10px 13px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation — créez d'abord une campagne et des plantations</div>
                : <Select value={form.campaign_planting_id} onChange={s('campaign_planting_id')}>
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
              <Input type="date" value={form.harvest_date} onChange={s('harvest_date')} />
            </FormGroup>
            <FormRow>
              <FormGroup label="Catégorie 1 — Export (kg)">
                <Input type="number" value={form.qty_category_1} onChange={s('qty_category_1')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Catégorie 2 — Local (kg)">
                <Input type="number" value={form.qty_category_2} onChange={s('qty_category_2')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie 3 — Déclassé (kg)">
                <Input type="number" value={form.qty_category_3} onChange={s('qty_category_3')} placeholder="0" />
              </FormGroup>
              <FormGroup label="Déchets (kg)">
                <Input type="number" value={form.qty_waste} onChange={s('qty_waste')} placeholder="0" />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes qualité">
              <Textarea rows={2} value={form.notes} onChange={s('notes')} placeholder="Observations, qualité, conditions..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving}
              disabled={!form.campaign_planting_id||!form.harvest_date} saveLabel="ENREGISTRER LA RÉCOLTE" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">{items.length} lot(s) · Total : {(totalKg/1000).toFixed(2)} t</div>
        </div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ SAISIR RÉCOLTE</button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Lots récoltés', v:String(items.length), c:'#00e87a'},
          {l:'Total récolté', v:(totalKg/1000).toFixed(2)+' t', c:'#00ffc8'},
          {l:'Cat. 1 Export', v:(items.reduce((s,r)=>s+(r.qty_category_1||0),0)/1000).toFixed(2)+' t', c:'#f5a623'},
          {l:'Cat. 2 Local',  v:(items.reduce((s,r)=>s+(r.qty_category_2||0),0)/1000).toFixed(2)+' t', c:'#00b4d8'},
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
          <div className="empty-icon">◉</div>
          <div className="empty-title">Aucune récolte saisie</div>
          <div className="empty-sub">Enregistrez votre première récolte.</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['N° Lot','Date','Serre','Variété','Cat.1 (kg)','Cat.2 (kg)','Cat.3 (kg)','Total (kg)','Notes'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((r:any)=>{
                  const cp = r.campaign_plantings
                  const total = (r.qty_category_1||0)+(r.qty_category_2||0)+(r.qty_category_3||0)
                  return (
                    <tr key={r.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{r.lot_number}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{r.harvest_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{cp?.greenhouses?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#7aab90'}}>{cp?.varieties?.commercial_name||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{(r.qty_category_1||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00b4d8'}}>{(r.qty_category_2||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{(r.qty_category_3||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{total.toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{r.notes||'—'}</span></td>
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
