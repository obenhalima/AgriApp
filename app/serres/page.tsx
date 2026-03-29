'use client'
import { useEffect, useState } from 'react'
import { getSerres, deleteSerre, getFarms } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function SerresPage() {
  const [serres, setSerres] = useState<any[]>([])
  const [farms, setFarms]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew,  setModalNew]  = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)
  const [form,   setForm]   = useState({ farm_id:'', code:'', name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:'' })
  const [formE,  setFormE]  = useState<Record<string,any>>({})
  const s  = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))
  const se = (k:string) => (e:any) => setFormE(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [sr,fr] = await Promise.all([getSerres(), getFarms()])
    setSerres(sr); setFarms(fr); setLoading(false)
  }
  useEffect(()=>{load()},[])

  const openNew = () => {
    const codes = serres.map(s=>s.code)
    const farmId = farms.length===1 ? farms[0].id : ''
    setForm({farm_id:farmId, code:genCode('S',codes), name:'', type:'tunnel', status:'active', total_area:'', exploitable_area:'', notes:''})
    setModalNew(true)
  }

  const openEdit = (s: any) => {
    setFormE({ farm_id:s.farm_id, code:s.code, name:s.name, type:s.type, status:s.status,
      total_area:String(s.total_area||''), exploitable_area:String(s.exploitable_area||''), notes:s.notes||'' })
    setModalEdit(s)
  }

  const save = async () => {
    if (!form.farm_id||!form.name||!form.total_area) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('greenhouses').insert({
        farm_id:form.farm_id, code:form.code, name:form.name, type:form.type, status:form.status,
        total_area:Number(form.total_area), exploitable_area:Number(form.exploitable_area||form.total_area), notes:form.notes||null
      }).select('*, farms(name)').single()
      if (error) throw error
      setSerres(p=>[data,...p]); setDone(true)
      setTimeout(()=>{setModalNew(false);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit||!formE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('greenhouses').update({
        farm_id:formE.farm_id, code:formE.code, name:formE.name, type:formE.type, status:formE.status,
        total_area:Number(formE.total_area)||0, exploitable_area:Number(formE.exploitable_area||formE.total_area)||0, notes:formE.notes||null
      }).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(()=>{setModalEdit(null);setDone(false);load()},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const del = async (id:string,name:string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return
    await deleteSerre(id); setSerres(p=>p.filter(s=>s.id!==id))
  }

  const ST: Record<string,string> = {active:'var(--neon)',en_preparation:'var(--mbe)',hors_service:'var(--ed)',renovation:'var(--blue)'}

  const SForm = ({vals, onChange, readOnly=false}: any) => (<>
    {!readOnly && <FormGroup label="Ferme *">
      {farms.length===0
        ? <div style={{padding:'10px',background:'var(--ed-dim)',border:'1px solid var(--red)40',borderRadius:7,color:'var(--ed)',fontFamily:'var(--font-mono)',fontSize:11}}>⚠ Aucune ferme</div>
        : <Select value={vals.farm_id} onChange={onChange('farm_id')}>
            <option value="">-- Sélectionner --</option>
            {farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
      }
    </FormGroup>}
    <FormRow>
      <FormGroup label="Code"><Input value={vals.code} onChange={onChange('code')} /></FormGroup>
      <FormGroup label="Nom *"><Input value={vals.name} onChange={onChange('name')} placeholder="ex: Serre Nord A" autoFocus /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Type">
        <Select value={vals.type} onChange={onChange('type')}>
          {['tunnel','chapelle','venlo','multispan','solaire','autre'].map(t=><option key={t}>{t}</option>)}
        </Select>
      </FormGroup>
      <FormGroup label="Statut">
        <Select value={vals.status} onChange={onChange('status')}>
          {['active','en_preparation','hors_service','renovation'].map(t=><option key={t}>{t}</option>)}
        </Select>
      </FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Superficie totale (m²) *"><Input type="number" value={vals.total_area} onChange={onChange('total_area')} placeholder="5000" /></FormGroup>
      <FormGroup label="Exploitable (m²)"><Input type="number" value={vals.exploitable_area} onChange={onChange('exploitable_area')} placeholder="= totale si vide" /></FormGroup>
    </FormRow>
    <FormGroup label="Notes"><Textarea rows={2} value={vals.notes} onChange={onChange('notes')} /></FormGroup>
  </>)

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modalNew && (
        <Modal title="NOUVELLE SERRE" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Serre créée !" /> : (<>
            <SForm vals={form} onChange={s} />
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={save} loading={saving} disabled={!form.farm_id||!form.name||!form.total_area} saveLabel="CRÉER" />
          </>)}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Serre modifiée !" /> : (<>
            <SForm vals={formE} onChange={se} readOnly={true} />
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER LES MODIFICATIONS" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div><div className="page-title">SERRES</div><div className="page-sub">{serres.length} serre(s)</div></div>
        <button className="btn-primary" onClick={openNew}>+ NEW SERRE</button>
      </div>

      {loading ? <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      : serres.length===0 ? (
        <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-title">Aucune serre</div><button className="btn-primary" onClick={openNew}>+ NEW SERRE</button></div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
          {serres.map((s:any)=>{
            const c = ST[s.status]||'var(--tx-3)'
            return (
              <div key={s.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,color:'var(--tx-1)',textTransform:'uppercase',letterSpacing:.5}}>{s.name}</div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--tx-3)',letterSpacing:1,marginTop:2}}>{s.code} · {s.type} · {s.farms?.name}</div>
                  </div>
                  <span style={{background:`${c}18`,color:c,padding:'2px 7px',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:8,border:`1px solid ${c}40`}}>{s.status?.replace('_',' ').toUpperCase()}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                  {[['SUPERFICIE',`${s.total_area?.toLocaleString('fr')} m²`],['EXPLOITABLE',`${s.exploitable_area?.toLocaleString('fr')} m²`]].map(([l,v])=>(
                    <div key={l} style={{background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:6,padding:'7px 10px'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:8,color:'var(--tx-3)',letterSpacing:1,marginBottom:2}}>{l}</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:14,fontWeight:700,color:'var(--tx-1)'}}>{v}</div>
                    </div>
                  ))}
                </div>
                {s.notes && <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--tx-3)',marginBottom:10,fontStyle:'italic'}}>{s.notes}</div>}
                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6}}>
                  <button onClick={()=>openEdit(s)} className="btn-secondary" style={{fontSize:10,justifyContent:'center'}}>✏️ MODIFIER</button>
                  <button onClick={()=>del(s.id,s.name)} className="btn-danger" style={{padding:'7px 10px',fontSize:11}}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
