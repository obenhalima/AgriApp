'use client'
import { useEffect, useState } from 'react'
import { getSerres, createSerre, deleteSerre, getFarms } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function SerresPage() {
  const [serres, setSerres] = useState<any[]>([])
  const [farms, setFarms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ farm_id:'', code:'', name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:'' })
  const s = (k:string) => (v:any) => setForm(f=>({...f,[k]:typeof v==='string'?v:v.target.value}))

  useEffect(() => {
    Promise.all([getSerres(), getFarms()])
      .then(([s,f]) => { setSerres(s); setFarms(f); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.farm_id || !form.code || !form.name || !form.total_area) return
    setSaving(true)
    try {
      const newS = await createSerre({ ...form, total_area: Number(form.total_area), exploitable_area: Number(form.exploitable_area || form.total_area) })
      setSerres(prev => [newS, ...prev])
      setDone(true)
      setTimeout(() => { setModal(false); setDone(false); setForm({ farm_id:'', code:'', name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:'' }) }, 1400)
    } catch(e:any) { alert('Erreur: ' + e.message) }
    setSaving(false)
  }

  const del = async (id:string, name:string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return
    await deleteSerre(id)
    setSerres(prev => prev.filter(s => s.id !== id))
  }

  const ST: Record<string,string> = { active:'#d8f3dc|#1b4332', en_preparation:'#fef3c7|#92400e', hors_service:'#fce4e5|#9b1d1d', renovation:'#dbeafe|#1e3a8a' }
  const stStyle = (s:string) => { const [bg,color]=(ST[s]||'#f4f9f4|#5a7a66').split('|'); return { background:bg,color,padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,display:'inline-block' } }
  const COLORS: Record<string,string> = { tunnel:'#40916c', chapelle:'#2d6a4f', venlo:'#74c69d', multispan:'#e9c46a', solaire:'#f4a261', autre:'#9dc4b0' }

  return (
    <div style={{ padding:'22px 26px', background:'#f4f9f4', minHeight:'100vh' }}>
      {modal && (
        <Modal title="Nouvelle serre" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Serre créée avec succès !" /> : (
            <>
              <FormRow>
                <FormGroup label="Ferme *">
                  <Select value={form.farm_id} onChange={s('farm_id')}>
                    <option value="">-- Sélectionner --</option>
                    {farms.map((f:any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Code *">
                  <Input value={form.code} onChange={s('code')} placeholder="ex: S01" />
                </FormGroup>
              </FormRow>
              <FormGroup label="Nom de la serre *">
                <Input value={form.name} onChange={s('name')} placeholder="ex: Serre Nord A" />
              </FormGroup>
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
                  <Input type="number" value={form.exploitable_area} onChange={s('exploitable_area')} placeholder="ex: 4600" />
                </FormGroup>
              </FormRow>
              <FormGroup label="Observations">
                <Textarea rows={2} value={form.notes} onChange={s('notes')} placeholder="Notes techniques..." />
              </FormGroup>
              <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.farm_id||!form.code||!form.name||!form.total_area} saveLabel="Créer la serre" />
            </>
          )}
        </Modal>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:700, color:'#1b3a2d', marginBottom:4 }}>Serres & Infrastructure</h2>
          <p style={{ fontSize:13, color:'#5a7a66' }}>{serres.length} serre(s) enregistrée(s)</p>
        </div>
        <button onClick={()=>setModal(true)} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#2d6a4f', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          + Nouvelle serre
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#5a7a66' }}>Chargement...</div>
      ) : serres.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, background:'#fff', border:'1px solid #cce5d4', borderRadius:12 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏗️</div>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, color:'#1b3a2d', marginBottom:8 }}>Aucune serre enregistrée</div>
          <div style={{ fontSize:13, color:'#5a7a66', marginBottom:20 }}>Commencez par ajouter votre première serre.</div>
          <button onClick={()=>setModal(true)} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#2d6a4f', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>+ Nouvelle serre</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
          {serres.map((s:any) => {
            const color = COLORS[s.type] || '#9dc4b0'
            return (
              <div key={s.id} style={{ background:'#fff', border:'1px solid #cce5d4', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(27,58,45,0.06)' }}>
                <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #e8f5ec', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700, color:'#1b3a2d', marginBottom:3 }}>{s.name}</div>
                    <div style={{ fontSize:11, color:'#5a7a66' }}>{s.code} · {s.type}</div>
                  </div>
                  <span style={stStyle(s.status)}>{s.status?.replace('_',' ')}</span>
                </div>
                <div style={{ padding:'12px 16px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Superficie</div><div style={{ fontSize:13, fontWeight:600, color:'#1b3a2d' }}>{s.total_area?.toLocaleString('fr')} m²</div></div>
                    <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Exploitable</div><div style={{ fontSize:13, fontWeight:600, color:'#1b3a2d' }}>{s.exploitable_area?.toLocaleString('fr')} m²</div></div>
                  </div>
                  {s.farms && <div style={{ fontSize:11, color:'#5a7a66', marginBottom:10 }}>🏭 {s.farms.name}</div>}
                  {s.notes && <div style={{ fontSize:11, color:'#5a7a66', marginBottom:10, fontStyle:'italic' }}>{s.notes}</div>}
                  <div style={{ display:'flex', gap:6 }}>
                    <button style={{ flex:1, padding:'5px 0', borderRadius:7, border:'1px solid #cce5d4', background:'#f4f9f4', color:'#1b3a2d', fontSize:12, cursor:'pointer' }}>✏️ Modifier</button>
                    <button onClick={()=>del(s.id,s.name)} style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #fcc', background:'#fff1f1', color:'#9b1d1d', fontSize:12, cursor:'pointer' }}>🗑</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
