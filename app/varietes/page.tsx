'use client'
import { useEffect, useState } from 'react'
import { getVarietes, createVariete, deleteVariete } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function VarietesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew,  setModalNew]  = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)
  const blank = { code:'', commercial_name:'', type:'ronde', destination:'mixte', theoretical_yield_per_m2:'', theoretical_cost_per_m2:'', avg_price_local:'', avg_price_export:'', estimated_cycle_days:'', technical_notes:'' }
  const [form,  setForm]  = useState({...blank})
  const [formE, setFormE] = useState<Record<string,any>>({})
  const s  = (k:string) => (e:any) => setForm((f:any)=>({...f,[k]:e.target.value}))
  const se = (k:string) => (e:any) => setFormE(f=>({...f,[k]:e.target.value}))

  const load = () => getVarietes().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{load()},[])

  const openNew = () => { setForm({...blank, code:genCode('V',items.map(i=>i.code))}); setModalNew(true) }
  const openEdit = (v:any) => {
    setFormE({code:v.code,commercial_name:v.commercial_name,type:v.type,destination:v.destination,
      theoretical_yield_per_m2:String(v.theoretical_yield_per_m2||''),theoretical_cost_per_m2:String(v.theoretical_cost_per_m2||''),
      avg_price_local:String(v.avg_price_local||''),avg_price_export:String(v.avg_price_export||''),
      estimated_cycle_days:String(v.estimated_cycle_days||''),technical_notes:v.technical_notes||''})
    setModalEdit(v)
  }

  const save = async () => {
    if (!form.commercial_name) return
    setSaving(true)
    try {
      const n = await createVariete({...form,theoretical_yield_per_m2:Number(form.theoretical_yield_per_m2)||0,theoretical_cost_per_m2:Number(form.theoretical_cost_per_m2)||0,avg_price_local:Number(form.avg_price_local)||0,avg_price_export:Number(form.avg_price_export)||0,estimated_cycle_days:form.estimated_cycle_days?Number(form.estimated_cycle_days):undefined})
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModalNew(false);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit||!formE.commercial_name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('varieties').update({
        code:formE.code,commercial_name:formE.commercial_name,type:formE.type,destination:formE.destination,
        theoretical_yield_per_m2:Number(formE.theoretical_yield_per_m2)||0,theoretical_cost_per_m2:Number(formE.theoretical_cost_per_m2)||0,
        avg_price_local:Number(formE.avg_price_local)||0,avg_price_export:Number(formE.avg_price_export)||0,
        estimated_cycle_days:formE.estimated_cycle_days?Number(formE.estimated_cycle_days):null,
        technical_notes:formE.technical_notes||null
      }).eq('id',modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(()=>{setModalEdit(null);setDone(false);load()},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const DEST_C: Record<string,string> = {export:'#f07050',local:'#00e87a',mixte:'#f5a623',grande_distribution:'#00b4d8',industrie:'#9b5de5'}

  const VForm = ({vals,onChange}: any) => (<>
    <FormRow>
      <FormGroup label="Code"><Input value={vals.code} onChange={onChange('code')} /></FormGroup>
      <FormGroup label="Nom commercial *"><Input value={vals.commercial_name} onChange={onChange('commercial_name')} placeholder="ex: Vitalia" autoFocus /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Type">
        <Select value={vals.type} onChange={onChange('type')}>{['ronde','grappe','cerise','allongee','cocktail','beef','olivette','autre'].map(t=><option key={t}>{t}</option>)}</Select>
      </FormGroup>
      <FormGroup label="Destination">
        <Select value={vals.destination} onChange={onChange('destination')}>{['mixte','export','local','grande_distribution','industrie'].map(d=><option key={d}>{d}</option>)}</Select>
      </FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Rend. th. (kg/m²)"><Input type="number" value={vals.theoretical_yield_per_m2} onChange={onChange('theoretical_yield_per_m2')} placeholder="45" /></FormGroup>
      <FormGroup label="Coût th. (MAD/m²)"><Input type="number" value={vals.theoretical_cost_per_m2} onChange={onChange('theoretical_cost_per_m2')} placeholder="120" /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Prix local (MAD/kg)"><Input type="number" value={vals.avg_price_local} onChange={onChange('avg_price_local')} placeholder="3.50" /></FormGroup>
      <FormGroup label="Prix export (EUR/kg)"><Input type="number" value={vals.avg_price_export} onChange={onChange('avg_price_export')} placeholder="0.60" /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Cycle (jours)"><Input type="number" value={vals.estimated_cycle_days} onChange={onChange('estimated_cycle_days')} placeholder="200" /></FormGroup>
      <FormGroup label=""><div/></FormGroup>
    </FormRow>
    <FormGroup label="Notes techniques"><Textarea rows={2} value={vals.technical_notes} onChange={onChange('technical_notes')} /></FormGroup>
  </>)

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modalNew && (
        <Modal title="NOUVELLE VARIÉTÉ" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Variété créée !" /> : (<>
            <VForm vals={form} onChange={s} />
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={save} loading={saving} disabled={!form.commercial_name} saveLabel="CRÉER" />
          </>)}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.commercial_name}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Variété modifiée !" /> : (<>
            <VForm vals={formE} onChange={se} />
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.commercial_name} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div><div className="page-title">VARIÉTÉS</div><div className="page-sub">{items.length} variété(s)</div></div>
        <button className="btn-primary" onClick={openNew}>+ NEW VARIÉTÉ</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      : items.length===0 ? (
        <div className="empty-state"><div className="empty-icon">✦</div><div className="empty-title">Aucune variété</div><button className="btn-primary" onClick={openNew}>+ NEW VARIÉTÉ</button></div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>{['Code','Nom','Type','Destination','Rend.Th.','Coût/m²','Prix Local','Prix Export','Cycle','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((v:any)=>{
                  const dc = DEST_C[v.destination]||'#3d6b52'
                  return (
                    <tr key={v.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{v.code}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{v.commercial_name}</span></td>
                      <td><span className="tag tag-blue" style={{fontSize:9}}>{v.type}</span></td>
                      <td><span className="tag" style={{background:`${dc}18`,color:dc,border:`1px solid ${dc}40`,fontSize:9}}>{v.destination}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{v.theoretical_yield_per_m2||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{v.theoretical_cost_per_m2||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{v.avg_price_local||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00ffc8'}}>{v.avg_price_export||'—'}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{v.estimated_cycle_days||'—'} j</span></td>
                      <td>
                        <div style={{display:'flex',gap:5}}>
                          <button onClick={()=>openEdit(v)} className="btn-ghost" style={{padding:'4px 8px',fontSize:10}}>✏️</button>
                          <button onClick={()=>{if(!confirm(`Archiver "${v.commercial_name}" ?`))return;deleteVariete(v.id);setItems(p=>p.filter(i=>i.id!==v.id))}} className="btn-danger" style={{padding:'4px 8px',fontSize:10}}>🗑</button>
                        </div>
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
