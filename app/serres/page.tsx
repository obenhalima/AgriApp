'use client'
import { useEffect, useState } from 'react'
import { getSerres, deleteSerre, getFarms } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function SerresPage() {
  const [serres, setSerres] = useState<any[]>([])
  const [farms, setFarms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ farm_id:'', code:'', name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:'' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    try {
      const [s, f] = await Promise.all([getSerres(), getFarms()])
      setSerres(s); setFarms(f)
    } catch(e){}
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const openModal = () => {
    const codes = serres.map(s=>s.code)
    const farmId = farms.length === 1 ? farms[0].id : ''
    setForm({ farm_id:farmId, code:genCode('S',codes), name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:'' })
    setModal(true)
  }

  const save = async () => {
    if (!form.farm_id || !form.name || !form.total_area) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('greenhouses').insert({
        farm_id: form.farm_id,
        code: form.code,
        name: form.name,
        type: form.type,
        status: form.status,
        total_area: Number(form.total_area),
        exploitable_area: Number(form.exploitable_area || form.total_area),
        notes: form.notes || null,
      }).select('*, farms(name)').single()
      if (error) throw error
      setSerres(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const del = async (id:string, name:string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return
    await deleteSerre(id); setSerres(p=>p.filter(s=>s.id!==id))
  }

  const ST: Record<string,string> = { active:'#00e87a', en_preparation:'#f5a623', hors_service:'#ff4d6d', renovation:'#00b4d8' }

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE SERRE" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Serre créée !" /> : (<>
            <FormGroup label="Ferme *">
              {farms.length === 0 ? (
                <div style={{padding:'10px 13px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>
                  ⚠ Aucune ferme — créez d'abord une ferme
                </div>
              ) : (
                <Select value={form.farm_id} onChange={s('farm_id')}>
                  <option value="">-- Sélectionner --</option>
                  {farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              )}
            </FormGroup>
            <FormRow>
              <FormGroup label="Code (auto-généré)">
                <Input value={form.code} onChange={s('code')} />
              </FormGroup>
              <FormGroup label="Nom de la serre *">
                <Input value={form.name} onChange={s('name')} placeholder="ex: Serre Nord A" autoFocus />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Type">
                <Select value={form.type} onChange={s('type')}>
                  {['tunnel','chapelle','venlo','multispan','solaire','autre'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Statut">
                <Select value={form.status} onChange={s('status')}>
                  <option value="active">Active</option>
                  <option value="en_preparation">En préparation</option>
                  <option value="hors_service">Hors service</option>
                  <option value="renovation">Rénovation</option>
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Superficie totale (m²) *">
                <Input type="number" value={form.total_area} onChange={s('total_area')} placeholder="ex: 5000" />
              </FormGroup>
              <FormGroup label="Surface exploitable (m²)">
                <Input type="number" value={form.exploitable_area} onChange={s('exploitable_area')} placeholder="= superficie si vide" />
              </FormGroup>
            </FormRow>
            <FormGroup label="Observations">
              <Textarea rows={2} value={form.notes} onChange={s('notes')} />
            </FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.farm_id||!form.name||!form.total_area} saveLabel="CRÉER LA SERRE" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <div className="page-title">SERRES</div>
          <div className="page-sub">{serres.length} serre(s) · {farms.length} ferme(s)</div>
        </div>
        <button className="btn-primary" onClick={openModal}>+ NEW SERRE</button>
      </div>

      {farms.length === 0 && !loading && (
        <div style={{padding:'12px 16px',background:'#f5a62318',border:'1px solid #f5a62340',borderRadius:8,marginBottom:16,fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>
          ⚠ Aucune ferme — créez d'abord une ferme dans <strong>Fermes & Sites</strong>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : serres.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <div className="empty-title">Aucune serre</div>
          <div className="empty-sub">Commencez par créer votre première serre.</div>
          <button className="btn-primary" onClick={openModal} disabled={farms.length===0}>+ NEW SERRE</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
          {serres.map((s:any)=>{
            const color = ST[s.status]||'#3d6b52'
            return (
              <div key={s.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,paddingBottom:10,borderBottom:'1px solid #1a3526'}}>
                  <div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:15,fontWeight:700,color:'#e8f5ee',textTransform:'uppercase',letterSpacing:.5,marginBottom:2}}>{s.name}</div>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1}}>{s.code} · {s.type} · {s.farms?.name}</div>
                  </div>
                  <span style={{background:`${color}18`,color,padding:'2px 8px',borderRadius:4,fontFamily:'DM Mono,monospace',fontSize:9,border:`1px solid ${color}40`}}>{s.status?.replace('_',' ').toUpperCase()}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                  <div style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,padding:'7px 10px'}}>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:2}}>SUPERFICIE</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{s.total_area?.toLocaleString('fr')} m²</div>
                  </div>
                  <div style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,padding:'7px 10px'}}>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:2}}>EXPLOITABLE</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{s.exploitable_area?.toLocaleString('fr')} m²</div>
                  </div>
                </div>
                {s.notes && <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',marginBottom:10,fontStyle:'italic'}}>{s.notes}</div>}
                <button onClick={()=>del(s.id,s.name)} className="btn-danger" style={{width:'100%',justifyContent:'center',fontSize:11}}>
                  🗑 SUPPRIMER
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
